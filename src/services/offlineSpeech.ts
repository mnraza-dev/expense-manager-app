export const VOICE_LANGUAGES = [
  { value: 'en-IN', label: 'English' },
  { value: 'hi-IN', label: 'हिन्दी' },
  { value: 'ur-PK', label: 'اردو' },
] as const;
export type SpeechRecovery = 'download' | 'settings' | null;
export class OfflineSpeechError extends Error {
  constructor(
    message: string,
    readonly recovery: SpeechRecovery = null,
    readonly locale?: string
  ) {
    super(message);
    this.name = 'OfflineSpeechError';
  }
}
const normalizedLocale = (locale: string) => locale.trim().replace(/_/g, '-');
const languageOf = (locale: string) => normalizedLocale(locale).toLowerCase().split('-')[0];
// An installed regional variant recognizes the same speaking language. Never switch languages.
export function installedSpeechLocale(requested: string, installed: string[]): string | null {
  const exact = installed.find(
    (locale) => normalizedLocale(locale).toLowerCase() === normalizedLocale(requested).toLowerCase()
  );
  const match = exact ?? installed.find((locale) => languageOf(locale) === languageOf(requested));
  return match ? normalizedLocale(match) : null;
}
export function speechLanguageName(locale: string) {
  return (
    VOICE_LANGUAGES.find((language) => languageOf(language.value) === languageOf(locale))?.label ??
    locale
  );
}
function missingModel(locale: string) {
  return new OfflineSpeechError(
    `The ${speechLanguageName(locale)} offline speech model is not installed. Tap Download speech language, then try Start speaking again. You can also type expenses below.`,
    'download',
    locale
  );
}
export function speechRecognitionError(
  code: string,
  locale: string,
  platform: string,
  nativeCode?: number
) {
  if (code === 'language-not-supported' && platform === 'android' && nativeCode === 12)
    return new OfflineSpeechError(
      'This language is not supported by your device speech service. Choose another speaking language or type expenses below.',
      'settings'
    );
  if (code === 'language-not-supported')
    return platform === 'android'
      ? missingModel(locale)
      : new OfflineSpeechError(
          'This speaking language is unavailable for on-device recognition. Choose another language or type expenses below.',
          'settings'
        );
  if (code === 'not-allowed')
    return new OfflineSpeechError(
      'Microphone access is unavailable. Enable microphone access for Settler in device settings, then try again.',
      'settings'
    );
  if (code === 'no-speech' || code === 'speech-timeout')
    return new OfflineSpeechError(
      'No speech was detected. Tap Start speaking and speak near the microphone.'
    );
  if (code === 'busy')
    return new OfflineSpeechError(
      'The speech recognizer is still stopping. Wait a moment and try again.'
    );
  if (code === 'audio-capture')
    return new OfflineSpeechError(
      'The microphone could not start. Close other recording or calling apps and check microphone access in device settings.',
      'settings'
    );
  if (code === 'service-not-allowed' || code === 'network')
    return new OfflineSpeechError(
      'On-device speech recognition is unavailable. Check your device speech service and offline language models, or type expenses below.',
      'settings'
    );
  return new OfflineSpeechError('Voice recognition stopped. Try again or type expenses below.');
}
export interface OfflineSpeechEngine {
  supportsOnDeviceRecognition(): boolean;
  getStateAsync?(): Promise<string>;
  getSupportedLocales(options: object): Promise<{ locales: string[]; installedLocales: string[] }>;
  requestMicrophonePermissionsAsync(): Promise<{ granted: boolean }>;
  androidTriggerOfflineModelDownload?(options: { locale: string }): Promise<{
    status: 'download_success' | 'opened_dialog' | 'download_scheduled';
    message: string;
  }>;
  start(options: {
    lang: string;
    interimResults: boolean;
    continuous: boolean;
    requiresOnDeviceRecognition: boolean;
    recordingOptions: { persist: boolean };
    maxAlternatives: number;
  }): void;
}
export async function startOfflineSpeech(
  engine: OfflineSpeechEngine | null,
  platform: string,
  version: number,
  locale: string,
  canStart: () => boolean,
  waitForAccess: () => Promise<void>,
  onStart: (resolvedLocale: string) => void = () => {}
) {
  if (!engine)
    throw new Error(
      'Install the updated native Settler build to enable voice entry. You can type expenses below.'
    );
  let resolvedLocale = locale;
  if (platform === 'android') {
    // Older Android recognizers treat offline as a preference, which cannot honor our privacy promise.
    if (version < 33 || !engine.supportsOnDeviceRecognition())
      throw new Error(
        'Private voice entry requires Android 13+ with an on-device speech recognizer. Type expenses below on this device.'
      );
    const supported = await engine.getSupportedLocales({});
    const installed = installedSpeechLocale(locale, supported.installedLocales);
    if (!installed) {
      const downloadLocale = installedSpeechLocale(locale, supported.locales) ?? locale;
      throw missingModel(downloadLocale);
    }
    resolvedLocale = installed;
  } else if (platform !== 'ios')
    throw new Error(
      'Private voice entry is available in Android and iOS native builds. Type expenses below.'
    );
  if (!canStart()) return false;
  const permission = await engine.requestMicrophonePermissionsAsync();
  if (!permission.granted)
    throw new OfflineSpeechError(
      'Microphone access was denied. Enable it in device settings or type expenses below.',
      'settings'
    );
  await waitForAccess();
  if (!canStart()) return false;
  if (engine.getStateAsync && (await engine.getStateAsync()) !== 'inactive')
    throw new Error('The speech recognizer is still stopping. Try again in a moment.');
  if (!canStart()) return false;
  onStart(resolvedLocale);
  engine.start({
    lang: resolvedLocale,
    interimResults: true,
    continuous: false,
    requiresOnDeviceRecognition: true,
    recordingOptions: { persist: false },
    maxAlternatives: 1,
  });
  return true;
}

