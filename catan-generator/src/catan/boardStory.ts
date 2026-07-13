import type { Board, HexTile } from './types';
import { coordKey, getNeighbors, hexDistance } from './hex';
import { PROD_RESOURCES, type ProdResource } from './placementModel';

export const RESOURCE_STORY_LABELS: Record<ProdResource, string> = {
  wood: 'tømmer',
  brick: 'tegl',
  sheep: 'ull',
  wheat: 'korn',
  ore: 'malm',
};

export const RESOURCE_PLACE_LABELS: Record<ProdResource, { land: string; theme: string }> = {
  wood: { land: 'Skogens', theme: 'Tømrets' },
  brick: { land: 'Leirens', theme: 'Teglbruddets' },
  sheep: { land: 'Engens', theme: 'Ullens' },
  wheat: { land: 'Åkerens', theme: 'Kornets' },
  ore: { land: 'Fjellets', theme: 'Malmens' },
};

export type BoardTraitId =
  | 'scarce_resource'
  | 'abundant_resource'
  | 'resource_cluster'
  | 'resource_scatter'
  | 'desert_center'
  | 'desert_rim'
  | 'port_export'
  | 'building_skew'
  | 'city_skew'
  | 'balanced';

export interface BoardTrait {
  id: BoardTraitId;
  strength: number;
  headline: string;
  detail: string;
  resource?: ProdResource;
}

export interface BoardStory {
  /** Øynavn i Catanøyriket */
  islandName: string;
  /** Én kort tittel-linje under navnet */
  epithet: string;
  /** 2–3 setninger som forteller hva som er spesielt */
  narrative: string;
  /** Opp til tre fremhevede trekk */
  highlights: BoardTrait[];
}

function emptyRecord(): Record<ProdResource, number> {
  return { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 };
}

function landTiles(board: Board): HexTile[] {
  return board.hexes.filter((h) => h.kind === 'land');
}

function countResources(board: Board): Record<ProdResource, number> {
  const counts = emptyRecord();
  for (const tile of landTiles(board)) {
    if (!tile.resource || tile.resource === 'desert') continue;
    counts[tile.resource]++;
  }
  return counts;
}

