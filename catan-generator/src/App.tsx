import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Board, BoardSize, GeneratorSettings, PlayerCount } from './catan/types';
import { DEFAULT_SETTINGS } from './catan/types';
import { BOARD_SIZE_CONFIG } from './catan/boardLayout';
import {
  type StrategyMode,
  STRATEGY_PROFILES,
} from './catan/resourceWeights';
import { generateBoard } from './catan/generator';
import { getBoardMapping } from './catan/mapping';
import {
  createSimulation,
  getOptionsWithAnalysis,
  getPlacementOrder,
  placeSettlement,
  type SimulationState,
} from './catan/simulator';
import { BoardView } from './components/BoardView';
import { MappingPanel } from './components/MappingPanel';
import { SettingsPanel } from './components/SettingsPanel';
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
  const [focusPlayer, setFocusPlayer] = useState(0);
  const [strategyMode, setStrategyMode] = useState<StrategyMode>('auto');
  const [simulation, setSimulation] = useState<SimulationState | null>(null);
  const [selectedVertex, setSelectedVertex] = useState<string | null>(null);
  const [mode, setMode] = useState<'view' | 'simulate'>('view');
  const [mappingMode, setMappingMode] = useState(false);
  const [highlightEdge, setHighlightEdge] = useState<string | null>(null);
  const [highlightCorner, setHighlightCorner] = useState<string | null>(null);

  const boardMapping = useMemo(() => getBoardMapping(boardSize), [boardSize]);
  const simActive = mode === 'simulate' && simulation !== null;

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

  const ranked =
    simulation && board
      ? getOptionsWithAnalysis(simulation, focusPlayer, strategyMode)
      : { options: [], analysis: null };

  const handleConfirm = () => {
    if (!simulation || !selectedVertex) return;
    setSimulation(placeSettlement(simulation, selectedVertex));
    setSelectedVertex(null);
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
          <button type="button" className="btn primary" onClick={handleGenerate}>
            Generer nytt brett
          </button>
        </div>
      </header>

      {error && <div className="error-banner">{error}</div>}

      <div className="layout">
        <aside className="sidebar sidebar-left">
          <SettingsPanel settings={settings} onChange={setSettings} />

          <div className="panel">
            <h2>Brettstørrelse</h2>
            <label className="field">
              Variant
              <select
                value={boardSize}
                onChange={(e) => {
                  const size = e.target.value as BoardSize;
                  setBoardSize(size);
                  if (size === 'base' && playerCount > 4) {
                    setPlayerCount(4);
                  }
                  if (size === 'base' && focusPlayer > 3) {
                    setFocusPlayer(3);
                  }
                }}
              >
                {(Object.keys(BOARD_SIZE_CONFIG) as BoardSize[]).map((key) => (
                  <option key={key} value={key}>
                    {BOARD_SIZE_CONFIG[key].label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="panel">
            <h2>Kartlegging</h2>
            <label className="setting-row">
              <input
                type="checkbox"
                checked={mappingMode}
                onChange={(e) => {
                  setMappingMode(e.target.checked);
                  if (e.target.checked) setMode('view');
                }}
              />
              <span className="setting-text">
                <strong>Vis K/H-nummerering</strong>
                <small>
                  K1–K{boardMapping.edgeHexes.length}, H1–H
                  {boardMapping.coastCorners.length}
                </small>
              </span>
            </label>
          </div>

          {mappingMode && (
            <MappingPanel
              mapping={boardMapping}
              onHighlightEdge={setHighlightEdge}
              onHighlightCorner={setHighlightCorner}
            />
          )}

          {!mappingMode && board && !simulation?.finished && (
            <details className="panel legend-collapsible">
              <summary>Havner og kantbrikker</summary>
              <p className="muted small">
                Rotasjon {board.edgeRotation}/5 ·{' '}
                {BOARD_SIZE_CONFIG[boardSize].harborTriplePieceCount}×3-hex
                {boardSize === 'extension56' &&
                  ` + ${BOARD_SIZE_CONFIG.extension56.singleEdgePieceCount} enkelt`}
              </p>
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
        </aside>

        <main className="board-area">
          {board ? (
            <BoardView
              board={board}
              placements={simulation?.placements ?? []}
              highlightedVertices={simActive ? ranked.options : []}
              selectedVertex={selectedVertex}
              onVertexClick={setSelectedVertex}
              interactive={simActive && !simulation?.finished}
              mappingMode={mappingMode}
              mapping={boardMapping}
              highlightEdge={highlightEdge}
              highlightCorner={highlightCorner}
            />
          ) : (
            <div className="empty-board">Genererer brett…</div>
          )}

          {simulation?.finished && (
            <SimulationSummaryPanel state={simulation} />
          )}
        </main>

        {!mappingMode && (
          <aside className="sidebar sidebar-right">
            <div className="panel simulation-setup">
              <h2>Startposisjon</h2>

              <div className="field-row">
                <label className="field">
                  Spillere
                  <select
                    value={playerCount}
                    disabled={simActive && !simulation?.finished}
                    onChange={(e) =>
                      setPlayerCount(Number(e.target.value) as PlayerCount)
                    }
                  >
                    <option value={2}>2</option>
                    <option value={3}>3</option>
                    <option value={4}>4</option>
                    {boardSize === 'extension56' && (
                      <>
                        <option value={5}>5</option>
                        <option value={6}>6</option>
                      </>
                    )}
                  </select>
                </label>
                <label className="field">
                  Min spiller
                  <select
                    value={focusPlayer}
                    onChange={(e) => setFocusPlayer(Number(e.target.value))}
                  >
                    {Array.from({ length: playerCount }, (_, i) => (
                      <option key={i} value={i}>
                        Spiller {i + 1}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="field">
                Strategi
                <select
                  value={strategyMode}
                  onChange={(e) =>
                    setStrategyMode(e.target.value as StrategyMode)
                  }
                >
                  {(Object.keys(STRATEGY_PROFILES) as StrategyMode[]).map((key) => (
                    <option key={key} value={key}>
                      {STRATEGY_PROFILES[key].label}
                    </option>
                  ))}
                </select>
              </label>

              <p className="muted small draft-order">
                Draft: {formatDraftOrder(playerCount)}
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

            {simActive && simulation && (
              <SettlementSimulator
                state={simulation}
                options={ranked.options}
                analysis={ranked.analysis}
                focusPlayer={focusPlayer}
                strategyMode={strategyMode}
                selectedVertex={selectedVertex}
                onSelectVertex={setSelectedVertex}
                onConfirm={handleConfirm}
              />
            )}

            {!simActive && (
              <div className="panel sim-placeholder">
                <p className="muted small">
                  Velg spillere og strategi, trykk <strong>Start plassering</strong>,
                  og klikk deretter på grønne markører på brettet til venstre.
                </p>
              </div>
            )}
          </aside>
        )}
      </div>

      <footer className="footer">
        <p>Grunnspill + 5–6 utvidelse · Auto-strategi (Board Game Analysis)</p>
      </footer>
    </div>
  );
}

export default App;
