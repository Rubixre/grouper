import type { CSSProperties } from 'react';
import { useMemo, useState } from 'react';
import type { SettlementScore, ResourceWeights, BoardSize } from '../catan/types';
import type { Board } from '../catan/types';
import type { SimulationState } from '../catan/simulator';
import { currentPlayer, isHumanTurn } from '../catan/simulator';
import type { StrategyChoice, StrategyProfile } from '../catan/resourceWeights';
import {
  HARBOR_STRATEGY_CHOICE,
  OPPONENT_RESOURCE_WEIGHTS,
  strategyChoiceLabel,
} from '../catan/resourceWeights';
import type {
  StrategyRecommendation,
  StrategyRelativeLevels,
} from '../catan/strategyAdvisor';
import {
  isHumanFirstSettlementTurn,
  isHumanSecondSettlementTurn,
} from '../catan/strategyAdvisor';
import {
  harborOpportunityKey,
  type HarborStrategyOpportunity,
} from '../catan/harborStrategy';
import { shortVertexLabel } from '../catan/vertexLabels';
import { getPlayerConfig } from '../catan/playerConfig';
import { RESOURCE_LABELS } from '../catan/playerStats';
import type { ProdResource } from '../catan/playerStats';
import { PlacementScoreBreakdown } from './PlacementScoreBreakdown';
import { SimulationDraftBar } from './SimulationDraftBar';
import { StrategyPicker } from './StrategyPicker';

const OPPONENT_BREAKDOWN_PROFILE: StrategyProfile = {
  id: 'general',
  label: 'Jevne vekter (motstander)',
  shortLabel: 'Jevne',
  description:
    'Motspillere vektlegger ressursene mer likt enn strategisk balansert.',
  weights: OPPONENT_RESOURCE_WEIGHTS,
};

interface SettlementSimulatorProps {
  state: SimulationState;
  board: Board;
  boardSize: BoardSize;
  options: SettlementScore[];
  selectedVertex: string | null;
  selectedHarborPlanKey: string | null;
  strategyChoice: StrategyChoice;
  strategyProfile: StrategyProfile;
  strategyWeights: ResourceWeights;
  strategyRecommendation: StrategyRecommendation | null;
  recommendedStrategyChoice: StrategyChoice | null;
  strategyLevels: StrategyRelativeLevels | null;
  harborOpportunities: HarborStrategyOpportunity[];
  secondPreviewVertex: string | null;
  onSelectVertex: (vertexId: string) => void;
  onSelectHarborPlan: (opp: HarborStrategyOpportunity) => void;
  onConfirm: () => void;
  onUndo: () => void;
  onStrategyChoiceChange: (choice: StrategyChoice) => void;
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
    const confidence =
      opt.lookaheadConfidence !== undefined
        ? ` · ${Math.round(opt.lookaheadConfidence * 100)}% sikker`
        : '';
    return `Forventet par ${opt.expectedPairScore.toFixed(2)}${confidence} · Spot ${local.toFixed(2)}`;
  }
  const pair = path ? ` · Par ${path.pairScore.toFixed(2)}` : '';
  return `Prod ${opt.production.toFixed(2)} · Dekk ${opt.diversity.toFixed(2)}${pair}`;
}

