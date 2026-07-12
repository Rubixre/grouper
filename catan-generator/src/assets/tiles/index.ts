import type { ResourceType } from '../../catan/types';

const tileModules = import.meta.glob('./*.png', {
  eager: true,
  import: 'default',
}) as Record<string, string>;

const TILE_FILES: Partial<Record<ResourceType, string>> = {
  wood: './wood.png',
  brick: './brick.png',
  sheep: './sheep.png',
  wheat: './wheat.png',
  ore: './ore.png',
  desert: './desert.png',
};

export const RESOURCE_TILE_IMAGES: Partial<Record<ResourceType, string>> = Object.fromEntries(
  Object.entries(TILE_FILES)
    .filter(([_, path]) => tileModules[path])
    .map(([resource, path]) => [resource, tileModules[path!]])
) as Partial<Record<ResourceType, string>>;
