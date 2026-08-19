import dnd5eWorld from '../../../../samples/dnd5e.world.json' with { type: 'json' };
import cyberpunkWorld from '../../../../samples/cyberpunk.world.json' with { type: 'json' };
import type { System, Compendium, Sheet } from './types.ts';

export interface SampleWorld {
  title: string;
  system: System;
  compendium: Compendium;
  sheets: Sheet[];
}

export const SAMPLE_WORLDS: SampleWorld[] = [dnd5eWorld, cyberpunkWorld] as unknown as SampleWorld[];

export const SAMPLE_SYSTEMS: System[] = SAMPLE_WORLDS.map(w => w.system);
