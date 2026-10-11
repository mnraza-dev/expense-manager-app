import { requireOptionalNativeModule } from 'expo';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { AppState, Platform } from 'react-native';
import { useLock, waitForForegroundAccess } from '../security/lock';
import { startOfflineSpeech } from '../services/offlineSpeech';
type SpeechModule = typeof import('expo-speech-recognition').ExpoSpeechRecognitionModule;
const speech = requireOptionalNativeModule<SpeechModule>('ExpoSpeechRecognition');
export function useVoiceEntry(
  onTranscript: (text: string) => void,
  onFinal: (text: string) => void
) {
  const [listening, setListening] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = useRef(false),
    requesting = useRef(false),
    accepting = useRef(false),
    generation = useRef(0);
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
              }
            }),
            speech.addListener('result', (event) => {
              if (
                active.current &&
                accepting.current &&
                AppState.currentState === 'active' &&
                !useLock.getState().locked
              ) {
                const text = event.results[0]?.transcript ?? '';
                transcript.current(text);
                if (event.isFinal) final.current(text);
              }
            }),
            speech.addListener('error', (event) => {
              if (!active.current || !accepting.current || event.error === 'aborted') return;
              setError(
                event.error === 'not-allowed'
                  ? 'Microphone access is unavailable. Check device settings or type expenses below.'
                  : 'On-device speech could not recognize this language or phrase. Check its offline model, try again, or type expenses below.'
              );
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
        speech?.abort();
        if (active.current) {
          setListening(false);
          setStarting(false);
        }
      };
      const app = AppState.addEventListener('change', (state) => {
        if (state !== 'active') cancel();
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
      };
    }, [])
  );
  const start = async (locale: string) => {
    if (requesting.current || accepting.current) return;
    requesting.current = true;
    setStarting(true);
    setError(null);
    const token = ++generation.current;
    try {
      await startOfflineSpeech(
        speech,
        Platform.OS,
        Number(Platform.Version),
        locale,
        () => active.current && generation.current === token,
        waitForForegroundAccess,
        () => {
          accepting.current = true;
          transcript.current('');
          setListening(true);
        }
      );
    } catch (e) {
      if (active.current && generation.current === token) {
        accepting.current = false;
        setListening(false);
        setError(
          e instanceof Error ? e.message : 'Voice entry is unavailable. Type expenses below.'
        );
      }
    } finally {
      if (active.current && generation.current === token) {
        setStarting(false);
        if (!accepting.current) requesting.current = false;
      }
    }
  };
  return { listening, starting, error, start, stop: () => speech?.stop() };
}
