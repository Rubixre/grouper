import type { BoardStory } from '../catan/boardStory';

interface BoardStoryPanelProps {
  story: BoardStory;
}

export function BoardStoryPanel({ story }: BoardStoryPanelProps) {
  return (
    <section className="panel board-story" aria-label={`Øya ${story.islandName}`}>
      <p className="board-story-realm muted small">En øy i Catanøyriket</p>
      <h2 className="board-story-name">{story.islandName}</h2>
      <p className="board-story-epithet">{story.epithet}</p>
      <p className="board-story-narrative">{story.narrative}</p>
      {story.highlights.length > 0 && (
        <ul className="board-story-traits">
          {story.highlights.map((trait) => (
            <li key={`${trait.id}-${trait.resource ?? 'none'}`}>
              <strong>{trait.headline}</strong>
              <span>{trait.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
