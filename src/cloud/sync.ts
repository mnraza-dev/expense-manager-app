import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';
import { create } from 'zustand';
import { cloudClient } from './client';
import { verifiedOwner, useCloudAuth } from './auth';
import { requireFeature } from './entitlements';
import { repo } from '../db/database';
import { useFinance } from '../store/useFinance';
import type { CanonicalRecord } from './model';
import { saveCloudRecovery } from './backups';
export type CloudSnapshot = {
  owner_id: string;
  schema_version: number;
  revision: number;
  record_count: number;
  records: CanonicalRecord[];
};
export const useSync = create<{
  status: 'offline' | 'pending' | 'syncing' | 'synced' | 'failed' | 'conflict' | 'disabled';
  error: string | null;
  pending: number;
  lastSuccess: string | null;
}>(() => ({ status: 'disabled', error: null, pending: 0, lastSuccess: null }));
let running: Promise<void> | null = null;
export async function remoteSnapshot(checkpoint = 0) {
  const owner = await verifiedOwner();
  const result = await cloudClient().rpc('cloud_snapshot', { after_revision: checkpoint });
  if (result.error) throw new Error('Cloud download failed. Retry without changing local records.');
  const data = result.data as CloudSnapshot;
  if (
    data.owner_id !== owner ||
    data.schema_version !== 5 ||
    !Array.isArray(data.records) ||
    data.records.length > 10000
  )
    throw new Error('Unsupported or oversized cloud dataset. Use cloud backup recovery.');
  return data;
}
export async function refreshSyncState() {
  const state = await repo().syncState();
  useSync.setState({
    pending: state.pending,
    lastSuccess: state.config?.last_success ?? null,
    ...(state.conflicts.length
      ? { status: 'conflict' as const }
      : !state.config?.enabled
        ? { status: 'disabled' as const }
        : {}),
  });
  return state;
}
export function synchronize(): Promise<void> {
  if (running) return running;
  running = syncRun().finally(() => {
    running = null;
  });
  return running;
}
async function syncRun() {
  try {
    const network = await NetInfo.fetch();
    if (!network.isConnected || network.isInternetReachable === false) {
      useSync.setState({ status: 'offline' });
      return;
    }
    const owner = await verifiedOwner();
    await requireFeature('multi_device_sync');
    const local = await refreshSyncState();
    if (!local.config?.enabled || local.config.owner !== owner)
      throw new Error('Enable synchronization for this account first.');
    useSync.setState({ status: 'syncing', error: null });
    for (let i = 0; i < 100; i++) {
      if (useCloudAuth.getState().session?.user.id !== owner)
        throw new Error('Cloud account changed; synchronization stopped.');
      const op = await repo().nextOperation(owner);
      if (!op) break;
      const result = await cloudClient().rpc('apply_sync', { operation: op });
      if (result.error)
        throw new Error(
          'Upload failed or your session expired. The pending operation is retained for retry.'
        );
      if (result.data?.status === 'conflict') {
        await repo().syncConflict(op, result.data.conflict_id);
        useSync.setState({
          status: 'conflict',
          error: 'Concurrent or incompatible financial changes require review.',
        });
        await refreshSyncState();
        return;
      }
      if (result.data?.status !== 'applied' || !Number.isSafeInteger(result.data.revision))
        throw new Error('Invalid sync receipt; pending changes remain locally.');
      await repo().acknowledge(op, result.data.revision);
    }
    const after = await repo().syncState();
    if (after.pending) {
      useSync.setState({ status: 'pending' });
      await refreshSyncState();
      return;
    }
    const snapshot = await remoteSnapshot(after.config?.checkpoint ?? 0);
    if (useCloudAuth.getState().session?.user.id !== owner)
      throw new Error('Cloud account changed; download was not applied.');
    if (!snapshot.records.length && snapshot.revision === (after.config?.checkpoint ?? 0)) {
      await repo().markSyncSuccess(snapshot.revision);
      useSync.setState({ status: 'synced', error: null });
      await refreshSyncState();
      return;
    }
    await useFinance
      .getState()
      .mutate(() => repo().applyRemote(snapshot.records, snapshot.revision, owner, false), 'all');
    useSync.setState({ status: 'synced', error: null });
    await refreshSyncState();
  } catch {
    useSync.setState({
      status: 'failed',
      error:
        'Sync did not complete. Pending changes and local financial data are retained. Check your session, access policy and connection; retry or review conflicts.',
    });
    await refreshSyncState().catch(() => {});
  }
}
export async function enableInitialSync() {
  const owner = await verifiedOwner();
  await requireFeature('multi_device_sync');
  const local = await repo().syncState();
  if (local.config?.enabled && local.config.owner === owner) {
    await synchronize();
    return;
  }
  const remote = await remoteSnapshot();
  if (remote.record_count)
    throw new Error(
      'This account already has cloud records. Use the explicit cloud-data restore; unrelated datasets are not merged automatically.'
    );
  await repo().enableSync(owner);
  await synchronize();
}
export async function adoptCloud() {
  const owner = await verifiedOwner(),
    snapshot = await remoteSnapshot();
  if (!snapshot.record_count) throw new Error('This cloud account has no synchronized records.');
  await useFinance
    .getState()
    .mutate(
      () => repo().applyRemote(snapshot.records, snapshot.revision, owner, true, saveCloudRecovery),
      'all'
    );
  const resolution = await cloudClient().rpc('resolve_cloud_conflicts');
  if (resolution.error) {
    useSync.setState({
      status: 'failed',
      error:
        'Cloud data was restored locally; server conflict history could not be marked resolved. Retry once connected.',
    });
    throw new Error('Local cloud restore completed, but server conflict history needs retry.');
  }
  await refreshSyncState();
  useSync.setState({ status: 'synced' });
}
export function startSyncObservers() {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      if (AppState.currentState === 'active' && useCloudAuth.getState().session)
        void refreshSyncState()
          .then((s) => {
            if (s.config?.enabled && s.config.owner === useCloudAuth.getState().session?.user.id)
              void synchronize();
          })
          .catch(() => {});
    }, 2000);
  };
  const offNetwork = NetInfo.addEventListener((n) => {
    if (n.isConnected) schedule();
    else useSync.setState({ status: 'offline' });
  });
  const offFinance = useFinance.subscribe((s, p) => {
    if (
      s.revision !== p.revision ||
      s.budgetRevision !== p.budgetRevision ||
      s.planningRevision !== p.planningRevision
    )
      schedule();
  });
  const app = AppState.addEventListener('change', (state) => {
    if (state === 'active') schedule();
  });
  const interval = setInterval(schedule, 30000);
  const offAuth = useCloudAuth.subscribe(schedule);
  return () => {
    clearInterval(interval);
    offAuth();
    offNetwork();
    offFinance();
    app.remove();
    if (timer) clearTimeout(timer);
  };
}
