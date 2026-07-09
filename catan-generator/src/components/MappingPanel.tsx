import { useState } from 'react';
import type { BoardMapping } from '../catan/mapping';
import { formatCoord } from '../catan/mapping';

interface MappingPanelProps {
  mapping: BoardMapping;
  onHighlightEdge: (label: string | null) => void;
  onHighlightCorner: (label: string | null) => void;
}

export function MappingPanel({
  mapping,
  onHighlightEdge,
  onHighlightCorner,
}: MappingPanelProps) {
  const [tab, setTab] = useState<'edge' | 'corner'>('edge');

  return (
    <div className="panel mapping-panel">
      <h2>Kartlegging (midlertidig)</h2>
      <p className="muted small">
        <strong>K1–K18</strong> = kanthexer med lokale hjørner 0–5 (gul = mot
        land). <strong>H1–H30</strong> = hjørner der kanthex og landhex møtes.
      </p>

      <div className="mapping-tabs">
        <button
          type="button"
          className={tab === 'edge' ? 'active' : ''}
          onClick={() => setTab('edge')}
        >
          Kanthexer ({mapping.edgeHexes.length})
        </button>
        <button
          type="button"
          className={tab === 'corner' ? 'active' : ''}
          onClick={() => setTab('corner')}
        >
          Hjørner ({mapping.coastCorners.length})
        </button>
      </div>

      {tab === 'edge' && (
        <ul className="mapping-list">
          {mapping.edgeHexes.map((edge) => (
            <li key={edge.label}>
              <button
                type="button"
                className="mapping-row"
                onMouseEnter={() => onHighlightEdge(edge.label)}
                onMouseLeave={() => onHighlightEdge(null)}
                onFocus={() => onHighlightEdge(edge.label)}
                onBlur={() => onHighlightEdge(null)}
              >
                <strong>{edge.label}</strong>
                <span>{formatCoord(edge.coord)}</span>
                <span className="mapping-detail">
                  Land-hjørner: [{edge.landCorners.join(', ')}] · Vann: [
                  {edge.waterCorners.join(', ')}]
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {tab === 'corner' && (
        <ul className="mapping-list">
          {mapping.coastCorners.map((corner) => (
            <li key={corner.label}>
              <button
                type="button"
                className="mapping-row"
                onMouseEnter={() => onHighlightCorner(corner.label)}
                onMouseLeave={() => onHighlightCorner(null)}
                onFocus={() => onHighlightCorner(corner.label)}
                onBlur={() => onHighlightCorner(null)}
              >
                <strong>{corner.label}</strong>
                <span>
                  {corner.edgeHexLabels.join(' + ')} ↔{' '}
                  {corner.landCoords.map(formatCoord).join(', ')}
                </span>
                <span className="mapping-detail">
                  Anker {formatCoord(corner.anchor)} hjørne {corner.corner}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
