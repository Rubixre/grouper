import type { HarborType } from '../catan/types';

const HARBOR_THEME: Record<
  string,
  { fill: string; stroke: string; accent: string; label: string }
> = {
  generic: { fill: '#1a5276', stroke: '#0d3350', accent: '#85c1e9', label: '3:1' },
  wood: { fill: '#2d6a4f', stroke: '#1b4332', accent: '#95d5b2', label: '2:1' },
  brick: { fill: '#c1440e', stroke: '#7d2e08', accent: '#f4a261', label: '2:1' },
  sheep: { fill: '#40916c', stroke: '#2d6a4f', accent: '#f8faf8', label: '2:1' },
  wheat: { fill: '#e9a319', stroke: '#b7791f', accent: '#fef3c7', label: '2:1' },
  ore: { fill: '#5c6b73', stroke: '#3d474d', accent: '#d5d8dc', label: '2:1' },
};

function themeFor(harbor: HarborType) {
  if (harbor.kind === 'generic') return HARBOR_THEME.generic;
  return HARBOR_THEME[harbor.resource] ?? HARBOR_THEME.generic;
}

export function getHarborTheme(harbor: HarborType) {
  return themeFor(harbor);
}

/** Stable trestokker */
function WoodGlyph() {
  return (
    <g className="harbor-glyph harbor-glyph-wood">
      <rect x={-9} y={-2} width={5} height={14} rx={1.2} fill="#6b3f1f" stroke="#3e2414" strokeWidth={0.6} />
      <rect x={-2} y={-4} width={5} height={16} rx={1.2} fill="#8b5a2b" stroke="#4a3018" strokeWidth={0.6} />
      <rect x={5} y={-1} width={5} height={13} rx={1.2} fill="#7a4a24" stroke="#3e2414" strokeWidth={0.6} />
      <ellipse cx={-6.5} cy={-3} rx={2.4} ry={1.2} fill="#a0714f" />
      <ellipse cx={0.5} cy={-5} rx={2.4} ry={1.2} fill="#a0714f" />
      <ellipse cx={7.5} cy={-2} rx={2.4} ry={1.2} fill="#a0714f" />
    </g>
  );
}

/** Teglstein */
function BrickGlyph() {
  return (
    <g className="harbor-glyph harbor-glyph-brick">
      <rect x={-10} y={-3} width={8} height={5} rx={0.6} fill="#d35400" stroke="#7d2e08" strokeWidth={0.6} />
      <rect x={0} y={-3} width={10} height={5} rx={0.6} fill="#e67e22" stroke="#7d2e08" strokeWidth={0.6} />
      <rect x={-6} y={3} width={9} height={5} rx={0.6} fill="#e67e22" stroke="#7d2e08" strokeWidth={0.6} />
      <rect x={4} y={3} width={7} height={5} rx={0.6} fill="#d35400" stroke="#7d2e08" strokeWidth={0.6} />
    </g>
  );
}

/** Sau */
function SheepGlyph() {
  return (
    <g className="harbor-glyph harbor-glyph-sheep">
      <ellipse cx={0} cy={2} rx={9} ry={6.5} fill="#f4f6f4" stroke="#5c6b63" strokeWidth={0.8} />
      <circle cx={-7} cy={1} r={3.8} fill="#f4f6f4" stroke="#5c6b63" strokeWidth={0.7} />
      <circle cx={7} cy={1} r={3.8} fill="#f4f6f4" stroke="#5c6b63" strokeWidth={0.7} />
      <ellipse cx={-9} cy={2} rx={3.2} ry={2.6} fill="#eceeed" stroke="#5c6b63" strokeWidth={0.6} />
      <circle cx={-10.5} cy={1.5} r={1} fill="#2d3436" />
      <circle cx={-9.5} cy={1.5} r={1} fill="#2d3436" />
      <path d="M-11 3.5 Q-9.5 4.5 -8 3.5" fill="none" stroke="#5c6b63" strokeWidth={0.5} />
      <rect x={-10.8} y={4} width={1.2} height={3} rx={0.4} fill="#5c6b63" />
      <rect x={-9.2} y={4} width={1.2} height={3} rx={0.4} fill="#5c6b63" />
    </g>
  );
}

