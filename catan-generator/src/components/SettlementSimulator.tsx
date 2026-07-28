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
import { InfoModal } from './InfoModal';
import { PlayerSetupPanel } from './PlayerSetupPanel';

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
  selectedRoadTo: string | null;
  placementStep: 'settlement' | 'road';
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
  onCancel: () => void;
  onStrategyChoiceChange: (choice: StrategyChoice) => void;
}

const DEFAULT_VISIBLE_OPTIONS = 5;

function resourceSummary(score: SettlementScore): string {
  const types = [...new Set(score.breakdown.map((b) => b.resource))] as ProdResource[];
  return types.map((r) => RESOURCE_LABELS[r]).join(' · ') || '—';
}

/** Kort meta for liste — detaljer ligger i poengforklaring-modal */
function optionMeta(
  opt: SettlementScore,
  path: { pairScore: number } | undefined
): string {
  if (opt.placementKind === 'second') {
    const build =
      (opt.portfolio ?? 0) > 0 ? ` · Bygg +${(opt.portfolio ?? 0).toFixed(2)}` : '';
    return `Par ${opt.production.toFixed(2)}${build}`;
  }
  if (opt.expectedPairScore !== undefined) {
    const confidence =
      opt.lookaheadConfidence !== undefined
        ? ` · ${Math.round(opt.lookaheadConfidence * 100)}%`
        : '';
    return `Par ${opt.expectedPairScore.toFixed(2)}${confidence}`;
  }
  const pair = path ? ` · Par ${path.pairScore.toFixed(2)}` : '';
  return `Prod ${opt.production.toFixed(2)}${pair}`;
}

