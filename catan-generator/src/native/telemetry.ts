/**
 * Crash / error reporting stub.
 * Set VITE_SENTRY_DSN and install `@sentry/react` to enable production reporting.
 */

const DSN =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SENTRY_DSN) || undefined;

type SentryLike = {
  init: (opts: Record<string, unknown>) => void;
  captureException: (error: unknown, ctx?: { extra?: Record<string, unknown> }) => void;
};

async function loadSentry(): Promise<SentryLike | null> {
  void DSN;
  // Stub until @sentry/react is added as a dependency.
  return null;
}

export function isTelemetryConfigured(): boolean {
  return Boolean(DSN);
}

export async function initTelemetry(): Promise<void> {
  if (!DSN) return;
  const Sentry = await loadSentry();
  Sentry?.init({
    dsn: DSN,
    tracesSampleRate: 0.1,
    environment: import.meta.env.MODE,
  });
}

export function captureException(error: unknown, context?: Record<string, unknown>): void {
  if (!DSN) {
    if (import.meta.env.DEV) {
      console.error('[telemetry]', error, context);
    }
    return;
  }
  void loadSentry().then((Sentry) => {
    if (Sentry) Sentry.captureException(error, { extra: context });
    else console.error(error);
  });
}
