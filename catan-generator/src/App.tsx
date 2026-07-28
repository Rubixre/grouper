import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Board, BoardSize, GeneratorSettings, PlayerCount } from './catan/types';
import { DEFAULT_SETTINGS } from './catan/types';
import { BOARD_SIZE_CONFIG } from './catan/boardLayout';
import { generateBoard } from './catan/generator';
import { getBoardMapping } from './catan/mapping';
import {
  getStrategyProfile,
  getStrategyWeights,
  resolveStrategyProfileId,
  strategyChoiceLabel,
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
  getOptionsForCurrentTurn,
  isHumanTurn,
  placeSettlement,
  undoLastPlacement,
  type SimulationState,
} from './catan/simulator';
import {
  loadSession,
  saveSession,
  type AppMode,
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
import { createBoardStory, type BoardStory } from './catan/boardStory';
import './App.css';

const restoredSession = typeof window !== 'undefined' ? loadSession() : null;

function App() {
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
  const [selectedHarborPlanKey, setSelectedHarborPlanKey] = useState<string | null>(null);
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

  const handleGenerate = useCallback(() => {
    const result = generateBoard(settings, boardSize);
    if (!result) {
      setError(
        'Kunne ikke generere gyldig brett med valgte regler. Prøv igjen eller slakk på begrensningene.'
      );
      setBoard(null);
      setBoardStory(null);
      setSimulation(null);
      return;
    }
    setError(null);
    setBoard(result);
    setBoardStory(createBoardStory(result));
    setSimulation(null);
    setSelectedVertex(null);
    setSelectedHarborPlanKey(null);
    setMode('view');
  }, [settings, boardSize]);

  const handleApplyPhotoBoard = useCallback((next: Board) => {
    setError(null);
    setBoardSize(next.boardSize);
    setBoard(next);
    setBoardStory(createBoardStory(next));
    setSimulation(null);
    setSelectedVertex(null);
    setMode('view');
    setMappingMode(false);
  }, []);

  useEffect(() => {
    if (!hydrated && !board) {
      handleGenerate();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    mode,
  ]);

  const startSimulation = () => {
    if (!board) return;
    setStrategyChoice('general');
    setSimulation(createSimulation(board, simulationConfig));
    setSelectedVertex(null);
    setSelectedHarborPlanKey(null);
    setMode('simulate');
    // Keep the map in view on phones (controls sit below the board).
    requestAnimationFrame(() => {
      boardWrapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const resetSimulation = () => {
    setSimulation(null);
    setSelectedVertex(null);
    setSelectedHarborPlanKey(null);
    setMode('view');
  };

  const simPlacing = simulation && simActive && !simulation.finished;

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
    if (choice === 'harbor') {
      const top = harborOpportunities[0];
      if (top) {
        setSelectedHarborPlanKey(harborOpportunityKey(top));
        setSelectedVertex(top.firstVertexId);
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
    setSelectedVertex(vertexId);
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
    setSelectedHarborPlanKey(harborOpportunityKey(opp));
    setSelectedVertex(opp.firstVertexId);
  };

  const handleConfirm = () => {
    if (!simulation || !selectedVertex) return;
    setSimulation(placeSettlement(simulation, selectedVertex));
    setSelectedVertex(null);
    setSelectedHarborPlanKey(null);
  };

  const handleUndo = () => {
    if (!simulation || simulation.placements.length === 0) return;
    setSimulation(undoLastPlacement(simulation));
    setSelectedVertex(null);
    setSelectedHarborPlanKey(null);
  };

  return (
    <div className={`app ${simPlacing ? 'app-simulating' : ''}`}>
      <header className="header">
        <div>
          <h1>Catan Brettgenerator</h1>
          <p className="subtitle">
            {boardStory ? (
              <>
                {boardStory.islandName}
                <span className="subtitle-sep"> · </span>
                {BOARD_SIZE_CONFIG[boardSize].label}
                {settings.bonanzaBoard && boardSize === 'base' ? ' · Bonanza' : ''}
              </>
            ) : (
              <>
                {BOARD_SIZE_CONFIG[boardSize].totalHexes} hex ·{' '}
                {BOARD_SIZE_CONFIG[boardSize].label}
                {settings.bonanzaBoard && boardSize === 'base' ? ' · Bonanza' : ''}
              </>
            )}
          </p>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="btn header-btn"
            onClick={() => setSettingsOpen(true)}
          >
            Innstillinger
          </button>
          <button
            type="button"
            className="btn header-btn"
            onClick={() => setPhotoBoardOpen(true)}
          >
            Fra bilde
          </button>
          <button type="button" className="btn primary" onClick={handleGenerate}>
            Generer brett
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
            <div className="board-wrap" ref={boardWrapRef}>
              <BoardView
                board={board}
                placements={simulation?.placements ?? []}
                playerConfig={simulation?.config ?? simulationConfig}
                highlightedVertices={simPlacing ? rankedOptions : []}
                previewSecondVertex={secondPreviewVertex}
                selectedVertex={selectedVertex}
                harborPlanHighlight={harborPlanHighlight}
                onVertexClick={simPlacing ? handleSelectVertex : undefined}
                interactive={Boolean(simPlacing)}
                mappingMode={mappingMode}
                mapping={boardMapping}
                highlightEdge={highlightEdge}
                highlightCorner={highlightCorner}
                coverFrame={false}
              />
              {simPlacing && isYourTurn && (
                <div className="placement-heatmap-legend" aria-hidden>
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
                      ? 'Oransje 1 / turkis 2 = havnplan · blå = havn · gullknapp = anbefalt'
                      : '#1 = best justert par · % sikker = forutsigbar sti · gullkant = anbefalt strategi'}
                  </span>
                </div>
              )}
              {simPlacing && !isYourTurn && (
                <div className="placement-heatmap-legend" aria-hidden>
                  <strong>Plasser manuelt for motspiller</strong>
                  <span className="placement-legend-hint">
                    Markører viser modellens toppforslag for spilleren som har tur
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="empty-board">Genererer brett…</div>
          )}

          {boardStory && !mappingMode && !simPlacing && (
            <BoardStoryPanel story={boardStory} />
          )}

          {simulation?.finished && (
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
          ) : simActive && simulation ? (
            <>
              <details className="panel sim-setup-details">
                <summary>
                  Oppsett · {playerCount} spillere · {strategyChoiceLabel(strategyChoice)}
                </summary>
                <label className="field">
                  Antall spillere
                  <select
                    value={playerCount}
                    disabled
                    onChange={(e) =>
                      handlePlayerCountChange(Number(e.target.value) as PlayerCount)
                    }
                  >
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

                <PlayerSetupPanel
                  playerCount={playerCount}
                  config={simulation.config}
                  disabled
                  compact
                  onConfigChange={setSimulationConfig}
                />

                <button
                  type="button"
                  className="btn btn-block"
                  onClick={resetSimulation}
                >
                  Avbryt simulering
                </button>
              </details>

              {board && (
                <SettlementSimulator
                  state={simulation}
                  board={board}
                  boardSize={boardSize}
                  options={rankedOptions}
                  selectedVertex={selectedVertex}
                  selectedHarborPlanKey={selectedHarborPlanKey}
                  strategyChoice={strategyChoice}
                  strategyProfile={activeStrategy}
                  strategyWeights={strategyWeights}
                  strategyRecommendation={strategyRecommendation}
                  recommendedStrategyChoice={recommendedStrategyChoice}
                  strategyLevels={strategyLevels}
                  harborOpportunities={harborOpportunities}
                  secondPreviewVertex={secondPreviewVertex}
                  onSelectVertex={handleSelectVertex}
                  onSelectHarborPlan={handleSelectHarborPlan}
                  onConfirm={handleConfirm}
                  onUndo={handleUndo}
                  onCancel={resetSimulation}
                  onStrategyChoiceChange={handleStrategyChoiceChange}
                />
              )}
            </>
          ) : (
            <>
              <div className="panel simulation-setup">
                <h2>Startposisjon</h2>

                <label className="field">
                  Antall spillere
                  <select
                    value={playerCount}
                    disabled={simActive && !simulation?.finished}
                    onChange={(e) =>
                      handlePlayerCountChange(Number(e.target.value) as PlayerCount)
                    }
                  >
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
                      ? 'Havn aktiveres når det er din tur og det finnes planer. Gullkant kommer under plassering.'
                      : activeStrategy.description
                  }
                />

                <p className="muted small scoring-hint">
                  Strategivalget gjelder bare deg. Anbefalt får gullkant — du bytter selv.
                  Trykk «Poengforklaring» under plassering for detaljer.
                </p>

                {!simActive ? (
                  <button
                    type="button"
                    className="btn primary btn-block"
                    disabled={!board}
                    onClick={startSimulation}
                  >
                    Start plassering
                  </button>
                ) : (
                  <div className="sim-actions">
                    <button
                      type="button"
                      className="btn primary btn-block"
                      onClick={startSimulation}
                    >
                      Ny runde
                    </button>
                  </div>
                )}
              </div>

              {!simActive && (
                <div className="panel sim-placeholder">
                  <p className="muted small">
                    Velg hvem du er, gi spillere navn og farger. Alle plasseres manuelt i
                    draft-rekkefølge. Velg strategi med knappene — gullkant markerer
                    anbefaling under din tur. Havn ligger i samme velger.
                  </p>
                </div>
              )}
            </>
          )}
        </aside>
      </div>

      <footer className="footer">
        <p>Grunnspill + 5–6 utvidelse · Vektede ressursverdier (Board Game Analysis)</p>
      </footer>
    </div>
  );
}

export default App;
