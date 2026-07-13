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
  createSimulation,
  getOptionsForCurrentTurn,
  getPlacementOrder,
  placeSettlement,
  type SimulationState,
} from './catan/simulator';
import { BoardView } from './components/BoardView';
import { MappingPanel } from './components/MappingPanel';
import { SettingsModal } from './components/SettingsModal';
import { SettlementSimulator } from './components/SettlementSimulator';
import { SimulationSummaryPanel } from './components/SimulationSummary';
import './App.css';

function formatDraftOrder(count: PlayerCount): string {
  return getPlacementOrder(count)
    .map((p) => p + 1)
    .join(' → ');
}

function App() {
  const [settings, setSettings] = useState<GeneratorSettings>(DEFAULT_SETTINGS);
  const [boardSize, setBoardSize] = useState<BoardSize>('base');
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playerCount, setPlayerCount] = useState<PlayerCount>(4);
  const [strategyProfile, setStrategyProfile] = useState<StrategyProfileId>('general');
  const [simulation, setSimulation] = useState<SimulationState | null>(null);
  const [selectedVertex, setSelectedVertex] = useState<string | null>(null);
  const [mode, setMode] = useState<'view' | 'simulate'>('view');
  const [mappingMode, setMappingMode] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [highlightEdge, setHighlightEdge] = useState<string | null>(null);
  const [highlightCorner, setHighlightCorner] = useState<string | null>(null);

  const boardMapping = useMemo(() => getBoardMapping(boardSize), [boardSize]);
  const activeStrategy = useMemo(() => getStrategyProfile(strategyProfile), [strategyProfile]);
  const strategyWeights = useMemo(() => getStrategyWeights(strategyProfile), [strategyProfile]);
  const simActive = mode === 'simulate' && simulation !== null;

  const handleBoardSizeChange = (size: BoardSize) => {
    setBoardSize(size);
    if (size === 'base' && playerCount > 4) setPlayerCount(4);
  };

  const handleGenerate = useCallback(() => {
    const result = generateBoard(settings, boardSize);
    if (!result) {
      setError(
        'Kunne ikke generere gyldig brett med valgte regler. Prøv igjen eller slakk på begrensningene.'
      );
      setBoard(null);
      setSimulation(null);
      return;
    }
    setError(null);
    setBoard(result);
    setSimulation(null);
    setSelectedVertex(null);
    setMode('view');
  }, [settings, boardSize]);

  useEffect(() => {
    handleGenerate();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const startSimulation = () => {
    if (!board) return;
    setSimulation(createSimulation(board, playerCount));
    setSelectedVertex(null);
    setMode('simulate');
  };

  const resetSimulation = () => {
    setSimulation(null);
    setSelectedVertex(null);
    setMode('view');
  };

  const rankedOptions =
    simulation && simActive ? getOptionsForCurrentTurn(simulation, strategyWeights) : [];

  const handleConfirm = () => {
    if (!simulation || !selectedVertex) return;
    setSimulation(placeSettlement(simulation, selectedVertex));
    setSelectedVertex(null);
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
            {BOARD_SIZE_CONFIG[boardSize].totalHexes} hex ·{' '}
            {BOARD_SIZE_CONFIG[boardSize].label}
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

      <div className="layout layout-two-col">
        <main className="board-area">
          {board ? (
            <div className="board-wrap">
              <BoardView
                board={board}
                placements={simulation?.placements ?? []}
                highlightedVertices={simActive ? rankedOptions : []}
                selectedVertex={selectedVertex}
                onVertexClick={setSelectedVertex}
                interactive={simActive && !simulation?.finished}
                mappingMode={mappingMode}
                mapping={boardMapping}
                highlightEdge={highlightEdge}
                highlightCorner={highlightCorner}
              />
              {simActive && !simulation?.finished && (
                <div className="placement-heatmap-legend" aria-hidden>
                  <strong>Anbefalte plasseringer</strong>
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
                    #1 = best · lyse punkter = også gyldige
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="empty-board">Genererer brett…</div>
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

        <aside className="sidebar sidebar-right">
          {mappingMode ? (
            <MappingPanel
              mapping={boardMapping}
              onHighlightEdge={setHighlightEdge}
              onHighlightCorner={setHighlightCorner}
            />
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
                      setPlayerCount(Number(e.target.value) as PlayerCount)
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

                <p className="muted small draft-order">
                  Draft: {formatDraftOrder(playerCount)}
                </p>

                <p className="muted small scoring-hint">
                  Poeng: vektet produksjon + dekning + pip, justert for knapphet på
                  brettet. Landsby nr. 2 vurderes som par med nr. 1.
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
                    {!simulation?.finished && (
                      <button
                        type="button"
                        className="btn btn-block"
                        onClick={resetSimulation}
                      >
                        Avbryt
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn primary btn-block"
                      onClick={startSimulation}
                    >
                      {simulation?.finished ? 'Ny runde' : 'Start på nytt'}
                    </button>
                  </div>
                )}
              </div>

              {simActive && simulation && board && (
                <SettlementSimulator
                  state={simulation}
                  board={board}
                  options={rankedOptions}
                  selectedVertex={selectedVertex}
                  strategyProfile={activeStrategy}
                  strategyWeights={strategyWeights}
                  onSelectVertex={setSelectedVertex}
                  onConfirm={handleConfirm}
                />
              )}

              {!simActive && (
                <div className="panel sim-placeholder">
                  <p className="muted small">
                    Velg antall spillere og trykk <strong>Start plassering</strong>.
                    De 8 beste plasseringene vises som nummererte markører på brettet
                    (gull = #1). Du kan også klikke andre lyse punkter for fri plassering.
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
