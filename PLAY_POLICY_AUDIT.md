# Google Play Policy Audit

Date: **2026-10-12** (Asia/Calcutta)\
App / package / versionCode: **Settler / `com.razatechlabs.settler` / 5**, version 1.3.0\
Source baseline: `724bcb5621515d8953244055e7bc01c1be65b6e2`, plus the audit fixes in the working tree.\
Original source tree SHA-256: `057093e11909bb3baf2912ae985c1fbac2863377aa5c67f84fc6faa2ce7411dd` (208 files).\
Current follow-up source tree SHA-256: `5c47e9e66ce0de3df1621b8a19baa6faed13a6236dfc9f90e7fe4d7d8f92e9ea` (212 source/configuration/test files).\
Existing AAB SHA-256: `3cb0afc2e1428b48516b078b4165ca6545459d99886cb59da08beb0a93de22eb`.\
Official policy last checked: **2026-10-12**.\
Verdict: **BLOCKED — do not submit or publish the existing AAB.**

Applied skill: [Google Play Policy Guardian](.claude/skills/google-play-policy-guardian/SKILL.md). Its release gate states: “No release approval with any BLOCKER, unverified high-risk control, or missing mandatory Play Console declaration.” This audit identifies code fixes and unresolved evidence; it is not Google approval. Unknown declarations are release gates, not allegations that the developer has submitted false information.

## Scope and verified configuration

Inspected Android/Expo configuration, native OCR, permissions and SDK dependencies, release manifests, the existing signed AAB, application routes, persistence/security, camera/voice/receipt flows, notifications, exports, optional cloud/Auth/billing, SQL policies and server functions. The developer confirmed **no authentication currently**. The local release profile explicitly disables online accounts and purchases, even if public environment keys are added. The build configuration checks these controls and excludes the unused native Android billing SDK. Account creation and purchases remain unavailable; Settings hides the inactive cloud entry. A separate anonymous client can retrieve public update metadata without loading saved Auth sessions. No credential values were printed.

The app records personal finances; it does not connect banks, provide loans, transfer money, host a public feed, or generate AI content. Local financial “accounts” and an optional device passcode are not online app accounts. Receipt OCR and voice parsing are recognition/draft-entry features. Online account-deletion and generative-content moderation requirements are consequently not current release blockers, provided the exact release configuration stays this way.

Unknown: Play Console declarations and policy notices, target countries/age groups, content rating, distribution track, highest uploaded versionCode, developer verification/app registration, store screenshots/text, asset ownership, and production network behavior of every bundled SDK. No backend was deployed or modified. The existing AAB was preserved; no new signed candidate was produced or installed.

[Original audit evidence](docs/play/evidence/2026-10-12.json) records the original hashes, permissions and limitations. [Local-profile follow-up evidence](docs/play/evidence/local-release-profile.json) records the latest controls, reduced native graph and source digest. [The app-specific public privacy notice draft](docs/play/settler-privacy-notice.html) is prepared locally and **has not been hosted**.

## Policy freshness and dates

