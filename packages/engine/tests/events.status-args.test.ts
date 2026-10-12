import { group, test, eq, deepSame, throws } from './harness.ts';
import { exchange } from './play.ts';
import { appliedOf, implicitOf, storable } from '../src/model/implicit.ts';
import type { System, Sheet, Compendium, Effect, Param, WornEffect } from '../src/model/types.ts';

const ACTOR = { key: 'действующий', kind: 'sheet' };
const TARGETS = { key: 'цели', kind: 'sheet', many: true, item: { key: 'цель' } };
const EACH = { type: 'each', of: 'цели' };
const apply = (to: string, extra: Record<string, unknown> = {}) => ({ type: 'status', effect: 'метка', to: { expr: to }, ...extra });

const world = (mark: Partial<Effect>, caller: Partial<Effect>, extra: Record<string, Partial<Effect>> = {}): System => ({
  id: 'метки', name: 'метки',
  tables: {
    лист: { shape: 'single', owner: 'sheet', columns: [{ key: 'хп', label: 'Хиты', kind: 'number', default: 10 }] },
    оружие: {
      shape: 'book', use: 'item', label: 'Оружие',
      columns: [{ key: 'клеймо', label: 'Клеймо', kind: 'number' }],
      bindings: [{ label: 'Метить', effect: 'метить' }],
    },
  },
  effects: {
    метка: { label: 'Метка', activation: 'passive', reapply: 'refresh', ...mark },
    метить: { label: 'Метить', activation: 'manual', params: [ACTOR, TARGETS], steps: [EACH, apply('@цель')], ...caller },
    ...extra,
  },
}) as unknown as System;

const book = { records: [{ id: 'печать', table: 'оружие', label: 'Печать', cells: { клеймо: 4 } }] } as unknown as Compendium;
const sheet = (id: string, effects: WornEffect[] = [], has: { of: string }[] = [{ of: 'печать' }]): Sheet =>
  ({ id, systemId: 'метки', name: id, values: {}, has, effects }) as unknown as Sheet;

const press = (system: System, options: { from?: string; to?: string[]; sheets?: Sheet[]; inputs?: Record<string, number | string> } = {}) =>
  exchange({
    system, compendium: book, die: () => 1, sheets: options.sheets ?? [sheet('а'), sheet('б'), sheet('в')],
    actionId: 'печать:0', fromId: options.from ?? 'а', toIds: options.to ?? ['б'], ...(options.inputs ? { inputs: options.inputs } : {}),
  });

const worn = (played: { sheets: Sheet[] }, id: string): WornEffect[] => played.sheets.find(one => one.id === id)!.effects ?? [];
const argsOf = (played: { sheets: Sheet[] }, id: string): Record<string, unknown> | undefined => worn(played, id)[0]?.args;

const WHO = { key: 'кто', label: 'Кто', kind: 'sheet', role: 'actor' };
const ON = { key: 'на_ком', label: 'На ком', kind: 'sheet', role: 'target' };

