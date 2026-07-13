import type { Board, HexTile } from './types';
import { coordKey, getNeighbors, hexDistance } from './hex';
import { NUMBER_PROB, PROD_RESOURCES, computeBoardEconomics, type ProdResource } from './placementModel';

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
  | 'scarce_access'
  | 'resource_cluster'
  | 'resource_scatter'
  | 'adjacent_reds'
  | 'hot_resource'
  | 'cold_resource'
  | 'desert_center'
  | 'desert_rim'
  | 'port_match'
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

function analyzeTraits(board: Board): BoardTrait[] {
  const econ = computeBoardEconomics(board);
  const tiles = landTiles(board);
  const tileMap = new Map(tiles.map((t) => [coordKey(t.coord), t]));
  const traits: BoardTrait[] = [];

  const supplies = PROD_RESOURCES.map((r) => econ.supplyByResource[r]);
  const avgSupply = supplies.reduce((a, b) => a + b, 0) / supplies.length;
  const opportunities = PROD_RESOURCES.map((r) => econ.placementOpportunityByResource[r]);
  const avgOpp =
    opportunities.reduce((a, b) => a + b, 0) / Math.max(1, opportunities.filter((v) => v > 0).length);

  let scarcest: ProdResource = 'sheep';
  let scarcestRatio = Infinity;
  let richest: ProdResource = 'wheat';
  let richestRatio = -Infinity;
  let scarceAccess: ProdResource = 'sheep';
  let scarceAccessRatio = Infinity;

  for (const resource of PROD_RESOURCES) {
    const supplyRatio = econ.supplyByResource[resource] / avgSupply;
    const opp = econ.placementOpportunityByResource[resource];
    const oppRatio = avgOpp > 0 ? opp / avgOpp : 1;
    if (supplyRatio < scarcestRatio) {
      scarcestRatio = supplyRatio;
      scarcest = resource;
    }
    if (supplyRatio > richestRatio) {
      richestRatio = supplyRatio;
      richest = resource;
    }
    if (oppRatio < scarceAccessRatio) {
      scarceAccessRatio = oppRatio;
      scarceAccess = resource;
    }
  }

  if (scarcestRatio <= 0.82) {
    const label = RESOURCE_STORY_LABELS[scarcest];
    traits.push({
      id: 'scarce_resource',
      strength: 1.2 - scarcestRatio,
      headline: `Knapphet på ${label}`,
      detail: `${label[0]!.toUpperCase()}${label.slice(1)} er tydelig underforsynt — forventet produksjon ligger langt under øyas snitt.`,
      resource: scarcest,
    });
  }

  if (richestRatio >= 1.18 && richest !== scarcest) {
    const label = RESOURCE_STORY_LABELS[richest];
    traits.push({
      id: 'abundant_resource',
      strength: richestRatio - 1,
      headline: `Overflod av ${label}`,
      detail: `${label[0]!.toUpperCase()}${label.slice(1)}-landet er rikt: her ligger mer terningstyrke enn øyas øvrige ressurser.`,
      resource: richest,
    });
  }

  if (scarceAccessRatio <= 0.75 && scarceAccess !== scarcest) {
    const label = RESOURCE_STORY_LABELS[scarceAccess];
    traits.push({
      id: 'scarce_access',
      strength: 1.1 - scarceAccessRatio,
      headline: `Få gode ${label}-hjørner`,
      detail: `Selv om ${label} finnes, er det få hjørner med sterk tilgang — den som tar dem tidlig, sitter godt.`,
      resource: scarceAccess,
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
      headline: 'Spredt mosaic',
      detail:
        'Ressursene er veldig blandet: det er vanskelig å monopolisere én type land, og mangfold belønnes.',
    });
  }

  // Adjacent 6/8
  let redAdj = 0;
  const redSeen = new Set<string>();
  for (const tile of tiles) {
    if (tile.number !== 6 && tile.number !== 8) continue;
    for (const n of getNeighbors(tile.coord)) {
      const neighbor = tileMap.get(coordKey(n));
      if (!neighbor || (neighbor.number !== 6 && neighbor.number !== 8)) continue;
      const edgeKey = [coordKey(tile.coord), coordKey(n)].sort().join('|');
      if (redSeen.has(edgeKey)) continue;
      redSeen.add(edgeKey);
      redAdj++;
    }
  }
  if (redAdj > 0) {
    traits.push({
      id: 'adjacent_reds',
      strength: 0.35 + redAdj * 0.2,
      headline: redAdj === 1 ? 'Røde tall møtes' : `${redAdj} røde nabopar`,
      detail:
        redAdj === 1
          ? 'En 6 og en 8 ligger inntil hverandre — ett hjørne der kan bli ekstremt hett.'
          : 'Flere 6- og 8-par berører hverandre. Midten av striden blir hard.',
    });
  }

  // Hottest / coldest resource by average number strength
  const pipByResource = emptyRecord();
  const countByResource = emptyRecord();
  for (const tile of tiles) {
    if (!tile.resource || tile.resource === 'desert' || tile.number == null) continue;
    pipByResource[tile.resource] += NUMBER_PROB[tile.number] ?? 0;
    countByResource[tile.resource]++;
  }
  let hotRes: ProdResource = 'ore';
  let hotAvg = -1;
  let coldRes: ProdResource = 'sheep';
  let coldAvg = Infinity;
  for (const resource of PROD_RESOURCES) {
    const count = countByResource[resource];
    if (count === 0) continue;
    const avg = pipByResource[resource] / count;
    if (avg > hotAvg) {
      hotAvg = avg;
      hotRes = resource;
    }
    if (avg < coldAvg) {
      coldAvg = avg;
      coldRes = resource;
    }
  }
  const globalAvgPip =
    PROD_RESOURCES.reduce((s, r) => s + pipByResource[r], 0) /
    Math.max(1, PROD_RESOURCES.reduce((s, r) => s + countByResource[r], 0));

  if (hotAvg >= globalAvgPip * 1.18) {
    const label = RESOURCE_STORY_LABELS[hotRes];
    traits.push({
      id: 'hot_resource',
      strength: hotAvg / globalAvgPip - 1,
      headline: `Hete ${label}-tall`,
      detail: `${label[0]!.toUpperCase()}${label.slice(1)}-brikkene har uvanlig sterke tall — den som låser dem, får jevn inntekt.`,
      resource: hotRes,
    });
  }

  if (coldAvg <= globalAvgPip * 0.82 && coldRes !== hotRes) {
    const label = RESOURCE_STORY_LABELS[coldRes];
    traits.push({
      id: 'cold_resource',
      strength: 1 - coldAvg / globalAvgPip,
      headline: `Kalde ${label}-felt`,
      detail: `${label[0]!.toUpperCase()}${label.slice(1)} ligger på svake tall. Mangelen skyldes ikke bare antall brikker, men også terningene.`,
      resource: coldRes,
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
        detail: 'Ørkenen ligger midt i øya og splitter de beste knutepunktene rundt midten.',
      });
    } else if (centerDist >= 2) {
      traits.push({
        id: 'desert_rim',
        strength: 0.25,
        headline: 'Ørken mot kanten',
        detail: 'Ørkenen er skjøvet ut — sentrale hjørner blir mer verdifulle, og ytterkanten mer forrædersk.',
      });
    }
  }

  // Harbor matching scarce resource
  if (scarcestRatio <= 0.9) {
    const matchingPort = board.harbors.find(
      (h) => h.definition.harbor.kind === 'resource' && h.definition.harbor.resource === scarcest
    );
    if (matchingPort) {
      const label = RESOURCE_STORY_LABELS[scarcest];
      traits.push({
        id: 'port_match',
        strength: 0.45,
        headline: `2:1-havn for knapp ${label}`,
        detail: `Havnen for ${label} ligger åpen mens ressursen er sjelden — kontroll der kan endre hele handelsbildet.`,
        resource: scarcest,
      });
    }
  }

  const woodBrick = econ.supplyByResource.wood + econ.supplyByResource.brick;
  const cityFuel = econ.supplyByResource.ore + econ.supplyByResource.wheat;
  const roadCityRatio = woodBrick / Math.max(0.01, cityFuel);
  if (roadCityRatio >= 1.25) {
    traits.push({
      id: 'building_skew',
      strength: roadCityRatio - 1,
      headline: 'Veibygging favoriseres',
      detail: 'Tømmer og tegl er sterkere enn malm og korn — lengste vei ligger nærmere enn byer for mange.',
    });
  } else if (roadCityRatio <= 0.8) {
    traits.push({
      id: 'city_skew',
      strength: 1 - roadCityRatio,
      headline: 'Byveien åpner seg',
      detail: 'Malm og korn er relativt godt stilt — øya peker mer mot byer og utviklingskort enn veirush.',
    });
  }

  if (traits.length === 0) {
    traits.push({
      id: 'balanced',
      strength: 0.2,
      headline: 'Jevn fordeling',
      detail: 'Denne øya skiller seg lite ut: ressursene og tallene er overraskende jevne. Små posisjonsvalg avgjør mer.',
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
  'Røde',
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
    const theme = primary.id.includes('scarce') || primary.id.includes('cold') ? place.theme : place.land;
    const islandName = `${theme} ${noun}`;
    const epithet =
      secondary?.headline != null
        ? `${primary.headline.toLowerCase()}, ${secondary.headline.toLowerCase()}`
        : primary.headline.toLowerCase();
    return { islandName, epithet };
  }

  if (primary?.id === 'adjacent_reds') {
    return {
      islandName: `Røde ${pick(['kjeften', 'knuten', 'midten', 'krysset'] as const, seed, 5)}`,
      epithet: 'der hete tall kolliderer',
    };
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
