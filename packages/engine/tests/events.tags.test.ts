import { group, test, eq, ok, deepEq, throws } from './harness.ts';
import { exchange, deliverMany } from './play.ts';
import { CUT_WORDS } from '../src/core/limits.ts';

const queue = (...values: number[]) => {
  const rest = [...values];
  return () => {
    if (!rest.length) throw new Error('кубик бросили больше раз, чем ожидал тест');
    return rest.shift()!;
  };
};

const passive = (label: string, modifiers: unknown[]) =>
  ({ label, activation: 'passive', duration: { kind: 'permanent' }, modifiers });

const SOURCES = ['магический'];

const ACTOR = { key: 'действующий', kind: 'sheet' };
const TARGETS = { key: 'жертвы', kind: 'sheet', many: true, item: { key: 'цель' } };
const EACH = { type: 'each', of: 'жертвы' };

const damageArgs = (amount: unknown, tags: string[], who: unknown = { expr: '@цель' }, by: unknown = { expr: '@действующий' }) => ({
  лист: who, обидчик: by, сколько: amount,
  ...Object.fromEntries(tags.map(tag => [SOURCES.includes(tag) ? 'природа' : 'тип', { expr: JSON.stringify(tag) }])),
});

const strike = (id: string, label: string, amount: number, tags: string[]) => ({
  label, activation: 'manual', params: [ACTOR, TARGETS],
  steps: [
    EACH,
    { id: 'n', type: 'roll', fixed: { expr: `${JSON.stringify(amount)}` } },
    { type: 'emit', effect: 'урон', args: damageArgs({ expr: '@n' }, tags) },
  ],
});

const world = (extraEffects: Record<string, unknown> = {}, receive: unknown[] | undefined = [
  { type: 'apply', target: { expr: '@лист.хп' }, direction: 'subtract', value: { expr: '@сколько' } },
]) => ({
  id: 'вызовы',
  effects: {
    удар: strike('удар', 'Удар', 8, ['рубящий']),
    огонь: strike('огонь', 'Огненный шар', 8, ['огонь', 'магический']),
    сигнал: { label: 'Тревога', activation: 'manual', params: [ACTOR, TARGETS], steps: [EACH, { type: 'emit', effect: 'тревога', args: { лист: { expr: '@цель' } } }] },
    урон: {
      label: 'Урон',
      params: [
        { key: 'лист', label: 'Лист', kind: 'sheet' },
        { key: 'обидчик', label: 'Обидчик', kind: 'sheet', optional: true },
        { key: 'сколько', label: 'Сколько', kind: 'number', role: 'amount' },
        { key: 'тип', label: 'Тип', kind: 'choice', from: 'типы', optional: true },
        { key: 'природа', label: 'Природа', kind: 'choice', from: 'источники', optional: true },
      ],
      ...(receive ? { steps: receive } : {}),
    },
    тревога: { label: 'Тревога', params: [{ key: 'лист', label: 'Лист', kind: 'sheet' }] },
    ...extraEffects,
  },
  tables: { лист: { shape: 'single', columns: [{ key: 'хп', label: 'Хиты', kind: 'number', default: 20, min: 0 }] },
    типы: { label: 'Типы', key: 'word', rows: ['рубящий', 'колющий', 'огонь'].map(value => ({ value, label: value })) },
    источники: { label: 'Источники', key: 'word', rows: [{ value: 'магический', label: 'магический' }] },
   приём: { shape: 'book', use: 'action', label: 'Приём' } },
  
});

const book = {
  records: [{ id: 'удар', table: 'приём', label: 'Удар', bindings: [{ label: 'Удар', effect: 'удар', args: {} }] }, { id: 'огонь', table: 'приём', label: 'Огненный шар', bindings: [{ label: 'Огненный шар', effect: 'огонь', args: {} }] }, { id: 'тревога', table: 'приём', label: 'Тревога', bindings: [{ label: 'Тревога', effect: 'сигнал', args: {} }] }],
};

const hero = (effects: string[] = []) => ({
  id: 'герой', values: { хп: 20 }, effects: effects.map(effectId => ({ effectId })), has: [{ of: 'удар' }, { of: 'огонь' }, { of: 'тревога' }],
});
const foe = (effects: string[] = []) => ({ id: 'враг', values: { хп: 20 }, effects: effects.map(effectId => ({ effectId })) });

