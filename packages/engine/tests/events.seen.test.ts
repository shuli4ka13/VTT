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
    ok(first.question.preview[0]!.includes('[4]') && first.question.preview[0]!.includes('Бросок'), first.question.preview.join(' | '));
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

group('увидев кости: поздние броски видят, что сделала реакция', () => {
  test('реакция потратила удачу — величина после проверки читает уже потраченное', () => {
    const system = world({
      удар: {
        label: 'Удар', activation: 'manual',
        steps: [
          { id: 'бросок', type: 'threshold', roll: { die: { constant: 'к20' }, tags: ['атака'] }, versus: { expr: '10' } },
          { id: 'урон', type: 'amount', source: 'item', fixed: { expr: '5 + @удача * 10' } },
          { type: 'apply', target: { tag: 'хп' }, direction: 'subtract', value: { expr: '@урон' } },
        ],
      },
      жертва: { label: 'Жертва', activation: 'passive', on: [{ on: 'seen', steps: [{ type: 'apply', target: { tag: 'удача' }, direction: 'subtract', value: { expr: '1' } }, { type: 'roll-plus', value: { expr: '0' } }] }] },
    });
    const out = play(system, [{ ...sheet('а', ['жертва']), values: { удача: 1 } } as Sheet, sheet('б')], [15]);
    eq(hp(out, 'б'), 15, 'удача уже 0: урон 5, а не 15');
  });
});

group('увидев кости на броске по полю листа', () => {
  test('без вопроса — срабатывает, с вопросом — молчит (вопросов вне действия нет)', async () => {
    const { checkSeen } = await import('../src/lang/check.ts');
    const system = world({
      везунчик: { label: 'Везунчик', activation: 'passive', on: [{ on: 'seen', steps: [{ type: 'roll-reroll', upTo: { expr: '1' } }] }] },
      вдохновение: { label: 'Вдохновение', activation: 'passive', on: [{ on: 'seen', confirm: true, steps: [{ type: 'roll-plus', value: { expr: '10' } }] }] },
    });
    const sheets = [sheet('а', ['везунчик', 'вдохновение'])];
    const out = checkSeen({ system, compendium: book, die: queue(1, 12) }, sheets, 'а', { die: { constant: 'к20' }, tags: ['атака'] }, 'проверка');
    eq(out.total, 12);
    ok(out.lines.some(line => line.includes('Везунчик')), out.lines.join(' | '));
  });
});

group('наблюдатели: реакции третьих лиц', () => {
  test('бард видит бросок врага по союзнику и режет его — вопрос задают барду', () => {
    const system = world({
      насмешка: { label: 'Язвительная насмешка', activation: 'passive', on: [{ on: 'seen', watch: true, confirm: true, steps: [{ type: 'roll-plus', value: { expr: '-5' } }] }] },
    });
    const sheets = [sheet('а'), sheet('б'), sheet('бард', ['насмешка'])];
    const first = play(system, sheets, [12]);
    eq(first.kind, 'paused');
    if (first.kind !== 'paused') return;
    eq(first.question.sheetId, 'бард');
    const journal = { ...first.journal, answers: { ...first.journal.answers, [first.question.key]: [first.question.offers[0]!.id] } };
    const second = play(system, sheets, [], journal);
    eq(hp(second, 'б'), 20, '12 − 5 = 7 против 10 — промах');
  });

  test('«когда кого-то ранили» слышит третий лист, а не сама цель', () => {
    const system = world({
      сочувствие: { label: 'Сочувствие', activation: 'passive', on: [{ on: 'affected', watch: true, if: { expr: '@вызов.цель == "б"' }, steps: [{ type: 'apply', target: { tag: 'удача' }, direction: 'add', value: { expr: '1' } }] }] },
    });
    const out = play(system, [sheet('а'), sheet('б', ['сочувствие']), sheet('в', ['сочувствие'])], [15]);
    eq(out.sheets.find(s => s.id === 'в')!.values.удача ?? 1, 2, 'наблюдатель отозвался');
    eq(out.sheets.find(s => s.id === 'б')!.values.удача ?? 1, 1, 'цель своим «наблюдаю» на себя не слышит');
  });
});

