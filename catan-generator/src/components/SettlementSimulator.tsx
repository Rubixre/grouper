import type { SettlementScore } from '../catan/types';
import type { SimulationState } from '../catan/simulator';
import { PLAYER_COLORS, PLAYER_NAMES, currentPlayer } from '../catan/simulator';

interface SettlementSimulatorProps {
  state: SimulationState;
  options: SettlementScore[];
  selectedVertex: string | null;
  onSelectVertex: (vertexId: string) => void;
  onConfirm: () => void;
}

export function SettlementSimulator({
  state,
  options,
  selectedVertex,
  onSelectVertex,
  onConfirm,
}: SettlementSimulatorProps) {
  const player = currentPlayer(state);
  const step = state.currentStep;
  const total = state.placementOrder.length;
  const progress = state.finished ? 100 : (step / total) * 100;
  const isSecond = options[0]?.placementKind === 'second';
  const topOptions = options.slice(0, 8);
  const selectedOption = selectedVertex
    ? options.find((opt) => opt.vertexId === selectedVertex)
    : undefined;
  const selectedRank = selectedVertex
    ? options.findIndex((opt) => opt.vertexId === selectedVertex) + 1
    : 0;

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

      {state.finished ? (
        <p className="sim-done">Ferdig! Statistikk vises under brettet.</p>
      ) : (
        <>
          <p className="sim-hint">
            {isSecond
              ? 'Andre landsby: poengsum vektlegger startressurser og utfylling mot din første landsby.'
              : 'Første landsby: poengsum basert på vektet produksjon og ressursdekning.'}{' '}
            <strong>Nummererte markører på brettet</strong> viser de 8 beste plasseringene (#1 er gull).
            Du kan også klikke <strong>andre lyse punkter</strong> for fri plassering.
          </p>
          <div className="options-list">
            <h3>Topp {Math.min(8, options.length)} plasseringer</h3>
            {topOptions.map((opt, i) => (
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
                      Start {opt.production.toFixed(2)} · Utfylling{' '}
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
            {selectedOption && selectedRank > 8 && (
              <div className="option-row selected custom-placement">
                <span className="option-rank">#{selectedRank}</span>
                <span className="option-score">{selectedOption.total.toFixed(2)}</span>
                <span className="option-detail">Valgt på brettet (utenfor topp 8)</span>
              </div>
            )}
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
