import type { HexCoord, HexKind, ResourceType } from '../catan/types';
import { hexCorner } from '../catan/hex';
import oreTile from '../assets/tiles/ore.png';

const RESOURCE_COLORS: Record<string, string> = {
  wood: '#2d6a4f',
  brick: '#c1440e',
  sheep: '#95d5b2',
  wheat: '#f4d35e',
  ore: '#6c757d',
  desert: '#e9c46a',
};

const RESOURCE_LABELS: Record<string, string> = {
  wood: 'Tømmer',
  brick: 'Tegl',
  sheep: 'Ull',
  wheat: 'Korn',
  ore: 'Malm',
  desert: 'Ørken',
};

const RESOURCE_IMAGES: Partial<Record<ResourceType, string>> = {
  ore: oreTile,
};

const EDGE_FILL = '#3498db';
const EDGE_STROKE = '#2471a3';

interface BoardHexProps {
  coord: HexCoord;
  kind: HexKind;
  resource: ResourceType | null;
  number: number | null;
  size: number;
}

function hexPoints(coord: HexCoord, size: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const { x, y } = hexCorner(coord, i, size);
    return `${x},${y}`;
  }).join(' ');
}

function hexBounds(coord: HexCoord, size: number) {
  const corners = Array.from({ length: 6 }, (_, i) => hexCorner(coord, i, size));
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

function hexImageRect(coord: HexCoord, size: number) {
  const { minX, maxX, minY, maxY } = hexBounds(coord, size);
  const pad = size * 0.06;
  return {
    x: minX - pad,
    y: minY - pad,
    width: maxX - minX + pad * 2,
    height: maxY - minY + pad * 2,
  };
}

export function BoardHex({ coord, kind, resource, number, size }: BoardHexProps) {
  const points = hexPoints(coord, size);
  const cx = Math.sqrt(3) * size * (coord.q + coord.r / 2);
  const cy = size * (3 / 2) * coord.r;
  const clipId = `hex-clip-${coord.q}-${coord.r}`;

  if (kind === 'edge') {
    return (
      <g className="hex-tile hex-edge">
        <polygon points={points} fill={EDGE_FILL} stroke={EDGE_STROKE} strokeWidth={2} />
      </g>
    );
  }

  const tileImage = resource ? RESOURCE_IMAGES[resource] : undefined;
  const fill = RESOURCE_COLORS[resource ?? ''] ?? '#ccc';
  const isDesert = resource === 'desert';

  return (
    <g className="hex-tile hex-land" aria-label={RESOURCE_LABELS[resource ?? ''] ?? resource ?? ''}>
      {tileImage ? (
        <>
          <defs>
            <clipPath id={clipId}>
              <polygon points={points} />
            </clipPath>
          </defs>
          {(() => {
            const rect = hexImageRect(coord, size);
            return (
              <image
                href={tileImage}
                x={rect.x}
                y={rect.y}
                width={rect.width}
                height={rect.height}
                clipPath={`url(#${clipId})`}
                preserveAspectRatio="xMidYMid slice"
              />
            );
          })()}
        </>
      ) : (
        <polygon points={points} fill={fill} stroke="#2b2b2b" strokeWidth={2} />
      )}

      {!tileImage && <polygon points={points} fill="none" stroke="#2b2b2b" strokeWidth={2} />}

      {!tileImage && (
        <text
          x={cx}
          y={cy - 8}
          textAnchor="middle"
          className="hex-resource-label"
          fill={isDesert ? '#5c4a1f' : '#fff'}
          fontSize={9}
          fontWeight={600}
        >
          {RESOURCE_LABELS[resource ?? ''] ?? resource}
        </text>
      )}

      {!isDesert && number !== null && (
        <>
          <circle
            cx={cx}
            cy={cy + 6}
            r={size * 0.32}
            fill={number === 6 || number === 8 ? '#c0392b' : '#f5f0e1'}
            stroke="#2b2b2b"
            strokeWidth={1.5}
          />
          <text
            x={cx}
            y={cy + 11}
            textAnchor="middle"
            fill={number === 6 || number === 8 ? '#fff' : '#1a1a1a'}
            fontSize={size * 0.38}
            fontWeight={700}
          >
            {number}
          </text>
        </>
      )}

      {isDesert && (
        <text x={cx} y={cy + 12} textAnchor="middle" fontSize={18}>
          🌵
        </text>
      )}
    </g>
  );
}