group('«Наложить» кладёт наложенному только явные аргументы', () => {
  const both = { кто: { expr: '@действующий' }, на_ком: { expr: '@цель' } };

  test('в «Для каждого» явные аргументы: target — цель, actor — нажавший', () => {
    const played = press(world({ params: [WHO, ON] as Param[] }, { steps: [EACH, apply('@цель', { args: both })] }));
    deepSame(argsOf(played, 'б'), { кто: 'а', на_ком: 'б' });
  });

  test('без аргументов роли сами не приходят и одноимённый вход тоже', () => {
    eq(argsOf(press(world({ params: [WHO, ON] as Param[] }, {})), 'б'), undefined);
    const ask = { key: 'сила', label: 'Сила', kind: 'number', ask: { by: 'actor' } };
    const played = press(world({ params: [{ key: 'сила', kind: 'number' }] as Param[] }, { params: [ACTOR, TARGETS, ask] as Param[] }), { inputs: { сила: 7 } });
    eq(argsOf(played, 'б'), undefined);
  });

  test('наложение на себя вне «Для каждого»: аргументы называют того, на ком висит', () => {
    const args = { кто: { expr: '@действующий' }, на_ком: { expr: '@действующий' } };
    const played = press(world({ params: [WHO, ON] as Param[] }, { steps: [apply('@действующий', { args })] }));
    deepSame(argsOf(played, 'а'), { кто: 'а', на_ком: 'а' });
    eq(worn(played, 'б').length, 0);
  });

  test('внутри «Для каждого» на себя: «На кого» остаётся тем, что передали', () => {
    const args = { кто: { expr: '@действующий' }, на_ком: { expr: '@действующий' } };
    const played = press(world({ params: [WHO, ON] as Param[] }, { steps: [EACH, apply('@действующий', { args })] }));
    deepSame(argsOf(played, 'а'), { кто: 'а', на_ком: 'а' });
  });

  test('у висящего эффекта наложение из подписки передаёт носителя явно', () => {
    const args = { кто: { expr: '@носитель' }, на_ком: { expr: '@носитель' } };
    const watch: Partial<Effect> = {
      label: 'Заслон', activation: 'passive',
      on: [{ on: 'after:метить', steps: [apply('@носитель', { args })] }] as never,
    };
    const played = press(
      world({ params: [WHO, ON] as Param[] }, { steps: [] }, { заслон: watch }),
      { sheets: [sheet('а'), sheet('б', [{ effectId: 'заслон' }]), sheet('в')] },
    );
    const mark = worn(played, 'б').find(entry => entry.effectId === 'метка');
    deepSame(mark?.args, { кто: 'б', на_ком: 'б' });
  });

  test('одноимённый вход вызывающего передают аргументом «@сила»', () => {
    const ask = { key: 'сила', label: 'Сила', kind: 'number', ask: { by: 'actor' } };
    const steps = [EACH, apply('@цель', { args: { сила: { expr: '@сила' } } })];
    const played = press(world({ params: [{ key: 'сила', kind: 'number' }] as Param[] }, { params: [ACTOR, TARGETS, ask] as Param[], steps }), { inputs: { сила: 7 } });
    deepSame(argsOf(played, 'б'), { сила: 7 });
  });

  test('аргумент «@сила» с умолчанием наложенного: передан — перебивает, не передан — умолчание', () => {
    const ask = { key: 'сила', label: 'Сила', kind: 'number', ask: { by: 'actor' } };
    const mark = { params: [{ key: 'сила', kind: 'number', default: 1 }] as Param[] };
    const withArg = world(mark, { params: [ACTOR, TARGETS, ask] as Param[], steps: [EACH, apply('@цель', { args: { сила: { expr: '@сила' } } })] });
    deepSame(argsOf(press(withArg, { inputs: { сила: 7 } }), 'б'), { сила: 7 });
    const bare = world(mark, { params: [ACTOR, TARGETS, ask] as Param[] });
    eq(argsOf(press(bare, { inputs: { сила: 7 } }), 'б'), undefined);
  });

  test('клетка записи сама во вход не уходит, с аргументом кнопки — уходит', () => {
    const mark = { params: [{ key: 'клеймо', kind: 'number' }] as Param[] };
    eq(argsOf(press(world(mark, {})), 'б'), undefined);
    const caller = { params: [ACTOR, TARGETS, { key: 'клеймо', label: 'Клеймо', kind: 'number', optional: true }] as Param[], steps: [EACH, apply('@цель', { args: { клеймо: { expr: '@клеймо' } } })] };
    const system = world(mark, caller);
    system.tables!.оружие!.bindings = [{ label: 'Метить', effect: 'метить', args: { клеймо: { expr: '@клеймо' } } }];
    deepSame(argsOf(press(system), 'б'), { клеймо: 4 });
  });

  test('явный аргумент кладётся как есть', () => {
    const played = press(world({ params: [{ key: 'клеймо', kind: 'number' }, WHO] as Param[] }, { steps: [EACH, apply('@цель', { args: { клеймо: { expr: '9' }, кто: { expr: '@цель' } } })] }));
    deepSame(argsOf(played, 'б'), { клеймо: 9, кто: 'б' });
  });

  test('явная пустая строка не запоминается', () => {
    const ask = { key: 'вид', label: 'Вид', kind: 'text', ask: { by: 'actor' } };
    const mark = { params: [{ key: 'вид', kind: 'text' }] as Param[] };
    const caller = { params: [ACTOR, TARGETS, ask] as Param[] };
    const named = press(world(mark, { ...caller, steps: [EACH, apply('@цель', { args: { вид: { expr: '@вид' } } })] }), { inputs: { вид: 'яд' } });
    deepSame(argsOf(named, 'б'), { вид: 'яд' });
    const played = press(world(mark, { ...caller, steps: [EACH, apply('@цель', { args: { вид: { expr: '""' } } })] }), { inputs: { вид: 'яд' } });
    eq(argsOf(played, 'б'), undefined);
  });

  test('список листов в аргумент наложения не запомнить — ошибка', () => {
    throws(() => press(world({ params: [{ key: 'цели', kind: 'sheet', many: true }] as Param[] }, { steps: [EACH, apply('@цель', { args: { цели: { expr: '@цели' } } })] })));
  });

  test('снятие входов не берёт и не требует', () => {
    const removing = { type: 'status', mode: 'remove', effect: 'метка', to: { expr: '@цель' } };
    const played = press(world({ params: [WHO, ON] as Param[] }, { steps: [EACH, removing] }), { sheets: [sheet('а'), sheet('б', [{ effectId: 'метка', args: { кто: 'а' } }]), sheet('в')] });
    eq(worn(played, 'б').length, 0);
  });
});

