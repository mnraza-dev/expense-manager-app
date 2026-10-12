import { requireOptionalNativeModule } from 'expo';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useRequiredUpdate } from '../updates/service';
import { AppState, Platform } from 'react-native';
import { useLock, waitForForegroundAccess } from '../security/lock';
import {
  startOfflineSpeech,
  downloadOfflineSpeechModel,
  OfflineSpeechError,
  speechRecognitionError,
  VoiceTranscript,
  type SpeechRecovery,
} from '../services/offlineSpeech';
type SpeechModule = typeof import('expo-speech-recognition').ExpoSpeechRecognitionModule;
const speech = requireOptionalNativeModule<SpeechModule>('ExpoSpeechRecognition');
export function useVoiceEntry(
  onTranscript: (text: string) => void,
  onFinal: (text: string) => void
) {
  const [listening, setListening] = useState(false);
  const [starting, setStarting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recovery, setRecovery] = useState<{ action: SpeechRecovery; locale?: string } | null>(
    null
  );
  const [setupMessage, setSetupMessage] = useState<string | null>(null);
  const active = useRef(false),
    requesting = useRef(false),
    accepting = useRef(false),
    generation = useRef(0);
  const currentLocale = useRef('en-IN');
  const received = useRef(new VoiceTranscript());
  const fail = useCallback((cause: unknown) => {
    setError(
      cause instanceof Error ? cause.message : 'Voice entry is unavailable. Type expenses below.'
    );
    setRecovery(
      cause instanceof OfflineSpeechError ? { action: cause.recovery, locale: cause.locale } : null
    );
  }, []);
  const transcript = useRef(onTranscript);
  const final = useRef(onFinal);
  useEffect(() => {
    transcript.current = onTranscript;
    final.current = onFinal;
  }, [onTranscript, onFinal]);
  // Subscribe only while this route is visible. Permission and native results must never
  // update an unfocused screen or resume recording after a background/lock transition.
  useFocusEffect(
    useCallback(() => {
      active.current = true;
      const listeners = speech
        ? [
            speech.addListener('start', () => {
              if (active.current && accepting.current) setListening(true);
            }),
            speech.addListener('end', () => {
              if (!accepting.current) return;
              accepting.current = false;
              requesting.current = false;
              if (active.current) {
                setListening(false);
                setStarting(false);
                if (
                  AppState.currentState === 'active' &&
                  !useLock.getState().locked &&
                  !useRequiredUpdate.getState().required
                ) {
                  const text = received.current.finish();
                  if (text) final.current(text);
                }
              }
            }),
            speech.addListener('result', (event) => {
              if (
                active.current &&
                accepting.current &&
                AppState.currentState === 'active' &&
                !useLock.getState().locked &&
                !useRequiredUpdate.getState().required
              ) {
                const result = received.current.receive(
                  event.results[0]?.transcript ?? '',
                  event.isFinal
                );
                if (result) {
                  transcript.current(result.text);
                  if (result.review) final.current(result.review);
                }
              }
            }),
            speech.addListener('error', (event) => {
              if (!active.current || !accepting.current || event.error === 'aborted') return;
              fail(
                speechRecognitionError(event.error, currentLocale.current, Platform.OS, event.code)
              );
              received.current.reset();
              setListening(false);
              setStarting(false);
              accepting.current = false;
              requesting.current = false;
            }),
          ]
        : [];
      const cancel = () => {
        if (!accepting.current) return;
        generation.current++;
        accepting.current = false;
        requesting.current = false;
        received.current.reset();
        speech?.abort();
        if (active.current) {
          setListening(false);
          setStarting(false);
        }
      };
      const app = AppState.addEventListener('change', (state) => {
        if (state !== 'active') cancel();
      });
      const update = useRequiredUpdate.subscribe((state) => {
        if (state.required) cancel();
      });
      const lock = useLock.subscribe((state) => {
        if (state.enabled && state.locked) cancel();
      });
      return () => {
        active.current = false;
        generation.current++;
        cancel();
        requesting.current = false;
        listeners.forEach((l) => l.remove());
        app.remove();
        lock();
        update();
      };
    }, [fail])
  );
  const start = async (locale: string) => {
    if (requesting.current || accepting.current) return;
    requesting.current = true;
    setStarting(true);
    setError(null);
    setRecovery(null);
    setSetupMessage(null);
    currentLocale.current = locale;
    const token = ++generation.current;
    try {
      await startOfflineSpeech(
        speech,
        Platform.OS,
        Number(Platform.Version),
        locale,
        () => active.current && generation.current === token,
        waitForForegroundAccess,
        (resolvedLocale) => {
          currentLocale.current = resolvedLocale;
          received.current.reset();
          accepting.current = true;
          transcript.current('');
          setListening(true);
        }
      );
    } catch (e) {
      if (active.current && generation.current === token) {
        accepting.current = false;
        setListening(false);
        fail(e);
      }
    } finally {
      if (active.current && generation.current === token) {
        setStarting(false);
        if (!accepting.current) requesting.current = false;
      }
    }
  };
  const download = async (selectedLocale: string) => {
    if (requesting.current || accepting.current) return;
    requesting.current = true;
    setDownloading(true);
    setError(null);
    setSetupMessage(null);
    const token = ++generation.current;
    try {
      const message = await downloadOfflineSpeechModel(
        speech,
        Platform.OS,
        Number(Platform.Version),
        recovery?.locale ?? selectedLocale,
        () => active.current && generation.current === token,
        waitForForegroundAccess
      );
      if (active.current && generation.current === token) setSetupMessage(message);
    } catch (e) {
      if (active.current && generation.current === token) fail(e);
    } finally {
      if (active.current && generation.current === token) {
        requesting.current = false;
        setDownloading(false);
      }
    }
  };
  return {
    listening,
    starting,
    downloading,
    error,
    recovery,
    setupMessage,
    clearSetup: () => {
      setError(null);
      setRecovery(null);
      setSetupMessage(null);
    },
    start,
    download,
    stop: () => speech?.stop(),
  };
}
