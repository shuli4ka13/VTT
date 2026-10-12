import { group, test, eq, deepSame } from './harness.ts';
import { exchange } from './play.ts';
import { appliedOf, fillMissing, implicitOf, storable } from '../src/model/implicit.ts';
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

group('«Наложить» заполняет входы наложенного так же, как «Вызвать»', () => {
  test('target — лист из «На кого», actor — кто действует: в «Для каждого» это цель и нажавший', () => {
    const played = press(world({ params: [WHO, ON] as Param[] }, {}));
    deepSame(argsOf(played, 'б'), { кто: 'а', на_ком: 'б' });
  });

  test('наложение на себя вне «Для каждого»: цели нет, target — тот, на ком висит', () => {
    const played = press(world({ params: [WHO, ON] as Param[] }, { steps: [apply('@действующий')] }));
    deepSame(argsOf(played, 'а'), { кто: 'а', на_ком: 'а' });
    eq(worn(played, 'б').length, 0);
  });

  test('внутри «Для каждого» на себя: target — «На кого», а не текущая цель', () => {
    const played = press(world({ params: [WHO, ON] as Param[] }, { steps: [EACH, apply('@действующий')] }));
    deepSame(argsOf(played, 'а'), { кто: 'а', на_ком: 'а' });
  });

  test('у висящего эффекта actor — носитель: наложение из подписки', () => {
    const watch: Partial<Effect> = {
      label: 'Заслон', activation: 'passive',
      on: [{ on: 'after:метить', steps: [apply('@носитель')] }] as never,
    };
    const played = press(
      world({ params: [WHO, ON] as Param[] }, { steps: [] }, { заслон: watch }),
      { sheets: [sheet('а'), sheet('б', [{ effectId: 'заслон' }]), sheet('в')] },
    );
    const mark = worn(played, 'б').find(entry => entry.effectId === 'метка');
    deepSame(mark?.args, { кто: 'б', на_ком: 'б' });
  });

  test('одноимённый вход вызывающего заполняет число, строка не нужна', () => {
    const ask = { key: 'сила', label: 'Сила', kind: 'number', ask: { by: 'actor' } };
    const played = press(world({ params: [{ key: 'сила', kind: 'number' }] as Param[] }, { params: [ACTOR, TARGETS, ask] as Param[] }), { inputs: { сила: 7 } });
    deepSame(argsOf(played, 'б'), { сила: 7 });
  });

  test('умолчание наложенного одноимённый вход не перебивает', () => {
    const ask = { key: 'сила', label: 'Сила', kind: 'number', ask: { by: 'actor' } };
    const played = press(world({ params: [{ key: 'сила', kind: 'number', default: 1 }] as Param[] }, { params: [ACTOR, TARGETS, ask] as Param[] }), { inputs: { сила: 7 } });
    eq(argsOf(played, 'б'), undefined);
  });

  test('клетка записи кнопки заполняет вход с её именем', () => {
    const played = press(world({ params: [{ key: 'клеймо', kind: 'number' }] as Param[] }, {}));
    deepSame(argsOf(played, 'б'), { клеймо: 4 });
  });

  test('явный аргумент сильнее и клетки, и одноимённого входа', () => {
    const played = press(world({ params: [{ key: 'клеймо', kind: 'number' }, WHO] as Param[] }, { steps: [EACH, apply('@цель', { args: { клеймо: { expr: '9' }, кто: { expr: '@цель' } } })] }));
    deepSame(argsOf(played, 'б'), { клеймо: 9, кто: 'б' });
  });

  test('явная пустая строка тоже закрывает неявное заполнение и не запоминается', () => {
    const ask = { key: 'вид', label: 'Вид', kind: 'text', ask: { by: 'actor' } };
    const mark = { params: [{ key: 'вид', kind: 'text' }] as Param[] };
    const caller = { params: [ACTOR, TARGETS, ask] as Param[] };
    deepSame(argsOf(press(world(mark, caller), { inputs: { вид: 'яд' } }), 'б'), { вид: 'яд' });
    const played = press(world(mark, { ...caller, steps: [EACH, apply('@цель', { args: { вид: { expr: '""' } } })] }), { inputs: { вид: 'яд' } });
    eq(argsOf(played, 'б'), undefined);
  });

  test('списки листов «сами» не приходят', () => {
    const played = press(world({ params: [{ key: 'цели', kind: 'sheet', many: true }, WHO] as Param[] }, {}));
    deepSame(argsOf(played, 'б'), { кто: 'а' });
  });

  test('снятие входов не берёт и не требует', () => {
    const removing = { type: 'status', mode: 'remove', effect: 'метка', to: { expr: '@цель' } };
    const played = press(world({ params: [WHO, ON] as Param[] }, { steps: [EACH, removing] }), { sheets: [sheet('а'), sheet('б', [{ effectId: 'метка', args: { кто: 'а' } }]), sheet('в')] });
    eq(worn(played, 'б').length, 0);
  });
});

