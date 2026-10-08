import { useTranslation } from 'react-i18next';
import type { BoardSize, PlayerCount } from '../catan/types';
import type { SimulationConfig } from '../catan/playerConfig';

export type MobileCoachStep = 'configure' | 'ready' | 'coaching' | 'done';

interface MobileCoachBarProps {
  step: MobileCoachStep;
  boardSize: BoardSize;
  playerCount: PlayerCount;
  config: SimulationConfig;
  canStartCoach: boolean;
  premiumUnlocked: boolean;
  onBoardSizeChange: (size: BoardSize) => void;
  onPlayerCountChange: (count: PlayerCount) => void;
  onConfigChange: (config: SimulationConfig) => void;
  onGenerate: () => void;
  onStartCoach: () => void;
  onOpenSettings: () => void;
}

const BASE_COUNTS: PlayerCount[] = [3, 4];
const EXT_COUNTS: PlayerCount[] = [5, 6];

export function MobileCoachBar({
  step,
  boardSize,
  playerCount,
  config,
  canStartCoach,
  premiumUnlocked,
  onBoardSizeChange,
  onPlayerCountChange,
  onConfigChange,
  onGenerate,
  onStartCoach,
  onOpenSettings,
}: MobileCoachBarProps) {
  const { t } = useTranslation();

  if (step === 'coaching') return null;

  const counts = boardSize === 'extension56' ? EXT_COUNTS : BASE_COUNTS;

  return (
    <section className="mobile-coach-bar" aria-label={t('mobile.coachBarLabel')}>
      <div className="mobile-coach-bar-inner">
        {(step === 'configure' || step === 'ready') && (
          <>
            <p className="mobile-coach-kicker">{t('mobile.configureTitle')}</p>

            <div className="mobile-segment" role="group" aria-label={t('settings.boardSize')}>
              <button
                type="button"
                className={`mobile-segment-btn ${boardSize === 'base' ? 'is-active' : ''}`}
                onClick={() => onBoardSizeChange('base')}
              >
                {t('mobile.boardBase')}
              </button>
              <button
                type="button"
                className={`mobile-segment-btn ${boardSize === 'extension56' ? 'is-active' : ''}`}
                onClick={() => onBoardSizeChange('extension56')}
              >
                {t('mobile.boardExtension')}
              </button>
            </div>

            <div className="mobile-chip-row" role="group" aria-label={t('setup.playerCount')}>
              {counts.map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`mobile-chip ${playerCount === n ? 'is-active' : ''}`}
                  onClick={() => onPlayerCountChange(n)}
                >
                  {t('setup.players', { count: n })}
                </button>
              ))}
            </div>

            <div className="mobile-chip-row" role="group" aria-label={t('mobile.youAre')}>
              <span className="mobile-chip-label">{t('mobile.youAre')}</span>
              {config.players.slice(0, playerCount).map((player, index) => {
                const isYou = config.humanPlayerIndex === index;
                return (
                  <button
                    key={index}
                    type="button"
                    className={`mobile-chip mobile-chip-player ${isYou ? 'is-active' : ''}`}
                    style={{
                      borderColor: isYou ? player.color : undefined,
                      ['--chip-color' as string]: player.color,
                    }}
                    onClick={() =>
                      onConfigChange({ ...config, humanPlayerIndex: index })
                    }
                  >
                    <span
                      className="mobile-chip-dot"
                      style={{ background: player.color }}
                      aria-hidden
                    />
                    {isYou ? t('mobile.you') : player.name || String(index + 1)}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {step === 'done' && (
          <p className="mobile-coach-done-msg">{t('mobile.doneHint')}</p>
        )}

        <div className="mobile-coach-actions">
          {(step === 'configure' || step === 'ready' || step === 'done') && (
            <button type="button" className="btn mobile-coach-secondary" onClick={onGenerate}>
              {step === 'done' ? t('mobile.newBoard') : t('app.generateBoard')}
            </button>
          )}

          {(step === 'configure' || step === 'ready') && (
            <button
              type="button"
              className={`btn primary mobile-coach-primary ${!premiumUnlocked ? 'btn-premium-locked' : ''}`}
              disabled={!canStartCoach}
              onClick={onStartCoach}
            >
              {premiumUnlocked
                ? t('mobile.getOpeningPicks')
                : t('mobile.unlockOpeningPicks')}
            </button>
          )}

          {step === 'done' && (
            <button
              type="button"
              className="btn primary mobile-coach-primary"
              onClick={onStartCoach}
            >
              {t('setup.newRound')}
            </button>
          )}

          <button
            type="button"
            className="btn mobile-coach-gear"
            onClick={onOpenSettings}
            aria-label={t('app.settings')}
          >
            ⚙
          </button>
        </div>

        {(step === 'configure' || step === 'ready') && (
          <p className="mobile-coach-hint muted small">{t('mobile.flowHint')}</p>
        )}
      </div>
    </section>
  );
}
