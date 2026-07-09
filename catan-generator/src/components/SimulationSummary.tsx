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

const DICE_NUMBERS = [2, 3, 4, 5, 6, 8, 9, 10, 11, 12];

function ResourceBars({
  stats,
  maxValue,
}: {
  stats: PlayerStats;
  maxValue: number;
}) {
  return (
    <div className="resource-bars">
      {PROD_RESOURCES.map((resource) => {
        const value = stats.combined.byResource[resource];
        const width = maxValue > 0 ? (value / maxValue) * 100 : 0;
        return (
          <div key={resource} className="resource-bar-row">
            <span className="resource-bar-label">{RESOURCE_LABELS[resource]}</span>
            <div className="resource-bar-track">
              <div
                className="resource-bar-fill"
                style={{
                  width: `${width}%`,
                  backgroundColor: RESOURCE_COLORS[resource],
                }}
              />
            </div>
            <span className="resource-bar-value">{formatPerRoll(value)}</span>
          </div>
        );
      })}
    </div>
  );
}

function NumberDistribution({ stats }: { stats: PlayerStats }) {
  const maxNum = Math.max(
    ...DICE_NUMBERS.map((n) => stats.combined.byNumber[n] ?? 0),
    0.001
  );

  return (
    <div className="number-bars">
      {DICE_NUMBERS.map((num) => {
        const value = stats.combined.byNumber[num] ?? 0;
        const width = (value / maxNum) * 100;
        const isHot = num === 6 || num === 8;
        return (
          <div key={num} className="number-bar-col" title={`${formatPerRoll(value)} per kast`}>
            <div className="number-bar-track">
              <div
                className={`number-bar-fill ${isHot ? 'hot' : ''}`}
                style={{ height: `${width}%` }}
              />
            </div>
            <span className={`number-bar-label ${isHot ? 'hot' : ''}`}>{num}</span>
          </div>
        );
      })}
    </div>
  );
}

function PlayerCard({ stats, maxResource }: { stats: PlayerStats; maxResource: number }) {
  const startingTotal = PROD_RESOURCES.reduce(
    (s, r) => s + stats.startingResources[r],
    0
  );

  return (
    <article className="player-stat-card">
      <header className="player-stat-header">
        <span className="player-stat-dot" style={{ backgroundColor: PLAYER_COLORS[stats.player] }} />
        <strong>{stats.name}</strong>
        <span className="player-stat-share">{formatPercent(stats.shareOfTable)} av bordet</span>
      </header>

      <div className="player-stat-metrics">
        <div className="metric-chip">
          <span className="metric-label">Forventet per kast</span>
          <span className="metric-value">{formatPerRoll(stats.combined.totalPerRoll)}</span>
        </div>
        <div className="metric-chip">
          <span className="metric-label">Ressurstyper</span>
          <span className="metric-value">{stats.combined.resourceCount}/5</span>
        </div>
        <div className="metric-chip">
          <span className="metric-label">6/8-noder</span>
          <span className="metric-value">{stats.combined.hotNumberCount}</span>
        </div>
        <div className="metric-chip">
          <span className="metric-label">Starthånd (2. landsby)</span>
          <span className="metric-value">{formatPerRoll(startingTotal)}</span>
        </div>
      </div>

      <h4>Ressursfordeling per kast</h4>
      <ResourceBars stats={stats} maxValue={maxResource} />

      <h4>Tallfordeling</h4>
      <p className="muted small">
        Forventet vektet treff per kast (summerer begge landsbyer).
      </p>
      <NumberDistribution stats={stats} />

      {stats.harbors.length > 0 && (
        <>
          <h4>Havner</h4>
          <ul className="harbor-access-list">
            {stats.harbors.map((h) => (
              <li key={`${h.name}-${h.fromSettlement}`}>
                <strong>{h.name}</strong> ({h.ratio}) – landsby {h.fromSettlement}
              </li>
            ))}
          </ul>
        </>
      )}
    </article>
  );
}

export function SimulationSummaryPanel({ state }: SimulationSummaryProps) {
  const summary = computeSimulationSummary(state);
  const maxResource = Math.max(
    ...summary.players.flatMap((p) => PROD_RESOURCES.map((r) => p.combined.byResource[r])),
    0.001
  );

  const tableResourceMax = Math.max(...PROD_RESOURCES.map((r) => summary.resourceTotals[r]), 0.001);

  return (
    <div className="simulation-summary">
      <h2>Statistikk etter simulering</h2>
      <p className="muted small">
        Forventet ressursinntekt per terningkast (sannsynlighet × antall produserende
        hexer). Tallene er statistiske forventninger, ikke faktiske kast.
      </p>

      <div className="table-overview panel-inner">
        <h3>Sammenligning</h3>
        <table className="stats-table">
          <thead>
            <tr>
              <th>Spiller</th>
              <th>Per kast</th>
              <th>Andel</th>
              <th>Dekning</th>
              <th>6/8</th>
              <th>Havner</th>
            </tr>
          </thead>
          <tbody>
            {summary.players.map((p) => (
              <tr key={p.player}>
                <td>
                  <span
                    className="player-stat-dot inline"
                    style={{ backgroundColor: PLAYER_COLORS[p.player] }}
                  />
                  {p.name}
                </td>
                <td>{formatPerRoll(p.combined.totalPerRoll)}</td>
                <td>{formatPercent(p.shareOfTable)}</td>
                <td>{p.combined.resourceCount}/5</td>
                <td>{p.combined.hotNumberCount}</td>
                <td>{p.harbors.length || '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="table-resource-totals panel-inner">
        <h3>Ressurser på bordet (alle spillere)</h3>
        <div className="resource-bars compact">
          {PROD_RESOURCES.map((resource) => {
            const value = summary.resourceTotals[resource];
            const width = (value / tableResourceMax) * 100;
            return (
              <div key={resource} className="resource-bar-row">
                <span className="resource-bar-label">{RESOURCE_LABELS[resource]}</span>
                <div className="resource-bar-track">
                  <div
                    className="resource-bar-fill"
                    style={{
                      width: `${width}%`,
                      backgroundColor: RESOURCE_COLORS[resource],
                    }}
                  />
                </div>
                <span className="resource-bar-value">{formatPerRoll(value)}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="player-stat-grid">
        {summary.players.map((p) => (
          <PlayerCard key={p.player} stats={p} maxResource={maxResource} />
        ))}
      </div>
    </div>
  );
}
