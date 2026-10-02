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

const damageArgs = (amount: unknown, tags: string[]) => ({
  сколько: amount,
  ...Object.fromEntries(tags.map(tag => [SOURCES.includes(tag) ? 'источник' : 'тип', { const: tag }])),
});

const strike = (id: string, label: string, amount: number, tags: string[]) => ({
  label, activation: 'manual',
  steps: [
    { id: 'n', type: 'amount', source: 'item', fixed: { expr: `${JSON.stringify(amount)}` } },
    { type: 'emit', event: 'урон', args: damageArgs({ expr: '@n' }, tags) },
  ],
});

const world = (extraEffects: Record<string, unknown> = {}, receive: unknown[] | undefined = [
  { type: 'apply', target: { tag: 'хп' }, direction: 'subtract', value: { expr: '@event.amount' }, targetModifiers: false },
]) => ({
  id: 'вызовы',
  effects: {
    удар: strike('удар', 'Удар', 8, ['рубящий']),
    огонь: strike('огонь', 'Огненный шар', 8, ['огонь', 'магический']),
    сигнал: { label: 'Тревога', activation: 'manual', steps: [{ type: 'emit', event: 'тревога' }] },
    урон: {
      label: 'Урон',
      params: [
        { key: 'сколько', label: 'Сколько', kind: 'number', role: 'amount' },
        { key: 'тип', label: 'Тип', kind: 'choice', from: 'типы', optional: true },
        { key: 'источник', label: 'Источник', kind: 'choice', from: 'источники', optional: true },
      ],
      ...(receive ? { steps: receive } : {}),
    },
    тревога: { label: 'Тревога' },
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
  };
};

group('вызываемый эффект как провод: отправитель не лезет в чужое поле', () => {
  test('урон доезжает по правилу приёма из словаря', () => {
    const out = hit(world(), 'удар', foe());
    eq(out.sheet.values.хп, 12);
    deepEq(out.report.emitted, [{ event: 'урон', amount: 8, incoming: 8, tags: ['рубящий'] }]);
  });

  test('в трассе сначала вызов, потом его шаги с пометкой, откуда они', () => {
    const t = hit(world(), 'удар', foe()).report.trace;
    eq(t[1]!.type, 'emit');
    eq(t[2]!.type, 'apply');
    eq(t[2]!.within, 'урон');
  });

  test('необъявленный вызов — ошибка перечисляет известные эффекты', () => {
    const sys: any = world({ чужое: { label: 'Чужое', activation: 'manual', steps: [{ type: 'emit', event: 'котик' }] } });
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
      { kind: 'edit', call: 'урон', param: 'сколько', op: 'mul', value: { expr: '0.5' }, stacking: 'max', anyTags: ['огонь'] }]),
    броня: passive('Тяжёлая броня', [
      { kind: 'edit', call: 'урон', param: 'сколько', op: 'add', value: { expr: '-3' }, stacking: 'sum', notTags: ['магический'] }]),
    камень: passive('Каменная кожа', [
      { kind: 'value', target: 'incoming:хп', op: 'mul', value: { expr: '0.5' }, stacking: 'max' }]),
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

  test('старое сопротивление на поле продолжает работать, если приём его учитывает', () => {
    const sys = world({ камень: resist.effects.камень }, [
      { type: 'apply', target: { tag: 'хп' }, direction: 'subtract', value: { expr: '@event.amount' }, targetModifiers: true },
    ]);
    eq(hit(sys, 'удар', foe(['камень'])).sheet.values.хп, 16);
  });
});

group('реакции слушают слово, а не имя эффекта', () => {
  const spiky = world({
    шипы: {
      label: 'Шипы', activation: 'passive', duration: { kind: 'permanent' },
      on: [{ on: 'affected', of: 'event:урон', to: 'other', if: null, steps: [{ type: 'emit', event: 'урон', args: damageArgs({ expr: '@event.amount' }, ['колющий']) }] }],
    },
    сторож: {
      label: 'Сторож', activation: 'passive', duration: { kind: 'permanent' },
      on: [{ on: 'affected', of: 'event:тревога', to: 'other', steps: [{ type: 'apply', target: { tag: 'хп' }, direction: 'add', value: { expr: '1' } }] }],
    },
  });

  test('шипы отвечают и на удар, и на огненный шар — оба посылают «урон»', () => {
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
        on: [{ on: 'affected', of: 'event:урон', steps: [{ type: 'status', mode: 'remove', effect: { const: 'сосредоточен' } }] }],
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

  test('шипы против шипов: ответки идут до предела глубины, и видно, что цепочка оборвана', () => {
    const r = exchange({
      system: spiky as any, compendium: book as any, die: queue(), sheets: [hero(['шипы']) as any, foe(['шипы']) as any],
      actionId: 'удар:0', fromId: 'герой', toId: 'враг',
    });
    eq(r.reports.filter(entry => entry.report.reply).length, 4, 'четыре ответки — предел глубины');
    eq(r.sheets.find(s => s.id === 'враг')!.values.хп, 0, 'удар, вторая и четвёртая ответки: 20 − 24, не ниже нуля');
    eq(r.sheets.find(s => s.id === 'герой')!.values.хп, 4, 'первая и третья: 20 − 16');
    ok(r.log.includes(CUT_WORDS), 'в журнале сказано, что цепочка оборвана');
  });

  test('ответ из тела ответки доходит: вампирские шипы ранят и лечат хозяина', () => {
    const vampiric = world({
      ...spiky.effects,
      шипы: {
        label: 'Вампирские шипы', activation: 'passive', duration: { kind: 'permanent' },
        on: [{ on: 'affected', of: 'event:урон', to: 'other', steps: [
          { type: 'emit', event: 'урон', args: damageArgs({ expr: '4' }, ['колющий']) },
          { type: 'emit', event: 'лечение', to: 'sender', args: { сколько: { expr: '4' } } },
        ] }],
      },
      лечение: {
        label: 'Лечение', params: [{ key: 'сколько', label: 'Сколько', kind: 'number', role: 'amount' }],
        steps: [{ type: 'apply', target: { tag: 'хп' }, direction: 'add', value: { expr: '@event.amount' }, targetModifiers: false }],
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
    const sys = { ...spiky, effects: { ...spiky.effects, сторож: { ...spiky.effects.сторож, on: [{ ...spiky.effects.сторож.on[0], to: 'self' }] } } };
    const out = hit(sys, 'тревога', foe(['сторож']));
    eq(out.sheet.values.хп, 21);
  });
});

group('«я совершил действие» — один раз на все цели, видит таблицу целей', () => {
  const tally = world({
    итог: {
      label: 'Итог', activation: 'passive', duration: { kind: 'uses', max: 2 },
      on: [{ on: 'done', of: 'удар', steps: [
        { type: 'apply', target: { tag: 'хп' }, direction: 'set', value: { expr: 'сумма(@цели.n) + сколько(@цели.лист)' } },
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

  test('кривое условие подписки — подписка молчит, ход не падает', () => {
    const broken = world({ итог: { ...tally.effects.итог, on: [{ ...tally.effects.итог.on[0], if: { expr: '@цели.n > 0' } }] } });
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
