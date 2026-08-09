import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Board, BoardSize, GeneratorSettings, PlayerCount } from './catan/types';
import { DEFAULT_SETTINGS } from './catan/types';
import { BOARD_SIZE_CONFIG } from './catan/boardLayout';
import { generateBoard } from './catan/generator';
import { getBoardMapping } from './catan/mapping';
import {
  getStrategyProfile,
  getStrategyWeights,
  resolveStrategyProfileId,
  type StrategyChoice,
} from './catan/resourceWeights';
import {
  createSimulationConfig,
  type SimulationConfig,
} from './catan/playerConfig';
import {
  buildStrategyRelativeLevels,
  getSecondSettlementPreview,
  isHumanFirstSettlementTurn,
  isHumanSecondSettlementTurn,
  recommendStrategy,
  recommendStrategyForSecondSettlement,
} from './catan/strategyAdvisor';
import {
  findHarborStrategyOpportunities,
  harborOpportunitiesAsPlacementScores,
  harborOpportunityKey,
  type HarborStrategyOpportunity,
} from './catan/harborStrategy';
import {
  createSimulation,
  currentPlayer,
  getOptionsForCurrentTurn,
  isHumanTurn,
  placeSettlement,
  undoLastPlacement,
  type SimulationState,
} from './catan/simulator';
import {
  computePlayerProduction,
  getExpansionTargets,
  getRoadTargets,
  rankRoadDirections,
  type RoadScoringContext,
} from './catan/roadPlan';
import {
  loadSession,
  saveSession,
  type AppMode,
  type PlacementStep,
} from './catan/sessionPersistence';
import { BoardView } from './components/BoardView';
import { BoardStoryPanel } from './components/BoardStoryPanel';
import { MappingPanel } from './components/MappingPanel';
import { PlayerSetupPanel, syncConfigPlayerCount } from './components/PlayerSetupPanel';
import { SettingsModal } from './components/SettingsModal';
import { PhotoBoardModal } from './components/PhotoBoardModal';
import { SettlementSimulator } from './components/SettlementSimulator';
import { SimulationSummaryPanel } from './components/SimulationSummary';
import { StrategyPicker } from './components/StrategyPicker';
import { PremiumPaywallModal } from './components/PremiumPaywallModal';
import { MidgamePanel } from './components/MidgamePanel';
import { createBoardStory, type BoardStory } from './catan/boardStory';
import {
  activateDevPremium,
  canUseBonanza,
  canUseMidgame,
  canUseSimulation,
  clearPremiumAccess,
  getEntitlementState,
  startLocalTrial,
  type EntitlementState,
  type PremiumFeature,
} from './catan/entitlements';
import {
  addMidgameRoad,
  createMidgameState,
  upgradeToCity,
  type MidgameState,
} from './catan/midgame';
import { parseCoord } from './catan/hex';
import { initPurchases } from './catan/purchases';
import { initTelemetry } from './native/telemetry';
import { maybeRequestStoreReview } from './native/storeReview';
import { APP_DISPLAY_NAME } from './product/appIdentity';
import './App.css';

const restoredSession = typeof window !== 'undefined' ? loadSession() : null;

