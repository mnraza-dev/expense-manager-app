const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  startOfflineSpeech,
  installedSpeechLocale,
  downloadOfflineSpeechModel,
  OfflineSpeechError,
  speechRecognitionError,
  VoiceTranscript,
} = require('../.test-build/services/offlineSpeech.js');
function engineWithModels(installed, locales = installed) {
  const starts = [],
    downloads = [];
  const engine = {
    supportsOnDeviceRecognition: () => true,
    getStateAsync: async () => 'inactive',
    getSupportedLocales: async () => ({ locales, installedLocales: installed }),
    requestMicrophonePermissionsAsync: async () => ({ granted: true }),
    start: (options) => starts.push(options),
    androidTriggerOfflineModelDownload: async (options) => {
      downloads.push(options);
      return { status: 'download_success', message: 'Native completion' };
    },
  };
  return { engine, starts, downloads };
}
test('English can use an installed regional offline model without changing language or privacy', async () => {
  const { engine, starts } = engineWithModels(['hi-IN', 'en-US']);
  let resolved = null;
  assert.equal(
    await startOfflineSpeech(
      engine,
      'android',
      34,
      'en-IN',
      () => true,
      async () => {},
      (locale) => {
        resolved = locale;
      }
    ),
    true
  );
  assert.equal(resolved, 'en-US');
  assert.equal(starts.length, 1);
  assert.equal(starts[0].lang, 'en-US');
  assert.equal(starts[0].requiresOnDeviceRecognition, true);
  assert.deepEqual(starts[0].recordingOptions, { persist: false });
  assert.equal(installedSpeechLocale('en-IN', ['en-US', 'EN_in']), 'EN-in');
  assert.equal(installedSpeechLocale('hi-IN', ['en-US']), null);
  assert.equal(installedSpeechLocale('ur-PK', ['ur_IN']), 'ur-IN');
});
test('missing models expose a download target in the selected language and do not start the microphone', async () => {
  const { engine, starts, downloads } = engineWithModels(['hi-IN'], ['hi-IN', 'en-US']);
  let permissions = 0;
  engine.requestMicrophonePermissionsAsync = async () => {
    permissions++;
    return { granted: true };
  };
  await assert.rejects(
    startOfflineSpeech(
      engine,
      'android',
      34,
      'en-IN',
      () => true,
      async () => {}
    ),
    (error) => {
      assert.ok(error instanceof OfflineSpeechError);
      assert.equal(error.recovery, 'download');
      assert.equal(error.locale, 'en-US');
      assert.match(error.message, /English.*not installed/);
      assert.match(error.message, /Download speech language/);
      return true;
    }
  );
  assert.equal(permissions, 0);
  assert.equal(starts.length, 0);
  assert.equal(downloads.length, 0);
  await assert.rejects(
    startOfflineSpeech(
      engine,
      'android',
      34,
      'ur-PK',
      () => true,
      async () => {}
    ),
    (error) => error.locale === 'ur-PK'
  );
});
test('model setup requests the native download explicitly and never starts recognition automatically', async () => {
  const { engine, starts, downloads } = engineWithModels([]);
  const message = await downloadOfflineSpeechModel(
    engine,
    'android',
    34,
    'en-US',
    () => true,
    async () => {}
  );
  assert.deepEqual(downloads, [{ locale: 'en-US' }]);
  assert.match(message, /installed.*Tap Start speaking/);
  assert.equal(starts.length, 0);
  for (const [status, pattern] of [
    ['opened_dialog', /Complete.*device dialog/],
    ['download_scheduled', /queued.*Wi-Fi/],
  ]) {
    engine.androidTriggerOfflineModelDownload = async () => ({ status, message: '' });
    const notice = await downloadOfflineSpeechModel(
      engine,
      'android',
      33,
      'en-IN',
      () => true,
      async () => {}
    );
    assert.match(notice, pattern);
    assert.doesNotMatch(notice, /installed/);
  }
});
test('model setup respects cancelled access and suppresses results after leaving the screen', async () => {
  const { engine, downloads } = engineWithModels([]);
  assert.equal(
    await downloadOfflineSpeechModel(
      engine,
      'android',
      34,
      'en-IN',
      () => false,
      async () => {}
    ),
    null
  );
  let visible = true;
  assert.equal(
    await downloadOfflineSpeechModel(
      engine,
      'android',
      34,
      'en-IN',
      () => visible,
      async () => {
        visible = false;
      }
    ),
    null
  );
  assert.equal(downloads.length, 0);
  visible = true;
  engine.androidTriggerOfflineModelDownload = async () => {
    visible = false;
    return { status: 'download_success', message: '' };
  };
  assert.equal(
    await downloadOfflineSpeechModel(
      engine,
      'android',
      34,
      'en-IN',
      () => visible,
      async () => {}
    ),
    null
  );
});
test('unsupported model downloads and native download failures provide a settings recovery', async () => {
  const { engine, starts, downloads } = engineWithModels([]);
  for (const [platform, version, source] of [
    ['android', 32, engine],
    ['ios', 18, engine],
    ['android', 34, null],
  ])
    await assert.rejects(
      downloadOfflineSpeechModel(
        source,
        platform,
        version,
        'en-IN',
        () => true,
        async () => {}
      ),
      (error) => error.recovery === 'settings'
    );
  assert.equal(downloads.length, 0);
  engine.androidTriggerOfflineModelDownload = async () => {
    throw new Error('Device download failed');
  };
  await assert.rejects(
    downloadOfflineSpeechModel(
      engine,
      'android',
      34,
      'en-IN',
      () => true,
      async () => {}
    ),
    (error) => error.recovery === 'settings' && /connection/.test(error.message)
  );
  assert.equal(starts.length, 0);
});
test('permission, model, microphone and silence errors have different actionable messages', () => {
  assert.match(
    speechRecognitionError('language-not-supported', 'ur-PK', 'android', 12).message,
    /not supported/
  );
  assert.equal(
    speechRecognitionError('language-not-supported', 'ur-PK', 'android', 12).recovery,
    'settings'
  );
  assert.equal(
    speechRecognitionError('language-not-supported', 'en-IN', 'android', 13).recovery,
    'download'
  );
  assert.equal(speechRecognitionError('not-allowed', 'en-IN', 'android').recovery, 'settings');
  assert.equal(
    speechRecognitionError('language-not-supported', 'hi-IN', 'android').locale,
    'hi-IN'
  );
  assert.equal(
    speechRecognitionError('language-not-supported', 'hi-IN', 'ios').recovery,
    'settings'
  );
  assert.match(
    speechRecognitionError('audio-capture', 'en-IN', 'android').message,
    /microphone could not start/i
  );
  assert.match(speechRecognitionError('speech-timeout', 'en-IN', 'android').message, /No speech/);
  assert.equal(speechRecognitionError('speech-timeout', 'en-IN', 'android').recovery, null);
});
test('interim text is reviewed once on normal end, empty finals cannot erase it and cancelled text is discarded', () => {
  const received = new VoiceTranscript();
  assert.deepEqual(received.receive('Tea 15 rupees', false), {
    text: 'Tea 15 rupees',
    review: null,
  });
  assert.equal(received.receive('', true), null);
  assert.equal(received.finish(), 'Tea 15 rupees');
  assert.equal(received.finish(), null);
  received.reset();
  assert.equal(received.finish(), null);
  assert.equal(received.receive('Lunch 140 rupees', true).review, 'Lunch 140 rupees');
  assert.equal(received.finish(), null);
  assert.equal(received.receive('Lunch 140 rupees', true).review, null);
  received.receive('Cancelled expense 30 rupees', false);
  received.reset();
  assert.equal(received.finish(), null);
});
