# Settler MVP v2 — receipts, voice entry and expense exports

Version 1.1.0, Android version code 3. Existing financial schema 4, backup compatibility, package ID `com.razatechlabs.settler`, and opt-in free cloud behavior are preserved.

## Transaction entry

- New transactions remember the most recently used compatible account and category. Account-specific entry respects the selected account.
- Up to six recent shortcuts reuse the latest distinct transaction descriptions, amounts, accounts, categories and card components. Review and edit before saving. Archived accounts/categories, voided records and loan events are excluded. Transfers require a valid, distinct destination.
- Shortcuts use today's local calendar date and clear old notes. They never copy receipts or save automatically.
- **Save & add another** commits once, retains the selected type/account/category/date and clears amount, description, notes and receipts. The amount field receives focus for the next entry. Save buttons share one duplicate-submission guard.

## Receipts

Use **Attach receipt** on a new or existing transaction to choose a JPEG, PNG or PDF from the system Files/document picker. There is no camera capture or OCR in this release. Up to five attachments are allowed, each nonempty and at most 10 MiB. File headers are checked, not just extensions or provider MIME types. Images have thumbnails and a full-screen preview; PDFs open the native share/open sheet. Each receipt can be shared separately. Receipt counts appear in transaction rows.

Save the transaction to commit attachment additions/removals. Leaving without saving discards picker copies and preserves existing attachments. Files are copied into private, persistent app documents before the financial commit. Transaction posting and attachment metadata commit in the same SQLite transaction. Copy or database failure rolls back new files and preserves the existing ledger/attachments; post-commit cleanup cannot turn a successful save into a retryable financial failure.

Device-local metadata lives in `local_receipts`, created idempotently alongside the existing financial migrations. It is deliberately outside the financial backup and cloud record whitelist. Files use validated UUID filenames; metadata contains no absolute iOS container path. Links use transaction ID and immutable creation time to avoid attaching old receipts to unrelated IDs after a replace restore. Matching transactions restored on the same device retain their files. Referenced receipts from an older dataset remain on the device for recovery; unreferenced files older than 24 hours are pruned on a subsequent launch.

**Receipt files and their metadata are excluded from JSON/encrypted financial backups, CSV/Excel exports, Supabase backups and sync.** Share copies from the transaction before uninstalling or changing devices. This limitation is shown beside attachments, on Data & backups and on Optional cloud. No photo/video or shared-storage permission is added; existing permission blocks remain in place.

The privacy gate now keeps forms mounted behind an opaque, inaccessible cover during backgrounding and locking. Opening the picker or share sheet preserves unsaved form data. Image previews close on backgrounding or locking. Access is checked before receipt picking completes, sharing or saving resumes.

## Private voice expense entry

Open **Voice entry** from Overview, Transactions or a new transaction. Select English, Hindi or Urdu, dictate and review the generated list before saving. For example, “I have ate biryani for 140 rupee and taken tea for 15 rupee today” produces two expenses, ₹140 and ₹15, with the current local calendar date. Common mixed phrases, native digits and number words are supported by a deterministic local parser; this is not general-purpose language understanding. Edit every draft's description, amount, date and category. Select an account and save the reviewed list atomically, with one duplicate-submission guard. Up to 20 expenses can be saved per batch.

Today, yesterday, tomorrow and supported relative/ISO dates are resolved against the device's local date at parsing time. Ambiguous “kal/कल/کل” requires an explicit date; invalid and conflicting dates are flagged. Review dates manually when using other expressions. Multiple amounts without an item separator, negative/range amounts and unrecognized amounts are surfaced for correction. Changing the transcript invalidates the old review until rebuilt.

Recognition requires a new native build. It requests microphone access, never persists audio and never falls back to cloud recognition. Android requires Android 13 or later, an on-device recognizer and the selected language's installed offline model. On iOS, the selected locale must support on-device recognition; the pinned speech dependency is patched during postinstall to refuse unsupported offline locales before creating a recognition request. Availability depends on the OS, device and installed models, including Urdu. Unsupported cases offer typed transcript entry with the same local parser. Backgrounding, locking or leaving the screen aborts dictation. Reviewed transactions follow the existing optional financial cloud-sync policy; raw audio/transcripts are not uploaded.

