import dnd5eWorld from '../../../../samples/dnd5e.world.json' with { type: 'json' };
import cyberpunkWorld from '../../../../samples/cyberpunk.world.json' with { type: 'json' };
import age13World from '../../../../samples/13age.world.json' with { type: 'json' };
import bladesWorld from '../../../../samples/blades.world.json' with { type: 'json' };
import { flattenSystem } from './inherit.ts';
import type { System, Compendium, Sheet } from './types.ts';

export interface SampleWorld {
  title: string;
  system: System;
  compendium: Compendium;
  sheets: Sheet[];
}

export const SAMPLE_WORLDS: SampleWorld[] = [dnd5eWorld, cyberpunkWorld, age13World, bladesWorld] as unknown as SampleWorld[];

export const SAMPLE_SYSTEMS: System[] = SAMPLE_WORLDS.map(w => w.system);

export const PLAYABLE_WORLDS: SampleWorld[] = SAMPLE_WORLDS.map(
  world => ({ ...world, system: flattenSystem(world.system) }),
);

export const PLAYABLE_SYSTEMS: System[] = PLAYABLE_WORLDS.map(world => world.system);
