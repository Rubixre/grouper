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
  const playerFirstVertex = state.placements.find((p) => p.player === human)?.vertexId;

  const selectedPath = useMemo(() => {
    if (!selectedVertex || !strategyRecommendation || !isFirstHuman) return null;
    return strategyRecommendation.suggestedPaths.find(
      (p) => p.firstVertexId === selectedVertex
    );
  }, [selectedVertex, strategyRecommendation, isFirstHuman]);

  if (!isHumanTurn(state) && !state.finished) {
    const active = player !== null ? getPlayerConfig(state.config, player) : null;
    return (
      <div className="panel simulator-panel simulator-waiting">
        <SimulationDraftBar state={state} />
        <div className="sim-waiting-card">
          <span className="sim-waiting-spinner" aria-hidden />
          <p>
            <strong style={{ color: active?.color }}>{active?.name}</strong> plasserer…
          </p>
          <p className="muted small">Motspillerne velger automatisk beste tilgjengelige spot.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="panel simulator-panel">
      <SimulationDraftBar state={state} />

      <div className="sim-you-banner" style={{ borderColor: humanConfig.color }}>
        <span className="sim-you-dot" style={{ background: humanConfig.color }} />
        <div>
          <strong>Du spiller som {humanConfig.name}</strong>
          <p className="muted small">
            {isSecond ? 'Andre landsby — hele paret vurderes' : 'Første landsby'}
          </p>
        </div>
        <div className="sim-progress-mini">
          <div className="sim-progress-fill" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {state.finished ? (
        <p className="sim-done">Ferdig! Statistikk vises under brettet.</p>
      ) : (
        <>
          {strategyRecommendation && isFirstHuman && (
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
            {isSecond
              ? 'Grønn stiplet markør på brettet viser beste nr. 2 for valgt plassering.'
              : 'Gull #1 er beste plassering. Stiplet markør viser forventet landsby nr. 2.'}
          </p>

          <div className="options-list">
            <h3>Topp {Math.min(8, options.length)} for deg</h3>
            {topOptions.map((opt, i) => {
              const path = strategyRecommendation?.suggestedPaths.find(
                (p) => p.firstVertexId === opt.vertexId
              );
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
                          {path && (
                            <> · Par {path.pairScore.toFixed(2)}</>
                          )}
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
              {selectedPath && isFirstHuman && (
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
                  selectedOption.placementKind === 'second'
                    ? playerFirstVertex
                    : undefined
                }
              />
            </>
          )}

          <button
            type="button"
            className="btn primary btn-block sim-confirm-btn"
            disabled={!selectedVertex}
            onClick={onConfirm}
            style={{ '--player-color': humanConfig.color } as CSSProperties}
          >
            Bekreft for {humanConfig.name}
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
