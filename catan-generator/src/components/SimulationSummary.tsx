import type { CSSProperties } from 'react';
import type { SimulationState } from '../catan/simulator';
import { PLAYER_COLORS } from '../catan/simulator';
import {
  PROD_RESOURCES,
  RESOURCE_COLORS,
  RESOURCE_LABELS,
  computeSimulationSummary,
  formatPercent,
  formatPerRoll,
  type PlayerStats,
} from '../catan/playerStats';

interface SimulationSummaryProps {
  state: SimulationState;
}

const DICE_NUMBERS = [2, 3, 4, 5, 6, 8, 9, 10, 11, 12] as const;

const RANK_MEDALS = ['🥇', '🥈', '🥉'] as const;

function ShareDonut({
  players,
  tableTotal,
}: {
  players: PlayerStats[];
  tableTotal: number;
}) {
  let cursor = 0;
  const stops = players.map((p) => {
    const start = cursor;
    cursor += p.shareOfTable * 100;
    return `${PLAYER_COLORS[p.player]} ${start}% ${cursor}%`;
  });

  return (
    <div className="sim-share-donut-wrap">
      <div
        className="sim-share-donut"
        style={{ background: `conic-gradient(${stops.join(', ')})` }}
        role="img"
        aria-label="Fordeling av forventet produksjon"
      />
      <div className="sim-share-donut-hole">
        <span className="sim-share-donut-label">Bord totalt</span>
        <strong>{formatPerRoll(tableTotal)}</strong>
        <span className="sim-share-donut-sublabel">per kast</span>
      </div>
      <ul className="sim-share-legend">
        {players.map((p) => (
          <li key={p.player}>
            <span className="sim-legend-swatch" style={{ background: PLAYER_COLORS[p.player] }} />
            <span>{p.name}</span>
            <strong>{formatPercent(p.shareOfTable)}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Leaderboard({ players }: { players: PlayerStats[] }) {
  const max = players[0]?.combined.totalPerRoll ?? 1;

  return (
    <div className="sim-leaderboard">
      {players.map((p, index) => {
        const width = (p.combined.totalPerRoll / max) * 100;
        return (
          <div key={p.player} className="sim-leaderboard-row">
            <span className="sim-leaderboard-rank">
              {index < 3 ? RANK_MEDALS[index] : `#${index + 1}`}
            </span>
            <div className="sim-leaderboard-body">
              <div className="sim-leaderboard-meta">
                <span
                  className="player-stat-dot"
                  style={{ backgroundColor: PLAYER_COLORS[p.player] }}
                />
                <strong>{p.name}</strong>
                <span>{formatPerRoll(p.combined.totalPerRoll)} / kast</span>
              </div>
              <div className="sim-leaderboard-track">
                <div
                  className="sim-leaderboard-fill"
                  style={{
                    width: `${width}%`,
                    background: `linear-gradient(90deg, ${PLAYER_COLORS[p.player]}, ${PLAYER_COLORS[p.player]}cc)`,
                  }}
                />
              </div>
            </div>
            <span className="sim-leaderboard-share">{formatPercent(p.shareOfTable)}</span>
          </div>
        );
      })}
    </div>
  );
}

function HighlightCards({ players }: { players: PlayerStats[] }) {
  const byProduction = [...players].sort(
    (a, b) => b.combined.totalPerRoll - a.combined.totalPerRoll
  );
  const byCoverage = [...players].sort(
    (a, b) => b.combined.resourceCount - a.combined.resourceCount
  );
  const byHot = [...players].sort(
    (a, b) => b.combined.hotNumberCount - a.combined.hotNumberCount
  );

  const cards = [
    {
      title: 'Sterkest produksjon',
      player: byProduction[0],
      detail: `${formatPerRoll(byProduction[0].combined.totalPerRoll)} per kast`,
    },
    {
      title: 'Best ressursdekning',
      player: byCoverage[0],
      detail: `${byCoverage[0].combined.resourceCount}/5 typer`,
    },
    {
      title: 'Flest 6/8-noder',
      player: byHot[0],
      detail: `${byHot[0].combined.hotNumberCount} hete tall`,
    },
  ];

  return (
    <div className="sim-highlight-grid">
      {cards.map((card) => (
        <div
          key={card.title}
          className="sim-highlight-card"
          style={{ borderColor: PLAYER_COLORS[card.player.player] }}
        >
          <span className="sim-highlight-title">{card.title}</span>
          <strong style={{ color: PLAYER_COLORS[card.player.player] }}>{card.player.name}</strong>
          <span className="sim-highlight-detail">{card.detail}</span>
        </div>
      ))}
    </div>
  );
}

function ResourceMixBar({ stats }: { stats: PlayerStats }) {
  const total = PROD_RESOURCES.reduce((s, r) => s + stats.combined.byResource[r], 0);
  if (total <= 0) return null;

  return (
    <div className="sim-resource-mix" title="Ressursmiks per kast">
      {PROD_RESOURCES.map((resource) => {
        const share = stats.combined.byResource[resource] / total;
        if (share <= 0) return null;
        return (
          <div
            key={resource}
            className="sim-resource-mix-segment"
            style={{
              width: `${share * 100}%`,
              backgroundColor: RESOURCE_COLORS[resource],
            }}
            title={`${RESOURCE_LABELS[resource]}: ${formatPerRoll(stats.combined.byResource[resource])}`}
          />
        );
      })}
    </div>
  );
}

function ResourceLegend() {
  return (
    <div className="sim-resource-mix-legend">
      {PROD_RESOURCES.map((r) => (
        <span key={r}>
          <i style={{ background: RESOURCE_COLORS[r] }} />
          {RESOURCE_LABELS[r]}
        </span>
      ))}
    </div>
  );
}

function NumberHeatmap({ stats }: { stats: PlayerStats }) {
  const max = Math.max(...DICE_NUMBERS.map((n) => stats.combined.byNumber[n] ?? 0), 0.001);

  return (
    <div className="sim-number-heat">
      {DICE_NUMBERS.map((num) => {
        const value = stats.combined.byNumber[num] ?? 0;
        const intensity = value / max;
        const isHot = num === 6 || num === 8;
        return (
          <div
            key={num}
            className={`sim-number-cell ${isHot ? 'hot' : ''}`}
            style={{
              background: isHot
                ? `rgba(192, 57, 43, ${0.15 + intensity * 0.75})`
                : `rgba(26, 82, 118, ${0.08 + intensity * 0.55})`,
            }}
            title={`${num}: ${formatPerRoll(value)} per kast`}
          >
            <span>{num}</span>
          </div>
        );
      })}
    </div>
  );
}

function PlayerCard({
  stats,
  rank,
}: {
  stats: PlayerStats;
  rank: number;
}) {
  const startingTotal = PROD_RESOURCES.reduce(
    (s, r) => s + stats.startingResources[r],
    0
  );
  const color = PLAYER_COLORS[stats.player];

  return (
    <article
      className="player-stat-card sim-player-card"
      style={{ '--player-color': color } as CSSProperties}
    >
      <header className="sim-player-card-header">
        <span className="sim-player-rank">{rank <= 3 ? RANK_MEDALS[rank - 1] : rank}</span>
        <div>
          <strong>{stats.name}</strong>
          <span>{formatPercent(stats.shareOfTable)} av bordets produksjon</span>
        </div>
        <div className="sim-player-card-score">
          <span>Per kast</span>
          <strong>{formatPerRoll(stats.combined.totalPerRoll)}</strong>
        </div>
      </header>

      <ResourceMixBar stats={stats} />

      <div className="sim-player-stats-row">
        <div className="sim-stat-pill">
          <span>Dekning</span>
          <strong>{stats.combined.resourceCount}/5</strong>
        </div>
        <div className="sim-stat-pill">
          <span>6 / 8</span>
          <strong>{stats.combined.hotNumberCount}</strong>
        </div>
        <div className="sim-stat-pill">
          <span>Starthånd</span>
          <strong>{formatPerRoll(startingTotal)}</strong>
        </div>
        <div className="sim-stat-pill">
          <span>Havner</span>
          <strong>{stats.harbors.length || '–'}</strong>
        </div>
      </div>

      <h4>Talltreff per kast</h4>
      <NumberHeatmap stats={stats} />

      {stats.harbors.length > 0 && (
        <div className="sim-harbor-pills">
          {stats.harbors.map((h) => (
            <span key={`${h.name}-${h.fromSettlement}`} className="sim-harbor-pill">
              {h.ratio} · {h.name}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}

export function SimulationSummaryPanel({ state }: SimulationSummaryProps) {
  const summary = computeSimulationSummary(state);
  const ranked = [...summary.players].sort(
    (a, b) => b.combined.totalPerRoll - a.combined.totalPerRoll
  );

  return (
    <div className="simulation-summary">
      <header className="sim-summary-hero">
        <h2>Resultat etter plassering</h2>
        <p className="muted small">
          Forventet ressursinntekt per terningkast – sannsynlighet × produserende hexer
          for begge landsbyer.
        </p>
      </header>

      <div className="sim-summary-dashboard">
        <ShareDonut players={summary.players} tableTotal={summary.tableTotalPerRoll} />
        <div className="sim-summary-main">
          <h3>Rangering</h3>
          <Leaderboard players={ranked} />
        </div>
      </div>

      <HighlightCards players={summary.players} />

      <ResourceLegend />

      <div className="player-stat-grid">
        {ranked.map((p, index) => (
          <PlayerCard key={p.player} stats={p} rank={index + 1} />
        ))}
      </div>
    </div>
  );
}
