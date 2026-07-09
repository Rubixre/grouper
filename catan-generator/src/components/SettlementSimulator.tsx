import type { SettlementScore } from '../catan/types';
import type { SimulationState } from '../catan/simulator';
import {
  PLAYER_COLORS,
  PLAYER_NAMES,
  currentPlayer,
  isHumanTurn,
} from '../catan/simulator';

interface SettlementSimulatorProps {
  state: SimulationState;
  options: SettlementScore[];
  selectedVertex: string | null;
  onSelectVertex: (vertexId: string) => void;
  onConfirm: () => void;
  onAutoPlay: () => void;
}

export function SettlementSimulator({
  state,
  options,
  selectedVertex,
  onSelectVertex,
  onConfirm,
  onAutoPlay,
}: SettlementSimulatorProps) {
  const player = currentPlayer(state);
  const humanTurn = isHumanTurn(state);
  const step = state.currentStep;
  const total = state.placementOrder.length;

  return (
    <div className="panel simulator-panel">
      <h2>Startposisjon-simulator</h2>

      <div className="sim-meta">
        <span>
          Trekk {step + 1} / {total}
        </span>
        {player !== null && (
          <span
            className="current-player"
            style={{ color: PLAYER_COLORS[player] }}
          >
            {humanTurn ? 'Din tur' : PLAYER_NAMES[player]}
          </span>
        )}
      </div>

      {state.finished ? (
        <p className="sim-done">Alle startlandsbyer er plassert!</p>
      ) : humanTurn ? (
        <>
          <p className="sim-hint">
            Klikk på en grønn markør på brettet for å velge plassering. Fargen
            viser relativ styrke basert på ressurser, sannsynlighet, variasjon
            og havn.
          </p>
          <div className="options-list">
            <h3>Toppkandidater</h3>
            {options.slice(0, 8).map((opt, i) => (
              <button
                key={opt.vertexId}
                type="button"
                className={`option-row ${selectedVertex === opt.vertexId ? 'selected' : ''}`}
                onClick={() => onSelectVertex(opt.vertexId)}
              >
                <span className="option-rank">#{i + 1}</span>
                <span className="option-score">{opt.total.toFixed(3)}</span>
                <span className="option-detail">
                  Prod {opt.production.toFixed(2)} · Var {opt.diversity.toFixed(2)} · Havn{' '}
                  {opt.harbor.toFixed(2)}
                </span>
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn primary"
            disabled={!selectedVertex}
            onClick={onConfirm}
          >
            Plasser landsby
          </button>
        </>
      ) : (
        <>
          <p className="sim-hint">
            {PLAYER_NAMES[player!]} velger automatisk (beste score)…
          </p>
          <button type="button" className="btn" onClick={onAutoPlay}>
            Kjør AI-trekk
          </button>
        </>
      )}

      <div className="placement-log">
        <h3>Plasseringer</h3>
        {state.placements.length === 0 && (
          <p className="muted">Ingen landsbyer plassert ennå.</p>
        )}
        {state.placements.map((p: { player: number }, i: number) => (
          <div key={i} className="log-row">
            <span style={{ color: PLAYER_COLORS[p.player] }}>●</span>
            <span>
              {PLAYER_NAMES[p.player]} – trekk {i + 1}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
