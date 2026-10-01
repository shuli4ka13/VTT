import { group, test, eq, ok } from './harness.ts';
import { act } from '../src/lang/act.ts';
import { emptyJournal } from '../src/lang/journal.ts';
import type { Journal } from '../src/lang/journal.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const queue = (...values: number[]) => {
  const rest = [...values];
  return () => {
    if (!rest.length) throw new Error('кубик бросили больше раз, чем ожидал тест');
    return rest.shift()!;
  };
};

const world = (effects: Record<string, unknown>): System => ({
  id: 'к', name: 'к',
  tables: {
    лист: { shape: 'single', columns: [{ key: 'хп', label: 'Хиты', kind: 'number', default: 20 }, { key: 'удача', label: 'Удача', kind: 'number', default: 1, min: 0 }] },
    приём: { shape: 'book', use: 'action', label: 'Приём', columns: [], bindings: [{ label: 'Удар', effect: 'удар', args: {} }] },
    rolls: { label: 'Броски', key: 'word', rows: [{ value: 'атака' }] },
  },
  constants: { к20: { label: 'к20', kind: 'die', dice: [{ count: 1, sides: 20 }] } },
  effects: {
    удар: {
      label: 'Удар', activation: 'manual',
      steps: [
        { id: 'бросок', type: 'threshold', roll: { die: { constant: 'к20' }, tags: ['атака'] }, versus: { expr: '10' } },
        { type: 'apply', target: { tag: 'хп' }, direction: 'subtract', value: { expr: '5' } },
      ],
    },
    ...effects,
  },
} as unknown as System);

const book = { records: [{ id: 'приём', table: 'приём', label: 'Удар', cells: {} }] } as Compendium;
const sheet = (id: string, effects: string[] = []): Sheet =>
  ({ id, systemId: 'к', name: id, values: {}, has: [{ of: 'приём' }], effects: effects.map(effectId => ({ effectId })) } as unknown as Sheet);
const hp = (out: { sheets: Sheet[] }, id: string) => out.sheets.find(s => s.id === id)!.values.хп ?? 20;

const play = (system: System, sheets: Sheet[], dice: number[], journal: Journal = emptyJournal()) =>
  act({ system, compendium: book, clock: null, sheets, die: queue(...dice), journal }, { actionId: 'приём:0', fromId: 'а', toIds: ['б'] });

group('увидев кости', () => {
  test('без вопроса: перебросить единицу — и удар попал', () => {
    const system = world({ везунчик: { label: 'Везунчик', activation: 'passive', on: [{ on: 'seen', tags: ['атака'], steps: [{ type: 'roll-reroll', upTo: { expr: '1' } }] }] } });
    const out = play(system, [sheet('а', ['везунчик']), sheet('б')], [1, 15]);
    eq(out.kind, 'done');
    eq(hp(out, 'б'), 15);
  });

  test('с вопросом: игрок видит кости, платит удачей и докидывает — выпавшее остаётся, повтор берёт те же кости', () => {
    const system = world({
      вдохновение: {
        label: 'Вдохновение', activation: 'passive',
        on: [{
          on: 'seen', confirm: true,
          cost: [{ type: 'apply', target: { tag: 'удача' }, direction: 'subtract', value: { expr: '1' } }],
          steps: [{ type: 'roll-add', count: { expr: '1' }, keep: 'best' }],
        }],
      },
    });
    const sheets = [sheet('а', ['вдохновение']), sheet('б')];
    const first = play(system, sheets, [4]);
    eq(first.kind, 'paused');
    if (first.kind !== 'paused') return;
    eq(first.question.window, 'seen');
    ok(first.question.preview[0]!.includes('[4]'), first.question.preview.join(' | '));
    const journal = { ...first.journal, answers: { ...first.journal.answers, [first.question.key]: [first.question.offers[0]!.id] } };
    const second = play(system, sheets, [17], journal);
    eq(second.kind, 'done');
    eq(hp(second, 'б'), 15, '4 и 17 — оставлена 17, попадание');
    eq(second.sheets.find(s => s.id === 'а')!.values.удача, 0, 'удача потрачена');
  });

  test('бросок по мне: цель видит кости нападающего и отнимает от итога', () => {
    const system = world({ насмешка: { label: 'Насмешка', activation: 'passive', on: [{ on: 'seen', as: 'against', steps: [{ type: 'roll-plus', value: { expr: '-5' } }] }] } });
    const out = play(system, [sheet('а'), sheet('б', ['насмешка'])], [12]);
    eq(hp(out, 'б'), 20, '12 − 5 = 7 против 10 — промах');
  });

  test('без подписок бросок не трогается', () => {
    eq(hp(play(world({}), [sheet('а'), sheet('б')], [12]), 'б'), 15);
  });
});

group('увидев кости в проверке системы', () => {
  test('«Докинуть» в обычных шагах — ошибка', async () => {
    const { lintSystem, errorsOf } = await import('../src/model/lint.ts');
    const system = world({ кривой: { label: 'Кривой', activation: 'manual', steps: [{ type: 'roll-add', count: { expr: '1' } }] } });
    ok(errorsOf(lintSystem(system, book)).some(p => p.text.includes('только в подписке')));
  });
});