export function SettlementSimulator({
  state,
  board,
  boardSize,
  options,
  selectedVertex,
  selectedHarborPlanKey,
  strategyChoice,
  strategyProfile,
  strategyWeights,
  strategyRecommendation,
  recommendedStrategyChoice,
  strategyLevels,
  harborOpportunities,
  secondPreviewVertex,
  onSelectVertex,
  onSelectHarborPlan,
  onConfirm,
  onUndo,
  onStrategyChoiceChange,
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
  const isSecondHuman = isHumanSecondSettlementTurn(state.placements, human);
  const harborMode = strategyChoice === 'harbor';
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

  const activeHarborPlan = useMemo(() => {
    if (!selectedHarborPlanKey) return null;
    return (
      harborOpportunities.find((o) => harborOpportunityKey(o) === selectedHarborPlanKey) ??
      null
    );
  }, [selectedHarborPlanKey, harborOpportunities]);

  const turnHint = isYourTurn
    ? harborMode
      ? 'Havnmodus — velg en havnplan under'
      : isSecond
        ? 'Andre landsby — gul kant = anbefalt strategi (byttes ikke automatisk)'
        : isFirstHuman
          ? 'Rangert på justert par. Gullkant = anbefalt strategi'
          : 'Første landsby'
    : 'Motspillere bruker jevnere ressursvekter · velg hjørne';

  const strategyHint = useMemo(() => {
    if (!isYourTurn) return null;
    if (recommendedStrategyChoice === 'harbor') {
      const level = strategyLevels?.harbor;
      return level != null
        ? `Anbefalt: Havn (${level}%). Prosent = relativ styrke (beste = 100).`
        : 'Anbefalt: Havn. Trykk knappen for å bruke.';
    }
    if (strategyRecommendation && recommendedStrategyChoice) {
      const label = strategyChoiceLabel(recommendedStrategyChoice);
      const level = strategyLevels?.[recommendedStrategyChoice];
      const levelTxt = level != null ? ` (${level}%)` : '';
      if (isSecondHuman) {
        return `Anbefalt ut fra gjenværende posisjoner: ${label}${levelTxt}.`;
      }
      return `Anbefalt: ${label}${levelTxt}. Gullkant = forslag · % = relativ styrke.`;
    }
    if (harborMode) return HARBOR_STRATEGY_CHOICE.description;
    return strategyProfile.description;
  }, [
    isYourTurn,
    recommendedStrategyChoice,
    strategyRecommendation,
    strategyLevels,
    isSecondHuman,
    harborMode,
    strategyProfile.description,
  ]);

  const breakdownProfile = isYourTurn
    ? harborMode
      ? {
          ...strategyProfile,
          label: HARBOR_STRATEGY_CHOICE.label,
          shortLabel: HARBOR_STRATEGY_CHOICE.shortLabel,
          description: HARBOR_STRATEGY_CHOICE.description,
        }
      : strategyProfile
    : OPPONENT_BREAKDOWN_PROFILE;
  const breakdownWeights = isYourTurn ? strategyWeights : OPPONENT_RESOURCE_WEIGHTS;

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
                <p className="muted small">
                  {harborMode && activeHarborPlan
                    ? 'Se markering på brettet'
                    : turnHint}
                </p>
              </>
            ) : (
              <>
                <strong>Plasser for {activeConfig.name}</strong>
                <p className="muted small">Manuell · du er {humanConfig.name}</p>
              </>
            )}
          </div>
          <div className="sim-progress-mini">
            <div className="sim-progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <span className="sim-profile-chip muted small">
            {isYourTurn ? strategyChoiceLabel(strategyChoice) : 'Jevne vekter (motstander)'}
          </span>
        </div>

        {isYourTurn && !state.finished && (
          <StrategyPicker
            value={strategyChoice}
            recommended={recommendedStrategyChoice}
            harborEnabled={harborOpportunities.length > 0}
            harborCount={harborOpportunities.length}
            levels={strategyLevels}
            onChange={onStrategyChoiceChange}
            hint={strategyHint}
          />
        )}

        <div className="sim-action-row">
          <button
            type="button"
            className="btn btn-block sim-undo-btn"
            disabled={state.placements.length === 0}
            onClick={onUndo}
          >
            Angre
          </button>
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
      </div>

      {state.finished ? (
        <p className="sim-done">Ferdig! Statistikk vises under brettet.</p>
      ) : harborMode && isYourTurn ? (
        <div className="sim-main-scroll" role="tabpanel">
          {harborOpportunities.length === 0 ? (
            <p className="muted small">
              Ingen sterke havnplaner akkurat nå. Velg en annen strategi over.
            </p>
          ) : (
            <>
              <p className="harbor-compare-legend muted small">
                % = effektiv verdi vs beste balanserte (inkl. estimert handelsbonus)
              </p>
              <ul className="harbor-strategy-list">
                {harborOpportunities.map((opp, index) => {
                  const planKey = harborOpportunityKey(opp);
                  const isActive = selectedHarborPlanKey === planKey;
                  const first = shortVertexLabel(boardSize, opp.firstVertexId);
                  const second =
                    opp.secondVertexId != null
                      ? shortVertexLabel(boardSize, opp.secondVertexId)
                      : null;
                  const vs = opp.vsBalanced;
                  return (
                    <li key={planKey}>
                      <button
                        type="button"
                        className={`harbor-strategy-item ${isActive ? 'selected' : ''}`}
                        onClick={() => onSelectHarborPlan(opp)}
                      >
                        <span className="harbor-strategy-index">#{index + 1}</span>
                        <span className="harbor-strategy-badge" data-strength={opp.strength}>
                          {opp.harborKind === 'resource' ? '2:1' : '3:1'}{' '}
                          {RESOURCE_LABELS[opp.resource]}
                        </span>
                        <span className="harbor-strategy-spots">
                          {second ? `${first} → ${second}` : first}
                        </span>
                        {vs ? (
                          <span
                            className="harbor-strategy-vs"
                            data-verdict={vs.verdict}
                            title={`PSM ${vs.planScore.toFixed(2)} + handelsjustering ${vs.tradeBonus.toFixed(2)} = ${vs.effectiveScore.toFixed(2)} vs balansert ${vs.bestBalancedScore.toFixed(2)}`}
                          >
                            {Math.round(vs.effectiveRelative * 100)}%
                          </span>
                        ) : (
                          <span className="harbor-strategy-reach muted small">
                            {opp.harborRoadDistance === 0 ? 'på havn' : '2 veier'}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
              {activeHarborPlan?.vsBalanced && (
                <p className="harbor-active-hint muted small">
                  {shortVertexLabel(boardSize, activeHarborPlan.firstVertexId)}
                  {activeHarborPlan.secondVertexId
                    ? ` → ${shortVertexLabel(boardSize, activeHarborPlan.secondVertexId)}`
                    : ''}{' '}
                  · {activeHarborPlan.vsBalanced.verdictLabel} enn balansert (
                  {Math.round(activeHarborPlan.vsBalanced.effectiveRelative * 100)}%
                  {activeHarborPlan.vsBalanced.tradeBonus > 0.01
                    ? ` · havn +${activeHarborPlan.vsBalanced.tradeBonus.toFixed(2)}`
                    : ''}
                  )
                </p>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="sim-main-scroll" role="tabpanel">
          <div className="options-list options-list-compact">
            <div className="options-list-header">
              <h3>
                Topp {Math.min(visibleCount, options.length)} for {activeConfig.name}
              </h3>
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
                  <span className="option-row-meta">Valgt på brettet</span>
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="sim-details-foot">
        {!harborMode && selectedOption && !state.finished && (
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
                Forventet #2:{' '}
                <strong>
                  {(
                    selectedOption.expectedPairScore ?? selectedPath?.pairScore ?? 0
                  ).toFixed(2)}
                </strong>
                {secondPreviewVertex && ' — stiplet ring'}
              </p>
            )}
            <PlacementScoreBreakdown
              score={selectedOption}
              board={board}
              rank={selectedRank}
              strategyProfile={breakdownProfile}
              strategyWeights={breakdownWeights}
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
                    <span className="muted small">
                      {shortVertexLabel(boardSize, p.vertexId)}
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