- The [Developer Program Policies](https://support.google.com/googleplay/android-developer/answer/18258653) page states an effective date of **September 30, 2026**, unless otherwise specified.
- [Target API requirements](https://support.google.com/googleplay/android-developer/answer/11926878) require API 36 for new phone apps/updates from **August 31, 2026**; an account-specific extension may run to November 1. This app already targets and compiles against API 36, minimum API 24.
- The current [16 KB guidance](https://developer.android.com/guide/practices/page-sizes) lists **February 1, 2027** as the update-blocking date. Google's [earlier announcement](https://android-developers.googleblog.com/2025/05/prepare-play-apps-for-devices-with-16kb-page-size.html) gave November 1, 2025. Verify the deadline/warning shown for this app in Console; this audit does not assume an extension. The inspected old AAB passes static 16 KB checks, but the next binary still needs verification.
- [Billing version deadlines](https://developer.android.com/google/play/billing/deprecation-faq) retire Billing 7 for new submissions/updates after August 31, 2026. The old AAB bundled Billing **8.3.0**; the updated Android profile excludes the native billing SDK entirely.
- [Policy deadlines](https://support.google.com/googleplay/android-developer/table/12921780) require checking app registration/developer verification effective September 30, 2026. Upcoming January 27, 2027 location, call-log and geofencing changes were reviewed; those functions are absent.

## Applicability and evidence matrix

`PASS (source)` means the inspected control or automated test passed, not that native behavior or the uploaded release is certified. `UNKNOWN` stays unresolved. Fixed controls must be present in the final signed binary.

| Policy / control | Applicability | Implementation evidence | Test | Result | Severity | Required action | Source |
| --- | --- | --- | --- | --- | --- | --- | --- |
| In-app privacy access | Yes | New `app/privacy/index.tsx`, Settings link and app-specific text | Type checking / bundle export; native navigation pending | PASS (source), old AAB lacks fix | HIGH, fixed in source | Include in new candidate | [User Data](https://support.google.com/googleplay/android-developer/answer/10144311) |
| Public privacy and retention | Yes | Supplied HTTPS policy fetched successfully; names RazaTech Labs, provides contact, updated Oct 5; broad shared-app wording | Content review; no store declaration available | UNKNOWN final disclosure match | NEEDS_HUMAN_REVIEW | Review/host Settler notice and verify listing identity/URL | [User Data](https://support.google.com/googleplay/android-developer/answer/10144311) |
| Data safety including SDKs | Yes | ML Kit common 18.11.0, bundled text-recognition 16.0.1; no declaration export | Dependency inspection; no network capture | UNKNOWN | BLOCKER | Reconcile actual collection with Console | [Data safety](https://support.google.com/googleplay/android-developer/answer/10787469) |
| OCR diagnostic transparency | Yes | New scan-screen notice and `src/privacy/policy.ts` distinguish local images/text from SDK metrics | Source and SDK terms reviewed | PASS (source) | HIGH, fixed in source | Verify displayed notice and SDK traffic | [ML Kit privacy](https://developers.google.com/ml-kit/terms), [SDK disclosures](https://developers.google.com/ml-kit/android-data-disclosure) |
| Camera / microphone in context | Yes | Camera only after Photograph receipt; dictation checks local models before permission/start | Voice cancellation/permission tests; native dialogs pending | PASS automated / UNKNOWN device | NEEDS_HUMAN_REVIEW | Denial, revocation and background tests | [Sensitive permissions](https://support.google.com/googleplay/android-developer/answer/16558241) |
| Photos / broad storage | Yes | System document picker copies selected files; no broad media/storage permissions in either release manifest | Manifest inspection; picker/device flow pending | PASS (manifest) | LOW | Confirm picker behavior on candidate | [Photo/video permissions](https://support.google.com/googleplay/android-developer/answer/16558241) |
| Overlay / ad ID / exact alarms | Yes | Explicit removal rules; refreshed merged manifest has none | Native manifest/resource compilation | PASS (updated manifest); overlay remains in old AAB | HIGH, fixed in source | Replace old candidate after testing | [Permissions](https://support.google.com/googleplay/android-developer/answer/16558241) |
| Contacts, SMS, location, accessibility, package inventory | No corresponding feature | No restricted permissions or broad `QUERY_ALL_PACKAGES`; narrow speech/share/store queries | Source/manifest inspection | PASS (manifest) | LOW | Monitor transitive SDK changes | [Permissions](https://support.google.com/googleplay/android-developer/answer/16558241) |
| Automatic backup / device transfer | Privacy hardening | New explicit exclusions for every app-storage domain; `allowBackup=false` | XML tests, resource compilation | PASS (source/resources) | MEDIUM, fixed in source | Test migration/manual recovery; save manual backup first | [Android backup](https://developer.android.com/identity/data/autobackup) |
| Financial storage and exports | Yes | Private SQLite/files; passcode is not database encryption; CSV/XLSX/PDF escaping; optional encrypted backup; sharing now waits for unlocked foreground | Accounting, backup, cryptography/export tests; native share pending | PASS automated / UNKNOWN native | HIGH sharing hardening fixed in source | Verify lock/background/share transitions | [User Data](https://support.google.com/googleplay/android-developer/answer/10144311) |
| Remote push registration | No active feature | Local reminders only; Firebase Messaging 25.0.1 transitively present; auto-init and Firebase Analytics collection disabled (ML Kit metrics remain) | Updated manifest inspection; no traffic capture | PASS (configuration), UNKNOWN SDK traffic | MEDIUM | Verify no remote token registration in candidate | [FCM initialization](https://firebase.google.com/docs/cloud-messaging/android/get-started) |
| Notification / background behavior | Yes | Opt-in, generic lock-screen text, local scheduling; no FGS/full-screen intent or exact-alarm permission | Reminder reconciliation tests; native delivery pending | PASS automated / UNKNOWN device | MEDIUM | Confirm permission denial/reboot; delivery may be delayed | [Permissions](https://support.google.com/googleplay/android-developer/answer/16558241) |
| Financial features declaration | Yes | Budgets, balances, debt/card tracking and interest arithmetic | Console unavailable | UNKNOWN | BLOCKER | Complete accurate financial declaration; review “Other” against actual features | [Financial declaration](https://support.google.com/googleplay/android-developer/answer/13849271) |
| Loan-provider / gambling / crypto licensing | No observed provider/trading feature | Loan records are local bookkeeping, no lender referrals or funding; no gambling/crypto flows | Source/endpoints inspected | NOT_APPLICABLE for current behavior | NOT_APPLICABLE | Listing must not imply lending, banking or investment advice | [Financial Services](https://support.google.com/googleplay/android-developer/answer/9876821) |
| App account deletion | Conditional, inactive | Local profile prevents online account activation; dormant Supabase deletion function present | Local PostgreSQL tests do not verify a deployed deletion service | NOT_APPLICABLE now; UNKNOWN if enabled | HIGH future gate | Re-audit before enabling Auth; provider cleanup and external request resource required | [Account deletion](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en-EN) |
| Digital purchases / cancellation | Conditional, inactive | Build/runtime profile disables purchases; Android native billing excluded; management link and dormant purchase dialog remain in unreachable future code | Billing 8.3.0 dependency inspected; no sandbox purchase | NOT_APPLICABLE now; FAIL future paywall terms | HIGH future gate | Replace price-only dialog with verified complete plan/offer terms before enabling purchases | [Payments](https://support.google.com/googleplay/android-developer/answer/9858738), [Subscriptions](https://support.google.com/googleplay/android-developer/answer/9900533) |
| Ads / disruptive advertising | No observed ads | No advertising UI; Android native RevenueCat, ads-identifier and location dependency paths excluded; AD_ID blocked | Source/dependency inspection; Console unknown | PASS (no ads found), UNKNOWN declaration | NEEDS_HUMAN_REVIEW | Confirm Contains ads answer from real behavior | [Ads](https://support.google.com/googleplay/android-developer/answer/9857753) |
| Generative AI moderation / reporting | No | No generative provider, prompts, generated feeds or output URLs; recognition only | Source/dependencies inspected | NOT_APPLICABLE | NOT_APPLICABLE | Re-audit if generation is introduced | [AI content](https://support.google.com/googleplay/android-developer/answer/13985936), [Explanation](https://support.google.com/googleplay/android-developer/answer/14094294) |
| Public UGC reporting / blocking | No | Receipts and notes remain private; external share uses the user's OS share sheet | Routes, files and endpoints inspected | NOT_APPLICABLE | NOT_APPLICABLE | Re-audit any shared feed/chat/upload service | [UGC](https://support.google.com/googleplay/android-developer/answer/9876937) |
| Child safety / restricted content | General policy applies | No social/dating/chat or sexual/violent content feature; app assets and listing rights not fully verified | Code/asset inventory, no final listing/screenshots | UNKNOWN listing/audience | NEEDS_HUMAN_REVIEW | Owner reviews final imagery/text and intended audience | [Content](https://support.google.com/googleplay/android-developer/answer/9878810) |
| Families / age groups | Conditional | No audience declaration provided; adult finance intent must not be assumed | No Console export | UNKNOWN | BLOCKER | Verify age groups; assess SDK eligibility if children are targeted | [Families](https://support.google.com/googleplay/android-developer/answer/9893335) |
| Store metadata / IP / claims | Yes | Draft/source features inspected, supplied developer policy verified; final listing and asset provenance absent | No final metadata/screenshot evidence | UNKNOWN | BLOCKER final cross-check | Match actual app, feature availability, contact and asset rights | [Metadata](https://support.google.com/googleplay/android-developer/answer/9898842) |
| Reviewer access | Yes | No online login/paywall allowed by local profile; optional device PIN is user-created | Device package read; full reviewer journey pending | UNKNOWN declaration/test | BLOCKER | Supply unrestricted-access declaration and offline/setup instructions | [App access](https://support.google.com/googleplay/android-developer/answer/15748846) |
| Target / compile SDK | Yes | AAB and refreshed manifest: target/compile 36, min 24 | Bundletool + Gradle | PASS for inspected versions | LOW | Verify final candidate stays API 36+ | [Target API](https://support.google.com/googleplay/android-developer/answer/11926878) |
| 64-bit / 16 KB support | Yes | Old AAB has four ABIs; 56 64-bit ELF libraries pass; config PAGE_ALIGNMENT_16K; generated APK zip alignment passes | Static old-artifact checks; connected phone has 4 KB pages | PASS old artifact / UNKNOWN new binary runtime | NEEDS_HUMAN_REVIEW | Repeat on new AAB including Expo GL; test 16 KB device/emulator | [Page sizes](https://developer.android.com/guide/practices/page-sizes) |
| Signing / package / version integrity | Yes | Plugin removes release debug fallback; missing/debug signing rejected; configured upload signing accepted; old AAB signature verifies | Positive/negative Gradle checks and jarsigner | PASS checks / UNKNOWN Play identity and next versionCode | BLOCKER final artifact | Verify Play upload key and unused versionCode; build new candidate | [App signing](https://developer.android.com/studio/publish/app-signing) |
| Update mechanism / remote code | Conditional checker inactive | Android parser/open action and new SQL constraint accept only own Play listing; no app-side APK/code downloads, OTA disabled | URL-spoofing and PostgreSQL permission/constraint tests | PASS (source); server migration not deployed | HIGH, fixed in source | Keep checks inactive until available update; deploy constraint if backend is enabled | [Device/network abuse](https://support.google.com/googleplay/android-developer/answer/16559646) |
| Vulnerable dependencies | Yes | Patched decoder 0.5.0 plus CJS bridge; brace-expansion 1.1.21; 30 residual npm findings | Malformed-link timeout, query regressions, fresh audit | PARTIAL; residual triage open | NEEDS_HUMAN_REVIEW | Review remaining build-time paths; native navigation test required | [Decoder advisory](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr), [Device/network abuse](https://support.google.com/googleplay/android-developer/answer/16559646) |
| App quality / crashes / ANRs | Yes | 156 tests; native resource build; JS exports; old installed app metadata only | Old device records show low-memory exits, not a new-candidate crash/ANR test | UNKNOWN release quality | HIGH | Native smoke/performance tests on new candidate, including charts/keyboard | [Core quality](https://developer.android.com/docs/quality-guidelines/core-app-quality) |
| Developer verification / distribution requirements | Yes | No Console/account registration evidence | No account/track/country evidence supplied | UNKNOWN | BLOCKER | Verify registration, account status and track eligibility | [Deadlines](https://support.google.com/googleplay/android-developer/table/12921780) |

## Additional prevention controls

The follow-up addresses accidental feature/SDK activation rather than claiming guaranteed Google approval:

- `src/release/profile.json` keeps accounts and purchases disabled. `app.config.js` and `npm run play:guard` reject profile drift or loss of the billing exclusion.
- `cloudClient()` and `verifiedOwner()` reject private cloud operations in this release. Existing local finance data is retained.
- `publicReleaseClient()` reads public minimum-version metadata with no saved login, token refresh or session persistence; adding backend keys cannot turn on sign-up or purchases.
- Expo Android autolinking excludes `react-native-purchases`. The native dependency graph no longer contains RevenueCat, Amazon billing, Play Billing or its ads-identifier/location paths. This follows [Expo's documented exclusion mechanism](https://docs.expo.dev/modules/autolinking/).
- The final merged manifest has 14 permissions, with billing/install-referrer and all unused launcher badge permissions removed; Firebase Analytics collection is explicitly disabled. These controls do not disable ML Kit diagnostics, which still require truthful disclosures and Data safety review.
- Two regression tests exercise malicious/accidental profile changes, synthetic credentials, old Auth state and SDK initialization prevention. The suite now contains 156 passing tests.

The old signed AAB is unchanged, the hosted policy has not been updated, and native phone/upgrade/network testing remains open. These controls reduce avoidable risks; they are not a release approval.

## Findings and remediation

| ID | Severity / state | File / screen / control | Risk and exact fix | Owner |
| --- | --- | --- | --- | --- |
| B01 | BLOCKER — OPEN | Play Console App content/account | Data safety, audience, rating, Ads, financial features, app access, registration and release-track evidence unavailable. Export/review them against this exact candidate; do not infer answers from “offline.” | Release owner |
| B02 | BLOCKER — OPEN | `builds/settler-1.3.0.aab` / versionCode 5 | Existing binary contains old permissions and lacks audit fixes. Pick an unused versionCode above Console's maximum, build with the registered upload key, rerun artifact checks, install over test data and capture runtime evidence. | Release owner / engineering |
| H01 | HIGH — FIXED IN SOURCE; runtime open | Settings, Privacy and Scan receipt | Previously no in-app policy or explicit ML Kit diagnostics disclosure. Added app-specific policy/contact/public link and pre-scan explanation. Review/host the supplied notice and reconcile SDK collection with Console. | Engineering / privacy owner |
| C01 | HIGH — FIXED IN SOURCE; native QA open | `src/release/profile.json`, app config, cloud clients and Android autolinking | Keys alone cannot enable accounts/purchases. Native billing/ads-identifier/location paths and unused permissions excluded; public Play update checks kept separate. New signed candidate still required. | Engineering |
| H02 | HIGH — FIXED IN SOURCE | Expo config / release Gradle | Unused overlay permission and default debug signing fallback. Blocked overlay/ad-ID/exact alarms, added persistent native config plugin, rejected debug/unsigned release tasks and verified legitimate upload config still passes. | Engineering |
| H03 | HIGH — FIXED IN SOURCE; native open | Navigation decoder | Router's query parser reached vulnerable `decode-uri-component` 0.2.2. Override to upstream 0.5.0; checked postinstall bridge preserves CommonJS callers. Malformed-input subprocess and multilingual queries pass. | Engineering |
| H04 | HIGH — FIXED IN SOURCE; native open | `src/services/files.ts`, `app/cloud/callback.tsx` | Export/recovery sharing could proceed after background/lock; unconfigured or failed Auth callback could throw. Added foreground/unlock gates before sharing and guarded callback errors/inactive configuration. | Engineering |
| H05 | HIGH — OPEN VERIFICATION | Candidate runtime / SDK traffic | No new-binary keyboard, navigation, permission, network, chart, lock, notification or upgrade tests/video. Connected phone was inspected read-only; the current app was not replaced. | QA / privacy owner |
| F01 | HIGH — FUTURE ACTIVATION GATE | Cloud sign-up, deletion, subscriptions | No current account/billing violation asserted. Future deployment needs public deletion resource, Supabase/RevenueCat cleanup/retention tests, full paywall period/renewal/trial/benefit terms and sandbox purchase/restore/cancel testing. Management link and startup billing guard added; these alone do not approve paid rollout. | Backend / billing owner |
| M01 | MEDIUM — FIXED IN SOURCE | Android storage and notifications | Disabled automatic app-data backup/transfer and FCM auto-init; explicit native exclusion resources compile. Previous SecureStore rules already limited backup to non-secure shared preferences; this was hardening, not evidence that the entire database had been uploaded. Manual backups remain available. | Engineering |
| M02 | NEEDS_HUMAN_REVIEW — OPEN | Dependency tree / profiling | Residual audit: 21 high, 9 moderate, zero critical. Main leaf advisories include unpatched `braces` in Metro, `node-forge` in Expo CLI/certificate tooling and `uuid` in Xcode tooling. Parent severity labels do not establish native runtime exposure. Latest available braces/node-forge versions remain affected; forced SDK downgrades were rejected as an unsafe remedy. Review tooling inputs and safe upstream fixes. Old device low-memory exits justify profiling, not a proven crash-policy violation. | Security / engineering |
| L01 | LOW — FIXED IN UPDATED NATIVE CONFIG | Transitive notification/billing dependencies | Unused OEM badge, billing and install-referrer permissions are blocked. Native Android RevenueCat and its Amazon/billing/location/ads-identifier paths are excluded. The old AAB still contains the old SDKs. Native upgrade/notification tests remain required; do not infer SDK data practices from class names alone. | Engineering |

## Data flow and Data safety worksheet

These are **evidence-based candidates for review**, not submitted answers. The [Data safety guidance](https://support.google.com/googleplay/android-developer/answer/10787469) distinguishes local processing from off-device collection and SDK behavior; absence of Auth does not settle the declaration.

| Data / surface | Actual handling | Retention / deletion | Console review |
| --- | --- | --- | --- |
| Ledger, budgets, goals, card/loan history | Private SQLite; no configured cloud upload | Kept locally, including audit/recovery history; clear app storage/uninstall for full local erasure | Do not mark financial records collected solely because they are stored locally; verify network behavior |
| Receipt image/PDF and recognized text | Selected/captured private copies; local OCR; no image/text upload in app code | Attachments device-local and excluded from financial backups; file cleanup plus full local erasure | Separate receipt content from SDK metrics |
| ML Kit diagnostics | SDK may transmit device/app info, installation identifiers, performance, API configuration and usage/error events | Google's service terms; developer must review applicable provider retention | Candidate categories: device/other identifiers, diagnostics/other performance data, app interactions; purposes analytics/functionality as actually applicable. Collection/sharing/optional flags require SDK-version/runtime review. [Google SDK disclosure](https://developers.google.com/ml-kit/android-data-disclosure) |
| Voice | On-device engine required; no persistent audio recording; user-requested model download uses device service | Draft transcript until saved; saved transactions follow ledger retention | Verify no speech-content network traffic; distinguish model download from audio upload |
| Passcode / biometrics | SecureStore verifier and OS authentication; no biometric template received | Secure local state; remove lock/clear storage as appropriate | Not a cloud user account or uploaded biometric record |
| CSV/XLSX/PDF/backup/receipt sharing | User-triggered OS share sheet; chosen recipient gains access; encrypted backups optional | Cached exports cleaned on later exports/OS cleanup; recipient copies outside app control | Review applicable user-initiated sharing treatment; never promise third-party copies are erased |
| Public minimum-version checks | Anonymous HTTPS metadata request when backend is configured; no ledger upload or saved Auth session | Service connection logs need provider/retention review before activation | Review ordinary connection metadata; this does not create an app account |
| Local reminders | Generic payment notification; no financial name/amount in body | Device schedules reconciled/removed when disabled | Review transitive FCM/FIS behavior; no remote token API used by app |
| External policy/support link | Browser or mail app receives ordinary connection/email information | External provider/developer support practices | Verify developer policy and support retention; user chooses what to send |
| Supabase / RevenueCat | Dormant code remains; local profile blocks Auth/billing activation. Native billing SDK excluded on Android | Not an active user-facing cloud/account/payment service | Reassess all data categories, deletion and provider transfers before activation |

No broad “no data collected” answer is approved. Also do not automatically mark SDK processing as advertising, sale or third-party sharing: use the actual purpose and applicable service-provider rules.

## AI / UGC abuse test results

| Test | Expected | Actual | Evidence | Result |
| --- | --- | --- | --- | --- |
| Generative provider/API, models, styles and output URL routes | No such feature in this app | None found; ML Kit text recognition only | Source, dependencies, native OCR | NOT_APPLICABLE |
| Public feed, chat, profiles, shared upload/catalog | No in-app public distribution | None found; private attachments and explicit external sharing | Routes and storage flows | NOT_APPLICABLE |
| Reference-image parsing / private file access | Reject unsafe files/URIs and excessive images | Native canonical cache-only files, size/pixel limits; attachment/parser tests pass | OCR module / receipt tests | PASS automated; native negative cases pending |
| Malformed incoming URL | Parser must finish without hanging | Patched parser completes bounded subprocess test | `tests/query-decoder.test.cjs` | PASS |
| Privileged key / forged cloud ownership | Reject privileged public keys and unauthorized cross-owner records | Existing public-key and PostgreSQL/RLS regressions pass | Node/PGlite tests | PASS locally; cloud service inactive |

Sexual/violent/prompt-injection generation tests, reporting dashboards and generation kill switches are not fabricated or added to a recognition-only finance app. The [AI safeguards](https://support.google.com/googleplay/android-developer/answer/16353813) and UGC controls must be revisited if those features are introduced.

## Verification results and limits

| Check | Result / evidence |
| --- | --- |
| Unit/integration suite | **156 passed, 0 failed**: SQLite/accounting, backups/security, SQL/RLS, reminders, voice/receipt parsing, charts, release-policy rules and query decoding |
| TypeScript / ESLint | **PASS / PASS** on final source |
| Android + iOS Hermes exports | **PASS / PASS** on final source; hashes recorded in evidence JSON. These are not a signed native release |
| Native manifest/resources/dependency graph | Gradle `processReleaseMainManifest`, `processReleaseResources`, releaseRuntimeClasspath completed successfully |
| Signing negative/positive control | `verifySettlerReleaseSigning` fails without upload signing and succeeds with the existing upload-keystore configuration |
| Existing AAB structural/signature validation | Google's bundletool 1.18.3 validation and jarsigner pass; self-signed upload certificates are normal and do not prove the registered Play key matches |
| Existing AAB 16 KB checks | 56 ELF64 libraries have LOAD alignment at least 16 KB, bundle requests PAGE_ALIGNMENT_16K, generated universal APK passes zipalign `-P 16` |
| Dependency audit | **34 → 30** findings after two narrow updates; no critical finding; residual issues above remain open |
| Connected device | V2356, Android API 36, 4096-byte pages, installed 1.3.0/build 5. Read-only metadata: 2 historical low-memory exits, 3 user-requested exits, 2 package-update exits; no crash/ANR reason in those retained entries. This is not release certification |
| Native functional, visual, accessibility and network QA | **NOT RUN on a new candidate**; no screenshots/video, traffic capture, 16 KB runtime or upgrade evidence |
| Production Auth/Storage/billing | **NOT_APPLICABLE current config / NOT TESTED future service**. PGlite tests are not a deployed Supabase/RevenueCat test |

Reproduction commands:

```sh
npm ci                       # runs the checked SDK compatibility patches
npm run play:guard           # checks local capabilities, not Play approval
npm test
npm run typecheck
npm run lint
npx expo prebuild --platform android --no-install
cd android
./gradlew :app:processReleaseMainManifest :app:processReleaseResources --no-daemon
./gradlew :app:dependencies --configuration releaseRuntimeClasspath
# verifySettlerReleaseSigning must reject absent/debug signing.
```

For the eventual candidate, rerun bundletool validation/dump-manifest/dump-config, signature verification, ELF and APK alignment checks, and verify its hash/version/signing identity against Console. Keep the current financial installation and exported recovery copies safe during testing. The temporary universal APK used for packaging inspection was signed by bundletool's debug key and **was not installed**.

## Play Console declaration cross-check

| Declaration / asset | Proposed evidence to use | Current status |
| --- | --- | --- |
| Data safety / deletion questions | Above worksheet + actual SDK traffic; current online account creation unavailable | **UNKNOWN — blocking** |
| Privacy policy URL | Supplied public URL plus reviewed Settler notice; in-app Settings policy | Public URL retrieved; Console entry/notice hosting unverified |
| Ads | No ads observed; identifier library presence alone is not ad display | **UNKNOWN declaration — blocking** |
| Target audience / countries | Owner's real age groups/markets; assess Families if relevant | **UNKNOWN — blocking** |
| Content rating | Actual finance features and user-private files; final questionnaire/listing | **UNKNOWN — blocking** |
| Financial features | Local bookkeeping/management; no loan origination or lender marketplace found | **UNKNOWN — blocking** |
| Permissions | Updated merged manifest; no media/storage/overlay/location/SMS/accessibility/exact alarms | Manifest verified; final AAB/declarations pending |
| App access | No login required; skip onboarding, add a local account, use typed entry if offline speech unavailable; optional lock not enabled by default | **UNKNOWN Console response/device walkthrough — blocking** |
| Store text / screenshots / support / asset rights | Current real UI and developer identity; no unsupported cloud, lending, exact reminder or “no SDK data” claims | **Not supplied — blocking cross-check** |
| Registration / signing / version / track | Verified developer/app registration, registered upload certificate, unused versionCode and track eligibility | **UNKNOWN — blocking** |

## Release decision

**Remain BLOCKED. No recommendation to publish is made.** Engineering fixes are reviewable, but missing mandatory declarations and unverified native controls prevent release signoff.

- [ ] No blockers or unknown mandatory controls.
- [x] AI generation and public UGC assessed; moderation/reporting gates not applicable to current app.
- [x] Current source, SDK graph, existing AAB and updated merged manifest inspected.
- [x] Technical privacy/permission/signing/update/decoder fixes implemented and automated checks performed.
- [ ] Public app-specific notice reviewed/hosted as needed; Data safety and SDK behavior reconciled.
- [ ] New signed AAB containing fixes, unused versionCode, registered key and verified hash.
- [ ] Native upgrade, offline onboarding, typed entry, scan/photo picker, microphone denial/model download, chart gestures/reduced motion, keyboard, large text, export/share, app lock/background, notification denial/reboot, memory/ANR and 16 KB checks documented with screenshots/video.
- [ ] Final store listing, Ads, audience, rating, financial features and reviewer-access declarations match the candidate.
- [ ] Developer registration, track/countries, asset rights and regional obligations verified.
- [x] Latest official policy and effective dates checked; account-specific warnings/extensions still need Console review.
- [ ] Human release owner signed off.

Open assumptions: the local-only release profile and native billing exclusion stay enforced; no undeclared remote content, ads or collection is enabled in a different build. Any SDK/configuration/backend change invalidates the corresponding conclusions. Once released after signoff, monitor Android vitals, policy status, support requests and SDK changes; rerun this audit before each submission. Do not enable a forced-update policy until the replacement is available to every affected user.

Reviewer: Codex engineering audit.\
Human release owner / signoff: **pending**.
