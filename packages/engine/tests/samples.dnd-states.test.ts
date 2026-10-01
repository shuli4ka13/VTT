import { group, test, eq, ok } from './harness.ts';
import { PLAYABLE_WORLDS } from '../src/model/systems.ts';
import { fireMoments } from '../src/events/moments.ts';
import { exchange } from './play.ts';
import { calc, newPass } from '../src/engine/calc.ts';
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

group('D&D: потерял сознание — концентрация прервалась', () => {
  test('без сознания включает «недееспособен», тот снимает концентрацию, благословение спадает с союзника', () => {
    const mirra = worn(sheetOf('mirra'), [{ effectId: 'concentration' }]);
    const sil = worn(sheetOf('sil'), [{ effectId: 'blessed', from: 'mirra', by: 'concentration' }]);
    const out = exchange({
      system, compendium: dnd.compendium, die: sides => sides,
      sheets: [sheetOf('ogre'), mirra, sil], actionId: 'ogre_club:0', fromId: 'ogre', toId: 'mirra',
    });
    const after = (id: string) => out.sheets.find(s => s.id === id);
    ok(wears(after('mirra'), 'unconscious'));
    ok(wears(after('mirra'), 'prone'), 'упала — лежит отдельно от «без сознания»');
    ok(!wears(after('mirra'), 'concentration'), 'концентрация прервалась');
    ok(!wears(after('sil'), 'blessed'), 'благословение держать стало нечем');
  });
});

group('D&D: отдых — каждое правило возвращает своё', () => {
  test('долгий отдых: хиты, ячейки, ресурсы, истощение и спасброски от смерти возвращаются разными правилами', () => {
    const tired = { ...sheetOf('mirra'), values: { ...sheetOf('mirra').values, hp_current: 1, 'slots.круг_1.left': 0, 'resources.luck.left': 0, exhaustion: 2, death_fail: 2 } };
    const out = fireMoments([{ moment: 'short-rest', sheetId: 'mirra' }, { moment: 'long-rest', sheetId: 'mirra' }], [tired], world(1) as never);
    const rested = out.sheets[0]!;
    const back = rested.values;
    const full = (tag: string) => calc(system, rested, tag, newPass(system, rested, { compendium: dnd.compendium }));
    eq(back.hp_current, full('hp_max'));
    eq(back['slots.круг_1.left'], full('slots.круг_1.max'));
    eq(back['resources.luck.left'], full('resources.luck.max'));
    eq(back.exhaustion, 1);
    eq(back.death_fail, 0);
    const rules = new Set(out.reports.map(r => r.report.effect));
    ok(['long_rest', 'slots_rest', 'resources_rest', 'exhaustion_rule', 'wake'].every(id => rules.has(id)), [...rules].join(', '));
  });
});
