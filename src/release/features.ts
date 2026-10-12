import profile from './profile.json';
export const releaseFeatures = Object.freeze(profile);
export function cloudAccountsAvailable(backendReady: boolean) {
  return releaseFeatures.cloudAccounts && backendReady;
}
export function storePurchasesAvailable(cloudReady: boolean, key?: string) {
  return releaseFeatures.storePurchases && cloudReady && !!key;
}
export const publicReleaseAuth = Object.freeze({
  autoRefreshToken: false,
  persistSession: false,
  detectSessionInUrl: false,
});