export function SettlementSimulator({
  state,
  board,
  boardSize,
  options,
  selectedVertex,
  selectedRoadTo,
  placementStep,
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
  onCancel,
  onStrategyChoiceChange,
}: SettlementSimulatorProps) {
  const [showAllOptions, setShowAllOptions] = useState(false);
  const [scoreModalOpen, setScoreModalOpen] = useState(false);
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [strategyModalOpen, setStrategyModalOpen] = useState(false);
  const [setupModalOpen, setSetupModalOpen] = useState(false);

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
  // Havn-UI bare på din tur — motstandere skal ikke påvirkes av ditt strategivalg.
  const harborMode = strategyChoice === 'harbor' && isYourTurn;
  const listTotal = harborMode ? harborOpportunities.length : options.length;
  const visibleCount = showAllOptions ? listTotal : DEFAULT_VISIBLE_OPTIONS;
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
      ? 'Havnmodus — velg plan i listen'
      : isSecond
        ? 'Andre landsby — gul kant = anbefalt'
        : isFirstHuman
          ? 'Første landsby — med par-outlook'
          : 'Første landsby'
    : 'Motstander · velg hjørne';

  const harborRows = useMemo(() => {
    if (!harborMode || !isYourTurn) return [];
    return harborOpportunities.map((opp, index) => {
      const planKey = harborOpportunityKey(opp);
      const score = opp.vsBalanced?.effectiveScore ?? opp.totalPip;
      const ratio = opp.harborKind === 'resource' ? '2:1' : '3:1';
      const vsPct =
        opp.vsBalanced != null
          ? Math.round(opp.vsBalanced.effectiveRelative * 100)
          : null;
      const confidence =
        opp.pathConfidence ?? opp.vsBalanced?.pathConfidence ?? undefined;
      const confidenceHint =
        confidence !== undefined && opp.secondVertexId
          ? ` · ${Math.round(confidence * 100)}%`
          : '';
      return {
        key: planKey,
        index,
        opp,
        score,
        resources: `${ratio} ${RESOURCE_LABELS[opp.resource]}`,
        meta:
          vsPct != null
            ? `${vsPct}% vs bal.${confidenceHint}`
            : `${opp.harborReachLabel}${confidenceHint}`,
        selected: selectedHarborPlanKey === planKey,
      };
    });
  }, [
    harborMode,
    isYourTurn,
    harborOpportunities,
    boardSize,
    selectedHarborPlanKey,
  ]);

  const harborVertexIds = useMemo(
    () => new Set(harborOpportunities.map((opp) => opp.firstVertexId)),
    [harborOpportunities]
  );
  const otherPlacementOptions = useMemo(
    () =>
      harborMode
        ? options.filter((opt) => !harborVertexIds.has(opt.vertexId))
        : options,
    [harborMode, options, harborVertexIds]
  );
  const listCount = harborMode
    ? harborRows.length + otherPlacementOptions.length
    : listTotal;
  const visibleHarborRows = showAllOptions
    ? harborRows
    : harborRows.slice(0, DEFAULT_VISIBLE_OPTIONS);
  const otherSlots = showAllOptions
    ? otherPlacementOptions.length
    : Math.max(0, DEFAULT_VISIBLE_OPTIONS - visibleHarborRows.length);
  const visibleOtherPlacements = otherPlacementOptions.slice(0, otherSlots);
  const visiblePlacementOptions = harborMode ? [] : visibleOptions;

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

        {isYourTurn && !state.finished && placementStep === 'settlement' && (
          <button
            type="button"
            className="btn sim-strategy-open"
            onClick={() => setStrategyModalOpen(true)}
          >
            Strategi · {strategyChoiceLabel(strategyChoice)}
            {recommendedStrategyChoice &&
            recommendedStrategyChoice !== strategyChoice
              ? ' · tip'
              : ''}
          </button>
        )}
      </div>

      {state.finished ? (
        <p className="sim-done">Ferdig! Statistikk vises under brettet.</p>
      ) : (
        <div className="sim-main-scroll" role="tabpanel">
          <div className="options-list options-list-compact">
            <div className="options-list-header">
              <h3>
                {placementStep === 'road'
                  ? `Startvei for ${activeConfig.name}`
                  : `Topp ${Math.min(visibleCount, listCount)} for ${activeConfig.name}${harborMode ? ' · havn' : ''}`}
              </h3>
              {placementStep === 'settlement' && listCount > DEFAULT_VISIBLE_OPTIONS && (
                <button
                  type="button"
                  className="btn-link options-toggle"
                  onClick={() => setShowAllOptions((on) => !on)}
                >
                  {showAllOptions ? 'Vis færre' : `Vis alle (${listCount})`}
                </button>
              )}
            </div>

            {placementStep === 'road' ? (
              <p className="road-pick-hint muted small">
                Landsby er valgt
                {selectedVertex
                  ? ` (${shortVertexLabel(boardSize, selectedVertex)})`
                  : ''}
                . Trykk en nabo på brettet for startvei, deretter Bekreft vei.
                Angre går tilbake til landsbyvalg.
              </p>
            ) : harborMode && isYourTurn ? (
              <>
                {harborRows.length === 0 ? (
                  <p className="muted small">
                    Ingen sterke havnplaner akkurat nå — velg fritt blant gyldige
                    plasseringer under, eller bytt strategi.
                  </p>
                ) : (
                  visibleHarborRows.map((row) => (
                    <button
                      key={row.key}
                      type="button"
                      className={`option-row-compact ${row.selected ? 'selected' : ''}`}
                      onClick={() => onSelectHarborPlan(row.opp)}
                      title={
                        row.opp.vsBalanced
                          ? `Justert PSM ${row.opp.vsBalanced.planScore.toFixed(2)} (rå par ${row.opp.vsBalanced.rawPlanScore.toFixed(2)}) + havn ${row.opp.vsBalanced.tradeBonus.toFixed(2)} = ${row.opp.vsBalanced.effectiveScore.toFixed(2)} vs balansert ${row.opp.vsBalanced.bestBalancedScore.toFixed(2)} · ${Math.round(row.opp.vsBalanced.pathConfidence * 100)}% sikker sti`
                          : row.opp.summary
                      }
                    >
                      <span className="option-row-rank" data-rank={row.index + 1}>
                        #{row.index + 1}
                      </span>
                      <span className="option-row-score">{row.score.toFixed(2)}</span>
                      <span className="option-row-detail">
                        <span className="option-row-resources">{row.resources}</span>
                        <span className="option-row-meta">{row.meta}</span>
                      </span>
                    </button>
                  ))
                )}

                {visibleOtherPlacements.length > 0 && (
                  <>
                    <div className="options-list-subheader muted small">
                      Andre gyldige plasseringer
                    </div>
                    {visibleOtherPlacements.map((opt, i) => {
                      const rank = harborRows.length + i + 1;
                      return (
                        <button
                          key={opt.vertexId}
                          type="button"
                          className={`option-row-compact ${selectedVertex === opt.vertexId ? 'selected' : ''}`}
                          onClick={() => onSelectVertex(opt.vertexId)}
                        >
                          <span className="option-row-rank" data-rank={rank}>
                            #{rank}
                          </span>
                          <span className="option-row-score">{opt.total.toFixed(2)}</span>
                          <span className="option-row-detail">
                            <span className="option-row-resources">
                              {resourceSummary(opt)}
                            </span>
                            <span className="option-row-meta">
                              {optionMeta(opt, undefined)}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </>
                )}
              </>
            ) : (
              visiblePlacementOptions.map((opt, i) => {
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
              })
            )}

            {selectedOption &&
              selectedRank > 0 &&
              ((harborMode &&
                !harborVertexIds.has(selectedOption.vertexId) &&
                !visibleOtherPlacements.some(
                  (opt) => opt.vertexId === selectedOption.vertexId
                )) ||
                (!harborMode && selectedRank > visibleCount)) && (
              <div className="option-row-compact selected custom-placement">
                <span className="option-row-rank">#{selectedRank}</span>
                <span className="option-row-score">{selectedOption.total.toFixed(2)}</span>
                <span className="option-row-detail">
                  <span className="option-row-meta">Valgt på brettet</span>
                </span>
              </div>
            )}
          </div>

          {placementStep === 'settlement' &&
            selectedVertex &&
            !state.finished && (
            <p className="road-pick-hint muted small">
              Bekreft landsbyen først. Deretter velger du startvei.
            </p>
          )}
          {placementStep === 'road' && selectedRoadTo && !state.finished && (
            <p className="road-pick-hint muted small">
              Startvei valgt — trykk Bekreft vei.
            </p>
          )}
          {harborMode && placementStep === 'settlement' && activeHarborPlan?.vsBalanced && (
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
        </div>
      )}

      <div className="sim-sticky-controls">
        <div className="sim-info-actions">
          <button
            type="button"
            className="btn sim-info-btn"
            onClick={() => setSetupModalOpen(true)}
          >
            Oppsett
          </button>
          {selectedOption && !state.finished && (
            <button
              type="button"
              className="btn sim-info-btn"
              onClick={() => setScoreModalOpen(true)}
            >
              Poeng
              {selectedRank > 0 ? ` #${selectedRank}` : ''}
            </button>
          )}
          {state.placements.length > 0 && (
            <button
              type="button"
              className="btn sim-info-btn"
              onClick={() => setLogModalOpen(true)}
            >
              Logg ({state.placements.length})
            </button>
          )}
          <button
            type="button"
            className="btn sim-info-btn sim-cancel-btn"
            onClick={onCancel}
          >
            Avbryt
          </button>
        </div>
        <div className="sim-action-row">
          <button
            type="button"
            className="btn btn-block sim-undo-btn"
            disabled={
              placementStep !== 'road' && state.placements.length === 0
            }
            onClick={onUndo}
          >
            Angre
          </button>
          {!state.finished && (
            <button
              type="button"
              className="btn primary btn-block sim-confirm-btn"
              disabled={
                placementStep === 'settlement'
                  ? !selectedVertex
                  : !selectedRoadTo
              }
              onClick={onConfirm}
              style={{ '--player-color': activeConfig.color } as CSSProperties}
            >
              {placementStep === 'settlement' ? 'Bekreft landsby' : 'Bekreft vei'}
            </button>
          )}
        </div>
      </div>


      <InfoModal
        open={setupModalOpen}
        title={`Oppsett · ${state.playerCount} spillere`}
        onClose={() => setSetupModalOpen(false)}
      >
        <label className="field">
          Antall spillere
          <select value={state.playerCount} disabled>
            <option value={2}>2 spillere</option>
            <option value={3}>3 spillere</option>
            <option value={4}>4 spillere</option>
            {boardSize === 'extension56' && (
              <>
                <option value={5}>5 spillere</option>
                <option value={6}>6 spillere</option>
              </>
            )}
          </select>
        </label>

        <p className="muted small">
          Strategi: {strategyChoiceLabel(strategyChoice)}
        </p>

        <PlayerSetupPanel
          playerCount={state.playerCount}
          config={state.config}
          disabled
          compact
          onConfigChange={() => undefined}
        />

        <button
          type="button"
          className="btn btn-block sim-cancel-btn"
          onClick={() => {
            setSetupModalOpen(false);
            onCancel();
          }}
        >
          Avbryt simulering
        </button>
      </InfoModal>

      <InfoModal
        open={strategyModalOpen && isYourTurn && !state.finished}
        title="Din strategi"
        onClose={() => setStrategyModalOpen(false)}
        footerNote={strategyHint ?? undefined}
      >
        <StrategyPicker
          value={strategyChoice}
          recommended={recommendedStrategyChoice}
          harborEnabled={harborOpportunities.length > 0}
          harborCount={harborOpportunities.length}
          levels={strategyLevels}
          onChange={(choice) => {
            onStrategyChoiceChange(choice);
            setStrategyModalOpen(false);
          }}
        />
      </InfoModal>

      <InfoModal
        open={scoreModalOpen && !!selectedOption && !state.finished}
        title={
          selectedOption
            ? `Poengforklaring · #${selectedRank}`
            : 'Poengforklaring'
        }
        onClose={() => setScoreModalOpen(false)}
        wide
      >
        {selectedOption && (
          <>
            {(selectedOption.expectedPairScore !== undefined ||
              (selectedPath && isFirstHuman && isYourTurn) ||
              (harborMode && secondPreviewVertex)) && (
              <p className="second-preview-hint muted small">
                Forventet #2:{' '}
                <strong>
                  {(
                    selectedOption.expectedPairScore ?? selectedPath?.pairScore ?? 0
                  ).toFixed(2)}
                </strong>
                {secondPreviewVertex && ' — stiplet ring på brettet'}
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
          </>
        )}
      </InfoModal>

      <InfoModal
        open={logModalOpen && state.placements.length > 0}
        title={`Plasseringer (${state.placements.length})`}
        onClose={() => setLogModalOpen(false)}
      >
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
      </InfoModal>
    </div>
  );
}
