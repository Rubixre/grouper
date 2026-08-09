import { APP_SUPPORT_EMAIL, APP_VERSION_LABEL } from '../product/appIdentity';
import i18n from '../i18n';

/** Open the system mail client with a prefilled feedback draft. */
export function openFeedbackEmail(): void {
  const lang = i18n.language || 'en';
  const subject = i18n.t('feedback.subject');
  const body = i18n.t('feedback.bodyPrefix', {
    version: APP_VERSION_LABEL,
    lang,
  });
  const url = `mailto:${APP_SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  if (typeof window !== 'undefined') {
    window.location.href = url;
  }
}

export function openPrivacyPolicy(): void {
  const base = import.meta.env.BASE_URL || '/';
  const path = `${base}privacy.html`.replace(/\/{2,}/g, '/').replace(':/', '://');
  if (typeof window !== 'undefined') {
    window.open(path, '_blank', 'noopener,noreferrer');
  }
}
