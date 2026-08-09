/**
 * Prompt for an App Store review after a successful setup (sparingly).
 * Install `@capacitor-community/in-app-review` before shipping native builds.
 */

import { Capacitor } from '@capacitor/core';

const STORAGE_KEY = 'hex-settlement-review-prompted-v1';

function alreadyPrompted(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return true;
  }
}

function markPrompted(): void {
  try {
    localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    // ignore
  }
}

export async function maybeRequestStoreReview(reason: 'setupFinished'): Promise<void> {
  void reason;
  if (alreadyPrompted()) return;
  markPrompted();
  if (!Capacitor.isNativePlatform()) return;
  // Hook: call InAppReview.requestReview() when the plugin is installed.
}