group('наблюдатели: по ревью', () => {
  test('два наблюдателя с одним эффектом бросают каждый свою кость', () => {
    const system = world({
      порча: { label: 'Порча', activation: 'passive', on: [{ on: 'seen', watch: true, steps: [{ type: 'roll-plus', value: { expr: "0 - кинуть('1d4')" } }] }] },
    });
    const out = play(system, [sheet('а'), sheet('б'), sheet('в', ['порча']), sheet('г', ['порча'])], [14, 1, 4]);
    eq(hp(out, 'б'), 20, '14 − 1 − 4 = 9 — промах; с одинаковыми костями было бы 14 − 1 − 1 = 12 и попадание');
  });
});

group('ожидание для кнопки', () => {
  test('кости по среднему, на вопросы «нет», листы не тронуты', async () => {
    const { expectAction } = await import('../src/events/trial.ts');
    const system = world({
      вдохновение: { label: 'Вдохновение', activation: 'passive', on: [{ on: 'seen', confirm: true, steps: [{ type: 'roll-plus', value: { expr: '-20' } }] }] },
    });
    const sheets = [sheet('а', ['вдохновение']), sheet('б')];
    const out = expectAction({ system, compendium: book, clock: null }, sheets, { actionId: 'приём:0', fromId: 'а', toIds: ['б'] });
    eq(out.trouble, null);
    ok(out.lines.some(line => line.includes('[11]')), out.lines.join(' | '));
    eq(sheets[1]!.values.хп, undefined, 'настоящие листы не тронуты');
  });
});

group('ядро: по ревью', () => {
  test('вызов, будящий подписку на себя же, обрывается ошибкой словами, а не переполнением стека', () => {
    const system = world({
      удар: { label: 'Удар', activation: 'manual', steps: [{ type: 'emit', event: 'эхо' }] },
      эхо: { label: 'Эхо', activation: 'manual', params: [], steps: [] },
      отзвук: { label: 'Отзвук', activation: 'passive', on: [{ on: 'targeted', of: 'event:эхо', steps: [{ type: 'emit', event: 'эхо' }] }] },
    });
    let message = '';
    try { play(system, [sheet('а'), sheet('б', ['отзвук'])], []); } catch (err) { message = (err as Error).message; }
    ok(message.includes('похоже, идут по кругу'), message);
  });

  test('ложное «когда» у броска действующего — кость не брошена, реакции на неё не будят', () => {
    const system = world({
      удар: {
        label: 'Удар', activation: 'manual',
        steps: [
          { id: 'бросок', type: 'threshold', roll: { die: { constant: 'к20' }, tags: ['атака'] }, versus: { expr: '10' }, when: { expr: 'нет' } },
          { type: 'apply', target: { tag: 'хп' }, direction: 'subtract', value: { expr: '1' } },
        ],
      },
      плата: { label: 'Плата', activation: 'passive', on: [{ on: 'seen', steps: [{ type: 'apply', target: { tag: 'удача' }, direction: 'subtract', value: { expr: '1' } }, { type: 'roll-plus', value: { expr: '0' } }] }] },
    });
    const out = play(system, [{ ...sheet('а', ['плата']), values: { удача: 1 } } as Sheet, sheet('б')], []);
    eq(out.kind, 'done');
    eq(out.sheets.find(s => s.id === 'а')!.values.удача, 1, 'реакция на несостоявшийся бросок не сработала');
  });

  test('две выбранные реакции на один ресурс: вторая пропускается с причиной, действие не падает', () => {
    const shield = (label: string) => ({
      label, activation: 'passive',
      on: [{ on: 'targeted', confirm: true, cost: [{ type: 'compare', value: { expr: '@удача' }, versus: { expr: '1' }, breakIf: 'less', note: 'нет удачи' }, { type: 'apply', target: { tag: 'удача' }, direction: 'subtract', value: { expr: '1' } }], steps: [] }],
    });
    const system = world({ р1: shield('Р1'), р2: shield('Р2') });
    const sheets = [sheet('а'), { ...sheet('б', ['р1', 'р2']), values: { удача: 1 } } as Sheet];
    const first = play(system, sheets, [15]);
    if (first.kind !== 'paused') { ok(false, 'ждали вопрос'); return; }
    const journal = { ...first.journal, answers: { ...first.journal.answers, [first.question.key]: ['р1', 'р2'] } };
    const second = play(system, sheets, [], journal);
    eq(second.kind, 'done');
    if (second.kind === 'done') ok(second.log.some(line => line.includes('не состоялось')), second.log.join(' | '));
  });
});
