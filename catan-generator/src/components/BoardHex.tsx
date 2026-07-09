import type { HexCoord } from '../catan/types';
import { hexCorner } from '../catan/hex';

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

interface BoardHexProps {
  coord: HexCoord;
  resource: string;
  number: number | null;
  size: number;
}

export function BoardHex({ coord, resource, number, size }: BoardHexProps) {
  const points = Array.from({ length: 6 }, (_, i) => {
    const { x, y } = hexCorner(coord, i, size);
    return `${x},${y}`;
  }).join(' ');

  const cx = Math.sqrt(3) * size * (coord.q + coord.r / 2);
  const cy = size * (3 / 2) * coord.r;

  const fill = RESOURCE_COLORS[resource] ?? '#ccc';
  const isDesert = resource === 'desert';

  return (
    <g className="hex-tile">
      <polygon
        points={points}
        fill={fill}
        stroke="#2b2b2b"
        strokeWidth={2}
      />
      <text
        x={cx}
        y={cy - 8}
        textAnchor="middle"
        className="hex-resource-label"
        fill={isDesert ? '#5c4a1f' : '#fff'}
        fontSize={9}
        fontWeight={600}
      >
        {RESOURCE_LABELS[resource] ?? resource}
      </text>
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