group('«Наложить» и «refresh»: записи различаются по аргументам', () => {
  const refresh = world({ params: [WHO] as Param[] }, { steps: [EACH, apply('@цель', { args: { кто: { expr: '@действующий' } } })] });
  const marks = (played: { sheets: Sheet[] }, id: string) => worn(played, id).filter(entry => entry.effectId === 'метка');

  test('один и тот же наложивший — одна запись, обновлённая', () => {
    const first = press(refresh);
    const again = press(refresh, { sheets: first.sheets });
    eq(marks(again, 'б').length, 1);
    deepSame(marks(again, 'б')[0]!.args, { кто: 'а' });
  });

  test('другой наложивший — вторая запись: «кто» различает записи', () => {
    const first = press(refresh);
    const second = press(refresh, { from: 'в', sheets: first.sheets });
    deepSame(marks(second, 'б').map(entry => entry.args), [{ кто: 'а' }, { кто: 'в' }]);
  });

  test('если «кто» не объявлен у наложенного, записи не множатся', () => {
    const bare = world({}, {});
    const first = press(bare);
    const second = press(bare, { from: 'в', sheets: first.sheets });
    eq(marks(second, 'б').length, 1);
  });
});

group('роли у наложения: «target» — лист из «На кого»', () => {
  const caller = { activation: 'manual', params: [ACTOR, TARGETS], steps: [EACH] } as Pick<Effect, 'params' | 'steps' | 'activation'>;

  test('у вызова target — текущая цель, у наложения — «На кого»', () => {
    const target = { key: 'на_ком', kind: 'sheet', role: 'target' } as Param;
    deepSame(implicitOf(target, caller), { by: 'target', from: 'цель' });
    deepSame(appliedOf(target, caller), { by: 'to' });
    deepSame(appliedOf(target, { activation: 'manual', params: [ACTOR] }), { by: 'to' });
    eq(implicitOf(target, { activation: 'manual', params: [ACTOR] }), null);
  });

  test('actor и одноимённый вход у наложения те же, что у вызова', () => {
    const who = { key: 'кто', kind: 'sheet', role: 'actor' } as Param;
    deepSame(appliedOf(who, caller), implicitOf(who, caller));
    deepSame(appliedOf(who, { activation: 'passive' }), { by: 'actor', from: 'носитель' });
    const named = { key: 'сила', kind: 'number' } as Param;
    deepSame(appliedOf(named, { params: [named] }), { by: 'name', from: 'сила' });
  });

  test('бросок, поле и списки наложение запомнить не может — «сам» нет', () => {
    for (const param of [{ key: 'к', kind: 'roll' }, { key: 'п', kind: 'field' }, { key: 'л', kind: 'sheet', many: true, role: 'target' }, { key: 'ч', kind: 'choice', many: true }] as Param[]) {
      eq(storable(param), false, param.key);
      eq(appliedOf(param, { params: [param] }), null, param.key);
    }
  });
});
