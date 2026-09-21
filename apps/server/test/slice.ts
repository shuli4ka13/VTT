import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const path = fileURLToPath(new URL('../../../packages/engine/tests/fixtures/slice/dnd5e.world.json', import.meta.url));

export function sliceWorld(): { system: any; compendium: any; sheets: any[] } {
  return JSON.parse(readFileSync(path, 'utf8'));
}
