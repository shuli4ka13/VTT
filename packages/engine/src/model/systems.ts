import dnd5eWorld from '../../../../samples/dnd5e.world.json' with { type: 'json' };
import cyberpunkWorld from '../../../../samples/cyberpunk.world.json' with { type: 'json' };
import age13World from '../../../../samples/13age.world.json' with { type: 'json' };
import bladesWorld from '../../../../samples/blades.world.json' with { type: 'json' };
import shadowrunWorld from '../../../../samples/shadowrun.world.json' with { type: 'json' };
import daggerheartWorld from '../../../../samples/daggerheart.world.json' with { type: 'json' };
import dnd5eLite from '../../../../samples/dnd5e.lite.world.json' with { type: 'json' };
import cyberpunkLite from '../../../../samples/cyberpunk.lite.world.json' with { type: 'json' };
import age13Lite from '../../../../samples/13age.lite.world.json' with { type: 'json' };
import bladesLite from '../../../../samples/blades.lite.world.json' with { type: 'json' };
import shadowrunLite from '../../../../samples/shadowrun.lite.world.json' with { type: 'json' };
import daggerheartLite from '../../../../samples/daggerheart.lite.world.json' with { type: 'json' };
import warhammerLite from '../../../../samples/warhammer.lite.world.json' with { type: 'json' };
import fabulaLite from '../../../../samples/fabula.lite.world.json' with { type: 'json' };
import { flattenSystem } from './inherit.ts';
import type { System, Compendium, Sheet } from './types.ts';

export interface SampleWorld {
  title: string;
  system: System;
  compendium: Compendium;
  sheets: Sheet[];
}

export const SAMPLE_WORLDS: SampleWorld[] = [dnd5eWorld, cyberpunkWorld, age13World, bladesWorld, shadowrunWorld, daggerheartWorld] as unknown as SampleWorld[];

export const LITE_WORLDS: SampleWorld[] = [dnd5eLite, cyberpunkLite, age13Lite, bladesLite, shadowrunLite, daggerheartLite, warhammerLite, fabulaLite] as unknown as SampleWorld[];

export const SAMPLE_SYSTEMS: System[] = SAMPLE_WORLDS.map(w => w.system);

export const PLAYABLE_WORLDS: SampleWorld[] = SAMPLE_WORLDS.map(
  world => ({ ...world, system: flattenSystem(world.system) }),
);

export const PLAYABLE_SYSTEMS: System[] = PLAYABLE_WORLDS.map(world => world.system);