group('«Наложить» и «refresh»: записи различаются по аргументам', () => {
  const refresh = world({ params: [WHO] as Param[] }, {});
  const marks = (played: { sheets: Sheet[] }, id: string) => worn(played, id).filter(entry => entry.effectId === 'метка');

  test('один и тот же наложивший — одна запись, обновлённая', () => {
    const first = press(refresh);
    const again = press(refresh, { sheets: first.sheets });
    eq(marks(again, 'б').length, 1);
    deepSame(marks(again, 'б')[0]!.args, { кто: 'а' });
  });

  test('другой наложивший — вторая запись: неявное «кто» теперь различает записи', () => {
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

group('общий порядок заполнения: явное, клетки записи, роли и имена', () => {
  const params = [
    { key: 'a', kind: 'number' }, { key: 'b', kind: 'number' }, { key: 'c', kind: 'number' }, { key: 'лист', kind: 'sheet' }, { key: 'поле', kind: 'field' },
  ] as Param[];
  const from = {
    prop: (name: string) => ({ a: 'клетка-a', b: 'клетка-b', лист: 'клетка-лист', поле: 'клетка-поле' })[name],
    implicit: (param: Param) => ({ b: 'сам-b', c: 'сам-c', лист: 'сам-лист', поле: 'сам-поле' })[param.key],
  };

  test('явное, затем клетка записи, затем «сам»; лист и поле клетками не заполняются, поле «сам» не приходит', () => {
    const args = fillMissing(params, { a: 'явное-a' }, from);
    deepSame(args, { a: 'явное-a', b: 'клетка-b', c: 'сам-c', лист: 'сам-лист' });
  });

  test('исходные явные значения не меняются', () => {
    const given = { a: 1 };
    fillMissing(params, given, from);
    deepSame(given, { a: 1 });
  });

  test('«null» и «нет значения» не закрывают вход, пустая строка — закрывает', () => {
    const args = fillMissing(params, { a: '' }, { prop: () => null, implicit: param => (param.key === 'b' ? undefined : 'сам') });
    eq(args.a, '');
    eq('b' in args, false);
    eq(args.c, 'сам');
  });

  test('для запоминаемого берутся только хранимые входы и значения: число, строка, да/нет', () => {
    const wide = [...params, { key: 'список', kind: 'sheet', many: true }, { key: 'бросок', kind: 'roll' }, { key: 'объект', kind: 'number' }, { key: 'пусто', kind: 'text' }, { key: 'жив', kind: 'boolean' }] as Param[];
    const source = {
      prop: (name: string) => (name === 'пусто' ? '' : undefined),
      implicit: (param: Param) => (param.key === 'объект' ? { x: 1 } : param.key === 'пусто' ? '' : param.key === 'жив' ? false : `сам-${param.key}`),
    };
    const args = fillMissing(wide, {}, source, true);
    deepSame(args, { a: 'сам-a', b: 'сам-b', c: 'сам-c', лист: 'сам-лист', жив: false });
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
