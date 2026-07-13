import type { BoardStory } from '../catan/boardStory';
import { RESOURCE_COLORS } from '../catan/playerStats';

interface BoardStoryPanelProps {
  story: BoardStory;
}

function fairnessLabel(ratio: number): string {
  if (ratio >= 1.18) return 'sterk';
  if (ratio <= 0.85) return 'svak';
  return 'normal';
}

function desertLabel(placement: BoardStory['stats']['desertPlacement']): string {
  if (placement === 'center') return 'I midten';
  if (placement === 'rim') return 'Mot kanten';
  return 'Ingen';
}

export function BoardStoryPanel({ story }: BoardStoryPanelProps) {
  const { stats } = story;

  return (
    <section className="panel board-story" aria-label={`Øya ${story.islandName}`}>
      <p className="board-story-realm muted small">En øy i Catanøyriket</p>
      <h2 className="board-story-name">{story.islandName}</h2>
      <p className="board-story-epithet">{story.epithet}</p>
      <p className="board-story-narrative">{story.narrative}</p>

      <div className="board-stats">
        <h3 className="board-stats-title">Brettstatistikk</h3>
        <table className="board-stats-table">
          <thead>
            <tr>
              <th>Ressurs</th>
              <th>Felt</th>
              <th>Forventet</th>
              <th>Andel</th>
              <th>Styrke</th>
            </tr>
          </thead>
          <tbody>
            {stats.resources.map((row) => (
              <tr key={row.resource}>
                <td>
                  <span
                    className="board-stats-swatch"
                    style={{ background: RESOURCE_COLORS[row.resource] }}
                    aria-hidden
                  />
                  {row.label[0]!.toUpperCase() + row.label.slice(1)}
                </td>
                <td>{row.tileCount}</td>
                <td>{row.expectedProduction.toFixed(2)}</td>
                <td>
                  <div className="board-stats-share">
                    <span
                      className="board-stats-share-bar"
                      style={{
                        width: `${Math.round(row.share * 100)}%`,
                        background: RESOURCE_COLORS[row.resource],
                      }}
                    />
                    <span>{Math.round(row.share * 100)}%</span>
                  </div>
                </td>
                <td>
                  <span className={`board-stats-strength is-${fairnessLabel(row.fairnessRatio)}`}>
                    {fairnessLabel(row.fairnessRatio)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="board-stats-footnote muted small">
          Forventet = sum av terningssannsynligheter. Styrke sammenligner med jevn fordeling
          for antall felt. Ørken: {desertLabel(stats.desertPlacement)}.
        </p>
      </div>
    </section>
  );
}
