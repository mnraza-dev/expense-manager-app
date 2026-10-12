# Settler MVP v3 — receipt scanning and editable expense drafts

Version 1.2.0, Android version code 4, package `com.razatechlabs.settler`. Financial schema 4 and existing financial backup/cloud formats are unchanged.

## User flow

Open **Scan receipt** from Overview, Transactions or new transaction entry. Select English or Hindi, then photograph a printed receipt or choose a JPEG/PNG using the system Files/document picker. Camera access is requested only when photographing a receipt. There is no broad photo-library or shared-storage access. PDF receipts remain available through manual transaction attachments; PDF text extraction, handwriting recognition, perspective correction and multi-page scanning are outside this release.

A scan opens a new transaction draft with the normalized receipt image already attached. Merchant, paid total, purchase date and category are suggestions that can be edited. Nothing is saved automatically. The normal transaction validator, atomic receipt-file commit and double-entry ledger handle the final save. **Save & add another** starts a clean entry after committing once.

The parser prefers labeled grand/net/payable totals over general totals and excludes subtotal, tax, discounts, change, tendered cash and item counts. It does not infer the largest printed number as the total. Conflicting totals remain blank with selectable candidates. Unrecognized amounts and foreign currencies require manual INR entry; no currency conversion is inferred. Dates support ISO, day/month/year and day–English-month–year formats. Numeric dates explicitly require confirmation of day/month ordering. Missing, invalid or conflicting dates remain blank; use the date picker or explicitly choose **Use today's date**. Unsupported formats need manual review. Category suggestions use merchant keywords and active expense categories.

Existing posted expenses with the same amount, purchase date and account trigger a possible-duplicate warning. Review their descriptions and explicitly confirm a separate expense before saving, or edit the draft. This is a warning based on transaction values, not a receipt identity guarantee. Voided transactions, income and transfers are excluded. Changing the amount/date/account updates the warning. Recent templates are hidden during scan review to preserve the scanned draft.

If a valid image cannot be recognized, its normalized photo is retained in a blank draft for manual entry. Invalid files, over-limit images and unavailable native modules show a retry/rebuild message. Failed or cancelled scans clean their owned cache copies; completed scans transfer ownership to the transaction form. Form cleanup survives React Strict Mode effect replay without deleting the initial image. Failed financial saves retain the draft, and successful saves use existing receipt storage rollback guarantees.

## Native recognition and privacy

The local Expo module lives in `modules/settler-receipt-ocr`. Android uses the [bundled ML Kit Latin and Devanagari text-recognition models](https://developers.google.com/ml-kit/vision/text-recognition/v2/android); it does not use downloadable-model or cloud OCR APIs. iOS uses [Apple Vision text recognition](https://developer.apple.com/documentation/vision/recognizing-text-in-images) and checks the requested language against the device's supported languages. English is the primary receipt format; Hindi works on Android's bundled model and on Apple devices where Vision supports it. Urdu receipt OCR is not included; existing English/Hindi/Urdu voice entry remains unchanged.

Recognition reads only validated private cache files, with native canonical-path checks and a 10 MiB size limit. Dimensions are inspected before image decoding and limited to 24 megapixels. The image is resized proportionally to a maximum 2,400-pixel edge, saved as JPEG without the original metadata and used as the attachment. Camera capture prefers a supported size around four megapixels. There are no OCR server credentials, receipt-image uploads or raw-text cloud records. The optional extracted-text preview is held in memory and is not inserted into notes automatically. Reviewed merchant/amount/date/category values become ordinary financial records and follow the existing opt-in financial sync policy.

The camera unmounts when the route loses focus, the app backgrounds or the app locks. Pending picker/OCR results check route ownership; returning from a provider or processing stage waits for foreground/unlocked access before presenting a draft. Receipt files remain excluded from financial backups, Excel/PDF reports and cloud sync, as in MVP v2. Share receipt copies before uninstalling or moving devices.

Install a rebuilt native binary; Metro reload and Expo Go cannot add the local OCR module. [Expo Camera](https://docs.expo.dev/versions/v57.0.0/sdk/camera/) and ImageManipulator are installed at SDK-compatible versions. The camera plugin preserves the microphone description used by private voice entry. Android permission blocks for photo/video and shared storage remain in `app.json`.

## Verification and physical-device acceptance

Automated verification: 90 tests pass, TypeScript and ESLint pass. New tests exercise total/date parsing, native digits, conflicts, foreign currency, archived categories, possible-duplicate matching, image limits, cache ownership, cancellation and recognition-failure/manual-draft fallback. Existing financial, cloud, voice, receipt and export regression tests pass. The Apple Vision recognition helpers and request API type-check against the installed macOS Swift SDK; this is not a signed iOS build or physical-device OCR test. CocoaPods spec syntax and local-module discovery are checked.

Before distribution, test on Android and iOS native devices:

1. Fresh launch in airplane mode: photograph and select English receipts with merchant/date/paid total, then confirm that recognition and manual fallback work without an OCR service. Check Hindi where supported and unsupported-language fallback.
2. Use a receipt with subtotal, GST, grand total, cash tendered and change. Verify the paid total. Test two conflicting totals, item-count totals, negative values, foreign currencies and unreadable photographs; nothing should be silently posted.
3. Scan old receipts and leap-day dates. Confirm missing/conflicting dates remain blank and day/month ordering is clearly shown. Edit all fields and confirm category/account selection and ledger balances.
4. Save once with an image, restart, then reopen its preview and share it. Confirm receipt persistence, one ledger posting, proper removal and **Save & add another** clearing the previous image.
5. Scan a transaction whose amount/date/account already exists. Confirm duplicate review is required and changing those fields updates the matches. Cancel and confirm no expense was added.
6. Deny camera permission, cancel Files, leave during processing, lock/background during capture and unlock after provider selection. The camera must stop, private data must stay covered and stale results must not update another route.
7. Reject a renamed unsupported file, an image above 10 MiB and an image above 24 megapixels. Simulate low storage/copy failure and retry without losing the reviewed draft or duplicating a posting.
8. Recheck MVP v2's offline voice and native PDF/Excel sharing on the rebuilt app. Confirm Play Console package/version and packaged permissions before upload.
