import { group, test, eq, ok } from './harness.ts';
import { asksOf, checkInputs, normalizeInputs } from '../src/model/asks.ts';
import { exchange } from './play.ts';
import { newPass } from '../src/engine/calc.ts';
import type { System, Compendium, Sheet } from '../src/model/types.ts';

const system = {
  id: 'x', name: 'x',
  tables: { лист: { shape: 'single', owner: 'sheet', columns: [{ key: 'hp', label: 'Хиты', kind: 'number', default: 20 }] }, места: { label: 'Места', key: 'word', rows: [{ value: 'тело', label: 'тело' }, { value: 'голова', label: 'голова' }] } , ствол: { shape: 'book', use: 'action', label: 'Ствол', columns: [], bindings: [{ label: 'Выстрел', effect: 'выстрел', args: { кость: '1d6' } }] } },
  constants: { к6: { label: 'Кость', kind: 'die', dice: [{ count: 1, sides: 6 }] } },
  effects: {
    выстрел: {
      label: 'Выстрел', activation: 'manual',
      params: [
        { key: 'действующий', kind: 'sheet' },
        { key: 'цели', kind: 'sheet', many: true, item: { key: 'цель' } },
        { key: 'дистанция', label: 'Дистанция', kind: 'number', min: 1, max: 100, ask: { by: 'actor' } },
        { key: 'прицел', label: 'Куда целишься', kind: 'choice', from: 'места', ask: { by: 'gm' } },
        { key: 'кость', label: 'Кость урона', kind: 'dice' },
      ],
      steps: [
        { type: 'each', of: 'цели' },
        { id: 'урон', type: 'roll', die: { expr: '@кость' } },
        { type: 'apply', target: { expr: '@цель.hp' }, direction: 'subtract', value: { expr: '@урон' } },
        { type: 'apply', target: { expr: '@цель.hp' }, direction: 'subtract', value: { expr: '@дистанция' } },
      ],
    },
  },
  
} as unknown as System;

const compendium = { records: [{ id: 'ствол', table: 'ствол', label: 'Ствол', cells: {} }] } as unknown as Compendium;
const sheet = (id: string): Sheet => ({ id, systemId: 'x', name: id, values: { hp: 20 }, has: [{ of: 'ствол' }], effects: [] } as unknown as Sheet);

group('значение, которое называет человек за столом', () => {
  const asked = asksOf('ствол:0', { system, compendium });

  test('спрашиваются только объявленные и не закрытые записью входы', () => {
    eq(asked.map(p => p.key).join(','), 'дистанция,прицел');
    eq(asked[0]!.ask.by, 'actor');
    eq(asked[1]!.ask.by, 'gm');
  });

  test('пустое, лишнее и вне границ — отказ словами', () => {
    ok(checkInputs(asked, {}, system)!.includes('Дистанция'));
    ok(checkInputs(asked, { дистанция: 5 }, system)!.includes('Куда целишься'));
    ok(checkInputs(asked, { дистанция: 0, прицел: 'тело' }, system)!.includes('не меньше 1'));
    ok(checkInputs(asked, { дистанция: 200, прицел: 'тело' }, system)!.includes('не больше 100'));
    ok(checkInputs(asked, { дистанция: 5, прицел: 'нога' }, system)!.includes('можно только'));
    ok(checkInputs(asked, { дистанция: 5, прицел: 'тело', лишнее: 1 }, system)!.includes('лишнее'));
    eq(checkInputs(asked, { дистанция: 5, прицел: 'тело' }, system), null);
  });

  test('ответ null на обязательное число — не заполнено', () => {
    ok(checkInputs(asked, { дистанция: null as never, прицел: 'тело' }, system)!.includes('не заполнено: Дистанция'));
  });

  test('число приходит числом, выбор — строкой', () => {
    const clean = normalizeInputs(asked, { дистанция: '7', прицел: 'голова' });
    eq(typeof clean.дистанция, 'number');
    eq(clean.дистанция, 7);
    eq(clean.прицел, 'голова');
  });

  test('названное человеком значение доходит до формулы шага', () => {
    const played = (дистанция: number) => exchange({
      system, compendium, die: () => 4, sheets: [sheet('а'), sheet('б')],
      actionId: 'ствол:0', fromId: 'а', toId: 'б',
      inputs: { дистанция, прицел: 'тело' },
    });
    eq(played(3).sheets.find(s => s.id === 'б')!.values.hp, 13, 'кость 4 плюс дистанция 3');
    eq(played(10).sheets.find(s => s.id === 'б')!.values.hp, 6, 'та же кость, дистанция 10');
  });
});

group('граница вопроса — формула по листу действующего', () => {
  const capped = {
    ...system,
    effects: { ...system.effects, выстрел: { ...system.effects.выстрел, params: [{ key: 'действующий', kind: 'sheet' }, { key: 'цели', kind: 'sheet', many: true, item: { key: 'цель' } }, { key: 'дистанция', label: 'Дистанция', kind: 'number', min: 0, max: { expr: '@hp' }, ask: { by: 'actor' } }] } },
  } as unknown as System;
  const asked = asksOf('ствол:0', { system: capped, compendium });
  const pass = (hp: number) => newPass(capped, { ...sheet('я'), values: { hp } }, { compendium });

  test('потолок читается с листа', () => {
    eq(checkInputs(asked, { дистанция: 5 }, capped, pass(5)), null);
    eq(checkInputs(asked, { дистанция: 6 }, capped, pass(5)), 'Дистанция: не больше 5');
  });

  test('без листа формулу не проверить — решает сервер', () => {
    eq(checkInputs(asked, { дистанция: 60 }, capped), null);
  });
});