export async function downloadOfflineSpeechModel(
  engine: OfflineSpeechEngine | null,
  platform: string,
  version: number,
  locale: string,
  canContinue: () => boolean,
  waitForAccess: () => Promise<void>
): Promise<string | null> {
  if (
    !engine?.androidTriggerOfflineModelDownload ||
    platform !== 'android' ||
    version < 33 ||
    !engine.supportsOnDeviceRecognition()
  )
    throw new OfflineSpeechError(
      'Offline model downloads are unavailable here. Check your device speech settings or type expenses below.',
      'settings'
    );
  if (!canContinue()) return null;
  await waitForAccess();
  if (!canContinue()) return null;
  let result;
  try {
    result = await engine.androidTriggerOfflineModelDownload({ locale });
  } catch {
    throw new OfflineSpeechError(
      'The speech language could not download. Check your connection and device speech settings, then try again.',
      'settings'
    );
  }
  if (!canContinue()) return null;
  const language = speechLanguageName(locale);
  if (result.status === 'download_success')
    return `${language} offline speech model installed. Tap Start speaking when ready.`;
  if (result.status === 'download_scheduled')
    return `${language} model download is queued by your device. Connect to Wi-Fi and try Start speaking after it finishes.`;
  return `Complete the ${language} model download in the device dialog, then try Start speaking again.`;
}

// Some recognizers end after emitting only interim text. Build a review once, without saving.
export class VoiceTranscript {
  private text = '';
  private reviewed = '';
  reset() {
    this.text = '';
    this.reviewed = '';
  }
  receive(text: string, isFinal: boolean) {
    if (!text.trim()) return null;
    this.text = text;
    return { text, review: isFinal ? this.finish() : null };
  }
  finish(): string | null {
    if (!this.text || this.text === this.reviewed) return null;
    this.reviewed = this.text;
    return this.text;
  }
}
