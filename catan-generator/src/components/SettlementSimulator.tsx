import type { CSSProperties } from 'react';
import { useMemo, useState } from 'react';
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

const DEFAULT_VISIBLE_OPTIONS = 5;

function resourceSummary(score: SettlementScore): string {
  const types = [...new Set(score.breakdown.map((b) => b.resource))] as ProdResource[];
  return types.map((r) => RESOURCE_LABELS[r]).join(' · ') || '—';
}

function optionMeta(
  opt: SettlementScore,
  path: { pairScore: number } | undefined
): string {
  if (opt.placementKind === 'second') {
    const synergy =
      (opt.buildingSynergy ?? 0) > 0 ? ` · Syn +${(opt.buildingSynergy ?? 0).toFixed(2)}` : '';
    return `Par ${opt.production.toFixed(2)}${synergy}`;
  }
  if (opt.expectedPairScore !== undefined) {
    const local = opt.immediateScore ?? opt.production;
    return `Forventet par ${opt.expectedPairScore.toFixed(2)} · Spot ${local.toFixed(2)}`;
  }
  const pair = path ? ` · Par ${path.pairScore.toFixed(2)}` : '';
  return `Prod ${opt.production.toFixed(2)} · Dekk ${opt.diversity.toFixed(2)}${pair}`;
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
  const [showAllOptions, setShowAllOptions] = useState(false);

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
  const visibleCount = showAllOptions ? options.length : DEFAULT_VISIBLE_OPTIONS;
  const visibleOptions = options.slice(0, visibleCount);
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

  const turnHint = isYourTurn
    ? isSecond
      ? 'Andre landsby — hele paret vurderes'
      : isFirstHuman
              ? 'Rangert på forventet par (lookahead). Stiplet ring = landsby #2'
        : 'Første landsby'
    : 'Velg hjørne på brettet eller i listen';

  return (
    <div className="panel simulator-panel">
      <div className="sim-sticky-head">
        <SimulationDraftBar state={state} />

        <div
          className={`sim-you-banner ${isYourTurn ? 'is-your-turn' : 'is-opponent-turn'}`}
          style={{ borderColor: activeConfig.color }}
        >
          <span className="sim-you-dot" style={{ background: activeConfig.color }} />
          <div className="sim-you-banner-text">
            {isYourTurn ? (
              <>
                <strong>Din tur — {humanConfig.name}</strong>
                <p className="muted small">{turnHint}</p>
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
          <span className="sim-profile-chip muted small">{strategyProfile.label}</span>
        </div>

        {!state.finished && (
          <button
            type="button"
            className="btn primary btn-block sim-confirm-btn"
            disabled={!selectedVertex}
            onClick={onConfirm}
            style={{ '--player-color': activeConfig.color } as CSSProperties}
          >
            Bekreft for {activeConfig.name}
          </button>
        )}
      </div>

      {state.finished ? (
        <p className="sim-done">Ferdig! Statistikk vises under brettet.</p>
      ) : (
        <div className="sim-main-scroll">
          {strategyRecommendation && isFirstHuman && isYourTurn && (
            <details className="sim-details-block strategy-recommendation-details">
              <summary>
                Anbefalt strategi: {strategyRecommendation.recommendedProfile.label}
              </summary>
              <div className="strategy-recommendation-card">
                <p className="muted small">{strategyRecommendation.reason}</p>
                <div className="strategy-recommendation-actions">
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
            </details>
          )}

          <div className="options-list options-list-compact">
            <div className="options-list-header">
              <h3>Topp {Math.min(visibleCount, options.length)} for {activeConfig.name}</h3>
              {options.length > DEFAULT_VISIBLE_OPTIONS && (
                <button
                  type="button"
                  className="btn-link options-toggle"
                  onClick={() => setShowAllOptions((on) => !on)}
                >
                  {showAllOptions ? 'Vis færre' : `Vis alle (${options.length})`}
                </button>
              )}
            </div>
            {visibleOptions.map((opt, i) => {
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
                  className={`option-row-compact ${selectedVertex === opt.vertexId ? 'selected' : ''}`}
                  onClick={() => onSelectVertex(opt.vertexId)}
                >
                  <span className="option-row-rank" data-rank={i + 1}>
                    #{i + 1}
                  </span>
                  <span className="option-row-score">{opt.total.toFixed(2)}</span>
                  <span className="option-row-detail">
                    <span className="option-row-resources">{resourceSummary(opt)}</span>
                    <span className="option-row-meta">{optionMeta(opt, path)}</span>
                  </span>
                </button>
              );
            })}
            {selectedOption && selectedRank > visibleCount && (
              <div className="option-row-compact selected custom-placement">
                <span className="option-row-rank">#{selectedRank}</span>
                <span className="option-row-score">{selectedOption.total.toFixed(2)}</span>
                <span className="option-row-detail">
                  <span className="option-row-meta">Valgt på brettet (utenfor listen)</span>
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="sim-details-foot">
        {selectedOption && !state.finished && (
          <details className="sim-details-block score-breakdown-details">
            <summary>
              Poengforklaring · #{selectedRank} (
              {selectedOption.expectedPairScore !== undefined
                ? `par ${selectedOption.expectedPairScore.toFixed(2)}`
                : selectedOption.total.toFixed(2)}
              )
            </summary>
            {(selectedOption.expectedPairScore !== undefined ||
              (selectedPath && isFirstHuman && isYourTurn)) && (
              <p className="second-preview-hint muted small">
                Forventet landsby nr. 2 (motspillere: pip + mangfold): parscore{' '}
                <strong>
                  {(
                    selectedOption.expectedPairScore ?? selectedPath?.pairScore ?? 0
                  ).toFixed(2)}
                </strong>
                {secondPreviewVertex && ' — stiplet ring på brettet'}
                {selectedOption.immediateScore !== undefined && (
                  <> · lokal spot {selectedOption.immediateScore.toFixed(2)}</>
                )}
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
          </details>
        )}

        {state.placements.length > 0 && (
          <details className="sim-details-block placement-log">
            <summary>Plasseringer ({state.placements.length})</summary>
            <div className="placement-log-list">
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
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
