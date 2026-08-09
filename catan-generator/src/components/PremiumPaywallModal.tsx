import { useTranslation } from 'react-i18next';
import { InfoModal } from './InfoModal';
import type { PremiumFeature } from '../catan/entitlements';
import {
  isDevPremiumUnlockEnabled,
  premiumFeatureLabelKey,
} from '../catan/entitlements';

interface PremiumPaywallModalProps {
  open: boolean;
  feature: PremiumFeature | null;
  onClose: () => void;
  /** Local trial until auth + RevenueCat land */
  onStartTrial: () => void;
  /** Dev unlock without trial framing — only shown in development builds */
  onActivateDev?: () => void;
}

const PERK_KEYS = [
  'premium.perkBonanza',
  'premium.perkSimulation',
  'premium.perkRoads',
  'premium.perkStrategy',
  'premium.perkMidgame',
] as const;

export function PremiumPaywallModal({
  open,
  feature,
  onClose,
  onStartTrial,
  onActivateDev,
}: PremiumPaywallModalProps) {
  const { t } = useTranslation();
  const featureName = feature
    ? t(premiumFeatureLabelKey(feature))
    : t('premium.title');
  const showDevUnlock = Boolean(onActivateDev) && isDevPremiumUnlockEnabled();

  return (
    <InfoModal
      open={open}
      title={t('premium.title')}
      onClose={onClose}
      footerNote={t('premium.footerNote')}
    >
      <div className="premium-paywall">
        <p>{t('premium.featureIsPremium', { feature: featureName })}</p>
        <p className="muted small">{t('premium.freeBoards')}</p>

        <h3 className="premium-paywall-heading">{t('premium.includedHeading')}</h3>
        <ul className="premium-perk-list">
          {PERK_KEYS.map((key) => (
            <li key={key}>{t(key)}</li>
          ))}
        </ul>

        <div className="premium-paywall-actions">
          <button type="button" className="btn primary btn-block" onClick={onStartTrial}>
            {t('premium.startTrial')}
          </button>
          {showDevUnlock && (
            <button type="button" className="btn btn-block" onClick={onActivateDev}>
              {t('premium.activateDev')}
            </button>
          )}
          <button type="button" className="btn btn-block" onClick={onClose}>
            {t('premium.continueFree')}
          </button>
        </div>
      </div>
    </InfoModal>
  );
}
