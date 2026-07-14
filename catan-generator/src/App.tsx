import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Board, BoardSize, GeneratorSettings, PlayerCount } from './catan/types';
import { DEFAULT_SETTINGS } from './catan/types';
import { BOARD_SIZE_CONFIG } from './catan/boardLayout';
import { generateBoard } from './catan/generator';
import { getBoardMapping } from './catan/mapping';
import {
  getStrategyProfile,
  getStrategyWeights,
  STRATEGY_PROFILES,
  type StrategyProfileId,
} from './catan/resourceWeights';
import {
  createSimulationConfig,
  type SimulationConfig,
} from './catan/playerConfig';
import {
  getSecondSettlementPreview,
  isHumanFirstSettlementTurn,
  recommendStrategy,
} from './catan/strategyAdvisor';
import { findHarborStrategyOpportunities, harborOpportunityKey, type HarborStrategyOpportunity } from './catan/harborStrategy';
import {
  createSimulation,
  getOptionsForCurrentTurn,
  isHumanTurn,
  placeSettlement,
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
import { SettlementSimulator } from './components/SettlementSimulator';
import { SimulationSummaryPanel } from './components/SimulationSummary';
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
  const [strategyProfile, setStrategyProfile] = useState<StrategyProfileId>(
    () => restoredSession?.strategyProfile ?? 'general'
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
  const [highlightEdge, setHighlightEdge] = useState<string | null>(null);
  const [highlightCorner, setHighlightCorner] = useState<string | null>(null);
  const [hydrated] = useState(() => restoredSession !== null);

  const boardMapping = useMemo(() => getBoardMapping(boardSize), [boardSize]);
  const activeStrategy = useMemo(() => getStrategyProfile(strategyProfile), [strategyProfile]);
  const strategyWeights = useMemo(() => getStrategyWeights(strategyProfile), [strategyProfile]);
  const simActive = mode === 'simulate' && simulation !== null;

  const handleBoardSizeChange = (size: BoardSize) => {
    setBoardSize(size);
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
      strategyProfile,
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
    strategyProfile,
    simulation,
    selectedVertex,
    mode,
  ]);

  const startSimulation = () => {
    if (!board) return;
    setSimulation(createSimulation(board, simulationConfig));
    setSelectedVertex(null);
    setSelectedHarborPlanKey(null);
    setMode('simulate');
  };

  const resetSimulation = () => {
    setSimulation(null);
    setSelectedVertex(null);
    setSelectedHarborPlanKey(null);
    setMode('view');
  };

  const simPlacing = simulation && simActive && !simulation.finished;

  const rankedOptions =
    simPlacing ? getOptionsForCurrentTurn(simulation, strategyWeights) : [];

  const isYourTurn = simulation && simActive && isHumanTurn(simulation);

  const strategyRecommendation = useMemo(() => {
    if (!board || !simulation || !isYourTurn) return null;
    const human = simulation.config.humanPlayerIndex;
    if (!isHumanFirstSettlementTurn(simulation.placements, human)) return null;
    return recommendStrategy(
      board,
      simulation.placements,
      human,
      simulation.playerCount
    );
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

  const harborPlanHighlight = activeHarborPlan
    ? {
        firstVertexId: activeHarborPlan.firstVertexId,
        secondVertexId: activeHarborPlan.secondVertexId,
        harborNodeVertexIds: activeHarborPlan.harborNodeVertexIds,
      }
    : null;

  const handleSelectVertex = (vertexId: string) => {
    setSelectedVertex(vertexId);
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

  const toggleMapping = () => {
    setMappingMode((on) => {
      if (!on) setMode('view');
      return !on;
    });
  };

  return (
    <div className="app">
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
            className={`btn header-btn ${mappingMode ? 'active' : ''}`}
            onClick={toggleMapping}
          >
            Kartlegging
          </button>
          <button
            type="button"
            className="btn header-btn"
            onClick={() => setSettingsOpen(true)}
          >
            Innstillinger
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

      {error && <div className="error-banner">{error}</div>}

      <div className={`layout layout-two-col ${simPlacing ? 'layout-simulating' : ''}`}>
        <main className="board-area">
          {board ? (
            <div className="board-wrap">
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
                    {activeHarborPlan
                      ? 'Oransje 1 / turkis 2 = havnstrategi · blå = havn'
                      : '#1 = best forventet par · stiplet ring = landsby nr. 2'}
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

          {!mappingMode && board && !simulation?.finished && (
            <details className="panel legend-collapsible board-legend">
              <summary>Havner</summary>
              <div className="legend-list">
                {board.harbors.map((h) => (
                  <div key={h.definition.id} className="harbor-legend-row">
                    <strong>B{h.pieceGroup + 1}</strong>
                    <span>{h.definition.name}</span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </main>

        <aside className={`sidebar sidebar-right ${simActive ? 'sim-sidebar-active' : ''}`}>
          {mappingMode ? (
            <MappingPanel
              mapping={boardMapping}
              onHighlightEdge={setHighlightEdge}
              onHighlightCorner={setHighlightCorner}
            />
          ) : simPlacing ? (
            <>
              <details className="panel sim-setup-details">
                <summary>
                  Oppsett · {playerCount} spillere · {activeStrategy.label}
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
                  config={simulation?.config ?? simulationConfig}
                  disabled
                  compact
                  onConfigChange={setSimulationConfig}
                />

                <label className="field">
                  Strategiprofil
                  <select
                    value={strategyProfile}
                    onChange={(e) =>
                      setStrategyProfile(e.target.value as StrategyProfileId)
                    }
                  >
                    {STRATEGY_PROFILES.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.label}
                      </option>
                    ))}
                  </select>
                </label>

                <button
                  type="button"
                  className="btn btn-block"
                  onClick={resetSimulation}
                >
                  Avbryt simulering
                </button>
              </details>

              {simulation && board && (
                <SettlementSimulator
                  state={simulation}
                  board={board}
                  boardSize={boardSize}
                  options={rankedOptions}
                  selectedVertex={selectedVertex}
                  selectedHarborPlanKey={selectedHarborPlanKey}
                  strategyProfile={activeStrategy}
                  strategyWeights={strategyWeights}
                  strategyRecommendation={strategyRecommendation}
                  harborOpportunities={harborOpportunities}
                  secondPreviewVertex={secondPreviewVertex}
                  onSelectVertex={handleSelectVertex}
                  onSelectHarborPlan={handleSelectHarborPlan}
                  onConfirm={handleConfirm}
                  onApplyRecommendedStrategy={setStrategyProfile}
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

                <label className="field">
                  Strategiprofil
                  <select
                    value={strategyProfile}
                    onChange={(e) =>
                      setStrategyProfile(e.target.value as StrategyProfileId)
                    }
                  >
                    {STRATEGY_PROFILES.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.label}
                      </option>
                    ))}
                  </select>
                </label>

                <p className="muted small strategy-hint">{activeStrategy.description}</p>

                <p className="muted small scoring-hint">
                  Poeng: vektet produksjon (lett justert for knapphet) + dekning og pip etter
                  valgt strategi. Ved første landsby foreslås strategi ut fra parpotensial.
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

              {simActive && simulation?.finished && board && (
                <SettlementSimulator
                  state={simulation}
                  board={board}
                  boardSize={boardSize}
                  options={rankedOptions}
                  selectedVertex={selectedVertex}
                  selectedHarborPlanKey={selectedHarborPlanKey}
                  strategyProfile={activeStrategy}
                  strategyWeights={strategyWeights}
                  strategyRecommendation={strategyRecommendation}
                  harborOpportunities={harborOpportunities}
                  secondPreviewVertex={secondPreviewVertex}
                  onSelectVertex={handleSelectVertex}
                  onSelectHarborPlan={handleSelectHarborPlan}
                  onConfirm={handleConfirm}
                  onApplyRecommendedStrategy={setStrategyProfile}
                />
              )}

              {!simActive && (
                <div className="panel sim-placeholder">
                  <p className="muted small">
                    Velg hvem du er, gi spillere navn og farger. Alle plasseres manuelt i
                    draft-rekkefølge. Du får strategianbefaling og par-preview når det er din tur.
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