Voice startup fix: a matching installed regional model now works for the selected language (for example, English can use `en-US` when `en-IN` is not installed). If no matching model is installed, **Download speech language** requests the Android speech service's model download. This one-time download requires connectivity; dictation remains on-device. Android 13 can open a device download dialog; Android 14+ reports immediate installation or a queued download. Complete the download, then tap **Start speaking** again; setup never starts recording automatically. Permission failures offer **Open device settings**, and unsupported languages, a busy recognizer and silence have distinct messages. Normal session end can build a review from interim text when the recognizer omits a final event; errors/cancellation do not automatically review it. No expense is saved until the user reviews and saves.

## Daily, weekly and monthly expense exports

Open **Reports → Daily, weekly & monthly exports**, or **Settings → Data & backups**, then use **Expense reports**. Choose Daily, Weekly, Monthly or All history; select any historical date and optionally an account, including archived accounts. Previous/next controls move through complete periods. Weeks run Monday–Sunday. Income, transfers and deleted transactions are excluded, and currencies are totaled separately.

**PDF** provides the selected period's totals, grouped expense summary and itemized dates, descriptions, notes, accounts, categories and amounts. **Excel (.xlsx)** includes transaction details plus Daily Expenses, Weekly Expenses and Monthly Expenses summary sheets with numeric amounts. User text remains literal rather than executable spreadsheet formulas, and PDF text is HTML-escaped. Use the native share sheet to save or send the file. PDF supports up to 1,000 expenses per report; Excel supports up to 50,000. Larger requests fail explicitly so the user can narrow the period. These files are exports, not restorable backups, and contain no receipt binaries.

## Physical-device acceptance checks

Run on both Android and iOS native builds:

1. Enter an amount and note, open Files, cancel, then choose a valid image/PDF. Confirm entered values survive the picker and a relock/unlock cycle.
2. Preview an image; background/lock the app and confirm the image is covered. Share an image and PDF to another app and reopen the received copy.
3. Attach five receipts; reject an oversized file and a renamed unsupported file. Confirm no broad media permission prompt appears.
4. Save, restart, reopen the entry and confirm attachments and counts persist. Remove a receipt, leave without saving, reopen and confirm it remains. Then remove and save.
5. Use a recent shortcut, change its amount and save. Confirm today's date, cleared notes, no copied receipt and correct account balances.
6. Tap **Save & add another** repeatedly, checking one posting per completed entry, a cleared amount/attachments and retained account/category/date.
7. Restore a financial backup on the same device and on a fresh installation. Matching local receipts should survive only on the original installation; the financial ledger must reconcile on both.
8. Simulate low storage/copy failure and retry. The entry must remain unsaved with its input intact and no duplicate ledger posting.

Automated coverage exercises SQLite atomicity, initialization, paginated receipt counts, receipt ownership, backup/cloud exclusion, restore identity matching, file-copy/commit rollback, cleanup failures, limits/signatures and recent-entry eligibility. Native picker, preview and sharing behavior require the checks above on physical devices.

9. Install offline language models and enable airplane mode. Dictate the two-expense example in English, Hindi and Urdu on devices that support those offline locales. Confirm totals/dates/categories, edit a draft and save once. Test unsupported locales, denied microphone access and background/lock cancellation; no network fallback should occur.
   Also test a missing model using **Download speech language**, Android 13's download dialog and Android 14+'s queued/completed states. Confirm a downloaded `en-US` model can serve English entry, switching languages clears the previous setup action, permission recovery opens settings, and microphone recording begins only after explicitly tapping **Start speaking**.
10. Choose past daily, weekly and monthly periods, including year boundaries and a leap February. Export PDF and Excel, open them in external readers, and compare every row and currency total with the ledger. Check multi-page PDFs, long notes, native-script text, empty periods and archived-account filtering.

Automated checks cover voice parsing, date boundaries, offline-recognizer guards, atomic multi-expense saving, period selection, currency-separated totals, actual XLSX cell types and PDF escaping/limits. The PDF HTML template was rendered to a three-page A4 browser preview and visually checked with Hindi/Urdu text and long notes. Native Expo Print, speech, picker and sharing require physical-device verification; browser preview does not establish native layout or offline recognition availability.

Final automated verification: 81 tests pass, TypeScript and ESLint pass, and Android/iOS Hermes production exports succeed. Physical-device acceptance remains outstanding.

Signed Android release build succeeds: `builds/settler-1.1.0.aab` (version code 3, `com.razatechlabs.settler`, all four architectures). Signature and archive integrity were verified; the packaged manifest includes microphone access and excludes broad media/storage and advertising ID permissions.
