import type { HarborType } from '../catan/types';

const HARBOR_THEME: Record<
  string,
  { fill: string; stroke: string; accent: string }
> = {
  generic: { fill: '#1a5276', stroke: '#0d3350', accent: '#85c1e9' },
  wood: { fill: '#2d6a4f', stroke: '#1b4332', accent: '#95d5b2' },
  brick: { fill: '#c1440e', stroke: '#7d2e08', accent: '#f4a261' },
  sheep: { fill: '#40916c', stroke: '#2d6a4f', accent: '#d8f3dc' },
  wheat: { fill: '#e9a319', stroke: '#b7791f', accent: '#fef3c7' },
  ore: { fill: '#5c6b73', stroke: '#3d474d', accent: '#adb5bd' },
};

function themeFor(harbor: HarborType) {
  if (harbor.kind === 'generic') return HARBOR_THEME.generic;
  return HARBOR_THEME[harbor.resource] ?? HARBOR_THEME.generic;
}

function GenericHarborGlyph({ accent }: { accent: string }) {
  return (
    <>
      <path
        d="M-8 4 L0 -7 L8 4 L5 4 L5 8 L-5 8 L-5 4 Z"
        fill={accent}
        stroke="#fff"
        strokeWidth={0.8}
      />
      <circle cx={0} cy={-2} r={2.2} fill="#fff" opacity={0.9} />
    </>
  );
}

function WoodGlyph({ accent }: { accent: string }) {
  return (
    <>
      <rect x={-3} y={2} width={6} height={8} rx={1} fill="#8b5a2b" stroke="#fff" strokeWidth={0.6} />
      <ellipse cx={0} cy={-1} rx={7} ry={5} fill={accent} stroke="#fff" strokeWidth={0.6} />
      <rect x={-1.2} y={-6} width={2.4} height={5} fill="#8b5a2b" />
    </>
  );
}

function BrickGlyph({ accent }: { accent: string }) {
  return (
    <>
      <rect x={-8} y={-2} width={7} height={4} fill={accent} stroke="#fff" strokeWidth={0.5} />
      <rect x={1} y={-2} width={7} height={4} fill={accent} stroke="#fff" strokeWidth={0.5} />
      <rect x={-4} y={3} width={7} height={4} fill={accent} stroke="#fff" strokeWidth={0.5} />
      <rect x={3} y={3} width={5} height={4} fill={accent} stroke="#fff" strokeWidth={0.5} />
    </>
  );
}

function SheepGlyph({ accent }: { accent: string }) {
  return (
    <>
      <ellipse cx={0} cy={1} rx={8} ry={6} fill={accent} stroke="#fff" strokeWidth={0.7} />
      <circle cx={-6} cy={0} r={3.2} fill={accent} stroke="#fff" strokeWidth={0.6} />
      <circle cx={6} cy={0} r={3.2} fill={accent} stroke="#fff" strokeWidth={0.6} />
      <circle cx={-7} cy={-1} r={1.2} fill="#2d6a4f" />
      <circle cx={-5} cy={-1} r={1.2} fill="#2d6a4f" />
    </>
  );
}

function WheatGlyph({ accent }: { accent: string }) {
  return (
    <>
      <path d="M0 8 L0 -4" stroke="#b7791f" strokeWidth={1.4} />
      <ellipse cx={-3} cy={-3} rx={2.2} ry={4} fill={accent} stroke="#fff" strokeWidth={0.5} />
      <ellipse cx={0} cy={-5} rx={2.2} ry={4} fill={accent} stroke="#fff" strokeWidth={0.5} />
      <ellipse cx={3} cy={-3} rx={2.2} ry={4} fill={accent} stroke="#fff" strokeWidth={0.5} />
    </>
  );
}

function OreGlyph({ accent }: { accent: string }) {
  return (
    <>
      <path d="M-9 6 L-4 -5 L0 2 L4 -6 L9 6 Z" fill={accent} stroke="#fff" strokeWidth={0.7} />
      <path d="M-5 6 L-2 -1 L2 6 Z" fill="#6c757d" opacity={0.55} />
      <path d="M2 6 L5 -2 L8 6 Z" fill="#495057" opacity={0.45} />
    </>
  );
}

function HarborGlyph({ harbor }: { harbor: HarborType }) {
  if (harbor.kind === 'generic') return <GenericHarborGlyph accent={HARBOR_THEME.generic.accent} />;
  switch (harbor.resource) {
    case 'wood':
      return <WoodGlyph accent={HARBOR_THEME.wood.accent} />;
    case 'brick':
      return <BrickGlyph accent={HARBOR_THEME.brick.accent} />;
    case 'sheep':
      return <SheepGlyph accent={HARBOR_THEME.sheep.accent} />;
    case 'wheat':
      return <WheatGlyph accent={HARBOR_THEME.wheat.accent} />;
    case 'ore':
      return <OreGlyph accent={HARBOR_THEME.ore.accent} />;
  }
}

interface HarborIconProps {
  harbor: HarborType;
  size: number;
  title?: string;
}

export function HarborIcon({ harbor, size, title }: HarborIconProps) {
  const theme = themeFor(harbor);
  const ratio = harbor.kind === 'generic' ? '3:1' : '2:1';
  const r = size * 0.42;

  return (
    <g className="harbor-icon" aria-label={title}>
      <circle
        cx={0}
        cy={0}
        r={r}
        fill={theme.fill}
        stroke="#fff"
        strokeWidth={2}
        opacity={0.97}
      />
      <circle cx={0} cy={0} r={r - 3} fill="none" stroke={theme.accent} strokeWidth={1} opacity={0.55} />
      <g transform={`scale(${size / 34})`}>
        <HarborGlyph harbor={harbor} />
      </g>
      <text
        x={0}
        y={r - 4}
        textAnchor="middle"
        fill="#fff"
        fontSize={size * 0.2}
        fontWeight={800}
        stroke={theme.stroke}
        strokeWidth={0.4}
        paintOrder="stroke"
      >
        {ratio}
      </text>
      {title && <title>{title}</title>}
    </g>
  );
}
