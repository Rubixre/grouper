/**
 * Kopierer ressursbrikke-bilder fra mappen "Catan brikker" til src/assets/tiles/.
 * Kjør: npx tsx scripts/copy-tile-images.ts
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const TARGET = join(ROOT, 'src/assets/tiles');

const SOURCE_CANDIDATES = [
  join(ROOT, 'Catan brikker'),
  join(ROOT, '..', 'Catan brikker'),
  join(ROOT, '..', 'Catan Brikker'),
  '/workspace/Catan brikker',
];

/** Nøkkelord i filnavn → ressursfil i assets/tiles */
const NAME_MAP: Record<string, string> = {
  tømmer: 'wood.png',
  tommer: 'wood.png',
  wood: 'wood.png',
  tegl: 'brick.png',
  brick: 'brick.png',
  ull: 'sheep.png',
  sheep: 'sheep.png',
  korn: 'wheat.png',
  wheat: 'wheat.png',
  malm: 'ore.png',
  ore: 'ore.png',
  ørken: 'desert.png',
  orken: 'desert.png',
  desert: 'desert.png',
};

function findSourceDir(): string | null {
  for (const dir of SOURCE_CANDIDATES) {
    if (existsSync(dir)) return dir;
  }
  return null;
}

function matchTarget(filename: string): string | null {
  const base = filename.replace(/\.[^.]+$/, '').toLowerCase();
  for (const [key, target] of Object.entries(NAME_MAP)) {
    if (base.includes(key)) return target;
  }
  return null;
}

const source = findSourceDir();
if (!source) {
  console.error('Fant ikke mappen "Catan brikker". Sjekk at den ligger i:');
  for (const dir of SOURCE_CANDIDATES) console.error('  -', dir);
  process.exit(1);
}

mkdirSync(TARGET, { recursive: true });

const files = readdirSync(source).filter((f) => /\.(png|jpe?g|webp)$/i.test(f));
let copied = 0;

for (const file of files) {
  const target = matchTarget(file);
  if (!target) {
    console.warn('Hopper over ukjent fil:', file);
    continue;
  }
  copyFileSync(join(source, file), join(TARGET, target));
  console.log(`${file} → tiles/${target}`);
  copied++;
}

if (copied === 0) {
  console.error('Ingen bilder kopiert fra', source);
  process.exit(1);
}

console.log(`\nKopierte ${copied} brikke-bilder til src/assets/tiles/`);
