import { group, test, eq } from './harness.ts';
import { exchange } from './play.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const attackRoll = {
  label: 'Бросок атаки',
  params: [{ key: 'кто', kind: 'sheet' }, { key: 'против', kind: 'sheet' }, { key: 'бонус', kind: 'number', default: 0 }],
  returns: [{ key: 'попал', label: 'попал', kind: 'boolean', expr: { expr: '@проверка.success' } }],
  steps: [
    { id: 'бросок', type: 'roll', die: 'к20', bonus: { expr: '@бонус' }, by: { expr: '@кто' }, against: { expr: '@против' } },
    { id: 'проверка', type: 'check', value: { expr: '@бросок' }, versus: { expr: '@против.кд' } },
  ],
};

const strike = {
  label: 'Удар', activation: 'manual',
  params: [{ key: 'действующий', kind: 'sheet' }, { key: 'цели', kind: 'sheet', many: true, item: { key: 'цель' } }],
  returns: [{ key: 'итог', label: 'итог', kind: 'number', expr: { expr: '1' } }],
  steps: [
    { type: 'each', of: 'цели' },
    { id: 'атака', type: 'emit', effect: 'бросок_атаки', args: { кто: { expr: '@действующий' }, против: { expr: '@цель' }, бонус: { expr: '5' } } },
  ],
};

const reply = (on: string, expr: string, confirm: boolean) => ({
  label: 'Ответ', activation: 'passive',
  on: [{ on, ...(confirm ? { confirm: true } : {}), if: { expr }, steps: [{ type: 'apply', target: { expr: '@носитель.хп' }, direction: 'subtract', value: { expr: '1' } }] }],
});

const system = (handler: ReturnType<typeof reply>): System => ({
  id: 'итоги', name: 'итоги',
  tables: {
    лист: { shape: 'single', owner: 'sheet', columns: [{ key: 'хп', label: 'Хиты', kind: 'number', default: 20 }, { key: 'кд', label: 'Класс брони', kind: 'number', default: 15 }] },
    приём: { shape: 'book', use: 'action', label: 'Приём', columns: [], bindings: [{ label: 'Удар', effect: 'удар', args: {} }] },
  },
  constants: { к20: { label: 'к20', kind: 'die', dice: [{ count: 1, sides: 20 }] } },
  effects: { бросок_атаки: attackRoll, удар: strike, ответ: handler },
}) as unknown as System;

const book = { records: [{ id: 'приём', table: 'приём', label: 'Удар', cells: {} }] } as unknown as Compendium;
const sheet = (id: string, effects: string[] = []): Sheet =>
  ({ id, systemId: 'итоги', name: id, values: { хп: 20 }, has: [{ of: 'приём' }], effects: effects.map(effectId => ({ effectId })) }) as unknown as Sheet;

const hpAfter = (handler: ReturnType<typeof reply>, die: number): { hp: number; questions: number } => {
  const played = exchange({
    system: system(handler), compendium: book, die: () => die, sheets: [sheet('а'), sheet('б', ['ответ'])],
    actionId: 'приём:0', fromId: 'а', toIds: ['б'], answer: question => question.offers.map(offer => offer.id),
  });
  return { hp: played.sheets.find(one => one.id === 'б')!.values.хп as number, questions: played.questions.length };
};

group('подписка «после» читает итоги вызова', () => {
  test('вызов из шага: итог «попал» видят и обычная подписка, и подписка с вопросом', () => {
    for (const confirm of [false, true]) {
      const handler = reply('after:бросок_атаки', '@попал', confirm);
      eq(hpAfter(handler, 18).hp, 19, `попал, вопрос: ${confirm}`);
      eq(hpAfter(handler, 2).hp, 20, `промах, вопрос: ${confirm}`);
    }
  });

  test('сам вызываемый эффект кнопки: итог «итог» видят и обычная подписка, и подписка с вопросом', () => {
    for (const confirm of [false, true]) {
      const out = hpAfter(reply('after:удар', '@итог == 1', confirm), 2);
      eq(out.hp, 19, `вопрос: ${confirm}`);
      eq(out.questions, confirm ? 1 : 0);
    }
  });

  test('условие, которое ложно по итогу, вопроса не задаёт', () => {
    const out = hpAfter(reply('after:удар', '@итог == 2', true), 2);
    eq(out.hp, 20);
    eq(out.questions, 0);
  });
});
