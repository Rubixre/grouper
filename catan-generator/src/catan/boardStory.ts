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

export const RESOURCE_PLACE_STEMS: Record<
  ProdResource,
  readonly { stem: string; flavor: 'rich' | 'scarce' }[]
> = {
  wood: [
    { stem: 'Skog', flavor: 'rich' },
    { stem: 'Tømmer', flavor: 'rich' },
    { stem: 'Gran', flavor: 'scarce' },
  ],
  brick: [
    { stem: 'Leir', flavor: 'rich' },
    { stem: 'Tegl', flavor: 'rich' },
    { stem: 'Rød', flavor: 'scarce' },
  ],
  sheep: [
    { stem: 'Eng', flavor: 'rich' },
    { stem: 'Ull', flavor: 'rich' },
    { stem: 'Beite', flavor: 'scarce' },
  ],
  wheat: [
    { stem: 'Åker', flavor: 'rich' },
    { stem: 'Korn', flavor: 'rich' },
    { stem: 'Gull', flavor: 'scarce' },
  ],
  ore: [
    { stem: 'Malm', flavor: 'rich' },
    { stem: 'Fjell', flavor: 'rich' },
    { stem: 'Berg', flavor: 'scarce' },
  ],
};

/** Grammatisk sammensatte stedsnavn (bestemt form i suffikset) */
const PLACE_SUFFIXES = [
  'bukta',
  'neset',
  'sundet',
  'øya',
  'skjæret',
  'klippen',
  'fjorden',
  'revet',
  'holmen',
  'dalen',
  'høyden',
  'vika',
] as const;

const THEME_STEMS: Record<string, readonly string[]> = {
  desert_center: ['Øde', 'Aske', 'Tom'],
  desert_rim: ['Ytter', 'Sand', 'Kyst'],
  building_skew: ['Vei', 'Sti', 'Bro'],
  city_skew: ['Tårn', 'Mur', 'By'],
  resource_scatter: ['Mosaikk', 'Broket', 'Flekk'],
  balanced: ['Jevn', 'Stille', 'Mild'],
  mood: ['Tåke', 'Vind', 'Storm', 'Skjær', 'Tide', 'Rød'],
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
  resource?: ProdResource;
  /** Mytisk fortellingsbruddstykke */
  lore: string;
}

export interface BoardResourceStat {
  resource: ProdResource;
  label: string;
  tileCount: number;
  /** Sum av terningssannsynligheter for ressursens felt */
  expectedProduction: number;
  /** Andel av øyas totale forventede produksjon (0–1) */
  share: number;
  /** actual / fair expectancy based on tile count */
  fairnessRatio: number;
}

export interface BoardStats {
  resources: BoardResourceStat[];
  totalExpectedProduction: number;
  desertPlacement: 'center' | 'rim' | 'none';
  strongestResource: ProdResource;
  weakestResource: ProdResource;
}

export interface BoardStory {
  islandName: string;
  epithet: string;
  narrative: string;
  stats: BoardStats;
  /** Internt / tester: trekk som drev historien */
  highlights: BoardTrait[];
}

