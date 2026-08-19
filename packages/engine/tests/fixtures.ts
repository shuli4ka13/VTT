import { SAMPLE_WORLDS } from '../src/model/systems.ts';

const dnd5eWorld = SAMPLE_WORLDS.find(w => w.system.id === 'dnd5e-slice')!;
const cyberpunkWorld = SAMPLE_WORLDS.find(w => w.system.id === 'cp-slice')!;

export const system = dnd5eWorld.system;
export const compendium = dnd5eWorld.compendium;
export const sheets = dnd5eWorld.sheets;
export const [arven, mirra] = dnd5eWorld.sheets;

export const cyberpunk = cyberpunkWorld.system;
export const cpCompendium = cyberpunkWorld.compendium;
export const [silver, raze] = cyberpunkWorld.sheets;
