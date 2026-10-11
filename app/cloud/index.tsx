import { useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { Screen, Card, Label, Button, Field, showError } from '../../src/components/ui';
import { cloudClient, cloudConfigured, authRedirect } from '../../src/cloud/client';
import { useCloudAuth } from '../../src/cloud/auth';
import {
  enableInitialSync,
  synchronize,
  useSync,
  refreshSyncState,
  adoptCloud,
} from '../../src/cloud/sync';
import {
  createCloudBackup,
  listCloudBackups,
  verifyCloudBackup,
  deleteCloudBackup,
  downloadCloudBackup,
  restoreCloudBackup,
  type CloudBackup,
} from '../../src/cloud/backups';
import {
  billingConfigured,
  entitlementStatus,
  refreshEntitlements,
  restorePurchases,
  packages,
  purchase,
} from '../../src/cloud/entitlements';
import { useDataOperation } from '../../src/services/files';
import { waitForForegroundAccess } from '../../src/security/lock';
import { repo } from '../../src/db/database';
export default function CloudScreen() {
  const { session, error, signOut } = useCloudAuth(),
    status = useSync();
  const [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [busy, setBusy] = useState(false),
    [backups, setBackups] = useState<CloudBackup[]>([]),
    [access, setAccess] = useState(''),
    [conflicts, setConflicts] = useState<{ id: string; proposal: string }[]>([]);
  const active = useRef(false);
  const reload = async () => {
    if (session) {
      setBackups(await listCloudBackups());
      const state = await refreshSyncState();
      setConflicts(state.conflicts);
      const policy = await entitlementStatus();
      setAccess(
        policy.policy.free_cloud
          ? 'Cloud backup and sync are free.'
          : policy.entitlements
              .filter((e) => e.active && (!e.expires_at || Date.parse(e.expires_at) > Date.now()))
              .map((e) => e.name)
              .join(', ') || 'No active verified entitlements.'
      );
    }
  };
  useEffect(() => {
    // Async server query refreshes this screen after an external auth-session change.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload().catch(() => {}); // Focused screen refresh is safe; authenticated server checks every action.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id]);
  const run = async (task: () => Promise<void>, blocking = false) => {
    if (active.current) return;
    active.current = true;
    setBusy(true);
    if (blocking) useDataOperation.getState().setMessage('Validating and applying cloud recovery…');
    try {
      await task();
      await reload();
    } catch (e) {
      showError(e);
    } finally {
      setPassword('');
      setBusy(false);
      active.current = false;
      useDataOperation.getState().setMessage(null);
    }
  };
  const confirm = (title: string, message: string) =>
    new Promise<boolean>((resolve) =>
      Alert.alert(
        title,
        message,
        [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Continue', style: 'destructive', onPress: () => resolve(true) },
        ],
        { cancelable: false }
      )
    );
  if (!cloudConfigured())
    return (
      <Screen title="Optional cloud" back>
        <Card>
          <Label>Cloud is not configured</Label>
          <Label small>
            Local finance, export and recovery remain available. Configure the public Supabase URL
            and publishable key in .env.example, then deploy the migrations and functions documented
            in CLOUD.md. No service-role secret belongs in this app.
          </Label>
        </Card>
      </Screen>
    );
  return (
    <Screen title="Optional cloud" back subtitle="Local finance always remains available">
      <Card>
        <Label>Cloud privacy</Label>
        <Label small>
          Enabling backup or sync uploads your financial records and audit history to your Supabase
          project. The backend operator can read plaintext cloud data. Access uses authenticated
          private records and Storage; this is not end-to-end encryption. Local exports and recovery
          never require a subscription.
        </Label>
      </Card>
      {error && <Label>{error}</Label>}
      {!session ? (
        <Card>
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />
          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="off"
          />
          <Button
            title="Sign in"
            busy={busy}
            onPress={() =>
              void run(async () => {
                const result = await cloudClient().auth.signInWithPassword({
                  email: email.trim(),
                  password,
                });
                if (result.error)
                  throw new Error(
                    'Sign in failed. Check your email, password, verification status and connection.'
                  );
              })
            }
          />
          <Button
            secondary
            title="Sign up with email"
            busy={busy}
            onPress={() =>
              void run(async () => {
                const result = await cloudClient().auth.signUp({
                  email: email.trim(),
                  password,
                  options: { emailRedirectTo: authRedirect },
                });
                if (result.error)
                  throw new Error('Sign up failed. Check email and password requirements.');
                Alert.alert(
                  'Sign up submitted',
                  'Check your email if verification is required by this project.'
                );
              })
            }
          />
          <Button
            secondary
            title="Send password reset email"
            busy={busy}
            onPress={() =>
              void run(async () => {
                const result = await cloudClient().auth.resetPasswordForEmail(email.trim(), {
                  redirectTo: authRedirect,
                });
                if (result.error)
                  throw new Error('Password reset request failed. Retry when online.');
                Alert.alert(
                  'Reset requested',
                  'If the account exists, check its email for a recovery link.'
                );
              })
            }
          />
        </Card>
      ) : (
        <>
          <Card>
            <Label>{session.user.email}</Label>
            <Label small>{access}</Label>
            <Button
              secondary
              title="Sign out · keep local records"
              busy={busy}
              onPress={() => void run(signOut)}
            />
            <Button
              danger
              title="Delete cloud account"
              busy={busy}
              onPress={() =>
                void run(async () => {
                  if (
                    !(await confirm(
                      'Delete cloud account?',
                      'All owned cloud records and backup files will be removed. Local financial data is retained. This cannot be undone.'
                    ))
                  )
                    return;
                  const result = await cloudClient().functions.invoke('account-delete');
                  if (result.error || result.data?.deleted !== true)
                    throw new Error(
                      'Cloud deletion did not finish. Retry; local records are retained.'
                    );
                  await repo().detachSync();
                  await signOut();
                  Alert.alert('Cloud account deleted', 'Local data remains on this device.');
                })
              }
            />
          </Card>
          <Card>
            <Label>Synchronization · {status.status}</Label>
            <Label small>
              {status.pending} pending batches · last successful sync{' '}
              {status.lastSuccess ?? 'never'}
            </Label>
            {status.error && <Label small>{status.error}</Label>}
            <Button
              title="Enable initial synchronization"
              busy={busy}
              onPress={() =>
                void run(async () => {
                  if (
                    await confirm(
                      'Upload this local dataset?',
                      'Accounts, categories, transactions, budgets, immutable ledger history, cards, loans, recurrence and relevant preferences will be associated with this authenticated owner. Existing cloud data will require explicit restore instead of automatic merging.'
                    )
                  )
                    await enableInitialSync();
                })
              }
            />
            <Button
              secondary
              title="Sync now / retry"
              busy={busy}
              onPress={() => void run(synchronize)}
            />
            <Button
              secondary
              title="Use cloud data / resolve conflicts"
              busy={busy}
              onPress={() =>
                void run(async () => {
                  if (
                    !(await confirm(
                      'Replace local data with cloud?',
                      'This replaces all local data and pending proposals with validated cloud records. A recoverable local backup is saved first. Conflicting local edits remain in that backup; review and re-enter corrections through the ordinary transaction editor.'
                    ))
                  )
                    return;
                  useDataOperation
                    .getState()
                    .setMessage('Preserving local proposals and downloading cloud data…');
                  await adoptCloud();
                })
              }
            />
            {conflicts.map((c) => (
              <Card key={c.id}>
                <Label>Conflict {c.id.slice(0, 8)}</Label>
                <Label small>
                  Operation {JSON.parse(c.proposal).id}. Both local proposal and cloud source are
                  retained. Sync is paused. Use cloud data after preserving the local recovery copy,
                  or keep this conflict pending for review.
                </Label>
              </Card>
            ))}
          </Card>
          <Card>
            <Label>Complete cloud backups</Label>
            <Label small>
              5 snapshots by default; 30 with verified extended history. Old and incomplete backups
              require explicit deletion. Last verified:{' '}
              {backups.find((b) => b.status === 'verified')?.verified_at ?? 'never'}.
            </Label>
            <Button
              title="Create cloud backup"
              busy={busy}
              onPress={() =>
                void run(async () => {
                  await createCloudBackup();
                  Alert.alert(
                    'Cloud backup verified',
                    'Upload and downloaded-byte integrity checks succeeded.'
                  );
                })
              }
            />
            <Button
              secondary
              title="Refresh backup list"
              busy={busy}
              onPress={() => void run(reload)}
            />
            {backups.map((b) => (
              <Card key={b.id}>
                <Label>
                  {b.created_at} · {b.status}
                </Label>
                {b.status === 'pending' ? (
                  <Button
                    secondary
                    title="Retry upload verification"
                    busy={busy}
                    onPress={() => void run(() => verifyCloudBackup(b.id))}
                  />
                ) : (
                  <Button
                    secondary
                    title="Restore this backup"
                    busy={busy}
                    onPress={() =>
                      void run(async () => {
                        const text = await downloadCloudBackup(b);
                        await waitForForegroundAccess();
                        if (
                          !(await confirm(
                            'Replace local data with backup?',
                            'A validated complete snapshot replaces current local records. A recovery copy is saved, and synchronization is detached to avoid uploading an old snapshot over newer cloud data.'
                          ))
                        )
                          return;
                        useDataOperation.getState().setMessage('Restoring verified cloud backup…');
                        await restoreCloudBackup(text);
                        Alert.alert('Backup restored', 'Local data is restored; sync is detached.');
                      })
                    }
                  />
                )}
                <Button
                  danger
                  title="Delete cloud backup"
                  busy={busy}
                  onPress={() =>
                    void run(async () => {
                      if (
                        await confirm(
                          'Delete this backup?',
                          'The cloud snapshot will be permanently removed. Local data is unchanged.'
                        )
                      )
                        await deleteCloudBackup(b.id);
                    })
                  }
                />
              </Card>
            ))}
          </Card>
          <Card>
            <Label>Subscription entitlements</Label>
            <Label small>
              {billingConfigured()
                ? 'Native store billing is configured. Verified server entitlements determine restricted cloud writes.'
                : 'Purchases are not configured. Cloud access follows the server free policy; no premium status is fabricated.'}
            </Label>
            <Button
              secondary
              title="Refresh verified access"
              busy={busy}
              onPress={() =>
                void run(async () => {
                  await refreshEntitlements();
                })
              }
            />
            {billingConfigured() && (
              <>
                <Button
                  title="View available store subscriptions"
                  busy={busy}
                  onPress={() =>
                    void run(async () => {
                      const available = await packages();
                      if (!available.length)
                        throw new Error(
                          'No subscription products are available. Check store configuration.'
                        );
                      Alert.alert(
                        'Choose a subscription',
                        'Price and billing terms are shown by the native store. Access is verified after purchase.',
                        [
                          { text: 'Cancel', style: 'cancel' },
                          ...available.slice(0, 2).map((pkg) => ({
                            text: `${pkg.product.title} · ${pkg.product.priceString}`,
                            onPress: () =>
                              void run(async () => {
                                await purchase(pkg);
                              }),
                          })),
                        ]
                      );
                    })
                  }
                />
                <Button
                  secondary
                  title="Restore store purchases"
                  busy={busy}
                  onPress={() =>
                    void run(async () => {
                      await restorePurchases();
                    })
                  }
                />
              </>
            )}
          </Card>
        </>
      )}
    </Screen>
  );
}
