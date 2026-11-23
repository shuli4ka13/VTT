import { group, test, eq, ok, throws } from './harness.ts';
import { PLAYABLE_WORLDS } from '../src/model/systems.ts';
import { fieldCheck } from '../src/engine/check.ts';
import { rollCheck, rollInitiative } from './kit.ts';
import { lintSystem } from '../src/model/lint.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const dnd = PLAYABLE_WORLDS.find(w => (w.system as System).id === 'dnd5e')!;
const system = dnd.system as System;
const compendium = dnd.compendium as Compendium;
const arven = dnd.sheets.find(s => s.id === 'arven') as Sheet;
const seven = () => 7;

group('проверка — одна на всё: шаг, бросок с листа, инициатива', () => {
  test('бросок поля — проверка, где прибавка — само поле', () => {
    const check = fieldCheck(system, 'abilities.dexterity.mod');
    eq(check.bonus?.expr, '@abilities.dexterity.mod');
    const out = rollCheck(system, arven, check, { compendium, die: seven, owner: check.label });
    eq(out.total, 7 + out.bonus);
  });

  test('инициатива D&D — та же проверка, что бросок поля «Инициатива»', () => {
    const initiative = rollInitiative(system, [arven], compendium, seven).rolls[0]!.total;
    const field = fieldCheck(system, 'initiative');
    eq(rollCheck(system, arven, field, { compendium, die: seven, owner: field.label }).total, initiative);
  });

  test('бросок с костью, которой нет в «Костях», — ошибка линта', () => {
    const bare = { ...system, rolls: { ...system.rolls, proverka: { ...system.rolls!.proverka!, die: 'нет_такой' } } } as System;
    ok(lintSystem(bare).some(p => p.level === 'error' && p.text.includes('кости «нет_такой» нет в «Костях»')));
  });

  test('одно поле — в одном броске', () => {
    const twice = { ...system, rolls: { ...system.rolls, ещё: { die: system.rolls!.proverka!.die, fields: [{ table: 'abilities', column: 'mod' }] } } } as System;
    ok(lintSystem(twice).some(p => p.level === 'error' && p.text.includes('бросают двумя бросками')));
  });
});
