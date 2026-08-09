import { useTranslation } from 'react-i18next';
import type { BoardSize, GeneratorSettings } from '../catan/types';

interface SettingsPanelProps {
  settings: GeneratorSettings;
  onChange: (settings: GeneratorSettings) => void;
  /** In modal – uten panel-wrapper */
  embedded?: boolean;
  /** Styrer om bonanza-valget vises (kun grunnspill) */
  boardSize?: BoardSize;
  /** When false, Bonanza is locked and opens paywall instead of toggling */
  canUseBonanza?: boolean;
  onPremiumRequired?: () => void;
}

const SETTING_ROWS: {
  key: keyof GeneratorSettings;
  labelKey: string;
  descKey: string;
  onlyBoardSize?: BoardSize;
  premium?: boolean;
}[] = [
  {
    key: 'allowAdjacent6And8',
    labelKey: 'settings.allowAdjacent68',
    descKey: 'settings.allowAdjacent68Desc',
  },
  {
    key: 'allowAdjacent2And12',
    labelKey: 'settings.allowAdjacent212',
    descKey: 'settings.allowAdjacent212Desc',
  },
  {
    key: 'allowAdjacentSameResource',
    labelKey: 'settings.allowSameResource',
    descKey: 'settings.allowSameResourceDesc',
  },
  {
    key: 'allowAdjacentSameNumber',
    labelKey: 'settings.allowSameNumber',
    descKey: 'settings.allowSameNumberDesc',
  },
  {
    key: 'randomHarbors',
    labelKey: 'settings.randomHarbors',
    descKey: 'settings.randomHarborsDesc',
  },
  {
    key: 'bonanzaBoard',
    labelKey: 'settings.bonanzaBoard',
    descKey: 'settings.bonanzaBoardDesc',
    onlyBoardSize: 'base',
    premium: true,
  },
];

export function SettingsPanel({
  settings,
  onChange,
  embedded = false,
  boardSize = 'base',
  canUseBonanza = true,
  onPremiumRequired,
}: SettingsPanelProps) {
  const { t } = useTranslation();
  const visibleSettings = SETTING_ROWS.filter(
    (row) => !row.onlyBoardSize || row.onlyBoardSize === boardSize
  );

  const Heading = embedded ? 'h3' : 'h2';

  const inner = (
    <>
      <Heading>{t('settings.generationRules')}</Heading>
      <p className="muted small">{t('settings.checkedMeans')}</p>
      <div className="settings-list">
        {visibleSettings.map(({ key, labelKey, descKey, premium }) => {
          const locked = Boolean(premium && !canUseBonanza);
          return (
            <label
              key={key}
              className={`setting-row ${locked ? 'setting-row-locked' : ''}`}
            >
              <input
                type="checkbox"
                checked={settings[key]}
                disabled={locked && !settings[key]}
                onChange={(e) => {
                  if (locked && e.target.checked) {
                    onPremiumRequired?.();
                    return;
                  }
                  onChange({ ...settings, [key]: e.target.checked });
                }}
                onClick={(e) => {
                  if (locked && !settings[key]) {
                    e.preventDefault();
                    onPremiumRequired?.();
                  }
                }}
              />
              <span className="setting-text">
                <strong>
                  {t(labelKey)}
                  {premium ? (
                    <span className="premium-badge" title="Premium">
                      Premium
                    </span>
                  ) : null}
                </strong>
                <small>{t(descKey)}</small>
                {locked ? (
                  <small className="setting-lock-hint">{t('settings.bonanzaLocked')}</small>
                ) : null}
              </span>
            </label>
          );
        })}
      </div>
    </>
  );

  if (embedded) return <div className="settings-panel embedded">{inner}</div>;
  return <div className="panel settings-panel">{inner}</div>;
}
