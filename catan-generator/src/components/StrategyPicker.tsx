import {
  HARBOR_STRATEGY_CHOICE,
  STRATEGY_PROFILES,
  type StrategyChoice,
} from '../catan/resourceWeights';
import type { StrategyRelativeLevels } from '../catan/strategyAdvisor';

interface StrategyPickerProps {
  value: StrategyChoice;
  recommended?: StrategyChoice | null;
  /** Skjul/disable havn når det ikke finnes planer (under simulering) */
  harborEnabled?: boolean;
  harborCount?: number;
  /** Relativ styrke (beste = 100) vist bak strateginavnet */
  levels?: StrategyRelativeLevels | null;
  onChange: (choice: StrategyChoice) => void;
  /** Kort hint under knappene */
  hint?: string | null;
}

function levelLabel(levels: StrategyRelativeLevels | null | undefined, choice: StrategyChoice): string | null {
  const level = levels?.[choice];
  if (level === undefined) return null;
  return `${level}%`;
}

export function StrategyPicker({
  value,
  recommended = null,
  harborEnabled = true,
  harborCount,
  levels = null,
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
          const level = levelLabel(levels, profile.id);
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
              title={
                level
                  ? `${profile.description} Relativ styrke: ${level} (beste = 100%).`
                  : profile.description
              }
              onClick={() => onChange(profile.id)}
            >
              <span className="strategy-pick-name">{profile.shortLabel}</span>
              {level && <span className="strategy-pick-level">{level}</span>}
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
          title={
            levelLabel(levels, 'harbor')
              ? `${HARBOR_STRATEGY_CHOICE.description} Relativ styrke: ${levelLabel(levels, 'harbor')} (beste = 100%).`
              : HARBOR_STRATEGY_CHOICE.description
          }
          onClick={() => onChange('harbor')}
        >
          <span className="strategy-pick-name">
            {HARBOR_STRATEGY_CHOICE.shortLabel}
            {typeof harborCount === 'number' && harborCount > 0 ? ` · ${harborCount}` : ''}
          </span>
          {levelLabel(levels, 'harbor') && (
            <span className="strategy-pick-level">{levelLabel(levels, 'harbor')}</span>
          )}
        </button>
      </div>
      {hint && <p className="strategy-picker-hint muted small">{hint}</p>}
    </div>
  );
}
