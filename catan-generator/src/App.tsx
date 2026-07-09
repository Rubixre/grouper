import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Board, GeneratorSettings, PlayerCount } from './catan/types';
import { DEFAULT_SETTINGS } from './catan/types';
import {
  type StrategyMode,
  STRATEGY_PROFILES,
} from './catan/resourceWeights';
import { generateBoard } from './catan/generator';
import { getBoardMapping } from './catan/mapping';
import {
  createSimulation,
  getOptionsWithAnalysis,
  placeSettlement,
  type SimulationState,
} from './catan/simulator';
import { BoardView } from './components/BoardView';
import { MappingPanel } from './components/MappingPanel';
import { SettingsPanel } from './components/SettingsPanel';
import { SettlementSimulator } from './components/SettlementSimulator';
import './App.css';

function App() {
  const [settings, setSettings] = useState<GeneratorSettings>(DEFAULT_SETTINGS);
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

  const boardMapping = useMemo(() => getBoardMapping(), []);

  const handleGenerate = useCallback(() => {
    const result = generateBoard(settings);
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
  }, [settings]);

  useEffect(() => {
    handleGenerate();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const startSimulation = () => {
    if (!board) return;
    setSimulation(createSimulation(board, playerCount));
    setSelectedVertex(null);
    setMode('simulate');
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
            37-hex brett (7 rader) – ressurser, tall og havnebrikker
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
        <aside className="sidebar">
          <SettingsPanel settings={settings} onChange={setSettings} />

          <div className="panel">
            <h2>Kartleggingsmodus</h2>
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
                <strong>Vis nummerering</strong>
                <small>K1–K18 kanthexer, H1–H30 møtehjørner, hjørne 0–5</small>
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

          {!mappingMode && (
          <div className="panel">
            <h2>Simulering</h2>
            <label className="field">
              Min spiller
              <select
                value={focusPlayer}
                onChange={(e) => setFocusPlayer(Number(e.target.value))}
              >
                <option value={0}>Spiller 1</option>
                <option value={1}>Spiller 2</option>
                <option value={2}>Spiller 3</option>
                <option value={3}>Spiller 4</option>
              </select>
            </label>
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
            <p className="muted small">
              {STRATEGY_PROFILES[strategyMode].description}. I auto-modus
              analyseres tilgjengelige plasseringer og forventede motstandertrekk
              før landsby nr. 2.{' '}
              <a
                href="https://www.boardgameanalysis.com/what-is-the-strategic-value-of-each-catan-resources/"
                target="_blank"
                rel="noreferrer"
              >
                Board Game Analysis
              </a>
              .
            </p>
            <label className="field">
              Antall spillere
              <select
                value={playerCount}
                onChange={(e) =>
                  setPlayerCount(Number(e.target.value) as PlayerCount)
                }
              >
                <option value={2}>2 spillere</option>
                <option value={3}>3 spillere</option>
                <option value={4}>4 spillere</option>
              </select>
            </label>
            <p className="muted small">
              Rekkefølge: 1 → 2 → 3 → 4 → 4 → 3 → 2 → 1 (slange-draft). Hver
              spiller plasserer manuelt når det er deres tur.
            </p>
            <button
              type="button"
              className="btn"
              disabled={!board}
              onClick={startSimulation}
            >
              Start plassering
            </button>
          </div>
          )}

          {!mappingMode && mode === 'simulate' && simulation && (
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
        </aside>

        <main className="board-area">
          {board ? (
            <BoardView
              board={board}
              placements={simulation?.placements ?? []}
              highlightedVertices={mode === 'simulate' ? ranked.options : []}
              selectedVertex={selectedVertex}
              onVertexClick={setSelectedVertex}
              interactive={mode === 'simulate'}
              mappingMode={mappingMode}
              mapping={boardMapping}
              highlightEdge={highlightEdge}
              highlightCorner={highlightCorner}
            />
          ) : (
            <div className="empty-board">Genererer brett…</div>
          )}

          <div className="legend panel">
            <h3>Kantbrikker og havner</h3>
            <p className="muted small">
              Rotasjon {board?.edgeRotation ?? 0}/5 (1/6 hvert steg). 6 brikker à 3 hexer
              (B1: K18–K1–K2 ved rot. 0).
            </p>
            {board?.harbors.map((h) => (
              <div key={h.definition.id} className="harbor-legend-row">
                <strong>
                  B{h.pieceGroup + 1} · {h.definition.name}
                </strong>
                <span>
                  {h.edgeHexLabel} → {h.nodeLabels.join(', ')}
                </span>
              </div>
            ))}
          </div>
        </main>
      </div>

      <footer className="footer">
        <p>
          Fase 1: Grunnspill · Fire seiersprofiler + auto-analyse (Board Game Analysis)
        </p>
      </footer>
    </div>
  );
}

export default App;