function fingerprint(board: Board): number {
  let hash = 2166136261;
  const tiles = [...landTiles(board)].sort(
    (a, b) => a.coord.q - b.coord.q || a.coord.r - b.coord.r
  );
  for (const tile of tiles) {
    const part = `${tile.coord.q},${tile.coord.r}:${tile.resource ?? ''}:${tile.number ?? ''}`;
    for (let i = 0; i < part.length; i++) {
      hash ^= part.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
  }
  return hash >>> 0;
}

function pick<T>(items: readonly T[], seed: number, salt = 0): T {
  return items[(seed + salt) % items.length]!;
}

function capitalizeLabel(label: string): string {
  return label[0]!.toUpperCase() + label.slice(1);
}

function analyzeTraits(board: Board): BoardTrait[] {
  const tiles = landTiles(board);
  const tileMap = new Map(tiles.map((t) => [coordKey(t.coord), t]));
  const counts = countResources(board);
  const traits: BoardTrait[] = [];

  const total = PROD_RESOURCES.reduce((s, r) => s + counts[r], 0);
  const avgCount = total / PROD_RESOURCES.length;

  let scarcest: ProdResource = 'sheep';
  let scarcestRatio = Infinity;
  let richest: ProdResource = 'wheat';
  let richestRatio = -Infinity;

  for (const resource of PROD_RESOURCES) {
    const ratio = counts[resource] / Math.max(avgCount, 0.01);
    if (ratio < scarcestRatio) {
      scarcestRatio = ratio;
      scarcest = resource;
    }
    if (ratio > richestRatio) {
      richestRatio = ratio;
      richest = resource;
    }
  }

  if (scarcestRatio <= 0.85) {
    const label = RESOURCE_STORY_LABELS[scarcest];
    traits.push({
      id: 'scarce_resource',
      strength: 1.15 - scarcestRatio,
      headline: `Lite ${label}-land`,
      detail: `${capitalizeLabel(label)} er sjeldent på øya — det finnes færre felt av denne typen enn av de fleste andre ressursene.`,
      resource: scarcest,
    });
  }

  if (richestRatio >= 1.15) {
    const label = RESOURCE_STORY_LABELS[richest];
    traits.push({
      id: 'abundant_resource',
      strength: richestRatio - 1,
      headline: `Mye ${label}-land`,
      detail: `${capitalizeLabel(label)}-landet breier seg: her er det mer av denne ressursen enn øyas øvrige landtyper.`,
      resource: richest,
    });
  }

  // Adjacent same-resource clustering
  let sameAdj = 0;
  let landEdges = 0;
  const seenEdge = new Set<string>();
  for (const tile of tiles) {
    if (!tile.resource || tile.resource === 'desert') continue;
    for (const n of getNeighbors(tile.coord)) {
      const nk = coordKey(n);
      const neighbor = tileMap.get(nk);
      if (!neighbor || neighbor.kind !== 'land') continue;
      const edgeKey = [coordKey(tile.coord), nk].sort().join('|');
      if (seenEdge.has(edgeKey)) continue;
      seenEdge.add(edgeKey);
      landEdges++;
      if (neighbor.resource === tile.resource) sameAdj++;
    }
  }
  const clusterRate = landEdges > 0 ? sameAdj / landEdges : 0;
  if (clusterRate >= 0.22) {
    traits.push({
      id: 'resource_cluster',
      strength: clusterRate,
      headline: 'Sammenhengende landskap',
      detail:
        'Likartede ressurser ligger ofte side om side — øya får tydelige regioner i stedet for et jevnt mosaikk.',
    });
  } else if (clusterRate <= 0.08 && landEdges > 10) {
    traits.push({
      id: 'resource_scatter',
      strength: 0.15 - clusterRate,
      headline: 'Spredt mosaikk',
      detail:
        'Ressursene er veldig blandet: det er vanskelig å monopolisere én type land, og mangfold belønnes.',
    });
  }

  // Desert position
  const desert = tiles.find((t) => t.resource === 'desert');
  if (desert) {
    const centerDist = hexDistance(desert.coord, { q: 0, r: 0 });
    if (centerDist <= 1) {
      traits.push({
        id: 'desert_center',
        strength: 0.35,
        headline: 'Ørken i hjertet',
        detail: 'Ørkenen ligger midt i øya og splitter landskapet rundt midten.',
      });
    } else if (centerDist >= 2) {
      traits.push({
        id: 'desert_rim',
        strength: 0.25,
        headline: 'Ørken mot kanten',
        detail: 'Ørkenen er skjøvet ut mot kysten — midten av øya er mer ekspansiv.',
      });
    }
  }

  // 2:1-havn er verdifull når det er MYE av ressursen (eksport/overskudd)
  if (richestRatio >= 1.1) {
    const matchingPort = board.harbors.find(
      (h) => h.definition.harbor.kind === 'resource' && h.definition.harbor.resource === richest
    );
    if (matchingPort) {
      const label = RESOURCE_STORY_LABELS[richest];
      traits.push({
        id: 'port_export',
        strength: 0.55 + (richestRatio - 1),
        headline: `2:1-havn for rik ${label}`,
        detail: `Øya har rikelig med ${label}, og den matchende 2:1-havnen gjør overskuddet omsettelig — et naturlig eksportsted.`,
        resource: richest,
      });
    }
  }

  const woodBrick = counts.wood + counts.brick;
  const cityFuel = counts.ore + counts.wheat;
  const roadCityRatio = woodBrick / Math.max(1, cityFuel);
  if (roadCityRatio >= 1.25) {
    traits.push({
      id: 'building_skew',
      strength: roadCityRatio - 1,
      headline: 'Veilandskapet dominerer',
      detail: 'Tømmer- og teglfelt veier tyngre enn malm og korn — øya lener seg mot veibygging.',
    });
  } else if (roadCityRatio <= 0.8) {
    traits.push({
      id: 'city_skew',
      strength: 1 - roadCityRatio,
      headline: 'Byens råvarer står sterkt',
      detail: 'Malm- og kornfelt er rikelig sammenlignet med tømmer og tegl — øya lener seg mot byer.',
    });
  }

  if (traits.length === 0) {
    traits.push({
      id: 'balanced',
      strength: 0.2,
      headline: 'Jevn fordeling',
      detail: 'Denne øya skiller seg lite ut: landtypene er overraskende jevnt fordelt. Små posisjonsvalg avgjør mer.',
    });
  }

  return traits.sort((a, b) => b.strength - a.strength);
}

const GEO_NOUNS = [
  'øy',
  'skjær',
  'sund',
  'nes',
  'vik',
  'fjord',
  'klippe',
  'høydene',
  'dalene',
  'bukten',
  'revet',
  'holmen',
] as const;

const MOOD_PREFIXES = [
  'Stridbare',
  'Stille',
  'Vill',
  'Skjulte',
  'Gamle',
  'Tørre',
  'Gyldne',
  'Grønne',
  'Vindharde',
  'Tåkelagte',
  'Solbrente',
] as const;

function nameFromTraits(traits: BoardTrait[], seed: number): { islandName: string; epithet: string } {
  const primary = traits[0];
  const secondary = traits[1];
  const noun = pick(GEO_NOUNS, seed, 3);

  if (primary?.resource) {
    const place = RESOURCE_PLACE_LABELS[primary.resource];
    const theme =
      primary.id === 'scarce_resource' ? place.theme : place.land;
    const islandName = `${theme} ${noun}`;
    const epithet =
      secondary?.headline != null
        ? `${primary.headline.toLowerCase()}, ${secondary.headline.toLowerCase()}`
        : primary.headline.toLowerCase();
    return { islandName, epithet };
  }

  if (primary?.id === 'desert_center') {
    return { islandName: `Ødemarkens ${noun}`, epithet: 'med ørken i hjertet' };
  }

  if (primary?.id === 'desert_rim') {
    return { islandName: `Ytterstens ${noun}`, epithet: 'ørkenen mot havet' };
  }

  if (primary?.id === 'building_skew') {
    return { islandName: `Veifarernes ${noun}`, epithet: 'rik på tømmer og tegl' };
  }

  if (primary?.id === 'city_skew') {
    return { islandName: `Bygnærenes ${noun}`, epithet: 'malm og korn i overflod' };
  }

  if (primary?.id === 'resource_cluster') {
    return { islandName: `Regionenes ${noun}`, epithet: 'tydelige landskapssoner' };
  }

  if (primary?.id === 'resource_scatter') {
    return { islandName: `Mosaikkens ${noun}`, epithet: 'spredt og broket' };
  }

  const mood = pick(MOOD_PREFIXES, seed, 7);
  return {
    islandName: `${mood} ${noun}`,
    epithet: primary?.headline.toLowerCase() ?? 'en øy i Catanøyriket',
  };
}

function buildNarrative(islandName: string, highlights: BoardTrait[]): string {
  const lead = `I Catanøyriket stiger ${islandName} frem som en egen skjærgård.`;
  if (highlights.length === 0) {
    return `${lead} Fordelingen er jevn, så det er posisjonering og tempererte valg som skiller seierherrene.`;
  }

  const first = highlights[0]!;
  const second = highlights[1];
  const third = highlights[2];

  let story = `${lead} ${first.detail}`;
  if (second) {
    story += ` Samtidig merkes ${second.headline.toLowerCase()}: ${second.detail}`;
  }
  if (third && highlights.length >= 3) {
    story += ` Til sist: ${third.detail}`;
  }
  return story;
}

/** Analyser brettet og lag øynavn + kort «historie» om det som skiller det ut */
export function createBoardStory(board: Board): BoardStory {
  const traits = analyzeTraits(board);
  const highlights = traits.slice(0, 3);
  const seed = fingerprint(board);
  const { islandName, epithet } = nameFromTraits(highlights, seed);
  const narrative = buildNarrative(islandName, highlights);

  return {
    islandName: capitalizeIslandName(islandName),
    epithet,
    narrative,
    highlights,
  };
}

function capitalizeIslandName(name: string): string {
  return name
    .split(' ')
    .map((word) => (word.length === 0 ? word : word[0]!.toUpperCase() + word.slice(1)))
    .join(' ');
}

/** @internal test helper */
export function __analyzeBoardTraitsForTest(board: Board): BoardTrait[] {
  return analyzeTraits(board);
}
