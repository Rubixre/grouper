/**
 * Premium entitlements (Phase 1: local/dev gate).
 * Later: Supabase profile + RevenueCat will drive this.
 */

export type PremiumFeature = 'bonanza' | 'simulation' | 'midgame';

export interface EntitlementState {
  /** Active premium access (trial or paid) */
  isPremium: boolean;
  /** How access was granted — for UI copy */
  source: 'none' | 'dev' | 'trial' | 'subscription';
  /** ISO date when trial/sub ends, if known */
  expiresAt: string | null;
}

const STORAGE_KEY = 'catan-premium-entitlement-v1';

type StoredEntitlement = {
  isPremium: boolean;
  source: EntitlementState['source'];
  expiresAt: string | null;
};

function readStored(): StoredEntitlement | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredEntitlement;
    if (typeof parsed.isPremium !== 'boolean') return null;
    return {
      isPremium: parsed.isPremium,
      source: parsed.source ?? (parsed.isPremium ? 'dev' : 'none'),
      expiresAt: parsed.expiresAt ?? null,
    };
  } catch {
    return null;
  }
}

function writeStored(state: StoredEntitlement): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/** True only in Vite/dev builds — hide unlock chrome in production. */
export function isDevPremiumUnlockEnabled(): boolean {
  try {
    return Boolean(import.meta.env?.DEV);
  } catch {
    return false;
  }
}

/** Query `?premium=1` unlocks Premium only outside production builds. */
export function getEntitlementState(): EntitlementState {
  if (typeof window !== 'undefined' && isDevPremiumUnlockEnabled()) {
    const params = new URLSearchParams(window.location.search);
    if (params.get('premium') === '1' || params.get('premium') === 'true') {
      return { isPremium: true, source: 'dev', expiresAt: null };
    }
  }

  const stored = readStored();
  if (stored?.isPremium) {
    if (stored.expiresAt && new Date(stored.expiresAt).getTime() < Date.now()) {
      return { isPremium: false, source: 'none', expiresAt: stored.expiresAt };
    }
    return {
      isPremium: true,
      source: stored.source,
      expiresAt: stored.expiresAt,
    };
  }

  return { isPremium: false, source: 'none', expiresAt: null };
}

export function canUseFeature(
  feature: PremiumFeature,
  state: EntitlementState = getEntitlementState()
): boolean {
  if (state.isPremium) return true;
  void feature;
  return false;
}

export function canUseBonanza(state?: EntitlementState): boolean {
  return canUseFeature('bonanza', state ?? getEntitlementState());
}

export function canUseSimulation(state?: EntitlementState): boolean {
  return canUseFeature('simulation', state ?? getEntitlementState());
}

export function canUseMidgame(state?: EntitlementState): boolean {
  return canUseFeature('midgame', state ?? getEntitlementState());
}

/** Dev / pre-auth: unlock Premium locally (persisted). */
export function activateDevPremium(days = 14): EntitlementState {
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  const next: StoredEntitlement = {
    isPremium: true,
    source: 'dev',
    expiresAt,
  };
  writeStored(next);
  return { ...next };
}

/** Start a local 14-day trial (pre-auth stand-in for store trial). */
export function startLocalTrial(days = 14): EntitlementState {
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  const next: StoredEntitlement = {
    isPremium: true,
    source: 'trial',
    expiresAt,
  };
  writeStored(next);
  return { ...next };
}

export function clearPremiumAccess(): EntitlementState {
  const next: StoredEntitlement = {
    isPremium: false,
    source: 'none',
    expiresAt: null,
  };
  writeStored(next);
  return { ...next };
}

export function premiumFeatureLabel(feature: PremiumFeature): string {
  switch (feature) {
    case 'bonanza':
      return 'Bonanzabrett';
    case 'simulation':
      return 'Startposisjon-simulering';
    case 'midgame':
      return 'Midgame-råd (vei, by, røver)';
  }
}
