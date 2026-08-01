import { InfoModal } from './InfoModal';
import type { PremiumFeature } from '../catan/entitlements';
import {
  isDevPremiumUnlockEnabled,
  premiumFeatureLabel,
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

const PREMIUM_PERKS = [
  'Bonanzabrett (tilfeldig pool fra grunnspill + utvidelse)',
  'Startposisjon-simulering med rangering av landsbyer',
  'Forslag til veiretning og ekspansjon',
  'Strategi- og havnråd under plassering',
  'Midgame: veinett / lengste vei, byer og røverråd',
];

export function PremiumPaywallModal({
  open,
  feature,
  onClose,
  onStartTrial,
  onActivateDev,
}: PremiumPaywallModalProps) {
  const featureName = feature ? premiumFeatureLabel(feature) : 'Premium';
  const showDevUnlock = Boolean(onActivateDev) && isDevPremiumUnlockEnabled();

  return (
    <InfoModal
      open={open}
      title="Premium"
      onClose={onClose}
      footerNote="14 dagers gratis prøve · deretter abonnement (kommer i app-butikkene)"
    >
      <div className="premium-paywall">
        <p>
          <strong>{featureName}</strong> er en Premium-funksjon.
        </p>
        <p className="muted small">
          Du kan generere så mange standardbrett du vil gratis. Premium låser opp
          avanserte brettvarianter og plasseringsrådgivning.
        </p>

        <h3 className="premium-paywall-heading">Inkludert i Premium</h3>
        <ul className="premium-perk-list">
          {PREMIUM_PERKS.map((perk) => (
            <li key={perk}>{perk}</li>
          ))}
        </ul>

        <div className="premium-paywall-actions">
          <button type="button" className="btn primary btn-block" onClick={onStartTrial}>
            Start 14 dagers gratis prøve
          </button>
          {showDevUnlock && (
            <button type="button" className="btn btn-block" onClick={onActivateDev}>
              Aktiver Premium (utvikling)
            </button>
          )}
          <button type="button" className="btn btn-block" onClick={onClose}>
            Fortsett gratis
          </button>
        </div>
      </div>
    </InfoModal>
  );
}
