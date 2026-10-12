export const PRIVACY_POLICY_URL = 'https://mnraza-dev.vercel.app/privacy-policy.html';
export const PRIVACY_CONTACT = 'mnraza.dev@gmail.com';
export const PRIVACY_UPDATED = 'October 12, 2026';
export const OCR_PRIVACY_NOTICE =
  'Receipt images and recognized text are processed on this device, not sent to Google. Google ML Kit may send SDK diagnostics and usage metrics, including device/app information, installation identifiers, performance, image dimensions and error codes, to Google. It may also check for model or compatibility updates.';
export const privacySections = [
  {
    title: 'Financial records and local storage',
    text: 'Settler, provided by RazaTech Labs, stores accounts, categories, transactions, budgets, goals, bills, loan/card records and audit history in the app’s private storage. It does not connect to your bank or move money. Local use requires no online account. Local records are not encrypted by the app; device security protects app storage. The optional passcode and biometric lock control access to the interface, not database encryption. App-lock verification material is kept in secure device storage; Settler does not receive your biometric templates.',
  },
  {
    title: 'Receipts and camera',
    text: `Camera access is requested when you choose to photograph a receipt. The system file picker gives access only to files you select. Attached JPEG, PNG and PDF receipts stay in the app’s private device storage and are excluded from financial backups and cloud synchronization. Scanning supports images. ${OCR_PRIVACY_NOTICE}`,
  },
  {
    title: 'Voice entry',
    text: 'Microphone access is requested when you start dictation. Supported devices use on-device speech recognition; Settler does not keep an audio recording or send your speech to a cloud recognizer. Recognition is unavailable when an offline model cannot be used. Your device’s speech service may need an internet connection to download a language model when you request it. Typed drafts stay on screen until you save them as transactions.',
  },
  {
    title: 'Notifications',
    text: 'Optional payment reminders are scheduled on the device after you enable notifications. Their lock-screen text does not include financial amounts, account names or merchant details. Settler does not register for remote push notifications. Delivery time depends on the operating system and may be delayed.',
  },
  {
    title: 'Sharing and exports',
    text: 'CSV, Excel, PDF, backup and receipt sharing occurs only when you choose it through the system share sheet. The receiving app or person can read an unencrypted export. A backup is encrypted only when you enter an encryption password; app-lock secrets and receipt files are not included. You control copies sent outside Settler. Temporary export copies are kept in the device cache and older copies are removed on a later export or by the operating system.',
  },
  {
    title: 'Retention and deletion',
    text: 'Local records, attachments and recovery copies remain until you remove them, clear Settler’s storage in Android Settings, or uninstall the app. Archive and ordinary financial transaction deletion may retain audit history; they are not a full device-data erasure. Export anything you need before clearing storage. Removing the app cannot erase copies you shared with other apps or people. Android automatic cloud backup and device transfer of Settler’s app data are disabled in updated native builds; use the explicit backup feature instead.',
  },
  {
    title: 'Advertising, diagnostics and external links',
    text: 'Settler contains no advertising UI and does not request an advertising identifier. Receipt recognition uses Google ML Kit as described above; local processing does not mean the SDK sends no diagnostics. Opening a privacy, support or store link lets that external service receive ordinary connection information under its own privacy policy. The developer receives information you choose to include in a support email. Do not send passwords or complete financial exports unless necessary for a support request.',
  },
  {
    title: 'Required app updates',
    text: 'When an update service is configured, Settler requests public minimum-version information over HTTPS at startup and while active. This check does not sign you in, load a saved login session or upload your financial records. The service receives ordinary connection information such as an IP address and client headers. Android update actions open Settler’s Google Play listing. Contact privacy support with questions about update-service connection logs.',
  },
  {
    title: 'Optional cloud and purchases',
    text: 'Cloud accounts, sync and purchases are unavailable in the current configuration. If enabled in a future release, the app must disclose the change before you use those features. Cloud authentication would send email and account credentials to Supabase; backup/sync would send selected financial records and audit history over HTTPS to private, authenticated storage. The backend operator could read cloud records; this would not be end-to-end encryption. Configured purchases would send an account identifier and store transaction information to RevenueCat and the app store. Cloud account deletion and an external deletion-request resource must be provided before account creation is enabled.',
  },
  {
    title: 'Privacy requests',
    text: `For questions, access or deletion requests concerning information you send to RazaTech Labs, email ${PRIVACY_CONTACT}. State that your request concerns Settler. We cannot remotely read or erase your device-local ledger. You can revoke camera, microphone and notification permissions in Android Settings. Target-audience and regional privacy requirements must be reviewed for each release.`,
  },
] as const;