interface ResourcePulse {
  resource: ProdResource;
  tileCount: number;
  actualSupply: number;
  expectedSupply: number;
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
      if (
        !neighbor ||
        neighbor.kind !== 'land' ||
        !neighbor.resource ||
        neighbor.resource === 'desert'
      ) {
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

const CLUSTER_PAIR_THRESHOLD = 2;
const HIGH_PROD_RATIO = 1.18;
const LOW_PROD_RATIO = 0.85;

const HIGH_PROD_LORE: Record<ProdResource, string[]> = {
  wood: [
    'I skogene hvisker det om rikdom: stammer som aldri synes å ta slutt.',
    'Tømmeret her er velsignet — trærne står som om de vokser fortere enn månen skifter.',
  ],
  brick: [
    'Leiren er rød og villig; det sies at murene reiser seg nesten av egen vilje.',
    'Fra bakken stiger en gammel ild — teglstenene her bærer mer kraft enn vanlig jord.',
  ],
  sheep: [
    'Engene er uvanlig milde, og ullflokkene vasser i overflod som om gudene smiler.',
    'Her flokker saueholdet seg som hvite skyer — øya er kjent for myk rikdom.',
  ],
  wheat: [
    'Åkrene bølger tyngre enn andre steder; kornet sies å være Catanøyrikets egen gave.',
    'Høsten kommer tidlig og rik — gullgule felt som sverger troskap til den som sår.',
  ],
  ore: [
    'Fjellene åpner årer av malm som gløder under stein: et skattkammer for den som graver.',
    'I bergene synger det av jern og stein — malmen er rikere enn i naboskærene.',
  ],
};

const LOW_PROD_LORE: Record<ProdResource, string[]> = {
  wood: [
    'Skogene er tynne og gjenstridige; tømmeret unndrar seg den utålmodige.',
    'Her er trærne færre i lykke — tømmeret kommer sent, om det kommer.',
  ],
  brick: [
    'Leiren er steil og karrig; murene vokser sakte på denne øya.',
    'Teglens ild sover dypt — de som bygger i stein, må vente lenger her.',
  ],
  sheep: [
    'Engene er magre, og ullflokkene er få — øya sparer på mykheten.',
    'Sauene finner lite beite; ullen er en sjeldenhet blant vindharde bakker.',
  ],
  wheat: [
    'Åkrene gir knapt, som om jorden holder på sitt gull.',
    'Kornet spirer motvillig — høsten er et løfte som ofte svikter.',
  ],
  ore: [
    'Fjellene er lukket; malmen ligger dypt og stumt.',
    'Bergene gir knapt mer enn stein — malmens sang er dempet her.',
  ],
};

const CLUSTER_LORE: Record<ProdResource, string[]> = {
  wood: [
    'Tømmeret vokser i én tett skyggekappe, som en skog som nekter å skilles.',
  ],
  brick: [
    'Leirfeltene henger sammen i en rød stripe — et brudd i landskapet der murmestere samles.',
  ],
  sheep: [
    'Engene ligger skulder ved skulder, et mykt landbånd midt i den hardere øya.',
  ],
  wheat: [
    'Åkrene danner et sammenhengende hav av gull, en kornrikes egen kjerne.',
  ],
  ore: [
    'Fjellryggen er én, sammenvokst: malmens land står som en klippeøy i øya.',
  ],
};

function analyzeTraits(board: Board, seed: number): BoardTrait[] {
  const tiles = landTiles(board);
  const { pulses, totalClusterPairs, landEdges } = measureResourcePulses(board);
  const traits: BoardTrait[] = [];

  const byRatio = [...pulses].sort((a, b) => b.ratio - a.ratio);
  const hottest = byRatio[0];
  const coldest = byRatio[byRatio.length - 1];

  if (hottest && hottest.ratio >= HIGH_PROD_RATIO) {
    traits.push({
      id: 'high_production',
      strength: hottest.ratio - 1,
      resource: hottest.resource,
      lore: pick(HIGH_PROD_LORE[hottest.resource], seed, 11),
    });
  }

  if (
    coldest &&
    coldest.ratio <= LOW_PROD_RATIO &&
    coldest.resource !== hottest?.resource
  ) {
    traits.push({
      id: 'low_production',
      strength: 1 - coldest.ratio,
      resource: coldest.resource,
      lore: pick(LOW_PROD_LORE[coldest.resource], seed, 17),
    });
  }

  const clustered = [...pulses]
    .filter((p) => p.clusterPairs >= CLUSTER_PAIR_THRESHOLD)
    .sort((a, b) => b.clusterPairs - a.clusterPairs);

  for (const [i, pulse] of clustered.slice(0, 2).entries()) {
    traits.push({
      id: 'resource_cluster',
      strength: 0.25 + pulse.clusterPairs * 0.12,
      resource: pulse.resource,
      lore: pick(CLUSTER_LORE[pulse.resource], seed, 23 + i * 5),
    });
  }

  const clusterRate = landEdges > 0 ? totalClusterPairs / landEdges : 0;
  if (clustered.length === 0 && clusterRate <= 0.06 && landEdges > 10) {
    traits.push({
      id: 'resource_scatter',
      strength: 0.18 - clusterRate,
      lore: pick(
        [
          'Ingen landtype hersker i et samlet rike: øya er et broket mosaikk, felt mot felt.',
          'Her er rikdommen spredt som stjerner — den som søker monopol, finner bare vind.',
        ] as const,
        seed,
        29
      ),
    });
  }

  const desert = tiles.find((t) => t.resource === 'desert');
  if (desert) {
    const centerDist = hexDistance(desert.coord, { q: 0, r: 0 });
    if (centerDist <= 1) {
      traits.push({
        id: 'desert_center',
        strength: 0.22,
        lore: pick(
          [
            'I hjertet av øya ligger en tomhet — ørkenen, som en lukket tårnport ingen krysser gratis.',
            'Midt blant fruktbare land kiler ørkenen seg inn, et stille sår i Catanøyrikets fang.',
          ] as const,
          seed,
          31
        ),
      });
    } else if (centerDist >= 2) {
      traits.push({
        id: 'desert_rim',
        strength: 0.18,
        lore: pick(
          [
            'Ørkenen er skjøvet mot kysten, der bølgene tygger på sand — midten får puste friere.',
            'Mot havkanten hviler den gule stillheten; øyas indre er rikere å få.',
          ] as const,
          seed,
          37
        ),
      });
    }
  }

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
        resource: exportCandidate.resource,
        lore: pick(
          [
            `Ved kajen venter en havn viet ${label} — her byttes overflod mot fremmede skatter.`,
            `De vise sier at den som holder ${label}-havnen, holder nøkkelen til øyas handel.`,
          ] as const,
          seed,
          41
        ),
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
      lore: pick(
        [
          'Gamle veier synes å synge her: tømmer og tegl er øyas første språk.',
          'Det sies at den lengste vei ble født på slike øyer — der skog og leire går foran fjell.',
        ] as const,
        seed,
        43
      ),
    });
  } else if (roadCityRatio <= 0.77) {
    traits.push({
      id: 'city_skew',
      strength: Math.min(1 - roadCityRatio, 0.6),
      lore: pick(
        [
          'Her drømmer man om tårn og mur: malm og korn rår, og byene vokser i tanken før de i stein.',
          'Øya heller mot byenes kall — fjellets malm og åkerens gull går foran veiens makt.',
        ] as const,
        seed,
        47
      ),
    });
  }

  if (traits.length === 0) {
    traits.push({
      id: 'balanced',
      strength: 0.15,
      lore: pick(
        [
          'Ingen enkelt gave preger landskapet; balansen selv er øyas hemmelighet.',
          'Karttegnerne finner lite å undres over — og nettopp derfor lyver kartet om hvor hardt det kjempes.',
        ] as const,
        seed,
        53
      ),
    });
  }

  return traits.sort((a, b) => b.strength - a.strength);
}

