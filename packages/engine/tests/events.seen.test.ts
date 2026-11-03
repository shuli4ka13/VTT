import { group, test, eq, ok } from './harness.ts';
import { act } from '../src/core/act.ts';
import { CUT_WORDS } from '../src/core/limits.ts';
import { emptyJournal } from '../src/core/external.ts';
import type { Journal } from '../src/core/external.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const queue = (...values: number[]) => {
  const rest = [...values];
  return () => {
    if (!rest.length) throw new Error('кубик бросили больше раз, чем ожидал тест');
    return rest.shift()!;
  };
};

const ACTOR = { key: 'действующий', kind: 'sheet' };
const TARGETS = { key: 'цели', kind: 'sheet', many: true, item: { key: 'цель' } };
const EACH = { type: 'each', of: 'цели' };
const roll = (extra: Record<string, unknown> = {}) => ({ id: 'бросок', type: 'roll', die: 'к20', tags: ['атака'], by: { expr: '@действующий' }, ...extra });
const mine = '@бросающий == @носитель';

const world = (effects: Record<string, unknown>): System => ({
  id: 'к', name: 'к',
  tables: {
    лист: { shape: 'single', columns: [{ key: 'хп', label: 'Хиты', kind: 'number', default: 20 }, { key: 'удача', label: 'Удача', kind: 'number', default: 1, min: 0 }, { key: 'кд', label: 'КД', kind: 'number', default: 10 }] },
    приём: { shape: 'book', use: 'action', label: 'Приём', columns: [], bindings: [{ label: 'Удар', effect: 'удар', args: {} }] },
    rolls: { label: 'Броски', key: 'word', rows: [{ value: 'атака' }] },
  },
  constants: { к20: { label: 'к20', kind: 'die', dice: [{ count: 1, sides: 20 }] } },
  effects: {
    удар: {
      label: 'Удар', activation: 'manual', params: [ACTOR, TARGETS],
      steps: [
        EACH,
        roll(),
        { id: 'попал', type: 'check', value: { expr: '@бросок' }, versus: { expr: '@цель.кд' } },
        { type: 'branch', if: { expr: 'не @попал.success' } }, { type: 'stop' }, { type: 'end' },
        { type: 'apply', target: { expr: '@цель.хп' }, direction: 'subtract', value: { expr: '5' } },
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
    const system = world({ везунчик: { label: 'Везунчик', activation: 'passive', on: [{ on: 'seen', if: { expr: mine + ' и есть(@roll.tags, "атака")' }, steps: [{ type: 'roll-reroll', upTo: { expr: '1' } }] }] } });
    const out = play(system, [sheet('а', ['везунчик']), sheet('б')], [1, 15]);
    eq(out.kind, 'done');
    eq(hp(out, 'б'), 15);
  });

  test('с вопросом: игрок видит кости, платит удачей и докидывает — выпавшее остаётся, повтор берёт те же кости', () => {
    const system = world({
      вдохновение: {
        label: 'Вдохновение', activation: 'passive',
        on: [{
          on: 'seen', confirm: true, if: { expr: mine },
          cost: [{ type: 'apply', target: { expr: '@носитель.удача' }, direction: 'subtract', value: { expr: '1' } }],
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

  test('Героическое вдохновение: перебросить меньшую — с вопросом, трасса «переброшено 4 → 17», повтор по журналу берёт те же кости', () => {
    const system = world({
      вдохновение: {
        label: 'Героическое вдохновение', activation: 'passive',
        on: [{
          on: 'seen', confirm: true, if: { expr: mine },
          cost: [{ type: 'apply', target: { expr: '@носитель.удача' }, direction: 'subtract', value: { expr: '1' } }],
          steps: [{ type: 'roll-reroll', which: 'lowest' }],
        }],
      },
    });
    const sheets = [sheet('а', ['вдохновение']), sheet('б')];
    const first = play(system, sheets, [4]);
    eq(first.kind, 'paused');
    if (first.kind !== 'paused') return;
    const journal = { ...first.journal, answers: { ...first.journal.answers, [first.question.key]: [first.question.offers[0]!.id] } };
    const second = play(system, sheets, [17], journal);
    eq(second.kind, 'done');
    eq(hp(second, 'б'), 15, '4 переброшена на 17 — попадание');
    ok(second.log.join(' ').includes('переброшено 4 → 17 — итог 4 → 17'), second.log.join(' | '));
    eq(second.sheets.find(s => s.id === 'а')!.values.удача, 0, 'удача потрачена');
    const again = play(system, sheets, [], second.journal);
    eq(again.kind, 'done');
    eq(hp(again, 'б'), 15, 'повтор по журналу — те же кости');
  });

  test('«Перебросить» с неизвестным режимом — ошибка, а не тихий порог', () => {
    const system = world({ кривой: { label: 'Кривой', activation: 'passive', on: [{ on: 'seen', if: { expr: mine }, steps: [{ type: 'roll-reroll', which: 'всё' }] }] } });
    let error = '';
    try { play(system, [sheet('а', ['кривой']), sheet('б')], [4, 4]); } catch (err) { error = String((err as Error).message); }
    ok(error.includes('не знает режима «всё»'), error);
  });

  test('окно видит итог с прибавкой шага: превью, @roll.total и трасса «Прибавить» сходятся', () => {
    const system = world({
      точная: {
        label: 'Точная', activation: 'passive',
        on: [{ on: 'seen', confirm: true, if: { expr: `${mine} и @roll.total < 13` }, steps: [{ type: 'roll-plus', value: { expr: 'кинуть(к6)' } }] }],
      },
    });
    (system.effects.удар!.steps as unknown[])[1] = roll({ bonus: { expr: '8' } });
    const sheets = [sheet('а', ['точная']), sheet('б')];
    const first = play(system, sheets, [4]);
    eq(first.kind, 'paused', '4 + 8 = 12 < 13 — реакция предложена');
    if (first.kind !== 'paused') return;
    ok(first.question.preview[0]!.includes('[4] + 8 → 12'), first.question.preview.join(' | '));
    const journal = { ...first.journal, answers: { ...first.journal.answers, [first.question.key]: [first.question.offers[0]!.id] } };
    const second = play(system, sheets, [3], journal);
    eq(second.kind, 'done');
    if (second.kind !== 'done') return;
    ok(JSON.stringify(second).includes('итог 12 → 15') || JSON.stringify(second).includes('"before":12,"after":15'), 'трасса «Прибавить» в тех же числах, что окно');
  });

  test('бросок по мне: цель видит кости нападающего и отнимает от итога', () => {
    const system = world({ насмешка: { label: 'Насмешка', activation: 'passive', on: [{ on: 'seen', if: { expr: '@против == @носитель' }, steps: [{ type: 'roll-plus', value: { expr: '-5' } }] }] } });
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
        label: 'Удар', activation: 'manual', params: [ACTOR, TARGETS],
        steps: [
          EACH, roll(),
          { id: 'попал', type: 'check', value: { expr: '@бросок' }, versus: { expr: '@цель.кд' } },
          { type: 'branch', if: { expr: 'не @попал.success' } }, { type: 'stop' }, { type: 'end' },
          { id: 'урон', type: 'roll', fixed: { expr: '5 + @действующий.удача * 10' } },
          { type: 'apply', target: { expr: '@цель.хп' }, direction: 'subtract', value: { expr: '@урон' } },
        ],
      },
      жертва: { label: 'Жертва', activation: 'passive', on: [{ on: 'seen', if: { expr: mine }, steps: [{ type: 'apply', target: { expr: '@носитель.удача' }, direction: 'subtract', value: { expr: '1' } }, { type: 'roll-plus', value: { expr: '0' } }] }] },
    });
    const out = play(system, [{ ...sheet('а', ['жертва']), values: { удача: 1 } } as Sheet, sheet('б')], [15]);
    eq(hp(out, 'б'), 15, 'удача уже 0: урон 5, а не 15');
  });
});

group('увидев кости на броске по полю листа', () => {
  test('без вопроса — срабатывает сразу, с вопросом — спрашивает (вопросы есть в любой операции)', async () => {
    const { perform } = await import('../src/core/perform.ts');
    const system = world({
      везунчик: { label: 'Везунчик', activation: 'passive', on: [{ on: 'seen', if: { expr: mine }, steps: [{ type: 'roll-reroll', upTo: { expr: '1' } }] }] },
      вдохновение: { label: 'Вдохновение', activation: 'passive', on: [{ on: 'seen', confirm: true, if: { expr: mine }, steps: [{ type: 'roll-plus', value: { expr: '10' } }] }] },
    });
    const field = { ...system, tables: { ...system.tables, лист: { ...(system.tables as never as Record<string, { columns: unknown[] }>).лист, columns: [...(system.tables as never as Record<string, { columns: unknown[] }>).лист.columns, { key: 'ловкость', label: 'Ловкость', kind: 'number', default: 0 }] } }, rolls: { атака: { die: 'к20', fields: [{ table: 'лист', column: 'ловкость' }] } } } as never;
    const sheets = [sheet('а', ['везунчик', 'вдохновение'])];
    const first = perform({ system: field, compendium: book, clock: null, sheets, die: queue(1, 12) }, { op: 'roll', sheetId: 'а', tag: 'ловкость' });
    eq(first.kind, 'paused');
    if (first.kind !== 'paused') return;
    eq(first.question.window, 'seen');
    const second = perform({ system: field, compendium: book, clock: null, sheets, die: queue(), journal: { ...first.journal, answers: { ...first.journal.answers, [first.question.key]: ['вдохновение'] } } }, { op: 'roll', sheetId: 'а', tag: 'ловкость' });
    eq(second.kind, 'done');
    ok(second.log[0]!.includes('= 22'), second.log.join(' | '));
    ok(second.log.some(line => line.includes('Везунчик')), second.log.join(' | '));
  });
});

group('наблюдатели: реакции третьих лиц', () => {
  test('бард видит бросок врага по союзнику и режет его — вопрос задают барду', () => {
    const system = world({
      насмешка: { label: 'Язвительная насмешка', activation: 'passive', on: [{ on: 'seen', confirm: true, if: { expr: '@бросающий != @носитель' }, steps: [{ type: 'roll-plus', value: { expr: '-5' } }] }] },
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
      сочувствие: { label: 'Сочувствие', activation: 'passive', on: [{ on: 'after:удар', if: { expr: '@цель != @носитель' }, steps: [{ type: 'apply', target: { expr: '@носитель.удача' }, direction: 'add', value: { expr: '1' } }] }] },
    });
    const out = play(system, [sheet('а'), sheet('б', ['сочувствие']), sheet('в', ['сочувствие'])], [15]);
    eq(out.sheets.find(s => s.id === 'в')!.values.удача ?? 1, 2, 'наблюдатель отозвался');
    eq(out.sheets.find(s => s.id === 'б')!.values.удача ?? 1, 1, 'цель своим «наблюдаю» на себя не слышит');
  });
});

group('наблюдатели: по ревью', () => {
  test('два наблюдателя с одним эффектом бросают каждый свою кость', () => {
    const system = world({
      порча: { label: 'Порча', activation: 'passive', on: [{ on: 'seen', if: { expr: '@бросающий != @носитель' }, steps: [{ type: 'roll-plus', value: { expr: "0 - кинуть('1d4')" } }] }] },
    });
    const out = play(system, [sheet('а'), sheet('б'), sheet('в', ['порча']), sheet('г', ['порча'])], [14, 1, 4]);
    eq(hp(out, 'б'), 20, '14 − 1 − 4 = 9 — промах; с одинаковыми костями было бы 14 − 1 − 1 = 12 и попадание');
  });
});

group('ожидание для кнопки', () => {
  test('кости по среднему, на вопросы «нет», листы не тронуты', async () => {
    const { expectAction } = await import('../src/events/trial.ts');
    const system = world({
      вдохновение: { label: 'Вдохновение', activation: 'passive', on: [{ on: 'seen', confirm: true, if: { expr: mine }, steps: [{ type: 'roll-plus', value: { expr: '-20' } }] }] },
    });
    const sheets = [sheet('а', ['вдохновение']), sheet('б')];
    const out = expectAction({ system, compendium: book, clock: null }, sheets, { actionId: 'приём:0', fromId: 'а', toIds: ['б'] });
    eq(out.trouble, null);
    ok(out.lines.some(line => line.includes('[11]')), out.lines.join(' | '));
    eq(sheets[1]!.values.хп, undefined, 'настоящие листы не тронуты');
  });
});

group('ядро: по ревью', () => {
  test('подписка, будящая сама себя, обрывается пределом, а действие завершается', () => {
    const system = world({
      удар: { label: 'Удар', activation: 'manual', params: [ACTOR, TARGETS], steps: [EACH, { type: 'emit', effect: 'эхо' }] },
      эхо: { label: 'Эхо', activation: 'manual', params: [], steps: [] },
      отзвук: { label: 'Отзвук', activation: 'passive', on: [{ on: 'after:эхо', steps: [{ type: 'emit', effect: 'эхо' }] }] },
    });
    const out = play(system, [sheet('а'), sheet('б', ['отзвук'])], []);
    eq(out.kind, 'done');
  });

  test('подписка, будящая сама себя, упирается в глубину обработчика: отказ обработчика и строка в журнале', () => {
    const system = world({
      удар: { label: 'Удар', activation: 'manual', params: [ACTOR, TARGETS], steps: [EACH, { type: 'emit', effect: 'эхо' }] },
      эхо: { label: 'Эхо', activation: 'manual', params: [], steps: [] },
      отзвук: { label: 'Отзвук', activation: 'passive', on: [{ on: 'after:эхо', steps: [{ type: 'emit', effect: 'эхо' }] }] },
    });
    const out = play(system, [sheet('а'), sheet('б', ['отзвук'])], []);
    ok(out.log.includes(CUT_WORDS), 'обработчик упёрся в глубину — отказ обработчика, строка в журнале');
  });

  test('ложное «Если» над броском действующего — кость не брошена, реакции на неё не будят', () => {
    const system = world({
      удар: {
        label: 'Удар', activation: 'manual', params: [ACTOR, TARGETS],
        steps: [
          EACH,
          { type: 'branch', if: { expr: 'нет' } }, roll(), { type: 'end' },
          { type: 'apply', target: { expr: '@цель.хп' }, direction: 'subtract', value: { expr: '1' } },
        ],
      },
      плата: { label: 'Плата', activation: 'passive', on: [{ on: 'seen', if: { expr: mine }, steps: [{ type: 'apply', target: { expr: '@носитель.удача' }, direction: 'subtract', value: { expr: '1' } }, { type: 'roll-plus', value: { expr: '0' } }] }] },
    });
    const out = play(system, [{ ...sheet('а', ['плата']), values: { удача: 1 } } as Sheet, sheet('б')], []);
    eq(out.kind, 'done');
    eq(out.sheets.find(s => s.id === 'а')!.values.удача, 1, 'реакция на несостоявшийся бросок не сработала');
  });

  test('две выбранные реакции на один ресурс: вторая пропускается с причиной, действие не падает', () => {
    const shield = (label: string) => ({
      label, activation: 'passive',
      on: [{ on: 'before:удар', confirm: true, if: { expr: '@цель == @носитель' }, cost: [
        { id: 'есть', type: 'check', value: { expr: '@носитель.удача' }, versus: { expr: '1' } },
        { type: 'branch', if: { expr: 'не @есть.success' } }, { type: 'stop', note: { expr: '"нет удачи"' } }, { type: 'end' },
        { type: 'apply', target: { expr: '@носитель.удача' }, direction: 'subtract', value: { expr: '1' } }], steps: [] }],
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

group('ядро: по ревью Fable', () => {
  const split = (extra: Record<string, unknown>) => world({
    удар: {
      label: 'Удар', activation: 'manual', params: [ACTOR, TARGETS],
      steps: [
        EACH, roll(),
        { id: 'попал', type: 'check', value: { expr: '@бросок' }, versus: { expr: '@цель.кд + 5' } },
        { type: 'branch', if: { expr: 'не @попал.success' } }, { type: 'stop' }, { type: 'end' },
        { type: 'apply', target: { expr: '@цель.хп' }, direction: 'subtract', value: { expr: '5' } },
      ],
    },
    ...extra,
  });
  const plus5 = { label: '+5', activation: 'passive', modifiers: [{ kind: 'edit', call: 'roll', param: 'bonus', op: 'add', value: { expr: '5' }, tags: ['атака'], if: { expr: mine } }] };

  test('после «Для каждой цели» атаку бросает нападающий: его +5 работает, +5 цели — нет', () => {
    eq(hp(play(split({ плюс: plus5 }), [sheet('а', ['плюс']), sheet('б')], [11]), 'б'), 15, '11 + 5 = 16 против 15 — попадание');
    eq(hp(play(split({ плюс: plus5 }), [sheet('а'), sheet('б', ['плюс'])], [11]), 'б'), 20, '+5 цели к атаке нападающего не идёт');
  });

  test('после «Для каждой цели» «бросок по мне» у цели срезает атаку, у нападающего — нет', () => {
    const cut = { label: 'Насмешка', activation: 'passive', on: [{ on: 'seen', if: { expr: '@против == @носитель' }, steps: [{ type: 'roll-plus', value: { expr: '-5' } }] }] };
    eq(hp(play(split({ насмешка: cut }), [sheet('а'), sheet('б', ['насмешка'])], [16]), 'б'), 20, '16 − 5 = 11 — промах');
    eq(hp(play(split({ насмешка: cut }), [sheet('а', ['насмешка']), sheet('б')], [16]), 'б'), 15, 'своё «по мне» нападающему атаку не режет');
  });

  test('две копии в стопке — у каждой своя кость', () => {
    const system = world({ порча: { label: 'Порча', activation: 'passive', reapply: 'stack', on: [{ on: 'seen', if: { expr: mine }, steps: [{ type: 'roll-plus', value: { expr: "0 - кинуть('1d4')" } }] }] } });
    const out = play(system, [sheet('а', ['порча', 'порча']), sheet('б')], [14, 1, 4]);
    eq(hp(out, 'б'), 20, '14 − 1 − 4 = 9 — промах; с одной костью на обе было бы 12');
  });

  test('одноразовый эффект с двумя подписками срабатывает один раз', () => {
    const system = world({
      разок: { label: 'Разок', activation: 'passive', duration: { kind: 'uses', max: 1 }, on: [
        { on: 'seen', if: { expr: mine }, steps: [{ type: 'roll-plus', value: { expr: '1' } }] },
        { on: 'seen', if: { expr: mine }, steps: [{ type: 'roll-plus', value: { expr: '10' } }] },
      ] },
    });
    const out = play(system, [{ ...sheet('а'), effects: [{ effectId: 'разок', usesLeft: 1 }] } as unknown as Sheet, sheet('б')], [5]);
    eq(hp(out, 'б'), 20, '5 + 1 = 6 — промах; второй +10 сгоревший эффект не даёт');
  });

  test('повтор id в ответе выполняет реакцию один раз', () => {
    const system = world({ вд: { label: 'Вд', activation: 'passive', on: [{ on: 'seen', confirm: true, if: { expr: mine }, steps: [{ type: 'roll-plus', value: { expr: '3' } }] }] } });
    const sheets = [sheet('а', ['вд']), sheet('б')];
    const first = play(system, sheets, [5]);
    if (first.kind !== 'paused') { ok(false, 'ждали вопрос'); return; }
    const journal = { ...first.journal, answers: { ...first.journal.answers, [first.question.key]: ['вд', 'вд'] } };
    eq(hp(play(system, sheets, [], journal), 'б'), 20, '5 + 3 = 8 — промах; дважды было бы 11 и попадание');
  });
});
