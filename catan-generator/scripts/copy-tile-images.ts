/**
 * Kopierer ferdig klippede PNG-brikker fra "Catan brikker" til src/assets/tiles/hex/.
 * Forutsetter at bakgrunn allerede er fjernet – ingen bildeprosessering.
 * Kjør: npm run copy:tiles
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const TARGET_DIR = join(ROOT, 'src/assets/tiles/hex');

const SOURCE_CANDIDATES = [
  join(ROOT, 'Catan brikker'),
  join(ROOT, '..', 'Catan brikker'),
  join(ROOT, '..', 'Catan Brikker'),
  '/workspace/Catan brikker',
];

/** Nøkkelord i filnavn → målfil i hex/ */
const NAME_TO_HEX: [string, string][] = [
  ['skog', 'skog.png'],
  ['tømmer', 'skog.png'],
  ['tommer', 'skog.png'],
  ['wood', 'skog.png'],
  ['leirgrunn', 'leirgrunn.png'],
  ['tegl', 'leirgrunn.png'],
  ['brick', 'leirgrunn.png'],
  ['eng', 'eng.png'],
  ['ull', 'eng.png'],
  ['sheep', 'eng.png'],
  ['åker', 'åker.png'],
  ['aker', 'åker.png'],
  ['korn', 'åker.png'],
  ['wheat', 'åker.png'],
  ['fjell', 'Fjell.png'],
  ['malm', 'Fjell.png'],
  ['ore', 'Fjell.png'],
  ['ørken', 'ørken.png'],
  ['orken', 'ørken.png'],
  ['desert', 'ørken.png'],
];

function findSourceDir(): string | null {
  for (const dir of SOURCE_CANDIDATES) {
    if (existsSync(dir)) return dir;
  }
  return null;
}

function matchHexName(filename: string): string | null {
  const base = filename.replace(/\.[^.]+$/, '').toLowerCase();
  for (const [key, hexName] of NAME_TO_HEX) {
    if (base.includes(key)) return hexName;
  }
  return null;
}

function main(): void {
  const source = findSourceDir();
  if (!source) {
    console.error('Fant ikke mappen "Catan brikker". Forventet én av:');
    for (const dir of SOURCE_CANDIDATES) console.error('  -', dir);
    process.exit(1);
  }

  const pngFiles = readdirSync(source).filter((f) => /\.png$/i.test(f));
  if (pngFiles.length === 0) {
    console.error(`Ingen PNG-filer funnet i ${source}`);
    console.error('Last opp 6 brikker med transparent bakgrunn (PNG) i den mappen.');
    process.exit(1);
  }

  mkdirSync(TARGET_DIR, { recursive: true });

  const chosen = new Map<string, string>();
  for (const file of pngFiles) {
    const hexName = matchHexName(file);
    if (!hexName) {
      console.warn('Hopper over ukjent fil:', file);
      continue;
    }
    if (!chosen.has(hexName)) {
      chosen.set(hexName, join(source, file));
    }
  }

  if (chosen.size === 0) {
    console.error('Ingen gjenkjente brikker i', source);
    process.exit(1);
  }

  for (const [hexName, sourcePath] of chosen) {
    const targetPath = join(TARGET_DIR, hexName);
    copyFileSync(sourcePath, targetPath);
    console.log(`${sourcePath} → hex/${hexName}`);
  }

  console.log(`\nKopierte ${chosen.size} brikker til ${TARGET_DIR}`);
}

main();
