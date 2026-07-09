import { useCallback, useEffect, useState } from 'react';
import type { Board, GeneratorSettings, PlayerCount } from './catan/types';
import { DEFAULT_SETTINGS } from './catan/types';
import { generateBoard } from './catan/generator';
import {
  advanceToHumanOrEnd,
  createSimulation,
  getOptionsForCurrentTurn,
  placeSettlement,
  type SimulationState,
} from './catan/simulator';
import { BoardView } from './components/BoardView';
import { SettingsPanel } from './components/SettingsPanel';
import { SettlementSimulator } from './components/SettlementSimulator';
import './App.css';

function App() {
  const [settings, setSettings] = useState<GeneratorSettings>(DEFAULT_SETTINGS);
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playerCount, setPlayerCount] = useState<PlayerCount>(4);
  const [humanPlayer, setHumanPlayer] = useState(0);
  const [simulation, setSimulation] = useState<SimulationState | null>(null);
  const [selectedVertex, setSelectedVertex] = useState<string | null>(null);
  const [mode, setMode] = useState<'view' | 'simulate'>('view');

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
    const sim = createSimulation(board, playerCount, humanPlayer);
    const advanced = advanceToHumanOrEnd(sim);
    setSimulation(advanced);
    setSelectedVertex(null);
    setMode('simulate');
  };

  const options =
    simulation && board
      ? getOptionsForCurrentTurn(simulation)
      : [];

  const handleConfirm = () => {
    if (!simulation || !selectedVertex) return;
    let next = placeSettlement(simulation, selectedVertex);
    next = advanceToHumanOrEnd(next);
    setSimulation(next);
    setSelectedVertex(null);
  };

  const handleAutoPlay = () => {
    if (!simulation) return;
    const next = advanceToHumanOrEnd(simulation);
    setSimulation(next);
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
            <h2>Simulering</h2>
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
            <label className="field">
              Din spiller
              <select
                value={humanPlayer}
                onChange={(e) => setHumanPlayer(Number(e.target.value))}
              >
                {Array.from({ length: playerCount }, (_, i) => (
                  <option key={i} value={i}>
                    Spiller {i + 1}
                  </option>
                ))}
              </select>
            </label>
            <p className="muted small">
              Rekkefølge: 1 → 2 → 3 → 4 → 4 → 3 → 2 → 1 (slange-draft)
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

          {mode === 'simulate' && simulation && (
            <SettlementSimulator
              state={simulation}
              options={options}
              selectedVertex={selectedVertex}
              onSelectVertex={setSelectedVertex}
              onConfirm={handleConfirm}
              onAutoPlay={handleAutoPlay}
            />
          )}
        </aside>

        <main className="board-area">
          {board ? (
            <BoardView
              board={board}
              placements={simulation?.placements ?? []}
              highlightedVertices={mode === 'simulate' ? options : []}
              selectedVertex={selectedVertex}
              onVertexClick={setSelectedVertex}
              interactive={mode === 'simulate'}
            />
          ) : (
            <div className="empty-board">Genererer brett…</div>
          )}

          <div className="legend panel">
            <h3>Havnebrikker (kantbrikker)</h3>
            <p className="muted small">
              6 unike kantbrikker à 3 kystsegmenter roteres som faste enheter
              rundt brettet. Hver brikke vender alltid mot sentrum.
            </p>
            {board?.harbors.map((h) => (
              <div key={h.piece.id} className="harbor-legend-row">
                <strong>{h.piece.name}</strong>
                <span>
                  Slot {h.startSlot}–{(h.startSlot + 2) % 18}
                </span>
              </div>
            ))}
          </div>
        </main>
      </div>

      <footer className="footer">
        <p>
          Fase 1: Grunnspill · Utvidelse kommer senere · Ressursverdier: Malm
          1.2, Korn 1.15, Tømmer/Tegl 1.0, Ull 0.85
        </p>
      </footer>
    </div>
  );
}

export default App;