const hit = (sys: any, action: string, target: any, ...dice: number[]) => {
  const played = exchange({
    system: sys, compendium: book as any, die: queue(...dice), sheets: [hero() as any, target],
    actionId: `${action}:0`, fromId: 'герой', toId: 'враг',
  });
  return {
    sheet: played.sheets.find(s => s.id === 'враг')!,
    report: played.reports.find(entry => !entry.report.reply && entry.toId === 'враг')!.report,
    replies: played.reports.filter(entry => entry.report.reply),
    hero: played.sheets.find(s => s.id === 'герой')!,
  };
};

group('вызываемый эффект как провод: действующий не лезет в чужое поле', () => {
  test('урон доезжает по правилу приёма из словаря', () => {
    const out = hit(world(), 'удар', foe());
    eq(out.sheet.values.хп, 12);
    deepEq(out.report.emitted.map(({ event, amount, incoming, tags }) => ({ event, amount, incoming, tags })), [{ event: 'урон', amount: 8, incoming: 8, tags: ['рубящий'] }]);
  });

  test('в трассе сначала вызов, потом его шаги с пометкой, откуда они', () => {
    const t = hit(world(), 'удар', foe()).report.trace;
    eq(t[1]!.type, 'emit');
    eq(t[2]!.type, 'apply');
    eq(t[2]!.within, 'урон');
  });

  test('необъявленный вызов — ошибка перечисляет известные эффекты', () => {
    const sys: any = world({ чужое: { label: 'Чужое', activation: 'manual', params: [ACTOR, TARGETS], steps: [EACH, { type: 'emit', effect: 'котик' }] } });
    const withAction = { ...book, records: [...book.records, { id: 'чужое', table: 'приём', label: 'Чужое', bindings: [{ label: 'Чужое', effect: 'чужое', args: {} }] }] };
    throws(() => exchange({
      system: sys, compendium: withAction as any, die: queue(), sheets: [{ ...hero(), has: [...hero().has, { of: 'чужое' }] } as any, foe() as any],
      actionId: 'чужое:0', fromId: 'герой', toId: 'враг',
    }), 'котик');
  });

  test('вызов без шагов — просто сигнал: поля не тронуты, но он отправлен', () => {
    const out = hit(world(), 'тревога', foe());
    eq(out.sheet.values.хп, 20);
    deepEq(out.report.changes, []);
    eq(out.report.emitted[0]!.event, 'тревога');
  });
});

group('сопротивления по тегам', () => {
  const resist = world({
    огнеупор: passive('Сопротивление огню', [
      { kind: 'edit', call: 'урон', param: 'сколько', op: 'mul', value: { expr: '0.5' }, anyTags: ['огонь'], if: { expr: '@лист == @носитель' } }]),
    броня: passive('Тяжёлая броня', [
      { kind: 'edit', call: 'урон', param: 'сколько', op: 'add', value: { expr: '-3' }, notTags: ['магический'], if: { expr: '@лист == @носитель' } }]),
  });

  test('сопротивление огню половинит огонь и молчит на рубящий', () => {
    eq(hit(resist, 'огонь', foe(['огнеупор'])).sheet.values.хп, 16);
    eq(hit(resist, 'удар', foe(['огнеупор'])).sheet.values.хп, 12);
  });

  test('«кроме магического»: броня режет меч, но не огненный шар', () => {
    eq(hit(resist, 'удар', foe(['броня'])).sheet.values.хп, 15);
    eq(hit(resist, 'огонь', foe(['броня'])).sheet.values.хп, 12);
  });

  test('трасса показывает, сколько отправлено и сколько дошло', () => {
    const t = hit(resist, 'огонь', foe(['огнеупор'])).report.trace[1]!;
    eq(t.incoming, 8);
    eq(t.amount, 4);
  });
});

