const fs = require('node:fs');
const path = require('node:path');
const marker = 'SETTLER_REQUIRE_OFFLINE_SPEECH';
const anchor = `    do {
      let request = Self.prepareRequest(
        options: options,
        recognizer: recognizer
      )`;
const guard = `    // SETTLER_REQUIRE_OFFLINE_SPEECH: never silently fall back to network recognition.
    guard !options.requiresOnDeviceRecognition || recognizer.supportsOnDeviceRecognition else {
      errorHandler(RecognizerError.recognizerIsUnavailable)
      reset(andEmitEnd: true)
      return
    }

`;
function patchSource(source) {
  if (source.includes(marker)) return source;
  if (!source.includes(anchor))
    throw new Error(
      'Speech recognition native code changed. Review the offline privacy guard before installing.'
    );
  return source.replace(anchor, guard + anchor);
}
if (require.main === module) {
  const root = path.dirname(require.resolve('expo-speech-recognition/package.json'));
  const target = path.join(root, 'ios/ExpoSpeechRecognizer.swift');
  const original = fs.readFileSync(target, 'utf8');
  const patched = patchSource(original);
  if (patched !== original) fs.writeFileSync(target, patched);
  process.stdout.write('Settler iOS offline speech guard applied.\n');
}
module.exports = { patchSource, anchor, guard };
