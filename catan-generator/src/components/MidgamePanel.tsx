import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
          {t('midgame.title')}
          <span className="premium-badge">Premium</span>
        </h2>
        <button type="button" className="btn" onClick={onExit}>
          {t('midgame.exit')}
        </button>
      </div>

      <section className="midgame-section">
        <h3>{t('midgame.victoryPoints')}</h3>
        <ul className="midgame-vp-list">
          {vpRows.map((row) => (
            <li key={row.player}>
              <strong>
                {getPlayerName(config, row.player)}
                {row.player === human ? ` ${t('midgame.you')}` : ''}
              </strong>
              <span>
                {t('midgame.vpLine', {
                  total: row.totalVp,
                  lr: row.longestRoadBonus > 0 ? t('midgame.longestRoadTag') : '',
                  settlements: row.settlements,
                  cities: row.cities,
                })}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="midgame-section">
        <h3>{t('midgame.longestRoad')}</h3>
        <p className="muted small">
          {midgame.longestRoadPlayer == null
            ? t('midgame.holderNone')
            : `${getPlayerName(config, midgame.longestRoadPlayer)} (${
                roadRanks.find((r) => r.player === midgame.longestRoadPlayer)
                  ?.length ?? '—'
              })`}
        </p>
        <ul className="midgame-road-rank">
          {roadRanks.slice(0, 4).map((r) => (
            <li key={r.player}>
              {t('midgame.roadsCount', {
                name: getPlayerName(config, r.player),
                count: r.length,
              })}
            </li>
          ))}
        </ul>

        <label className="field">
          {t('midgame.addRoadFrom')}
          <select
            value={roadFrom ?? ''}
            onChange={(e) => setRoadFrom(e.target.value || null)}
          >
            <option value="">{t('midgame.chooseStart')}</option>
            {ownSettlements.map((p) => (
              <option key={p.vertexId} value={p.vertexId}>
                {p.isCity ? t('midgame.city') : t('midgame.settlement')}{' '}
                {p.vertexId}
              </option>
            ))}
          </select>
        </label>
        {roadFrom && (
          <div className="midgame-road-targets">
            {roadTargets.length === 0 ? (
              <p className="muted small">{t('midgame.noOpenRoads')}</p>
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
                  {t('midgame.toVertex', { id: to })}
                </button>
              ))
            )}
          </div>
        )}
      </section>

      <section className="midgame-section">
        <h3>{t('midgame.upgradeCity')}</h3>
        {upgradeable.length === 0 ? (
          <p className="muted small">{t('midgame.noUpgradeable')}</p>
        ) : (
          <div className="midgame-city-actions">
            {upgradeable.map((p) => (
              <button
                key={p.vertexId}
                type="button"
                className="btn primary"
                onClick={() => onUpgradeCity(p.vertexId)}
              >
                {t('midgame.cityOn', { id: p.vertexId })}
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="midgame-section">
        <h3>{t('midgame.robberAdvice')}</h3>
        <p className="muted small">{t('midgame.robberHint')}</p>
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
                #{i + 1}{' '}
                {tip.resource
                  ? t(`resources.${tip.resource}`, { defaultValue: tip.resource })
                  : '?'}{' '}
                {tip.number} · {tip.reason}
              </button>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
