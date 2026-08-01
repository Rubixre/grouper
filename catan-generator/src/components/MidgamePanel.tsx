import { useMemo, useState } from 'react';
import type { Board, PlacedSettlement } from '../catan/types';
import type { SimulationConfig } from '../catan/playerConfig';
import { getPlayerName } from '../catan/playerConfig';
import type { MidgameState } from '../catan/midgame';
import {
  computeVictoryPoints,
  topRobberAdvice,
} from '../catan/midgame';
import {
  legalRoadExtensions,
  rankLongestRoads,
} from '../catan/roadGraph';
import { RESOURCE_LABELS } from '../catan/playerStats';

interface MidgamePanelProps {
  board: Board;
  placements: PlacedSettlement[];
  config: SimulationConfig;
  playerCount: 2 | 3 | 4 | 5 | 6;
  midgame: MidgameState;
  onUpgradeCity: (vertexId: string) => void;
  onAddRoad: (fromVertexId: string, toVertexId: string) => void;
  onSetRobber: (hexKey: string) => void;
  onExit: () => void;
}

export function MidgamePanel({
  board,
  placements,
  config,
  playerCount,
  midgame,
  onUpgradeCity,
  onAddRoad,
  onSetRobber,
  onExit,
}: MidgamePanelProps) {
  const human = config.humanPlayerIndex;
  const [roadFrom, setRoadFrom] = useState<string | null>(null);

  const vpRows = useMemo(
    () => computeVictoryPoints(placements, playerCount, midgame.longestRoadPlayer),
    [placements, playerCount, midgame.longestRoadPlayer]
  );

  const roadRanks = useMemo(
    () => rankLongestRoads(midgame.roads, placements, playerCount),
    [midgame.roads, placements, playerCount]
  );

  const robberTips = useMemo(
    () => topRobberAdvice(board, placements, human, midgame.robberHexKey, 5),
    [board, placements, human, midgame.robberHexKey]
  );

  const ownSettlements = placements.filter((p) => p.player === human);
  const upgradeable = ownSettlements.filter((p) => !p.isCity);

  const roadTargets = roadFrom
    ? legalRoadExtensions(roadFrom, midgame.roads, human, placements)
    : [];

  return (
    <div className="panel midgame-panel">
      <div className="midgame-panel-header">
        <h2>
          Midgame
          <span className="premium-badge">Premium</span>
        </h2>
        <button type="button" className="btn" onClick={onExit}>
          Avslutt midgame
        </button>
      </div>

      <section className="midgame-section">
        <h3>Seierspoeng</h3>
        <ul className="midgame-vp-list">
          {vpRows.map((row) => (
            <li key={row.player}>
              <strong>
                {getPlayerName(config, row.player)}
                {row.player === human ? ' (deg)' : ''}
              </strong>
              <span>
                {row.totalVp} VP
                {row.longestRoadBonus > 0 ? ' · lengste vei' : ''}
                {' · '}
                {row.settlements} landsby / {row.cities} by
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="midgame-section">
        <h3>Lengste vei</h3>
        <p className="muted small">
          Holder:{' '}
          {midgame.longestRoadPlayer == null
            ? 'ingen (trenger ≥5)'
            : `${getPlayerName(config, midgame.longestRoadPlayer)} (${
                roadRanks.find((r) => r.player === midgame.longestRoadPlayer)
                  ?.length ?? '—'
              })`}
        </p>
        <ul className="midgame-road-rank">
          {roadRanks.slice(0, 4).map((r) => (
            <li key={r.player}>
              {getPlayerName(config, r.player)}: {r.length} veier
            </li>
          ))}
        </ul>

        <label className="field">
          Legg vei fra (din landsby/by eller tip)
          <select
            value={roadFrom ?? ''}
            onChange={(e) => setRoadFrom(e.target.value || null)}
          >
            <option value="">Velg startpunkt…</option>
            {ownSettlements.map((p) => (
              <option key={p.vertexId} value={p.vertexId}>
                {p.isCity ? 'By' : 'Landsby'} {p.vertexId}
              </option>
            ))}
          </select>
        </label>
        {roadFrom && (
          <div className="midgame-road-targets">
            {roadTargets.length === 0 ? (
              <p className="muted small">Ingen ledige naboveier her.</p>
            ) : (
              roadTargets.map((to) => (
                <button
                  key={to}
                  type="button"
                  className="btn"
                  onClick={() => {
                    onAddRoad(roadFrom, to);
                    setRoadFrom(to);
                  }}
                >
                  Til {to}
                </button>
              ))
            )}
          </div>
        )}
      </section>

      <section className="midgame-section">
        <h3>Oppgrader til by</h3>
        {upgradeable.length === 0 ? (
          <p className="muted small">Ingen landsbyer igjen å oppgradere.</p>
        ) : (
          <div className="midgame-city-actions">
            {upgradeable.map((p) => (
              <button
                key={p.vertexId}
                type="button"
                className="btn primary"
                onClick={() => onUpgradeCity(p.vertexId)}
              >
                By på {p.vertexId}
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="midgame-section">
        <h3>Røverråd</h3>
        <p className="muted small">
          Anbefalte hex å legge røveren på (treffer motstandere, skåner deg).
        </p>
        <ol className="midgame-robber-list">
          {robberTips.map((tip, i) => (
            <li key={tip.key}>
              <button
                type="button"
                className={`btn btn-block midgame-robber-btn ${
                  midgame.robberHexKey === tip.key ? 'active' : ''
                }`}
                onClick={() => onSetRobber(tip.key)}
              >
                #{i + 1} {tip.resource ? RESOURCE_LABELS[tip.resource as keyof typeof RESOURCE_LABELS] ?? tip.resource : '?'}{' '}
                {tip.number} · {tip.reason}
              </button>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