/** Hveteaks */
function WheatGlyph() {
  return (
    <g className="harbor-glyph harbor-glyph-wheat">
      <path d="M0 10 L0 -6" stroke="#b7791f" strokeWidth={1.6} strokeLinecap="round" />
      <ellipse cx={-3.5} cy={-4} rx={2.4} ry={5} fill="#f4d35e" stroke="#b7791f" strokeWidth={0.6} transform="rotate(-18 -3.5 -4)" />
      <ellipse cx={0} cy={-6.5} rx={2.4} ry={5.2} fill="#f9e076" stroke="#b7791f" strokeWidth={0.6} />
      <ellipse cx={3.5} cy={-4} rx={2.4} ry={5} fill="#f4d35e" stroke="#b7791f" strokeWidth={0.6} transform="rotate(18 3.5 -4)" />
      <ellipse cx={-2} cy={0} rx={2} ry={4.2} fill="#f4d35e" stroke="#b7791f" strokeWidth={0.5} transform="rotate(-24 -2 0)" />
      <ellipse cx={2} cy={0} rx={2} ry={4.2} fill="#f4d35e" stroke="#b7791f" strokeWidth={0.5} transform="rotate(24 2 0)" />
    </g>
  );
}

/** Malmstein */
function OreGlyph() {
  return (
    <g className="harbor-glyph harbor-glyph-ore">
      <path d="M-10 7 L-5 -6 L0 1 L5 -7 L10 7 Z" fill="#95a5a6" stroke="#4a5560" strokeWidth={0.8} />
      <path d="M-6 7 L-3 0 L2 7 Z" fill="#bdc3c7" opacity={0.7} />
      <path d="M1 7 L5 -1 L9 7 Z" fill="#7f8c8d" opacity={0.65} />
      <path d="M-2 -4 L1 -7 L4 -3 Z" fill="#ecf0f1" opacity={0.85} />
    </g>
  );
}

/** 3:1 generisk – anker */
function GenericHarborGlyph() {
  return (
    <g className="harbor-glyph harbor-glyph-generic">
      <circle cx={0} cy={0} r={7} fill="none" stroke="#85c1e9" strokeWidth={1.6} />
      <path
        d="M0 -8 L0 4 M-5 0 Q0 6 5 0 M-3 4 L3 4"
        fill="none"
        stroke="#d6eaf8"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={0} cy={-5} r={2.2} fill="none" stroke="#d6eaf8" strokeWidth={1.4} />
    </g>
  );
}

function HarborGlyph({ harbor }: { harbor: HarborType }) {
  if (harbor.kind === 'generic') return <GenericHarborGlyph />;
  switch (harbor.resource) {
    case 'wood':
      return <WoodGlyph />;
    case 'brick':
      return <BrickGlyph />;
    case 'sheep':
      return <SheepGlyph />;
    case 'wheat':
      return <WheatGlyph />;
    case 'ore':
      return <OreGlyph />;
  }
}

interface HarborIconProps {
  harbor: HarborType;
  size: number;
  title?: string;
}

export function HarborIcon({ harbor, size, title }: HarborIconProps) {
  const theme = themeFor(harbor);
  const ratio = theme.label;
  const w = size * 0.95;
  const h = size * 1.05;
  const glyphScale = size / 36;

  return (
    <g className="harbor-icon" aria-label={title}>
      <ellipse cx={0} cy={h * 0.08} rx={w * 0.52} ry={h * 0.1} fill="rgba(0,0,0,0.22)" />
      <rect
        x={-w / 2}
        y={-h / 2}
        width={w}
        height={h}
        rx={h * 0.14}
        fill={theme.fill}
        stroke="#fff"
        strokeWidth={2.2}
      />
      <rect
        x={-w / 2 + 3}
        y={-h / 2 + 3}
        width={w - 6}
        height={h * 0.58}
        rx={h * 0.1}
        fill="rgba(255,255,255,0.12)"
      />
      <g transform={`translate(0 ${-h * 0.06}) scale(${glyphScale})`}>
        <HarborGlyph harbor={harbor} />
      </g>
      <text
        x={0}
        y={h * 0.34}
        textAnchor="middle"
        fill="#fff"
        fontSize={size * 0.34}
        fontWeight={900}
        letterSpacing={0.5}
        stroke={theme.stroke}
        strokeWidth={1.2}
        paintOrder="stroke"
      >
        {ratio}
      </text>
      {title && <title>{title}</title>}
    </g>
  );
}