group('реакции слушают слово, а не имя эффекта', () => {
  const spiky = world({
    шипы: {
      label: 'Шипы', activation: 'passive', duration: { kind: 'permanent' },
      on: [{ on: 'after:урон', if: { expr: '@лист == @носитель и не пусто(@обидчик) и @обидчик != @носитель' }, steps: [{ type: 'emit', effect: 'урон', args: damageArgs({ expr: '@сколько' }, ['колющий'], { expr: '@обидчик' }, { expr: '@носитель' }) }] }],
    },
    сторож: {
      label: 'Сторож', activation: 'passive', duration: { kind: 'permanent' },
      on: [{ on: 'after:тревога', if: { expr: '@лист == @носитель' }, steps: [{ type: 'apply', target: { expr: '@носитель.хп' }, direction: 'add', value: { expr: '1' } }] }],
    },
  });

  test('шипы отвечают и на удар, и на огненный шар — оба посылают «урон»', () => {
    eq(hit(spiky, 'удар', foe(['шипы'])).hero.values.хп, 12);
    eq(hit(spiky, 'огонь', foe(['шипы'])).hero.values.хп, 12);
    eq(hit(spiky, 'тревога', foe(['шипы'])).hero.values.хп, 20, 'тревога — не урон');
  });

  test('ответка шипов записана в журнал действия отдельным отчётом', () => {
    eq(hit(spiky, 'удар', foe(['шипы'])).replies.length, 1);
    eq(hit(spiky, 'огонь', foe(['шипы'])).replies.length, 1);
    eq(hit(spiky, 'тревога', foe(['шипы'])).replies.length, 0, 'тревога — не урон');
  });

  test('ход целиком: шипы возвращают полученное', () => {
    const r = exchange({
      system: spiky as any, compendium: book as any, die: queue(), sheets: [hero() as any, foe(['шипы']) as any],
      actionId: 'удар:0', fromId: 'герой', toId: 'враг',
    });
    eq(r.sheets.find(s => s.id === 'враг')!.values.хп, 12);
    eq(r.sheets.find(s => s.id === 'герой')!.values.хп, 12, 'шипы вернули те же 8');
  });

  test('урон ответкой будит подписку нападавшего — как концентрацию от «Адского возмездия»', () => {
    const sys = world({
      ...spiky.effects,
      сосредоточен: {
        label: 'Сосредоточен', activation: 'passive', duration: { kind: 'permanent' },
        on: [{ on: 'after:урон', if: { expr: '@лист == @носитель' }, steps: [{ type: 'status', mode: 'remove', effect: 'сосредоточен', to: { expr: '@носитель' } }] }],
      },
    });
    const r = exchange({
      system: sys as any, compendium: book as any, die: queue(), sheets: [hero(['сосредоточен']) as any, foe(['шипы']) as any],
      actionId: 'удар:0', fromId: 'герой', toId: 'враг',
    });
    const me = r.sheets.find(s => s.id === 'герой')!;
    eq(me.values.хп, 12);
    deepEq(me.effects, [], 'шипы ранили — сосредоточенность сорвалась');
  });

  const fixedSpikes = world({
    ...spiky.effects,
    шипы: {
      label: 'Шипы', activation: 'passive', duration: { kind: 'permanent' },
      on: [{ on: 'after:урон', if: { expr: '@лист == @носитель и не пусто(@обидчик) и @обидчик != @носитель' }, steps: [{ type: 'emit', effect: 'урон', args: damageArgs({ expr: '8' }, ['колющий'], { expr: '@обидчик' }, { expr: '@носитель' }) }] }],
    },
  });
  const spikesAgainstSpikes = (sys: any) => exchange({
    system: sys, compendium: book as any, die: queue(), sheets: [hero(['шипы']) as any, foe(['шипы']) as any],
    actionId: 'удар:0', fromId: 'герой', toId: 'враг',
  });

  test('шипы против шипов: ответки идут до предела глубины', () => {
    const r = spikesAgainstSpikes(fixedSpikes);
    eq(r.sheets.find(s => s.id === 'враг')!.values.хп, 0, 'удар, вторая и четвёртая ответки: 20 − 24, не ниже нуля');
    eq(r.sheets.find(s => s.id === 'герой')!.values.хп, 4, 'первая и третья: 20 − 16');
  });

  test('шипы против шипов: четыре ответки записаны в журнал, и видно, что цепочка оборвана', () => {
    const r = spikesAgainstSpikes(fixedSpikes);
    eq(r.reports.filter(entry => entry.report.reply).length, 4, 'четыре ответки — предел глубины');
    ok(r.log.includes(CUT_WORDS), 'в журнале сказано, что цепочка оборвана');
  });

  test('шипы против шипов: вторая ответка читает входы вызова «Урон», посланного первой', () => {
    const r = spikesAgainstSpikes(spiky);
    eq(r.sheets.find(s => s.id === 'враг')!.values.хп, 0);
    eq(r.sheets.find(s => s.id === 'герой')!.values.хп, 4);
  });

  test('ответ из тела ответки доходит: вампирские шипы ранят и лечат хозяина', () => {
    const vampiric = world({
      ...spiky.effects,
      шипы: {
        label: 'Вампирские шипы', activation: 'passive', duration: { kind: 'permanent' },
        on: [{ on: 'after:урон', if: { expr: '@лист == @носитель и не пусто(@обидчик) и @обидчик != @носитель' }, steps: [
          { type: 'emit', effect: 'урон', args: damageArgs({ expr: '4' }, ['колющий'], { expr: '@обидчик' }, { expr: '@носитель' }) },
          { type: 'emit', effect: 'лечение', args: { лист: { expr: '@носитель' }, сколько: { expr: '4' } } },
        ] }],
      },
      лечение: {
        label: 'Лечение', params: [{ key: 'лист', label: 'Лист', kind: 'sheet' }, { key: 'сколько', label: 'Сколько', kind: 'number', role: 'amount' }],
        steps: [{ type: 'apply', target: { expr: '@лист.хп' }, direction: 'add', value: { expr: '@сколько' } }],
      },
    });
    const r = exchange({
      system: vampiric as any, compendium: book as any, die: queue(), sheets: [hero() as any, foe(['шипы']) as any],
      actionId: 'удар:0', fromId: 'герой', toId: 'враг',
    });
    eq(r.sheets.find(s => s.id === 'герой')!.values.хп, 16, 'шипы укололи на 4');
    eq(r.sheets.find(s => s.id === 'враг')!.values.хп, 16, 'удар 8, лечение от своих шипов 4');
    ok(!r.cut);
  });

  test('сигнал без приёма будит реакцию на самом себе', () => {
    const out = hit(spiky, 'тревога', foe(['сторож']));
    eq(out.sheet.values.хп, 21);
  });
});

