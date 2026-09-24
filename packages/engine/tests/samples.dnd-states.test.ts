import { group, test, eq, ok } from './harness.ts';
import { PLAYABLE_WORLDS } from '../src/model/systems.ts';
import { fireMoments } from '../src/events/moments.ts';
import { exchange } from '../src/events/exchange.ts';
import type { System, Sheet } from '../src/model/types.ts';

const dnd = PLAYABLE_WORLDS.find(w => (w.system as System).id === 'dnd5e')!;
const system = dnd.system as System;
const sheetOf = (id: string) => structuredClone(dnd.sheets.find(s => s.id === id)!) as Sheet;
const worn = (sheet: Sheet, entries: Sheet['effects']) => ({ ...sheet, effects: [...(sheet.effects ?? []), ...(entries ?? [])] });
const wears = (sheet: Sheet | undefined, id: string) => (sheet?.effects ?? []).some(e => e.effectId === id);
const world = (die: number) => ({ system, compendium: dnd.compendium, die: () => die });

group('D&D: состояние само повторяет спасбросок', () => {
  test('наложенный заклинанием паралич — в конце хода спасбросок против запомненной сложности', () => {
    const held = worn(sheetOf('goblin'), [{ effectId: 'paralyzed', carry: 13 }]);
    const lucky = fireMoments([{ moment: 'turn-end', sheetId: 'goblin' }], [held], world(20) as never);
    ok(!wears(lucky.sheets[0], 'paralyzed'), 'двадцатка — спасся, паралич спал');
    const unlucky = fireMoments([{ moment: 'turn-end', sheetId: 'goblin' }], [held], world(1) as never);
    ok(wears(unlucky.sheets[0], 'paralyzed'), 'единица — остался парализован');
  });

  test('без запомненной сложности повторного спасброска нет', () => {
    const frightened = worn(sheetOf('goblin'), [{ effectId: 'frightened' }]);
    const out = fireMoments([{ moment: 'turn-end', sheetId: 'goblin' }], [frightened], world(20) as never);
    ok(wears(out.sheets[0], 'frightened'), 'изгнание нежити пугает без повторного спасброска');
    eq(out.reports.length, 0);
  });
});

group('D&D: невероятное уклонение спадает само после удара', () => {
  test('урон вдвое меньше, и состояние ушло', () => {
    const target = worn(sheetOf('sil'), [{ effectId: 'uncanny_up' }]);
    const plain = sheetOf('sil');
    const hit = (sheet: Sheet) => exchange({
      system, compendium: dnd.compendium, die: () => 15,
      sheets: [sheetOf('orc'), sheet], actionId: 'orc_greataxe:0', fromId: 'orc', toId: 'sil',
    }).sheets.find(s => s.id === 'sil')!;
    const dodged = hit(target);
    const full = hit(plain);
    ok(!wears(dodged, 'uncanny_up'), 'уклонение спало');
    const lost = (s: Sheet) => Number(plain.values.hp_current) - Number(s.values.hp_current);
    eq(lost(dodged), Math.floor(lost(full) / 2));
  });
});