function App() {
  const { t, i18n } = useTranslation();
  const [settings, setSettings] = useState<GeneratorSettings>(
    () => restoredSession?.settings ?? DEFAULT_SETTINGS
  );
  const [boardSize, setBoardSize] = useState<BoardSize>(
    () => restoredSession?.boardSize ?? 'base'
  );
  const [board, setBoard] = useState<Board | null>(() => restoredSession?.board ?? null);
  const [error, setError] = useState<string | null>(null);
  const [playerCount, setPlayerCount] = useState<PlayerCount>(
    () => restoredSession?.playerCount ?? 4
  );
  const [simulationConfig, setSimulationConfig] = useState<SimulationConfig>(
    () => restoredSession?.simulationConfig ?? createSimulationConfig(4, 0)
  );
  const [strategyChoice, setStrategyChoice] = useState<StrategyChoice>(
    () => restoredSession?.strategyChoice ?? 'general'
  );
  const [simulation, setSimulation] = useState<SimulationState | null>(
    () => restoredSession?.simulation ?? null
  );
  const [selectedVertex, setSelectedVertex] = useState<string | null>(
    () => restoredSession?.selectedVertex ?? null
  );
  const [selectedRoadTo, setSelectedRoadTo] = useState<string | null>(
    () => restoredSession?.selectedRoadTo ?? null
  );
  /** Landsby bekreftes først, deretter velges startvei. */
  const [placementStep, setPlacementStep] = useState<PlacementStep>(
    () => restoredSession?.placementStep ?? 'settlement'
  );
  const [selectedHarborPlanKey, setSelectedHarborPlanKey] = useState<string | null>(
    () => restoredSession?.selectedHarborPlanKey ?? null
  );
  const [boardStory, setBoardStory] = useState<BoardStory | null>(
    () => restoredSession?.boardStory ?? null
  );
  const [mode, setMode] = useState<AppMode>(() => restoredSession?.mode ?? 'view');
  const [mappingMode, setMappingMode] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [photoBoardOpen, setPhotoBoardOpen] = useState(false);
  const [highlightEdge, setHighlightEdge] = useState<string | null>(null);
  const [highlightCorner, setHighlightCorner] = useState<string | null>(null);
  const [hydrated] = useState(() => restoredSession !== null);
  const boardWrapRef = useRef<HTMLDivElement>(null);
  const [entitlement, setEntitlement] = useState<EntitlementState>(() =>
    getEntitlementState()
  );
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [paywallFeature, setPaywallFeature] = useState<PremiumFeature | null>(
    null
  );
  const [midgame, setMidgame] = useState<MidgameState | null>(null);

  const premiumBonanza = canUseBonanza(entitlement);
  const premiumSimulation = canUseSimulation(entitlement);
  const premiumMidgame = canUseMidgame(entitlement);

  const openPaywall = (feature: PremiumFeature) => {
    setPaywallFeature(feature);
    setPaywallOpen(true);
  };

  const refreshEntitlement = (next: EntitlementState) => {
    setEntitlement(next);
    if (!canUseBonanza(next) && settings.bonanzaBoard) {
      setSettings((prev) => ({ ...prev, bonanzaBoard: false }));
    }
  };

  const boardMapping = useMemo(() => getBoardMapping(boardSize), [boardSize]);
  const strategyProfileId = resolveStrategyProfileId(strategyChoice);
  const activeStrategy = useMemo(
    () => getStrategyProfile(strategyProfileId),
    [strategyProfileId]
  );
  const strategyWeights = useMemo(
    () => getStrategyWeights(strategyProfileId),
    [strategyProfileId]
  );
  const simActive = mode === 'simulate' && simulation !== null;

  const handleBoardSizeChange = (size: BoardSize) => {
    setBoardSize(size);
    if (size !== 'base' && settings.bonanzaBoard) {
      setSettings((prev) => ({ ...prev, bonanzaBoard: false }));
    }
    if (size === 'base' && playerCount > 4) {
      const nextCount = 4 as PlayerCount;
      setPlayerCount(nextCount);
      setSimulationConfig((cfg) => syncConfigPlayerCount(cfg, nextCount));
    }
  };

  const handlePlayerCountChange = (count: PlayerCount) => {
    setPlayerCount(count);
    setSimulationConfig((cfg) => syncConfigPlayerCount(cfg, count));
  };

  const clearSimulationUi = useCallback(() => {
    setSimulation(null);
    setSelectedVertex(null);
    setSelectedRoadTo(null);
    setPlacementStep('settlement');
    setSelectedHarborPlanKey(null);
    setMidgame(null);
    setMode('view');
  }, []);

  const confirmWipeActiveSession = useCallback(
    (messageKey: 'app.confirmWipeGenerate' | 'app.confirmWipePhoto'): boolean => {
      if (!simulation && mode !== 'simulate') return true;
      return window.confirm(t(messageKey));
    },
    [simulation, mode, t]
  );

  const handleGenerate = useCallback(() => {
    if (!confirmWipeActiveSession('app.confirmWipeGenerate')) return;
    const effectiveSettings =
      canUseBonanza(getEntitlementState()) || !settings.bonanzaBoard
        ? settings
        : { ...settings, bonanzaBoard: false };
    if (effectiveSettings !== settings) {
      setSettings(effectiveSettings);
    }
    const result = generateBoard(effectiveSettings, boardSize);
    if (!result) {
      setError(t('app.generateFailed'));
      setBoard(null);
      setBoardStory(null);
      clearSimulationUi();
      return;
    }
    setError(null);
    setBoard(result);
    setBoardStory(createBoardStory(result));
    clearSimulationUi();
  }, [settings, boardSize, confirmWipeActiveSession, clearSimulationUi, t]);

  const handleApplyPhotoBoard = useCallback(
    (next: Board) => {
      if (!confirmWipeActiveSession('app.confirmWipePhoto')) return;
      setError(null);
      setBoardSize(next.boardSize);
      setBoard(next);
      setBoardStory(createBoardStory(next));
      clearSimulationUi();
      setMappingMode(false);
    },
    [confirmWipeActiveSession, clearSimulationUi]
  );

  useEffect(() => {
    if (!hydrated && !board) {
      handleGenerate();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void initTelemetry();
    void initPurchases();
  }, []);

  useEffect(() => {
    if (simulation?.finished) {
      void maybeRequestStoreReview('setupFinished');
    }
  }, [simulation?.finished]);

  // Drop premium-only session bits when access is missing
  useEffect(() => {
    if (!premiumBonanza && settings.bonanzaBoard) {
      setSettings((prev) => ({ ...prev, bonanzaBoard: false }));
    }
    if (!premiumSimulation && mode === 'simulate') {
      setSimulation(null);
      setSelectedVertex(null);
      setSelectedRoadTo(null);
      setPlacementStep('settlement');
      setSelectedHarborPlanKey(null);
      setMode('view');
    }
  }, [premiumBonanza, premiumSimulation, settings.bonanzaBoard, mode]);

  // Persist session so refresh keeps board + simulation
  useEffect(() => {
    if (!board) return;
    saveSession({
      version: 1,
      settings,
      boardSize,
      board,
      playerCount,
      simulationConfig,
      strategyChoice,
      simulation,
      selectedVertex,
      selectedRoadTo,
      placementStep,
      selectedHarborPlanKey,
      mode,
    });
  }, [
    settings,
    boardSize,
    board,
    playerCount,
    simulationConfig,
    strategyChoice,
    simulation,
    selectedVertex,
    selectedRoadTo,
    placementStep,
    selectedHarborPlanKey,
    mode,
  ]);

  const startSimulation = () => {
    if (!board) return;
    if (!premiumSimulation) {
      openPaywall('simulation');
      return;
    }
    // Keep the player's chosen strategy — do not reset to general.
    setSimulation(createSimulation(board, simulationConfig));
    setSelectedVertex(null);
    setSelectedRoadTo(null);
    setPlacementStep('settlement');
    setSelectedHarborPlanKey(null);
    setMode('simulate');
    // Avoid scrollIntoView — on the mobile sim sheet it can tuck the board
    // under the header / behind the sticky panel.
  };

  const resetSimulation = () => {
    clearSimulationUi();
  };

  const startMidgame = () => {
    if (!simulation?.finished) return;
    if (!premiumMidgame) {
      openPaywall('midgame');
      return;
    }
    setMidgame(createMidgameState(simulation));
  };

  const exitMidgame = () => {
    setMidgame(null);
  };

  const simPlacing = simulation && simActive && !simulation.finished;
  const midgameActive = Boolean(midgame && simulation?.finished);

  const isYourTurn = simulation && simActive && isHumanTurn(simulation);

  const strategyRecommendation = useMemo(() => {
    if (!board || !simulation || !isYourTurn) return null;
    const human = simulation.config.humanPlayerIndex;
    if (isHumanFirstSettlementTurn(simulation.placements, human)) {
      return recommendStrategy(
        board,
        simulation.placements,
        human,
        simulation.playerCount
      );
    }
    if (isHumanSecondSettlementTurn(simulation.placements, human)) {
      return recommendStrategyForSecondSettlement(
        board,
        simulation.placements,
        human
      );
    }
    return null;
  }, [board, simulation, isYourTurn]);

  const harborOpportunities = useMemo(() => {
    if (!board || !simulation || !isYourTurn) return [];
    return findHarborStrategyOpportunities(
      board,
      simulation.placements,
      simulation.config.humanPlayerIndex,
      simulation.playerCount
    );
  }, [board, simulation, isYourTurn]);

  const rankedOptions = useMemo(() => {
    if (!simPlacing || !simulation) return [];

    // Motstandere / ikke-havn: alltid vanlig PSM. Strategivalg gjelder bare deg.
    if (!isYourTurn || strategyChoice !== 'harbor') {
      return getOptionsForCurrentTurn(simulation, strategyWeights);
    }

    // Havn for deg: havnplaner først, men behold alle gyldige plasseringer klikkbare.
    const harborScores = harborOpportunitiesAsPlacementScores(harborOpportunities);
    const allOptions = getOptionsForCurrentTurn(simulation, strategyWeights);
    const harborIds = new Set(harborScores.map((score) => score.vertexId));
    const rest = allOptions.filter((opt) => !harborIds.has(opt.vertexId));
    return [...harborScores, ...rest];
  }, [
    simPlacing,
    simulation,
    isYourTurn,
    strategyChoice,
    harborOpportunities,
    strategyWeights,
  ]);

  const strategyLevels = useMemo(() => {
    if (!isYourTurn || !strategyRecommendation) return null;
    const topHarbor = harborOpportunities[0]?.vsBalanced?.effectiveScore ?? null;
    const levels = buildStrategyRelativeLevels(
      strategyRecommendation.evaluations,
      topHarbor
    );
    return Object.keys(levels).length > 0 ? levels : null;
  }, [isYourTurn, strategyRecommendation, harborOpportunities]);

  /** Gullkant: strategien med høyest relativ nivå (inkl. havn). Byttes aldri automatisk. */
  const recommendedStrategyChoice = useMemo((): StrategyChoice | null => {
    if (!isYourTurn || !strategyLevels) {
      return strategyRecommendation?.recommendedProfileId ?? null;
    }
    let bestChoice: StrategyChoice | null = null;
    let bestLevel = -1;
    for (const [choice, level] of Object.entries(strategyLevels) as [
      StrategyChoice,
      number,
    ][]) {
      if (level > bestLevel) {
        bestLevel = level;
        bestChoice = choice;
      }
    }
    return bestChoice;
  }, [isYourTurn, strategyLevels, strategyRecommendation]);

  const handleStrategyChoiceChange = (choice: StrategyChoice) => {
    setStrategyChoice(choice);
    if (placementStep === 'road') return;
    if (choice === 'harbor') {
      const top = harborOpportunities[0];
      if (top) {
        setSelectedHarborPlanKey(harborOpportunityKey(top));
        setSelectedVertex(top.firstVertexId);
        setSelectedRoadTo(null);
      }
      return;
    }
    setSelectedHarborPlanKey(null);
  };

  // Hvis havnmodus er aktiv men planene forsvinner, fall tilbake til balansert.
  useEffect(() => {
    if (strategyChoice !== 'harbor') return;
    if (!simPlacing || !isYourTurn) return;
    if (harborOpportunities.length > 0) return;
    setStrategyChoice('general');
    setSelectedHarborPlanKey(null);
  }, [strategyChoice, simPlacing, isYourTurn, harborOpportunities.length]);

  const activeHarborPlan = useMemo(() => {
    if (!selectedHarborPlanKey) return null;
    return (
      harborOpportunities.find((o) => harborOpportunityKey(o) === selectedHarborPlanKey) ??
      null
    );
  }, [selectedHarborPlanKey, harborOpportunities]);

  const secondPreviewVertex = useMemo(() => {
    if (!board || !simulation || !selectedVertex || !isYourTurn) return null;
    if (activeHarborPlan?.secondVertexId) return activeHarborPlan.secondVertexId;
    const human = simulation.config.humanPlayerIndex;
    if (!isHumanFirstSettlementTurn(simulation.placements, human)) return null;
    return getSecondSettlementPreview(
      board,
      simulation.placements,
      human,
      simulation.playerCount,
      selectedVertex,
      strategyWeights
    );
  }, [
    board,
    simulation,
    selectedVertex,
    isYourTurn,
    strategyWeights,
    activeHarborPlan,
  ]);

  const roadScoringCtx: RoadScoringContext = useMemo(() => {
    if (!simulation || !board) return {};
    const player = currentPlayer(simulation);
    const productionPlaced =
      player !== null && placementStep === 'road' && selectedVertex
        ? [
            ...simulation.placements,
            { vertexId: selectedVertex, player, isCity: false } as const,
          ]
        : simulation.placements;
    return {
      selfPlayer: player ?? undefined,
      strategy: strategyProfileId,
      playerCount: simulation.playerCount,
      production: player !== null
        ? computePlayerProduction(board, productionPlaced, player)
        : undefined,
    };
  }, [simulation, board, strategyProfileId, placementStep, selectedVertex]);

  // Predict where opponents will place after human's confirmed settlement
  const predictedPlacements = useMemo(() => {
    if (placementStep !== 'road' || !selectedVertex || !simulation || !board) return null;
    let predicted = placeSettlement(simulation, selectedVertex);
    let safety = 0;
    while (!predicted.finished && safety < 20) {
      const opts = getOptionsForCurrentTurn(predicted);
      if (opts.length === 0) break;
      predicted = placeSettlement(predicted, opts[0].vertexId);
      safety++;
    }
    return predicted.placements;
  }, [placementStep, selectedVertex, simulation, board]);

  // Score road directions using predicted placements so scoring matches highlight
  const rankedRoads = useMemo(() => {
    if (!selectedVertex || !board || !predictedPlacements) return [];
    return rankRoadDirections(selectedVertex, board, predictedPlacements, roadScoringCtx);
  }, [selectedVertex, board, predictedPlacements, roadScoringCtx]);

  const expansionTargets = useMemo(() => {
    if (!selectedVertex || !predictedPlacements) return [];
    return getExpansionTargets(selectedVertex, predictedPlacements);
  }, [selectedVertex, predictedPlacements]);

  // Havnmarkering bare på din tur — skal ikke låse motstanderens plassering.
  const harborPlanHighlight =
    isYourTurn && activeHarborPlan
      ? {
          firstVertexId: activeHarborPlan.firstVertexId,
          secondVertexId: activeHarborPlan.secondVertexId,
          harborNodeVertexIds: activeHarborPlan.harborNodeVertexIds,
        }
      : null;

  const handleSelectVertex = (vertexId: string) => {
    if (placementStep !== 'settlement') return;
    setSelectedVertex(vertexId);
    setSelectedRoadTo(null);
    if (strategyChoice === 'harbor') {
      const match =
        harborOpportunities.find((o) => o.firstVertexId === vertexId) ?? null;
      setSelectedHarborPlanKey(match ? harborOpportunityKey(match) : null);
      return;
    }
    if (
      selectedHarborPlanKey &&
      !harborOpportunities.some(
        (o) =>
          harborOpportunityKey(o) === selectedHarborPlanKey &&
          o.firstVertexId === vertexId
      )
    ) {
      setSelectedHarborPlanKey(null);
    }
  };

  const handleSelectHarborPlan = (opp: HarborStrategyOpportunity) => {
    if (placementStep !== 'settlement') return;
    setSelectedHarborPlanKey(harborOpportunityKey(opp));
    setSelectedVertex(opp.firstVertexId);
    setSelectedRoadTo(null);
  };

  const handleConfirm = () => {
    if (!simulation || !selectedVertex) return;
    if (placementStep === 'settlement') {
      setSelectedRoadTo(null);
      setPlacementStep('road');
      return;
    }
    if (!selectedRoadTo) return;
    setSimulation(placeSettlement(simulation, selectedVertex, selectedRoadTo));
    setSelectedVertex(null);
    setSelectedRoadTo(null);
    setPlacementStep('settlement');
    setSelectedHarborPlanKey(null);
  };

  const handleUndo = () => {
    if (!simulation) return;
    if (placementStep === 'road') {
      setSelectedRoadTo(null);
      setPlacementStep('settlement');
      return;
    }
    if (simulation.placements.length === 0) return;
    setSimulation(undoLastPlacement(simulation));
    setSelectedVertex(null);
    setSelectedRoadTo(null);
    setPlacementStep('settlement');
    setSelectedHarborPlanKey(null);
  };

  return (
    <div className={`app ${simPlacing ? 'app-simulating' : ''}`}>
      <header className="header">
        <div>
          <h1>{t('app.title')}</h1>
          <p className="subtitle">
            {boardStory ? (
              <>
                {boardStory.islandName}
                <span className="subtitle-sep"> · </span>
                {t(`boardSize.${boardSize}`)}
                {settings.bonanzaBoard && boardSize === 'base'
                  ? ` · ${t('app.bonanzaTag')}`
                  : ''}
              </>
            ) : (
              <>
                {BOARD_SIZE_CONFIG[boardSize].totalHexes} hex · {t(`boardSize.${boardSize}`)}
                {settings.bonanzaBoard && boardSize === 'base'
                  ? ` · ${t('app.bonanzaTag')}`
                  : ''}
              </>
            )}
          </p>
        </div>
        <div className="header-actions">
          {simActive && (
            <button
              type="button"
              className="btn header-btn header-sim-keep header-exit-sim"
              onClick={resetSimulation}
            >
              {t('app.exit')}
            </button>
          )}
          {entitlement.isPremium ? (
            <button
              type="button"
              className="btn header-btn premium-status-chip header-sim-hide"
              title={
                entitlement.expiresAt
                  ? new Date(entitlement.expiresAt).toLocaleDateString(
                      i18n.language === 'nb' ? 'nb-NO' : 'en-US'
                    )
                  : t('app.premium')
              }
              onClick={() => {
                if (!window.confirm(t('app.confirmClearPremium'))) {
                  return;
                }
                refreshEntitlement(clearPremiumAccess());
              }}
            >
              {entitlement.source === 'trial' ? t('app.premiumTrial') : t('app.premium')}
            </button>
          ) : (
            <button
              type="button"
              className="btn header-btn header-sim-hide"
              onClick={() => openPaywall('simulation')}
            >
              {t('app.tryPremium')}
            </button>
          )}
          <button
            type="button"
            className="btn header-btn header-sim-keep"
            onClick={() => setSettingsOpen(true)}
          >
            {t('app.settings')}
          </button>
          <button
            type="button"
            className="btn header-btn header-sim-hide"
            onClick={() => setPhotoBoardOpen(true)}
          >
            {t('app.fromPhoto')}
          </button>
          <button
            type="button"
            className="btn primary header-sim-hide"
            onClick={handleGenerate}
          >
            {t('app.generateBoard')}
          </button>
        </div>
      </header>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onSettingsChange={setSettings}
        boardSize={boardSize}
        onBoardSizeChange={handleBoardSizeChange}
        canUseBonanza={premiumBonanza}
        onPremiumRequired={() => openPaywall('bonanza')}
      />

      <PremiumPaywallModal
        open={paywallOpen}
        feature={paywallFeature}
        onClose={() => setPaywallOpen(false)}
        onStartTrial={() => {
          refreshEntitlement(startLocalTrial(14));
          setPaywallOpen(false);
        }}
        onActivateDev={() => {
          refreshEntitlement(activateDevPremium(14));
          setPaywallOpen(false);
        }}
      />

      <PhotoBoardModal
        open={photoBoardOpen}
        onClose={() => setPhotoBoardOpen(false)}
        boardSize={boardSize}
        settings={settings}
        onApply={handleApplyPhotoBoard}
      />

      {error && <div className="error-banner">{error}</div>}

      <div className={`layout layout-two-col ${simPlacing ? 'layout-simulating' : ''}`}>
        <main className="board-area">
          {board ? (
            <>
              <div className="board-wrap" ref={boardWrapRef}>
                <BoardView
                  board={board}
                  placements={simulation?.placements ?? []}
                  playerConfig={simulation?.config ?? simulationConfig}
                  highlightedVertices={simPlacing ? rankedOptions : []}
                  previewSecondVertex={secondPreviewVertex}
                  selectedVertex={selectedVertex}
                  previewRoadTo={
                    simPlacing && placementStep === 'road' ? selectedRoadTo : null
                  }
                  roadTargets={
                    simPlacing && placementStep === 'road' && selectedVertex
                      ? getRoadTargets(selectedVertex)
                      : []
                  }
                  rankedRoads={
                    simPlacing && placementStep === 'road' ? rankedRoads : []
                  }
                  expansionTargets={
                    simPlacing && placementStep === 'road' ? expansionTargets : []
                  }
                  onRoadTargetClick={
                    simPlacing && placementStep === 'road'
                      ? (to) => setSelectedRoadTo(to)
                      : undefined
                  }
                  harborPlanHighlight={harborPlanHighlight}
                  onVertexClick={
                    simPlacing && placementStep === 'settlement'
                      ? handleSelectVertex
                      : undefined
                  }
                  interactive={Boolean(simPlacing)}
                  settlementInteractive={placementStep === 'settlement'}
                  mappingMode={mappingMode}
                  mapping={boardMapping}
                  highlightEdge={highlightEdge}
                  highlightCorner={highlightCorner}
                  coverFrame={Boolean(simPlacing)}
                  midgameRoads={midgame?.roads ?? []}
                  robberHex={
                    midgame?.robberHexKey
                      ? parseCoord(midgame.robberHexKey)
                      : null
                  }
                />
              </div>
              {simPlacing && isYourTurn && (
                <div className="placement-heatmap-legend placement-heatmap-legend-inline" aria-hidden>
                  <strong>Dine beste plasseringer</strong>
                  <div className="placement-legend-scale">
                    {['#f1c40f', '#2ecc71', '#58d68d', '#a9dfbf', '#d5f5e3'].map(
                      (color, i) => (
                        <span
                          key={color}
                          className="placement-legend-swatch"
                          style={{ background: color }}
                          title={`#${i + 1}`}
                        />
                      )
                    )}
                  </div>
                  <span className="placement-legend-hint">
                    {strategyChoice === 'harbor' || activeHarborPlan
                      ? 'Oransje 1 / turkis 2 = havnplan · blå = havn · hvit stiplet = valgt startvei'
                      : placementStep === 'road'
                        ? 'Steg 2: trykk nabo for startvei, deretter Bekreft vei'
                        : 'Steg 1: velg landsby og Bekreft landsby · gullkant = anbefalt strategi'}
                  </span>
                </div>
              )}
              {simPlacing && !isYourTurn && (
                <div className="placement-heatmap-legend placement-heatmap-legend-inline" aria-hidden>
                  <strong>Plasser manuelt for motspiller</strong>
                  <span className="placement-legend-hint">
                    Markører viser modellens toppforslag for spilleren som har tur
                  </span>
                </div>
              )}
            </>
          ) : (
            <div className="empty-board">{t('app.generating')}</div>
          )}

          {boardStory && !mappingMode && !simPlacing && (
            <BoardStoryPanel story={boardStory} />
          )}

          {simulation?.finished && !midgameActive && (
            <SimulationSummaryPanel state={simulation} />
          )}
        </main>

        <aside className={`sidebar sidebar-right ${simActive ? 'sim-sidebar-active' : ''}`}>
          {mappingMode ? (
            <MappingPanel
              mapping={boardMapping}
              onHighlightEdge={setHighlightEdge}
              onHighlightCorner={setHighlightCorner}
            />
          ) : midgameActive && simulation && board && midgame ? (
            <MidgamePanel
              board={board}
              placements={simulation.placements}
              config={simulation.config}
              playerCount={simulation.playerCount}
              midgame={midgame}
              onUpgradeCity={(vertexId) => {
                const human = simulation.config.humanPlayerIndex;
                setSimulation({
                  ...simulation,
                  placements: upgradeToCity(
                    simulation.placements,
                    vertexId,
                    human
                  ),
                });
              }}
              onAddRoad={(from, to) => {
                const human = simulation.config.humanPlayerIndex;
                setMidgame(
                  addMidgameRoad(
                    midgame,
                    from,
                    to,
                    human,
                    simulation.placements,
                    simulation.playerCount
                  )
                );
              }}
              onSetRobber={(hexKey) => {
                setMidgame({ ...midgame, robberHexKey: hexKey });
              }}
              onExit={exitMidgame}
            />
          ) : simActive && simulation ? (
            <>
              {board && (
                <SettlementSimulator
                  state={simulation}
                  board={board}
                  boardSize={boardSize}
                  options={rankedOptions}
                  selectedVertex={selectedVertex}
                  selectedRoadTo={selectedRoadTo}
                  placementStep={placementStep}
                  selectedHarborPlanKey={selectedHarborPlanKey}
                  strategyChoice={strategyChoice}
                  strategyProfile={activeStrategy}
                  strategyWeights={strategyWeights}
                  strategyRecommendation={strategyRecommendation}
                  recommendedStrategyChoice={recommendedStrategyChoice}
                  strategyLevels={strategyLevels}
                  harborOpportunities={harborOpportunities}
                  rankedRoads={rankedRoads}
                  secondPreviewVertex={secondPreviewVertex}
                  onSelectVertex={handleSelectVertex}
                  onSelectRoad={(to) => setSelectedRoadTo(to)}
                  onSelectHarborPlan={handleSelectHarborPlan}
                  onConfirm={handleConfirm}
                  onUndo={handleUndo}
                  onCancel={resetSimulation}
                  onStrategyChoiceChange={handleStrategyChoiceChange}
                  onStartMidgame={startMidgame}
                  midgameLocked={!premiumMidgame}
                />
              )}
            </>
          ) : (
            <>
              <div className="panel simulation-setup">
                <h2>
                  {t('setup.heading')}
                  <span className="premium-badge">Premium</span>
                </h2>

                {!premiumSimulation && (
                  <p className="premium-gate-banner muted small">{t('setup.premiumGate')}</p>
                )}

                <label className="field">
                  {t('setup.playerCount')}
                  <select
                    value={playerCount}
                    disabled={simActive && !simulation?.finished}
                    onChange={(e) =>
                      handlePlayerCountChange(Number(e.target.value) as PlayerCount)
                    }
                  >
                    {([2, 3, 4] as const).map((n) => (
                      <option key={n} value={n}>
                        {t('setup.players', { count: n })}
                      </option>
                    ))}
                    {boardSize === 'extension56' &&
                      ([5, 6] as const).map((n) => (
                        <option key={n} value={n}>
                          {t('setup.players', { count: n })}
                        </option>
                      ))}
                  </select>
                </label>

                <PlayerSetupPanel
                  playerCount={playerCount}
                  config={simulation?.config ?? simulationConfig}
                  disabled={simActive && !simulation?.finished}
                  onConfigChange={setSimulationConfig}
                />

                <StrategyPicker
                  value={strategyChoice}
                  onChange={setStrategyChoice}
                  harborEnabled
                  hint={
                    strategyChoice === 'harbor'
                      ? t('strategy.hintHarbor')
                      : activeStrategy.description
                  }
                />

                <p className="muted small scoring-hint">{t('setup.scoringHint')}</p>

                {!simActive ? (
                  <button
                    type="button"
                    className={`btn primary btn-block ${!premiumSimulation ? 'btn-premium-locked' : ''}`}
                    disabled={!board}
                    onClick={startSimulation}
                  >
                    {premiumSimulation
                      ? t('setup.startPlacement')
                      : t('setup.unlockPlacement')}
                  </button>
                ) : (
                  <div className="sim-actions">
                    <button
                      type="button"
                      className="btn primary btn-block"
                      onClick={startSimulation}
                    >
                      {t('setup.newRound')}
                    </button>
                  </div>
                )}
              </div>

              {!simActive && (
                <div className="panel sim-placeholder">
                  <p className="muted small">{t('setup.placeholder')}</p>
                </div>
              )}
            </>
          )}
        </aside>
      </div>

      <footer className="footer">
        <p>
          {APP_DISPLAY_NAME} · {t('app.footer')}
        </p>
      </footer>
    </div>
  );
}

export default App;
