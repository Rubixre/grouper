/**
 * Purchase / subscription bridge.
 * v1: local trial (entitlements.ts).
 * Wire RevenueCat by setting VITE_REVENUECAT_IOS_KEY and installing
 * `@revenuecat/purchases-capacitor`, then implement loadPurchasesPlugin().
 */

import {
  clearPremiumAccess,
  getEntitlementState,
  startLocalTrial,
  type EntitlementState,
} from './entitlements';
import { Capacitor } from '@capacitor/core';

const RC_API_KEY =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_REVENUECAT_IOS_KEY) ||
  undefined;

type PurchasesPlugin = {
  configure: (opts: { apiKey: string }) => Promise<unknown>;
  getCustomerInfo: () => Promise<{
    customerInfo?: {
      entitlements?: { active?: { premium?: { expirationDate?: string | null } } };
    };
  }>;
  getOfferings: () => Promise<{
    current?: { availablePackages?: unknown[] };
  }>;
  purchasePackage: (opts: { aPackage: unknown }) => Promise<unknown>;
  restorePurchases: () => Promise<unknown>;
};

async function loadPurchasesPlugin(): Promise<PurchasesPlugin | null> {
  // Intentionally not bundling RevenueCat until the package is added.
  // Replace this stub when integrating StoreKit / RevenueCat.
  void RC_API_KEY;
  return null;
}

export function isRevenueCatConfigured(): boolean {
  return Boolean(RC_API_KEY && Capacitor.isNativePlatform());
}

export async function initPurchases(): Promise<void> {
  if (!isRevenueCatConfigured()) return;
  const Purchases = await loadPurchasesPlugin();
  if (!Purchases || !RC_API_KEY) return;
  await Purchases.configure({ apiKey: RC_API_KEY });
}

export async function refreshPurchasesEntitlement(): Promise<EntitlementState> {
  if (!isRevenueCatConfigured()) return getEntitlementState();
  const Purchases = await loadPurchasesPlugin();
  if (!Purchases) return getEntitlementState();
  try {
    const info = await Purchases.getCustomerInfo();
    const active = info?.customerInfo?.entitlements?.active?.premium;
    if (active) {
      return {
        isPremium: true,
        source: 'subscription',
        expiresAt: active.expirationDate ?? null,
      };
    }
    return { isPremium: false, source: 'none', expiresAt: null };
  } catch {
    return getEntitlementState();
  }
}

export async function purchasePremiumPackage(): Promise<EntitlementState> {
  if (!isRevenueCatConfigured()) return startLocalTrial(14);
  const Purchases = await loadPurchasesPlugin();
  if (!Purchases) return startLocalTrial(14);
  try {
    const offerings = await Purchases.getOfferings();
    const pkg = offerings?.current?.availablePackages?.[0];
    if (!pkg) return startLocalTrial(14);
    await Purchases.purchasePackage({ aPackage: pkg });
    return refreshPurchasesEntitlement();
  } catch {
    return getEntitlementState();
  }
}

export async function restorePurchases(): Promise<EntitlementState> {
  if (!isRevenueCatConfigured()) return getEntitlementState();
  const Purchases = await loadPurchasesPlugin();
  if (!Purchases) return getEntitlementState();
  try {
    await Purchases.restorePurchases();
    return refreshPurchasesEntitlement();
  } catch {
    return getEntitlementState();
  }
}

export function clearLocalPremium(): EntitlementState {
  return clearPremiumAccess();
}
