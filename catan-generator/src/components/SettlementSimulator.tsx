import type { SettlementScore } from '../catan/types';
import type { SimulationState } from '../catan/simulator';
import type { StrategyMode } from '../catan/resourceWeights';
import { STRATEGY_PROFILES } from '../catan/resourceWeights';
import type { StrategyAnalysis } from '../catan/strategyInference';
import { getAnalysisSummary } from '../catan/strategyInference';
import { PLAYER_COLORS, PLAYER_NAMES, currentPlayer } from '../catan/simulator';

interface SettlementSimulatorProps {
  state: SimulationState;
  options: SettlementScore[];
  analysis: StrategyAnalysis | null;
  focusPlayer: number;
  strategyMode: StrategyMode;
  selectedVertex: string | null;
  onSelectVertex: (vertexId: string) => void;
  onConfirm: () => void;
}

export function SettlementSimulator({
  state,
  options,
  analysis,
  focusPlayer,
  strategyMode,
  selectedVertex,
  onSelectVertex,
  onConfirm,
}: SettlementSimulatorProps) {
  const player = currentPlayer(state);
  const step = state.currentStep;
  const total = state.placementOrder.length;
  const progress = state.finished ? 100 : (step / total) * 100;
  const isFocusTurn = player === focusPlayer;
  const advising = strategyMode === 'auto' && isFocusTurn;

  return (
    <div className="panel simulator-panel">
      <div className="sim-progress-wrap">
        <div className="sim-progress-label">
          <span>
            Trekk {Math.min(step + 1, total)} / {total}
          </span>
          {player !== null && !state.finished && (
            <span
              className="current-player"
              style={{ color: PLAYER_COLORS[player] }}
            >
              {PLAYER_NAMES[player]}
            </span>
          )}
        </div>
        <div className="sim-progress-track" role="progressbar" aria-valuenow={progress}>
          <div className="sim-progress-fill" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {advising && analysis && (
        <div className="strategy-analysis">
          <h3>Analyse · {PLAYER_NAMES[focusPlayer]}</h3>
          <p className="muted small">{getAnalysisSummary(analysis)}</p>
          <div className="profile-scores">
            {Object.entries(analysis.profileScores).map(([profile, score]) => (
              <span key={profile} className="profile-score-chip">
                {STRATEGY_PROFILES[profile as keyof typeof STRATEGY_PROFILES].label}:{' '}
                {score.toFixed(2)}
              </span>
            ))}
          </div>
        </div>
      )}

      {!isFocusTurn && strategyMode === 'auto' && !state.finished && (
        <p className="muted small sim-hint">
          Venter på {PLAYER_NAMES[player!]} – råd vises når det er din tur.
        </p>
      )}

      {state.finished ? (
        <p className="sim-done">
          Ferdig! Statistikk vises under brettet.
        </p>
      ) : (
        <>
          <p className="sim-hint">
            Klikk grønn markør på brettet eller velg i listen.
            {options[0]?.placementKind === 'second' && (
              <> Andre landsby gir startressurser.</>
            )}
          </p>
          <div className="options-list">
            <h3>Topp {Math.min(8, options.length)} plasseringer</h3>
            {options.slice(0, 8).map((opt, i) => (
              <button
                key={opt.vertexId}
                type="button"
                className={`option-row ${selectedVertex === opt.vertexId ? 'selected' : ''}`}
                onClick={() => onSelectVertex(opt.vertexId)}
              >
                <span className="option-rank">#{i + 1}</span>
                <span className="option-score">{opt.total.toFixed(2)}</span>
                <span className="option-detail">
                  {opt.placementKind === 'second' ? (
                    <>
                      Start {opt.production.toFixed(2)} · Portef.{' '}
                      {((opt.portfolio ?? 0) - (opt.overlap ?? 0)).toFixed(2)}
                    </>
                  ) : (
                    <>
                      Prod {opt.production.toFixed(2)} · Dekk {opt.diversity.toFixed(2)}
                    </>
                  )}
                </span>
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn primary btn-block"
            disabled={!selectedVertex}
            onClick={onConfirm}
          >
            Bekreft for {PLAYER_NAMES[player!]}
          </button>
        </>
      )}

      {state.placements.length > 0 && (
        <details className="placement-log" open={state.placements.length <= 4}>
          <summary>Plasseringer ({state.placements.length})</summary>
          {state.placements.map((p, i) => (
            <div key={i} className="log-row">
              <span style={{ color: PLAYER_COLORS[p.player] }}>●</span>
              <span>
                {PLAYER_NAMES[p.player]} · trekk {i + 1}
              </span>
            </div>
          ))}
        </details>
      )}
    </div>
  );
}