group('«я совершил действие» — один раз на все цели, видит таблицу целей', () => {
  const tally = world({
    итог: {
      label: 'Итог', activation: 'passive', duration: { kind: 'uses', max: 2 },
      on: [{ on: 'done:удар', if: { expr: '@действующий == @носитель' }, steps: [
        { type: 'apply', target: { expr: '@носитель.хп' }, direction: 'set', value: { expr: 'сумма(@итоги.n) + сколько(@итоги.лист)' } },
      ] }],
    },
  });
  const twoFoes = () => {
    const sheets = [{ ...hero(), effects: [{ effectId: 'итог', usesLeft: 2 }] }, foe(), { ...foe(), id: 'враг2' }];
    return deliverMany({ system: tally as any, compendium: book as any, die: queue(), sheets: sheets as any, actionId: 'удар:0', fromId: 'герой', toIds: ['враг', 'враг2'] });
  };

  test('по двум целям: итог по колонке целей — урон 8 + 8 и две строки', () => {
    const me = twoFoes().sheets.find(s => s.id === 'герой')!;
    eq(me.values.хп, 18);
  });

  test('заряд сгорает один раз за действие, а не за каждую цель', () => {
    const me = twoFoes().sheets.find(s => s.id === 'герой')!;
    eq(me.effects[0]!.usesLeft, 1);
  });

  test('таблица «итоги» в «завершено» не путается со входом-списком «цели»', () => {
    const same = world({
      удар: { ...strike('удар', 'Удар', 8, ['рубящий']), params: [ACTOR, { key: 'цели', kind: 'sheet', many: true, item: { key: 'цель' } }], steps: [{ type: 'each', of: 'цели' }, ...strike('удар', 'Удар', 8, ['рубящий']).steps.slice(1)] },
      итог: tally.effects.итог,
    });
    const sheets = [{ ...hero(), effects: [{ effectId: 'итог', usesLeft: 2 }] }, foe(), { ...foe(), id: 'враг2' }];
    const out = deliverMany({ system: same as any, compendium: book as any, die: queue(), sheets: sheets as any, actionId: 'удар:0', fromId: 'герой', toIds: ['враг', 'враг2'] });
    eq(out.sheets.find(s => s.id === 'герой')!.values.хп, 18);
  });

  test('кривое условие подписки — подписка молчит, ход не падает', () => {
    const broken = world({ итог: { ...tally.effects.итог, on: [{ ...tally.effects.итог.on[0], if: { expr: '@итоги.n > 0' } }] } });
    const r = exchange({
      system: broken as any, compendium: book as any, die: queue(), sheets: [hero(['итог']) as any, foe() as any],
      actionId: 'удар:0', fromId: 'герой', toId: 'враг',
    });
    eq(r.sheets.find(s => s.id === 'враг')!.values.хп, 12);
    eq(r.sheets.find(s => s.id === 'герой')!.values.хп, 20);
  });

  test('ход по одной цели тоже доходит до «совершил действие»', () => {
    const r = exchange({
      system: tally as any, compendium: book as any, die: queue(), sheets: [hero(['итог']) as any, foe() as any],
      actionId: 'удар:0', fromId: 'герой', toId: 'враг',
    });
    eq(r.sheets.find(s => s.id === 'герой')!.values.хп, 9);
  });
});
