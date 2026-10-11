export const VOICE_LANGUAGES = [
  { value: 'en-IN', label: 'English' },
  { value: 'hi-IN', label: 'हिन्दी' },
  { value: 'ur-PK', label: 'اردو' },
] as const;
export interface OfflineSpeechEngine {
  supportsOnDeviceRecognition(): boolean;
  getStateAsync?(): Promise<string>;
  getSupportedLocales(options: object): Promise<{ locales: string[]; installedLocales: string[] }>;
  requestMicrophonePermissionsAsync(): Promise<{ granted: boolean }>;
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
  onStart: () => void = () => {}
) {
  if (!engine)
    throw new Error(
      'Install the updated native Settler build to enable voice entry. You can type expenses below.'
    );
  if (platform === 'android') {
    // Older Android recognizers treat offline as a preference, which cannot honor our privacy promise.
    if (version < 33 || !engine.supportsOnDeviceRecognition())
      throw new Error(
        'Private voice entry requires Android 13+ with an on-device speech recognizer. Type expenses below on this device.'
      );
    const supported = await engine.getSupportedLocales({});
    if (
      !supported.installedLocales.some(
        (installed) => installed.toLowerCase() === locale.toLowerCase()
      )
    )
      throw new Error(
        'The selected offline speech language is not installed. Download its model in device speech settings, or type expenses below.'
      );
  } else if (platform !== 'ios')
    throw new Error(
      'Private voice entry is available in Android and iOS native builds. Type expenses below.'
    );
  if (!canStart()) return false;
  const permission = await engine.requestMicrophonePermissionsAsync();
  if (!permission.granted)
    throw new Error(
      'Microphone access was denied. Enable it in device settings or type expenses below.'
    );
  await waitForAccess();
  if (!canStart()) return false;
  if (engine.getStateAsync && (await engine.getStateAsync()) !== 'inactive')
    throw new Error('The speech recognizer is still stopping. Try again in a moment.');
  if (!canStart()) return false;
  onStart();
  engine.start({
    lang: locale,
    interimResults: true,
    continuous: false,
    requiresOnDeviceRecognition: true,
    recordingOptions: { persist: false },
    maxAlternatives: 1,
  });
  return true;
}
