// @vitest-environment jsdom
import { setLangs, translatable, translate } from '@vtt/engine';
import type { System, Compendium } from '@vtt/schema';
import { roundTrip } from '../../testing/round-trip.tsx';

roundTrip('Blades in the Dark', 0, 1, world => {
  setLangs(world.system as System, ['ru', 'xx']);
  for (const root of [world.system as System, world.compendium as Compendium]) {
    for (const entry of translatable(root)) translate(root, entry.path, 'xx', entry.field, `⟦${entry.text}⟧`);
  }
  return world;
});
