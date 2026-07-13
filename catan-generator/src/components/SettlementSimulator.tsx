import type { CSSProperties } from 'react';
import { useMemo } from 'react';
import type { SettlementScore, ResourceWeights } from '../catan/types';
import type { Board } from '../catan/types';
import type { SimulationState } from '../catan/simulator';
import { currentPlayer, isHumanTurn } from '../catan/simulator';
import type { StrategyProfile, StrategyProfileId } from '../catan/resourceWeights';
import type { StrategyRecommendation } from '../catan/strategyAdvisor';
import { isHumanFirstSettlementTurn } from '../catan/strategyAdvisor';
import { getPlayerConfig } from '../catan/playerConfig';
import { RESOURCE_LABELS } from '../catan/playerStats';
import type { ProdResource } from '../catan/playerStats';
import { PlacementScoreBreakdown } from './PlacementScoreBreakdown';
import { SimulationDraftBar } from './SimulationDraftBar';

interface SettlementSimulatorProps {
  state: SimulationState;
  board: Board;
  options: SettlementScore[];
  selectedVertex: string | null;
  strategyProfile: StrategyProfile;
  strategyWeights: ResourceWeights;
  strategyRecommendation: StrategyRecommendation | null;
  secondPreviewVertex: string | null;
  onSelectVertex: (vertexId: string) => void;
  onConfirm: () => void;
  onApplyRecommendedStrategy: (profileId: StrategyProfileId) => void;
}

function resourceSummary(score: SettlementScore): string {
  const types = [...new Set(score.breakdown.map((b) => b.resource))] as ProdResource[];
  return types.map((r) => RESOURCE_LABELS[r]).join(' · ') || '—';
}

