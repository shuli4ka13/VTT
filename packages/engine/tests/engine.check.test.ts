import { group, test, eq, ok, throws } from './harness.ts';
import { PLAYABLE_WORLDS } from '../src/model/systems.ts';
import { rollCheck, fieldCheck } from '../src/engine/check.ts';
import { rollInitiative } from '../src/engine/clock.ts';
import { lintSystem } from '../src/model/lint.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const dnd = PLAYABLE_WORLDS.find(w => (w.system as System).id === 'dnd5e')!;
const system = dnd.system as System;
const compendium = dnd.compendium as Compendium;
const arven = dnd.sheets.find(s => s.id === 'arven') as Sheet;
const seven = () => 7;

group('проверка — одна на всё: шаг, бросок с листа, инициатива', () => {
  test('бросок поля — проверка, где прибавка — само поле', () => {
    const check = fieldCheck(system, 'abilities.dex.mod');
    eq(check.bonus?.expr, '@abilities.dex.mod');
    const out = rollCheck(system, arven, check, { compendium, die: seven, owner: check.label });
    eq(out.total, 7 + out.bonus);
  });

  test('инициатива D&D — та же проверка, что бросок поля «Инициатива»', () => {
    const initiative = rollInitiative(system, [arven], compendium, seven).rolls[0]!.total;
    const field = fieldCheck(system, 'initiative');
    eq(rollCheck(system, arven, field, { compendium, die: seven, owner: field.label }).total, initiative);
  });

  test('бросок без кости: у стола — отказ словами, у автора — ошибка линта', () => {
    const bare = { ...system, fields: system.fields.map(f => (f.tag === 'abilities.dex.mod' ? { ...f, roll: { label: 'Ловкость' } } : f)) } as System;
    throws(() => fieldCheck(bare, 'abilities.dex.mod'), 'кость не выбрана');
    ok(lintSystem(bare).some(p => p.level === 'error' && p.where.field === 'abilities.dex.mod' && p.text.includes('кость не выбрана')));
  });
});
