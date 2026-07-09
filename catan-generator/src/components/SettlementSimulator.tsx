import type { SettlementScore } from '../catan/types';
import type { SimulationState } from '../catan/simulator';
import type { StrategyProfile } from '../catan/resourceWeights';
import { STRATEGY_PROFILES } from '../catan/resourceWeights';
import { PLAYER_COLORS, PLAYER_NAMES, currentPlayer } from '../catan/simulator';

interface SettlementSimulatorProps {
  state: SimulationState;
  options: SettlementScore[];
  strategyProfile: StrategyProfile;
  selectedVertex: string | null;
  onSelectVertex: (vertexId: string) => void;
  onConfirm: () => void;
}

export function SettlementSimulator({
  state,
  options,
  strategyProfile,
  selectedVertex,
  onSelectVertex,
  onConfirm,
}: SettlementSimulatorProps) {
  const player = currentPlayer(state);
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
            {PLAYER_NAMES[player]} plasserer
          </span>
        )}
      </div>

      {state.finished ? (
        <p className="sim-done">Alle startlandsbyer er plassert!</p>
      ) : (
        <>
          <p className="sim-hint">
            {PLAYER_NAMES[player!]}: klikk på en grønn markør på brettet, eller
            velg fra listen.{' '}
            {options[0]?.placementKind === 'second'
              ? 'Andre landsby: startressurser fra denne plasseringen, men vurdering inkluderer vektet utfylling mot første landsby og havn på total inntekt.'
              : `Fargen viser relativ styrke (${STRATEGY_PROFILES[strategyProfile].label}: produksjon, dekningsgrad, havn).`}
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
                  {opt.placementKind === 'second' ? (
                    <>
                      Start {opt.production.toFixed(2)} · Portef.{' '}
                      {((opt.portfolio ?? 0) - (opt.overlap ?? 0)).toFixed(2)} · Havn tot.{' '}
                      {opt.harbor.toFixed(2)}
                    </>
                  ) : (
                    <>
                      Prod {opt.production.toFixed(2)} · Dekk {opt.diversity.toFixed(2)} · Havn{' '}
                      {opt.harbor.toFixed(2)}
                    </>
                  )}
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
            Plasser landsby for {PLAYER_NAMES[player!]}
          </button>
        </>
      )}

      <div className="placement-log">
        <h3>Plasseringer</h3>
        {state.placements.length === 0 && (
          <p className="muted">Ingen landsbyer plassert ennå.</p>
        )}
        {state.placements.map((p, i) => (
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
