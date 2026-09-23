import { describe, it, expect } from 'vitest';
import { SAMPLE_WORLDS } from '../src/model/systems.ts';
import { flattenSystem } from '../src/model/inherit.ts';
import { unifySides } from '../src/model/sides.ts';
import { availableActions, send, receive } from '../src/events/envelope.ts';
import { exchange } from '../src/events/exchange.ts';
import type { System, Compendium, Sheet } from '../src/model/types.ts';

const dieOf = () => { let n = 0; return (sides: number) => ((n++ * 7 + 3) % sides) + 1; };

function answers(system: System, effectId: string): Record<string, number | string> {
  const out: Record<string, number | string> = {};
  for (const param of system.effects[effectId]?.params ?? []) {
    const p = param as { key: string; kind?: string; from?: string; ask?: { min?: number } };
    if (p.kind === 'number') out[p.key] = Math.max(1, p.ask?.min ?? 1);
    if (p.kind === 'choice' && p.from) {
      const first = system.tables?.[p.from]?.rows?.[0]?.value;
      if (first !== undefined) out[p.key] = first as number | string;
    }
  }
  return out;
}

function play(system: System, compendium: Compendium, sheets: Sheet[], from: Sheet, to: Sheet, actionId: string, effectId: string) {
  try {
    const out = exchange({
      system, compendium, die: dieOf(), sheets, actionId, fromId: from.id, toId: to.id, inputs: answers(system, effectId),
    });
    return out.sheets.map(s => ({ id: s.id, values: s.values, effects: s.effects }));
  } catch (err) {
    return `${(err as Error).name}: ${(err as Error).message}`;
  }
}

for (const world of SAMPLE_WORLDS) {
  describe(`${world.title}: хозяин в имени считает так же, как старые пометки`, () => {
    const before = { system: flattenSystem(world.system), compendium: world.compendium };
    const after = unifySides({ system: world.system, compendium: world.compendium });
    const migrated = { system: flattenSystem(after.system), compendium: after.compendium };

    it('после перевода нет ни одной старой пометки стороны', () => {
      const text = JSON.stringify(after.system.effects);
      expect(text).not.toMatch(/"of":"target"/);
      expect(text).not.toMatch(/"sender":\[/);
    });

    for (const from of world.sheets) {
      for (const action of availableActions(from, before)) {
        it(`${from.id} · ${action.id} — на всех целях одинаково`, () => {
          let played = 0;
          for (const to of world.sheets) {
            const now = play(migrated.system, migrated.compendium, world.sheets, from, to, action.id, action.effect);
            expect(now).toEqual(play(before.system, before.compendium, world.sheets, from, to, action.id, action.effect));
            if (typeof now !== 'string') played++;
          }
          expect(played, 'действие хоть на ком-то сыгралось').toBeGreaterThan(0);
        });
      }
    }
  });
}

describe('имя с хозяином', () => {
  const system = {
    id: 'стороны', name: 'стороны',
    fields: [
      { tag: 'сила', label: 'Сила', value: { kind: 'stored', type: 'number', default: 0 } },
      { tag: 'броня', label: 'Броня', value: { kind: 'stored', type: 'number', default: 10 } },
      { tag: 'хп', label: 'Хиты', value: { kind: 'stored', type: 'number', default: 20 } },
    ],
    effects: {
      удар: {
        label: 'Удар', activation: 'manual',
        steps: [{
          type: 'apply', target: { tag: 'хп' }, direction: 'subtract', targetModifiers: false,
          value: { expr: '@отправитель.сила * 2 - @получатель.броня' },
        }],
      },
      просто: {
        label: 'Просто', activation: 'manual',
        steps: [{ type: 'emit', event: 'урон', args: { сколько: { expr: '@отправитель.сила' } } }],
      },
      урон: {
        label: 'Урон', params: [{ key: 'сколько', label: 'Сколько', kind: 'number', role: 'amount' }],
        steps: [{ type: 'apply', target: { tag: 'хп' }, direction: 'subtract', targetModifiers: false, value: { expr: '@сколько + @получатель.сила' } }],
      },
      наивный: {
        label: 'Наивный', params: [{ key: 'сколько', label: 'Сколько', kind: 'number', role: 'amount' }],
        steps: [{ type: 'apply', target: { tag: 'хп' }, direction: 'subtract', targetModifiers: false, value: { expr: '@отправитель.сила' } }],
      },
      зовёт_наивного: {
        label: 'Зовёт', activation: 'manual',
        steps: [{ type: 'emit', event: 'наивный', args: { сколько: { const: 1 } } }],
      },
    },
    records: { приём: { kind: 'action', label: 'Приём' } },
  } as unknown as System;
  const book = {
    items: [],
    actions: ['удар', 'просто', 'зовёт_наивного'].map(id => ({ id, rk: 'приём', label: id, effect: id })),
  } as unknown as Compendium;
  const sheet = (id: string, сила: number, броня: number): Sheet =>
    ({ id, systemId: 'стороны', kind: 'pc', name: id, values: { сила, броня, хп: 20 }, equipped: [], effects: [], actions: ['удар', 'просто', 'зовёт_наивного'] } as unknown as Sheet);
  const hit = (action: string) => {
    const env = send(`${action}:0`, { system, sheet: sheet('бьёт', 7, 1), compendium: book, die: () => 1 });
    return receive(env, { system, sheet: sheet('держит', 3, 5), compendium: book, die: () => 1 }).sheet.values.хп;
  };

  it('сила — у отправителя, броня — у получателя: 7·2 − 5 = 9', () => {
    expect(hit('удар')).toBe(20 - 9);
  });

  it('вызываемый эффект получает силу отправителя входом, а свою силу читает сам: 7 + 3', () => {
    expect(hit('просто')).toBe(20 - 10);
  });

  it('вызываемый эффект не может тайком прочитать лист отправителя', () => {
    expect(() => hit('зовёт_наивного')).toThrow(/отправителя не пришло/);
  });
});