function buildStats(board: Board): BoardStats {
  const { pulses } = measureResourcePulses(board);
  const totalExpectedProduction = pulses.reduce((s, p) => s + p.actualSupply, 0);
  const resources: BoardResourceStat[] = pulses.map((p) => ({
    resource: p.resource,
    label: RESOURCE_STORY_LABELS[p.resource],
    tileCount: p.tileCount,
    expectedProduction: p.actualSupply,
    share: totalExpectedProduction > 0 ? p.actualSupply / totalExpectedProduction : 0,
    fairnessRatio: p.ratio,
  }));

  const bySupply = [...resources].sort(
    (a, b) => b.expectedProduction - a.expectedProduction
  );
  const desert = landTiles(board).find((t) => t.resource === 'desert');
  let desertPlacement: BoardStats['desertPlacement'] = 'none';
  if (desert) {
    const d = hexDistance(desert.coord, { q: 0, r: 0 });
    desertPlacement = d <= 1 ? 'center' : 'rim';
  }

  return {
    resources,
    totalExpectedProduction,
    desertPlacement,
    strongestResource: bySupply[0]?.resource ?? 'wheat',
    weakestResource: bySupply[bySupply.length - 1]?.resource ?? 'sheep',
  };
}

const MYTHIC_EPITHETS = [
  'der de gamle stiene ennå huskes',
  'beskyttet av tåke og tidevann',
  'sungen om i fiskernes barnerim',
  'forlatt av kart, men ikke av myter',
  'der Catanøyriket puster hardest',
  'med en skjebne skrevet i stein og sand',
  'en plass sjøfolk bare nevner hviskende',
  'kjent for land som bytter temperament med vinden',
] as const;

