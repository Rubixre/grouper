import type { SimulationState } from '../catan/simulator';
import { getPlayerConfig } from '../catan/playerConfig';
import {
  RESOURCE_COLORS,
  computePlacementAwards,
  computeSimulationSummary,
  type PlacementAward,
} from '../catan/playerStats';

interface SimulationSummaryProps {
  state: SimulationState;
}

function WinnerNames({
  award,
  config,
}: {
  award: PlacementAward;
  config: SimulationState['config'];
}) {
  if (award.winners.length === 0) {
    return <span className="sim-award-empty">—</span>;
  }

  return (
    <div className="sim-award-winners">
      {award.winners.map((winner, index) => {
        const color = getPlayerConfig(config, winner.player).color;
        return (
          <span key={winner.player} className="sim-award-winner">
            {index > 0 && <span className="sim-award-tie-sep">·</span>}
            <span className="sim-award-dot" style={{ background: color }} />
            <strong style={{ color }}>{winner.name}</strong>
          </span>
        );
      })}
      {award.winners.length > 1 && (
        <span className="sim-award-tie-label">delt</span>
      )}
    </div>
  );
}

function AwardCard({
  award,
  config,
}: {
  award: PlacementAward;
  config: SimulationState['config'];
}) {
  const accent =
    award.winners.length === 1
      ? getPlayerConfig(config, award.winners[0]!.player).color
      : award.winners.length > 1
        ? '#8a7340'
        : '#9aa7b2';

  return (
    <article className="sim-award-card" style={{ borderColor: accent }}>
      <span className="sim-award-title">{award.title}</span>
      <WinnerNames award={award} config={config} />
      <span className="sim-award-value">{award.valueLabel}</span>
    </article>
  );
}

function ResourceCrownRow({
  award,
  config,
}: {
  award: PlacementAward;
  config: SimulationState['config'];
}) {
  const resourceKey = award.id.replace('resource-', '') as keyof typeof RESOURCE_COLORS;
  const swatch = RESOURCE_COLORS[resourceKey] ?? '#888';

  return (
    <div className="sim-crown-row">
      <span className="sim-crown-resource">
        <i style={{ background: swatch }} />
        {award.title}
      </span>
      <WinnerNames award={award} config={config} />
      <span className="sim-crown-value">{award.valueLabel}</span>
    </div>
  );
}

export function SimulationSummaryPanel({ state }: SimulationSummaryProps) {
  const summary = computeSimulationSummary(state);
  const { awards, resourceCrowns, boardFacts } = computePlacementAwards(summary);

  return (
    <div className="simulation-summary">
      <header className="sim-summary-hero">
        <h2>Resultat etter plassering</h2>
        <p className="muted small">
          Vinnere på nøkkeltall — ved likhet er alle på topp markert som vinnere.
        </p>
      </header>

      <div className="sim-board-facts">
        {boardFacts.map((fact) => (
          <div key={fact.id} className="sim-board-fact">
            <span>{fact.label}</span>
            <strong>{fact.value}</strong>
          </div>
        ))}
      </div>

      <section className="sim-awards-section">
        <h3>Vinnere</h3>
        <div className="sim-awards-grid">
          {awards.map((award) => (
            <AwardCard key={award.id} award={award} config={state.config} />
          ))}
        </div>
      </section>

      {resourceCrowns.length > 0 && (
        <section className="sim-crowns-section">
          <h3>Ressurskonger</h3>
          <p className="muted small sim-crowns-hint">
            Høyest forventet inntekt per ressurs rundt bordet.
          </p>
          <div className="sim-crowns-list">
            {resourceCrowns.map((award) => (
              <ResourceCrownRow
                key={award.id}
                award={award}
                config={state.config}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
