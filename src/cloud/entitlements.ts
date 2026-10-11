import { Platform } from 'react-native';
import type { PurchasesPackage } from 'react-native-purchases';
import { isRunningInExpoGo } from 'expo';
import { cloudClient } from './client';
import { verifiedOwner } from './auth';
export type Feature =
  | 'cloud_backup'
  | 'multi_device_sync'
  | 'extended_backup_history'
  | 'advanced_reports';
const publicKey =
  Platform.OS === 'ios'
    ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY
    : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;
let configured = false,
  currentOwner: string | null = null;
export function billingConfigured() {
  return (
    !!publicKey && !isRunningInExpoGo() && (Platform.OS === 'ios' || Platform.OS === 'android')
  );
}
export async function billingUser(owner: string | null) {
  if (!publicKey || !billingConfigured()) return;
  const { default: Purchases } = await import('react-native-purchases');
  if (!configured) {
    Purchases.configure({ apiKey: publicKey, appUserID: owner ?? undefined });
    configured = true;
    currentOwner = owner;
    return;
  }
  if (owner === currentOwner) return;
  if (owner) await Purchases.logIn(owner);
  else if (currentOwner) await Purchases.logOut();
  currentOwner = owner;
}
export async function entitlementStatus() {
  const owner = await verifiedOwner();
  const client = cloudClient();
  const [policy, entitlements] = await Promise.all([
    client.from('cloud_policy').select('free_cloud,backup_limit,extended_backup_limit').single(),
    client
      .from('cloud_entitlements')
      .select('name,active,expires_at,verified_at')
      .eq('owner_id', owner),
  ]);
  if (policy.error || entitlements.error)
    throw new Error('Unable to refresh cloud access policy. Retry when online.');
  return { policy: policy.data, entitlements: entitlements.data };
}
export async function requireFeature(feature: Feature) {
  const result = await cloudClient().rpc('cloud_allowed', { feature });
  if (result.error || result.data !== true)
    throw new Error(
      'Verified cloud access is required. Your existing local records, exports and recovery remain available.'
    );
}
export async function refreshEntitlements() {
  const owner = await verifiedOwner();
  await billingUser(owner);
  if (billingConfigured()) {
    const { default: Purchases } = await import('react-native-purchases');
    await Purchases.getCustomerInfo();
    const response = await cloudClient().functions.invoke('entitlements');
    if (response.error)
      throw new Error('Purchase verification is pending. Retry entitlement refresh.');
  }
  return entitlementStatus();
}
export async function packages() {
  const owner = await verifiedOwner();
  if (!billingConfigured())
    throw new Error('Purchases require a native development build and configured billing keys.');
  const { default: Purchases } = await import('react-native-purchases');
  await billingUser(owner);
  return (await Purchases.getOfferings()).current?.availablePackages ?? [];
}
export async function purchase(pkg: PurchasesPackage) {
  if (!billingConfigured())
    throw new Error('Purchases require a native development build and configured billing keys.');
  const { default: Purchases } = await import('react-native-purchases');
  await billingUser(await verifiedOwner());
  await Purchases.purchasePackage(pkg);
  return refreshEntitlements();
}
export async function restorePurchases() {
  if (!billingConfigured())
    throw new Error('Purchases require a native development build and configured billing keys.');
  const { default: Purchases } = await import('react-native-purchases');
  await billingUser(await verifiedOwner());
  await Purchases.restorePurchases();
  return refreshEntitlements();
}