function compoundPlaceName(stem: string, suffix: string): string {
  // Unngå trippel-konsonant / rare sammensetninger: Skygg + skjæret → Skyggskjæret ok
  return `${stem}${suffix}`;
}

function nameFromTraits(
  traits: BoardTrait[],
  seed: number
): { islandName: string; epithet: string } {
  const primary = traits[0];
  const suffix = pick(PLACE_SUFFIXES, seed, 3);
  const epithet = pick(MYTHIC_EPITHETS, seed, 9);

  if (primary?.resource) {
    const stems = RESOURCE_PLACE_STEMS[primary.resource];
    const wantScarce = primary.id === 'low_production';
    const matching = stems.filter((s) =>
      wantScarce ? s.flavor === 'scarce' : s.flavor === 'rich'
    );
    const pool = matching.length > 0 ? matching : stems;
    const stem = pick(pool, seed, 5).stem;
    return { islandName: compoundPlaceName(stem, suffix), epithet };
  }

  const themeKey =
    primary?.id === 'desert_center' ||
    primary?.id === 'desert_rim' ||
    primary?.id === 'building_skew' ||
    primary?.id === 'city_skew' ||
    primary?.id === 'resource_scatter' ||
    primary?.id === 'balanced'
      ? primary.id
      : 'mood';

  const stem = pick(THEME_STEMS[themeKey]!, seed, 7);
  return { islandName: compoundPlaceName(stem, suffix), epithet };
}

/** Én kort, spennende intro — ikke en liste over trekk */
function buildNarrative(islandName: string, primary: BoardTrait | undefined, seed: number): string {
  if (!primary) {
    return pick(
      [
        `I Catanøyriket venter ${islandName} — rolig på kartet, urolig under støvlene.`,
        `${islandName} stiger frem i Catanøyriket som et blankt løfte: hvem tar den først?`,
      ] as const,
      seed,
      2
    );
  }

  // Bruk én lore-linje som kjerne, men pakk den som intro med øynavn
  const core = primary.lore.replace(/\s+/g, ' ').trim().replace(/\.$/, '');
  return pick(
    [
      `Velkommen til ${islandName} i Catanøyriket. ${core}.`,
      `I Catanøyriket ligger ${islandName}. ${core}.`,
      `${islandName} — en øy i Catanøyriket. ${core}.`,
    ] as const,
    seed,
    13
  );
}

export function createBoardStory(board: Board): BoardStory {
  const seed = fingerprint(board);
  const traits = analyzeTraits(board, seed);
  const highlights = traits.slice(0, 3);
  const primary = highlights[0];
  const { islandName, epithet } = nameFromTraits(highlights, seed);
  const prettyName = capitalizeIslandName(islandName);

  return {
    islandName: prettyName,
    epithet,
    narrative: buildNarrative(prettyName, primary, seed),
    stats: buildStats(board),
    highlights,
  };
}

function capitalizeIslandName(name: string): string {
  if (name.length === 0) return name;
  return name[0]!.toUpperCase() + name.slice(1);
}

/** @internal test helper */
export function __analyzeBoardTraitsForTest(board: Board): BoardTrait[] {
  return analyzeTraits(board, fingerprint(board));
}

/** @internal test helper */
export function __measureResourcePulsesForTest(board: Board) {
  return measureResourcePulses(board);
}
