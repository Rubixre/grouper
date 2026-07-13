import type { Board, HexTile } from './types';
import { coordKey, getNeighbors, hexDistance } from './hex';
import { NUMBER_PROB, PROD_RESOURCES, type ProdResource } from './placementModel';

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
  | 'high_production'
  | 'low_production'
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
  islandName: string;
  epithet: string;
  narrative: string;
  highlights: BoardTrait[];
}

interface ResourcePulse {
  resource: ProdResource;
  tileCount: number;
  actualSupply: number;
  expectedSupply: number;
  /** actual / expected — 1 = typisk for antall felt */
  ratio: number;
  clusterPairs: number;
}

function emptyRecord(): Record<ProdResource, number> {
  return { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 };
}

function landTiles(board: Board): HexTile[] {
  return board.hexes.filter((h) => h.kind === 'land');
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

/**
 * Forventet produksjon vs. «rettferdig» snitt gitt antall felt.
 * Fixed tile counts (4 tømmer / 3 tegl) er like på alle brett — det som skiller
 * er hvilke tall ressursene lander på.
 */
function measureResourcePulses(board: Board): {
  pulses: ResourcePulse[];
  meanPip: number;
  totalClusterPairs: number;
  landEdges: number;
} {
  const tiles = landTiles(board);
  const tileMap = new Map(tiles.map((t) => [coordKey(t.coord), t]));

  const numbered = tiles.filter(
    (t) => t.resource && t.resource !== 'desert' && t.number != null
  );
  const meanPip =
    numbered.length > 0
      ? numbered.reduce((s, t) => s + (NUMBER_PROB[t.number!] ?? 0), 0) / numbered.length
      : 0;

  const tileCount = emptyRecord();
  const actualSupply = emptyRecord();
  for (const tile of numbered) {
    const resource = tile.resource as ProdResource;
    tileCount[resource]++;
    actualSupply[resource] += NUMBER_PROB[tile.number!] ?? 0;
  }

  const clusterPairs = emptyRecord();
  let totalClusterPairs = 0;
  let landEdges = 0;
  const seenEdge = new Set<string>();

  for (const tile of tiles) {
    if (!tile.resource || tile.resource === 'desert') continue;
    for (const n of getNeighbors(tile.coord)) {
      const nk = coordKey(n);
      const neighbor = tileMap.get(nk);
      if (!neighbor || neighbor.kind !== 'land' || !neighbor.resource || neighbor.resource === 'desert') {
        continue;
      }
      const edgeKey = [coordKey(tile.coord), nk].sort().join('|');
      if (seenEdge.has(edgeKey)) continue;
      seenEdge.add(edgeKey);
      landEdges++;
      if (neighbor.resource === tile.resource) {
        clusterPairs[tile.resource as ProdResource]++;
        totalClusterPairs++;
      }
    }
  }

  const pulses: ResourcePulse[] = PROD_RESOURCES.map((resource) => {
    const count = tileCount[resource];
    const expected = count * meanPip;
    const actual = actualSupply[resource];
    return {
      resource,
      tileCount: count,
      actualSupply: actual,
      expectedSupply: expected,
      ratio: expected > 0 ? actual / expected : 1,
      clusterPairs: clusterPairs[resource],
    };
  });

  return { pulses, meanPip, totalClusterPairs, landEdges };
}

/** Typisk for tre like felt: ~2 nabopar i en klynge; 1 kan være tilfeldig. */
const CLUSTER_PAIR_THRESHOLD = 2;
const HIGH_PROD_RATIO = 1.18;
const LOW_PROD_RATIO = 0.85;

function analyzeTraits(board: Board): BoardTrait[] {
  const tiles = landTiles(board);
  const { pulses, totalClusterPairs, landEdges } = measureResourcePulses(board);
  const traits: BoardTrait[] = [];

  const byRatio = [...pulses].sort((a, b) => b.ratio - a.ratio);
  const hottest = byRatio[0];
  const coldest = byRatio[byRatio.length - 1];

  if (hottest && hottest.ratio >= HIGH_PROD_RATIO) {
    const label = RESOURCE_STORY_LABELS[hottest.resource];
    traits.push({
      id: 'high_production',
      strength: hottest.ratio - 1,
      headline: `Sterk ${label}-produksjon`,
      detail: `${capitalizeLabel(label)} har landet på uvanlig gode tall for antall felt — forventet produksjon ligger klart over det normale for denne ressursen.`,
      resource: hottest.resource,
    });
  }

  if (
    coldest &&
    coldest.ratio <= LOW_PROD_RATIO &&
    coldest.resource !== hottest?.resource
  ) {
    const label = RESOURCE_STORY_LABELS[coldest.resource];
    traits.push({
      id: 'low_production',
      strength: 1 - coldest.ratio,
      headline: `Svak ${label}-produksjon`,
      detail: `${capitalizeLabel(label)} er satt på svake tall — forventet produksjon er merkbart lavere enn det antall felt skulle tilsi.`,
      resource: coldest.resource,
    });
  }

  // Per-resource clusters (what actually distinguishes boards with fixed tile counts)
  const clustered = [...pulses]
    .filter((p) => p.clusterPairs >= CLUSTER_PAIR_THRESHOLD)
    .sort((a, b) => b.clusterPairs - a.clusterPairs);

  for (const pulse of clustered.slice(0, 2)) {
    const label = RESOURCE_STORY_LABELS[pulse.resource];
    traits.push({
      id: 'resource_cluster',
      strength: 0.25 + pulse.clusterPairs * 0.12,
      headline: `${capitalizeLabel(label)}-klynge`,
      detail: `${capitalizeLabel(label)}-feltene ligger samlet i et sammenhengende område i stedet for å være spredt over øya.`,
      resource: pulse.resource,
    });
  }

  const clusterRate = landEdges > 0 ? totalClusterPairs / landEdges : 0;
  if (clustered.length === 0 && clusterRate <= 0.06 && landEdges > 10) {
    traits.push({
      id: 'resource_scatter',
      strength: 0.18 - clusterRate,
      headline: 'Spredt mosaikk',
      detail:
        'Like ressurser ligger sjelden inntil hverandre — landskapet er et broket mosaikk uten store ensartede regioner.',
    });
  }

  const desert = tiles.find((t) => t.resource === 'desert');
  if (desert) {
    const centerDist = hexDistance(desert.coord, { q: 0, r: 0 });
    if (centerDist <= 1) {
      traits.push({
        id: 'desert_center',
        strength: 0.22,
        headline: 'Ørken i hjertet',
        detail: 'Ørkenen ligger midt i øya og splitter landskapet rundt midten.',
      });
    } else if (centerDist >= 2) {
      traits.push({
        id: 'desert_rim',
        strength: 0.18,
        headline: 'Ørken mot kanten',
        detail: 'Ørkenen er skjøvet ut mot kysten — midten av øya er mer ekspansiv.',
      });
    }
  }

  // 2:1-havn er verdifull når forventet produksjon av ressursen er høy
  const exportCandidate = [...pulses]
    .filter((p) => p.ratio >= 1.12)
    .sort((a, b) => b.ratio - a.ratio)[0];

  if (exportCandidate) {
    const matchingPort = board.harbors.find(
      (h) =>
        h.definition.harbor.kind === 'resource' &&
        h.definition.harbor.resource === exportCandidate.resource
    );
    if (matchingPort) {
      const label = RESOURCE_STORY_LABELS[exportCandidate.resource];
      traits.push({
        id: 'port_export',
        strength: 0.4 + (exportCandidate.ratio - 1),
        headline: `2:1-havn for sterk ${label}`,
        detail: `${capitalizeLabel(label)} har høy forventet produksjon, og den matchende 2:1-havnen gjør overskuddet omsettelig — et naturlig eksportsted.`,
        resource: exportCandidate.resource,
      });
    }
  }

  const woodBrick =
    (pulses.find((p) => p.resource === 'wood')?.actualSupply ?? 0) +
    (pulses.find((p) => p.resource === 'brick')?.actualSupply ?? 0);
  const cityFuel =
    (pulses.find((p) => p.resource === 'ore')?.actualSupply ?? 0) +
    (pulses.find((p) => p.resource === 'wheat')?.actualSupply ?? 0);
  const roadCityRatio = woodBrick / Math.max(0.01, cityFuel);
  if (roadCityRatio >= 1.3) {
    traits.push({
      id: 'building_skew',
      strength: Math.min(roadCityRatio - 1, 0.6),
      headline: 'Veilandskapet står sterkt',
      detail:
        'Forventet produksjon av tømmer og tegl er tydelig høyere enn for malm og korn — øya lener seg mot veibygging.',
    });
  } else if (roadCityRatio <= 0.77) {
    traits.push({
      id: 'city_skew',
      strength: Math.min(1 - roadCityRatio, 0.6),
      headline: 'Byens råvarer står sterkt',
      detail:
        'Forventet produksjon av malm og korn er tydelig høyere enn for tømmer og tegl — øya lener seg mot byer.',
    });
  }

  if (traits.length === 0) {
    traits.push({
      id: 'balanced',
      strength: 0.15,
      headline: 'Jevn fordeling',
      detail:
        'Verken tallfordeling eller landklynger skiller seg sterkt ut — denne øya er overraskende jevn.',
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
      primary.id === 'low_production' ? place.theme : place.land;
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
    return { islandName: `Veifarernes ${noun}`, epithet: 'sterk tømmer- og teglproduksjon' };
  }

  if (primary?.id === 'city_skew') {
    return { islandName: `Bygnærenes ${noun}`, epithet: 'sterk malm- og kornproduksjon' };
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
    return `${lead} Landskapet er jevnt, så det er posisjonering som skiller seierherrene.`;
  }

  const first = highlights[0]!;
  const second = highlights[1];
  const third = highlights[2];

  let story = `${lead} ${first.detail}`;
  if (second) {
    story += ` Samtidig merkes ${second.headline.toLowerCase()}: ${second.detail}`;
  }
  if (third) {
    story += ` Til sist: ${third.detail}`;
  }
  return story;
}

export function createBoardStory(board: Board): BoardStory {
  const traits = analyzeTraits(board);
  const highlights = traits.slice(0, 3);
  const seed = fingerprint(board);
  const { islandName, epithet } = nameFromTraits(highlights, seed);

  return {
    islandName: capitalizeIslandName(islandName),
    epithet,
    narrative: buildNarrative(islandName, highlights),
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

/** @internal test helper */
export function __measureResourcePulsesForTest(board: Board) {
  return measureResourcePulses(board);
}
