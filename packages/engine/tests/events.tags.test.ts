import { group, test, eq, ok, deepEq, throws } from './harness.ts';
import { send, receive } from '../src/events/envelope.ts';
import { exchange } from '../src/events/exchange.ts';
import { targets } from '../src/engine/targets.ts';

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
  const env = send(`${action}:0`, { system: sys, sheet: hero(), compendium: book, die: queue(...dice) });
  return receive(env, { system: sys, sheet: target, compendium: book, die: queue() });
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

  test('мишень «Входящий эффект» выводится из вызываемых', () => {
    ok(targets(world() as any).some(t => t.tag === 'event:урон' && t.kind === 'event'));
  });

  test('необъявленный вызов — ошибка перечисляет известные эффекты', () => {
    const sys: any = world({ чужое: { label: 'Чужое', activation: 'manual', steps: [{ type: 'emit', event: 'котик' }] } });
    const withAction = { ...book, records: [...book.records, { id: 'чужое', table: 'приём', label: 'Чужое', bindings: [{ label: 'Чужое', effect: 'чужое', args: {} }] }] };
    throws(() => send('чужое:0', { system: sys, sheet: { ...hero(), records: ['чужое'] }, compendium: withAction, die: queue() }), 'котик');
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
      { kind: 'value', target: 'event:урон', op: 'mul', value: { expr: '0.5' }, stacking: 'max', tags: ['огонь'] }]),
    броня: passive('Тяжёлая броня', [
      { kind: 'value', target: 'event:урон', op: 'add', value: { expr: '-3' }, stacking: 'sum', notTags: ['магический'] }]),
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
      on: [{ on: 'event:урон', to: 'other', if: null, steps: [{ type: 'emit', event: 'урон', args: damageArgs({ expr: '@event.amount' }, ['колющий']) }] }],
    },
    сторож: {
      label: 'Сторож', activation: 'passive', duration: { kind: 'permanent' },
      on: [{ on: 'event:тревога', to: 'other', steps: [{ type: 'apply', target: { tag: 'хп' }, direction: 'add', value: { expr: '1' } }] }],
    },
  });

  test('шипы отвечают и на удар, и на огненный шар — оба посылают «урон»', () => {
    eq(hit(spiky, 'удар', foe(['шипы'])).replies.length, 1);
    eq(hit(spiky, 'огонь', foe(['шипы'])).replies.length, 1);
    eq(hit(spiky, 'тревога', foe(['шипы'])).replies.length, 0, 'тревога — не урон');
  });

  test('ответка несёт величину вызова константой: отправитель не знает чужих результатов', () => {
    const out = hit(spiky, 'удар', foe(['шипы']));
    deepEq(out.replies[0]!.steps[0]!.args.сколько, { const: 8 });
  });

  test('ход целиком: шипы возвращают полученное', () => {
    const r = exchange({
      system: spiky as any, compendium: book, die: queue(), sheets: [hero(), foe(['шипы'])],
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
        on: [{ on: 'event:урон', steps: [{ type: 'status', mode: 'remove', effect: { const: 'сосредоточен' } }] }],
      },
    });
    const r = exchange({
      system: sys as any, compendium: book, die: queue(), sheets: [hero(['сосредоточен']), foe(['шипы'])],
      actionId: 'удар:0', fromId: 'герой', toId: 'враг',
    });
    const me = r.sheets.find(s => s.id === 'герой')!;
    eq(me.values.хп, 12);
    deepEq(me.effects, [], 'шипы ранили — сосредоточенность сорвалась');
  });

  test('на ответку не отвечают: шипы против шипов не ходят по кругу', () => {
    const r = exchange({
      system: spiky as any, compendium: book, die: queue(), sheets: [hero(['шипы']), foe(['шипы'])],
      actionId: 'удар:0', fromId: 'герой', toId: 'враг',
    });
    eq(r.sheets.find(s => s.id === 'враг')!.values.хп, 12);
    eq(r.sheets.find(s => s.id === 'герой')!.values.хп, 12, 'только одна ответка');
  });

  test('сигнал без приёма будит реакцию на самом себе', () => {
    const sys = { ...spiky, effects: { ...spiky.effects, сторож: { ...spiky.effects.сторож, on: [{ ...spiky.effects.сторож.on[0], to: 'self' }] } } };
    const out = hit(sys, 'тревога', foe(['сторож']));
    eq(out.sheet.values.хп, 21);
  });
});
