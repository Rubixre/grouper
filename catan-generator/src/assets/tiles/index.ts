import type { ResourceType } from '../../catan/types';

const tileModules = import.meta.glob(['./*.{png,jpeg,jpg,webp}'], {
  eager: true,
  import: 'default',
}) as Record<string, string>;

/** Nøkkelord i filnavn → ressurs */
const NAME_TO_RESOURCE: [string, ResourceType][] = [
  ['skog', 'wood'],
  ['tømmer', 'wood'],
  ['tommer', 'wood'],
  ['wood', 'wood'],
  ['leirgrunn', 'brick'],
  ['tegl', 'brick'],
  ['brick', 'brick'],
  ['eng', 'sheep'],
  ['ull', 'sheep'],
  ['sheep', 'sheep'],
  ['åker', 'wheat'],
  ['aker', 'wheat'],
  ['korn', 'wheat'],
  ['wheat', 'wheat'],
  ['fjell', 'ore'],
  ['malm', 'ore'],
  ['ore', 'ore'],
  ['ørken', 'desert'],
  ['orken', 'desert'],
  ['desert', 'desert'],
];

function resourceForFile(path: string): ResourceType | null {
  const base = path.replace(/^.*\//, '').replace(/\.[^.]+$/, '').toLowerCase();
  for (const [key, resource] of NAME_TO_RESOURCE) {
    if (base.includes(key)) return resource;
  }
  return null;
}

const images: Partial<Record<ResourceType, string>> = {};

for (const [path, url] of Object.entries(tileModules)) {
  const resource = resourceForFile(path);
  if (resource) images[resource] = url;
}

export const RESOURCE_TILE_IMAGES = images;