export function SettlementSimulator({
  state,
  board,
  options,
  selectedVertex,
  strategyProfile,
  strategyWeights,
  strategyRecommendation,
  secondPreviewVertex,
  onSelectVertex,
  onConfirm,
  onApplyRecommendedStrategy,
}: SettlementSimulatorProps) {
  const player = currentPlayer(state);
  const human = state.config.humanPlayerIndex;
  const humanConfig = getPlayerConfig(state.config, human);
  const activeConfig = player !== null ? getPlayerConfig(state.config, player) : humanConfig;
  const isYourTurn = isHumanTurn(state);
  const step = state.currentStep;
  const total = state.placementOrder.length;
  const progress = state.finished ? 100 : (step / total) * 100;
  const isSecond = options[0]?.placementKind === 'second';
  const isFirstHuman = isHumanFirstSettlementTurn(state.placements, human);
  const topOptions = options.slice(0, 8);
  const selectedOption = selectedVertex
    ? options.find((opt) => opt.vertexId === selectedVertex)
    : undefined;
  const selectedRank = selectedVertex
    ? options.findIndex((opt) => opt.vertexId === selectedVertex) + 1
    : 0;
  const currentFirstVertex =
    player !== null
      ? state.placements.find((p) => p.player === player)?.vertexId
      : undefined;

  const selectedPath = useMemo(() => {
    if (!selectedVertex || !strategyRecommendation || !isFirstHuman || !isYourTurn) return null;
    return strategyRecommendation.suggestedPaths.find(
      (p) => p.firstVertexId === selectedVertex
    );
  }, [selectedVertex, strategyRecommendation, isFirstHuman, isYourTurn]);

  return (
    <div className="panel simulator-panel">
      <SimulationDraftBar state={state} />

      <div
        className={`sim-you-banner ${isYourTurn ? 'is-your-turn' : 'is-opponent-turn'}`}
        style={{ borderColor: activeConfig.color }}
      >
        <span className="sim-you-dot" style={{ background: activeConfig.color }} />
        <div>
          {isYourTurn ? (
            <>
              <strong>Din tur — {humanConfig.name}</strong>
              <p className="muted small">
                {isSecond ? 'Andre landsby — hele paret vurderes' : 'Første landsby'}
              </p>
            </>
          ) : (
            <>
              <strong>Plasser for {activeConfig.name}</strong>
              <p className="muted small">
                Manuell plassering · du er {humanConfig.name}
              </p>
            </>
          )}
        </div>
        <div className="sim-progress-mini">
          <div className="sim-progress-fill" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {state.finished ? (
        <p className="sim-done">Ferdig! Statistikk vises under brettet.</p>
      ) : (
        <>
          {strategyRecommendation && isFirstHuman && isYourTurn && (
            <div className="strategy-recommendation-card">
              <div className="strategy-recommendation-header">
                <span className="strategy-recommendation-icon" aria-hidden>
                  ✦
                </span>
                <div>
                  <h3>Anbefalt strategi</h3>
                  <p className="muted small">{strategyRecommendation.reason}</p>
                </div>
              </div>
              <div className="strategy-recommendation-actions">
                <span className="strategy-pill">{strategyRecommendation.recommendedProfile.label}</span>
                {strategyProfile.id !== strategyRecommendation.recommendedProfileId && (
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() =>
                      onApplyRecommendedStrategy(strategyRecommendation.recommendedProfileId)
                    }
                  >
                    Bruk anbefaling
                  </button>
                )}
              </div>
              {strategyRecommendation.suggestedPaths.length > 0 && (
                <ul className="strategy-path-list muted small">
                  {strategyRecommendation.suggestedPaths.slice(0, 3).map((path, i) => (
                    <li key={path.firstVertexId}>
                      #{i + 1} parscore {path.pairScore.toFixed(2)} · 1. landsby{' '}
                      {path.firstScore.toFixed(2)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <p className="sim-hint">
            <strong>Profil:</strong> {strategyProfile.label}.{' '}
            {isYourTurn && isFirstHuman && !isSecond
              ? 'Gull #1 er beste plassering. Stiplet markør viser forventet landsby nr. 2.'
              : isSecond
                ? 'Grønn stiplet markør viser beste nr. 2 når det er din tur.'
                : 'Velg hjørne på brettet eller fra listen under.'}
          </p>

          <div className="options-list">
            <h3>
              Topp {Math.min(8, options.length)} for {activeConfig.name}
            </h3>
            {topOptions.map((opt, i) => {
              const path =
                isYourTurn && isFirstHuman
                  ? strategyRecommendation?.suggestedPaths.find(
                      (p) => p.firstVertexId === opt.vertexId
                    )
                  : undefined;
              return (
                <button
                  key={opt.vertexId}
                  type="button"
                  className={`option-card ${selectedVertex === opt.vertexId ? 'selected' : ''}`}
                  onClick={() => onSelectVertex(opt.vertexId)}
                >
                  <div className="option-card-rank" data-rank={i + 1}>
                    #{i + 1}
                  </div>
                  <div className="option-card-body">
                    <div className="option-card-score">{opt.total.toFixed(2)}</div>
                    <div className="option-card-resources">{resourceSummary(opt)}</div>
                    <div className="option-card-meta">
                      {opt.placementKind === 'second' ? (
                        <>
                          Par {opt.production.toFixed(2)}
                          {(opt.buildingSynergy ?? 0) > 0 && (
                            <> · Syn +{(opt.buildingSynergy ?? 0).toFixed(2)}</>
                          )}
                        </>
                      ) : (
                        <>
                          Prod {opt.production.toFixed(2)} · Dekk {opt.diversity.toFixed(2)}
                          {path && <> · Par {path.pairScore.toFixed(2)}</>}
                        </>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
            {selectedOption && selectedRank > 8 && (
              <div className="option-card selected custom-placement">
                <div className="option-card-rank">#{selectedRank}</div>
                <div className="option-card-body">
                  <div className="option-card-score">{selectedOption.total.toFixed(2)}</div>
                  <div className="option-card-meta">Valgt på brettet (utenfor topp 8)</div>
                </div>
              </div>
            )}
          </div>

          {selectedOption && (
            <>
              {selectedPath && isFirstHuman && isYourTurn && (
                <p className="second-preview-hint muted small">
                  Forventet landsby nr. 2 (mot simulerte motspillere): parscore{' '}
                  <strong>{selectedPath.pairScore.toFixed(2)}</strong>
                  {secondPreviewVertex && ' — markert på brettet med stiplet ring'}
                </p>
              )}
              <PlacementScoreBreakdown
                score={selectedOption}
                board={board}
                rank={selectedRank}
                strategyProfile={strategyProfile}
                strategyWeights={strategyWeights}
                firstVertexId={
                  selectedOption.placementKind === 'second' ? currentFirstVertex : undefined
                }
              />
            </>
          )}

          <button
            type="button"
            className="btn primary btn-block sim-confirm-btn"
            disabled={!selectedVertex}
            onClick={onConfirm}
            style={{ '--player-color': activeConfig.color } as CSSProperties}
          >
            Bekreft for {activeConfig.name}
          </button>
        </>
      )}

      {state.placements.length > 0 && (
        <details className="placement-log" open={state.placements.length <= 4}>
          <summary>Plasseringer ({state.placements.length})</summary>
          {state.placements.map((p, i) => {
            const cfg = getPlayerConfig(state.config, p.player);
            return (
              <div key={i} className="log-row">
                <span style={{ color: cfg.color }}>●</span>
                <span>
                  {cfg.name}
                  {p.player === human ? ' (deg)' : ''} · trekk {i + 1}
                </span>
              </div>
            );
          })}
        </details>
      )}
    </div>
  );
}
