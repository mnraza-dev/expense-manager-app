# Required native updates

Settler checks a public release policy on cold launch, foreground resume, network reconnect and every five minutes while active. The check is independent of financial cloud sync and login. Native version/build values come from [Expo Application](https://docs.expo.dev/versions/latest/sdk/application/), so changing a JavaScript version label cannot make an older binary satisfy the requirement.

When an enabled policy requires a newer native version or a higher build of the same version, a centered, non-dismissible modal with a dimmed backdrop blocks app routes, existing sheets, gestures, Android Back and accessibility access to financial content. It offers **Update now** and **Check again**, with no skip action. Camera and voice capture stop when a requirement arrives. Financial screens stay mounted so an in-flight write is not interrupted; an active backup/restore finishes before the update actions are shown. Update installation must preserve the app's package, signing identity and data; do not ask users to uninstall.

A valid last-known policy is cached in device-local storage outside financial backups. A known requirement remains enforced without a connection. A newly installed qualifying native build clears that requirement even offline. A successful administrator rollback (`enabled=false`) also releases it. Failed, missing, malformed or cross-platform policies never remove a known requirement. Network/auth requests time out after four seconds. A first launch with no valid cached policy can still use local finance when the check fails; an app cannot discover a newly published minimum version without contacting the server. Clearing storage/reinstalling also removes the cache. This is a user-flow gate, not remote attestation or a server-side security boundary.

Development builds, Expo Go, web and builds without Supabase public configuration skip enforcement. Use a release native build to test the complete gate. Expo's [native version documentation](https://docs.expo.dev/build-reference/app-versions/) distinguishes the installed binary version from JavaScript configuration.

## Rollout and activation

1. Deploy `supabase/migrations/202610120002_release_policy.sql` to the configured Supabase project. It creates separate Android/iOS policies readable by `anon` and `authenticated`, with updates restricted to trusted administrators/service-role operations. The table uses [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security). Never place a service-role key in the app or `.env` public variables.
2. Ship Settler 1.3.0 / Android build 5 / iOS build 5 with this checker. Existing older releases have no update-checking code and no configured OTA delivery; they cannot be retroactively blocked by this migration. Their users must install this checker-enabled release once. This is a binary update because MVP v4 adds native notification capabilities.
3. Verify the replacement binary is actually available to every affected user at its distribution destination. Android's prepared URL is `https://play.google.com/store/apps/details?id=com.razatechlabs.settler`; this is a destination template, not proof the listing is published. iOS needs its actual App Store URL. Android clients accept only this exact Play listing URL. APK download pages, alternate packages and lookalike hosts are rejected.
4. Enable the platform policy only after distribution is available. Policies are seeded disabled to avoid trapping users with an unavailable replacement. Enter the minimum version and, optionally, the minimum build for that same version. Newer marketing versions pass even if iOS build numbering restarts.

Example for requiring 1.3.0 after it is available:

```sql
update public.app_release_policy
set enabled = true,
    minimum_version = '1.3.0',
    minimum_build = '5',
    store_url = 'https://play.google.com/store/apps/details?id=com.razatechlabs.settler',
    message = 'Update Settler to use bill reminders, savings goals, refunds and split expenses.',
    updated_at = now()
where platform = 'android';
```

For a future release, change the minimum to its published version/build; older **checker-enabled** installs then require that update. Set the real iOS `store_url` before enabling the iOS row. Use the exact Settler Play listing for Android; the server constraint and client both enforce it. iOS uses its HTTPS App Store destination. Credentials, custom schemes and insecure HTTP are rejected. These SQL statements are for the Supabase SQL editor/admin connection, not app-side code.

Rollback:

```sql
update public.app_release_policy
set enabled = false, updated_at = now()
where platform = 'android';
```

Devices must reconnect to receive a rollback. No release policies or store submissions are deployed by these repository changes.

## Acceptance

Verification: all 117 repository tests, TypeScript and ESLint pass; Android and iOS production Hermes bundles compile. Physical-device update-flow testing remains pending.

Automated tests cover numeric version comparison, native build requirements, missing native versions, iOS dotted builds, unsafe URLs, policy corruption, cached offline blocking, updated native builds, first-offline launch, reconnect, administrator rollback, concurrent checks, storage failure, timeout and anonymous read/client write restrictions.

On release devices, point the policy at a real available update, require a minimum above the installed version, and verify that startup, deep links, open sheets, app resume and hardware Back cannot open the app. Check camera/voice cancellation, notification/store return, offline restart and a failed store link. Install the newer binary over the existing app and confirm that the gate clears and the database/receipts remain intact. Exercise disabled-policy rollback after reconnect and confirm that financial backup/restore is not interrupted by a policy refresh.

The policy audit and remaining release gates are recorded in [PLAY_POLICY_AUDIT.md](PLAY_POLICY_AUDIT.md). Update checks remain inactive in the current configuration because cloud credentials are absent. The new server constraint is checked in but has not been deployed.

The local-only profile keeps cloud Auth disabled while allowing public release metadata through `publicReleaseClient()`. This client has session persistence, token refresh and URL session detection disabled and never reads saved Auth storage. Public backend credentials are still required for the update check; they do not turn on user accounts.
