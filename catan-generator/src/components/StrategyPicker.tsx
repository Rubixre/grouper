import {
  HARBOR_STRATEGY_CHOICE,
  STRATEGY_PROFILES,
  type StrategyChoice,
} from '../catan/resourceWeights';

interface StrategyPickerProps {
  value: StrategyChoice;
  recommended?: StrategyChoice | null;
  /** Skjul/disable havn når det ikke finnes planer (under simulering) */
  harborEnabled?: boolean;
  harborCount?: number;
  onChange: (choice: StrategyChoice) => void;
  /** Kort hint under knappene */
  hint?: string | null;
}

export function StrategyPicker({
  value,
  recommended = null,
  harborEnabled = true,
  harborCount,
  onChange,
  hint,
}: StrategyPickerProps) {
  return (
    <div className="strategy-picker">
      <div className="strategy-picker-label">Din strategi</div>
      <div className="strategy-picker-grid" role="group" aria-label="Strategiprofil">
        {STRATEGY_PROFILES.map((profile) => {
          const selected = value === profile.id;
          const isRecommended = recommended === profile.id;
          return (
            <button
              key={profile.id}
              type="button"
              className={[
                'strategy-pick-btn',
                selected ? 'is-selected' : '',
                isRecommended ? 'is-recommended' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-pressed={selected}
              title={profile.description}
              onClick={() => onChange(profile.id)}
            >
              {profile.shortLabel}
            </button>
          );
        })}
        <button
          type="button"
          className={[
            'strategy-pick-btn',
            'strategy-pick-harbor',
            value === 'harbor' ? 'is-selected' : '',
            recommended === 'harbor' ? 'is-recommended' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          aria-pressed={value === 'harbor'}
          disabled={!harborEnabled}
          title={HARBOR_STRATEGY_CHOICE.description}
          onClick={() => onChange('harbor')}
        >
          {HARBOR_STRATEGY_CHOICE.shortLabel}
          {typeof harborCount === 'number' && harborCount > 0 ? ` (${harborCount})` : ''}
        </button>
      </div>
      {hint && <p className="strategy-picker-hint muted small">{hint}</p>}
    </div>
  );
}
