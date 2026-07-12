import type { HexCoord, HexKind, ResourceType } from '../catan/types';
import { hexCorner, hexToPixel } from '../catan/hex';
import { RESOURCE_TILE_IMAGES } from '../assets/tiles';

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

const EDGE_FILL = '#3498db';
const EDGE_STROKE = '#2471a3';

/** Roterer flate brikke-PNG-er til pointy-top hex på brettet */
const TILE_IMAGE_ROTATION = 30;
/** Kvadrat stort nok til å fylle hex etter rotasjon (preserveAspectRatio slice) */
const TILE_IMAGE_SCALE = 1.75;

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

export function BoardHex({ coord, kind, resource, number, size }: BoardHexProps) {
  const points = hexPoints(coord, size);
  const { x: cx, y: cy } = hexToPixel(coord, size);
  const clipId = `hex-clip-${coord.q}-${coord.r}`;

  if (kind === 'edge') {
    return (
      <g className="hex-tile hex-edge">
        <polygon points={points} fill={EDGE_FILL} stroke={EDGE_STROKE} strokeWidth={2} />
      </g>
    );
  }

  const tileImage = resource ? RESOURCE_TILE_IMAGES[resource] : undefined;
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
          <g clipPath={`url(#${clipId})`}>
            <image
              href={tileImage}
              x={cx - (size * TILE_IMAGE_SCALE) / 2}
              y={cy - (size * TILE_IMAGE_SCALE) / 2}
              width={size * TILE_IMAGE_SCALE}
              height={size * TILE_IMAGE_SCALE}
              preserveAspectRatio="xMidYMid slice"
              transform={`rotate(${TILE_IMAGE_ROTATION} ${cx} ${cy})`}
            />
          </g>
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

      {isDesert && !tileImage && (
        <text x={cx} y={cy + 12} textAnchor="middle" fontSize={18}>
          🌵
        </text>
      )}
    </g>
  );
}
