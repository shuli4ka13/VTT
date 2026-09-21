import { SAMPLE_WORLDS } from '../src/model/systems.ts';
import type { SampleWorld } from '../src/model/systems.ts';
import slice from './fixtures/slice/dnd5e.world.json' with { type: 'json' };

const dnd5eWorld = slice as unknown as SampleWorld;
const cyberpunkWorld = SAMPLE_WORLDS.find(w => w.system.id === 'cp-slice')!;

export const system = dnd5eWorld.system;
export const compendium = dnd5eWorld.compendium;
export const sheets = dnd5eWorld.sheets;
export const [arven, mirra] = dnd5eWorld.sheets;

export const cyberpunk = cyberpunkWorld.system;
export const cpCompendium = cyberpunkWorld.compendium;
export const [silver, raze] = cyberpunkWorld.sheets;
