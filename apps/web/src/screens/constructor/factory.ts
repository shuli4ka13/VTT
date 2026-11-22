import { STEP_WORDS, COST_BLOCK, fieldsOf, rowTables } from '@vtt/engine';
import type { LaunchKind, RecordKind } from '@vtt/engine';
import { freeId } from '../../store/world.ts';
import { dice } from '../../words.ts';
import type { System, Effect, Handler, Binding, Step, SystemConstant, RollEdit, Table, Column } from '@vtt/schema';
import type { SheetNames } from '../../ui/formula-chips.tsx';
import { filledStep } from './effects/call-args.ts';
import { isThrow } from './cards-kind.ts';

export interface Made<T> { key: string; value: T }


export const newHandler = (): Handler => ({ on: 'before:*', steps: [] });

export const newEffect = (system: System, kind: LaunchKind): Made<Effect> => ({
  key: freeId(Object.keys(system.effects), 'effect'),
  value: kind === 'manual'
    ? {
      label: 'Новый эффект',
      params: [{ key: 'действующий', label: 'Кто действует', kind: 'sheet' }],
      steps: [],
    }
    : {
      label: 'Новый эффект', activation: 'passive', duration: { kind: 'permanent' },
      ...(kind === 'auto' ? { on: [newHandler()] } : {}),
    },
});

export const newColumn = (system: System, _block?: string): Made<Column> => {
  const key = freeId([...fieldsOf(system).map(f => f.tag), ...Object.keys(system.tables ?? {})], 'field');
  return { key, value: { key, label: 'Новое поле', kind: 'number' } };
};

export const newRecordKind = (system: System): Made<RecordKind> => ({
  key: freeId([...Object.keys(system.tables ?? {}), ...Object.keys(system.sheets ?? {})], 'kind'),
  value: { shape: 'book', use: 'item', label: 'Новый тип', block: 'Снаряжение' },
});

export const newBinding = (): Binding => ({ effect: '' });

export const newProp = (kind: RecordKind): Column => ({
  key: freeId((kind.columns ?? []).map(p => p.key), 'prop'),
  label: 'Новое свойство',
  kind: 'number',
});

export const DIE_KINDS = [
  ['one', 'одна кость — к20'],
  ['sum', 'несколько костей, сумма — 2к6'],
  ['hits', 'набор костей (пул): считаем успехи — к6, от 5'],
  ['best', 'набор костей (пул): берём лучшую — к6'],
  ['percent', 'процентная — к100'],
  ['parts', 'две кости с именами — к12 и к12'],
] as const;

export type DieKind = typeof DIE_KINDS[number][0];

const DIE_SHAPES: Record<DieKind, Omit<SystemConstant, 'label' | 'kind'>> = {
  one: { dice: [{ sides: 20 }] },
  sum: { dice: [{ count: 2, sides: 6 }] },
  hits: { dice: [{ sides: 6 }], read: { kind: 'count', atLeast: 5 } },
  best: { dice: [{ sides: 6 }], read: 'best' },
  percent: { dice: [{ sides: 100 }] },
  parts: { dice: [{ sides: 12, name: 'первая', label: 'Первая' }, { sides: 12, name: 'вторая', label: 'Вторая' }] },
};

export const newDie = (system: System, kind: DieKind = 'one'): Made<SystemConstant> => ({
  key: freeId(Object.keys(system.constants ?? {}), 'кость'),
  value: { label: '', kind: 'die', ...structuredClone(DIE_SHAPES[kind]) },
});

export const newRollEdit = (system: System): Made<RollEdit> => ({
  key: freeId(Object.keys(system.roll_edits ?? {}), 'правка'),
  value: { label: '', ops: [] },
});

export const newTable = (system: System): Made<Table> => ({
  key: freeId(Object.keys(system.tables ?? {}), 'таблица'),
  value: { label: '', key: 'word', rows: [{ value: '' }] },
});

export const newCost = (system: System): Made<Effect> => ({
  key: freeId(Object.keys(system.effects ?? {}), 'стоимость'),
  value: { label: `${COST_BLOCK}: новая`, group: COST_BLOCK, steps: [] },
});

export const costsOf = (system: System): [string, Effect][] => {
  const paid = new Set(Object.values(system.effects ?? {}).flatMap(effect => [...(effect.cost ?? []), ...(effect.on ?? []).flatMap(handler => handler.cost ?? [])])
    .flatMap(step => { const called = (step as { effect?: unknown }).effect; return step.type === 'emit' && typeof called === 'string' ? [called] : []; }));
  return Object.entries(system.effects ?? {}).filter(([id]) => paid.has(id));
};

export const payStep = (system: System, caller: Effect, id: string): Step =>
  filledStep(system, caller, { type: 'emit', effect: id }, []) as unknown as Step;

export interface StepTemplate {
  key: string;
  label: string;
  hint: string;
  make(system: System, takenIds: string[], effect?: Effect, sheets?: SheetNames): Step[];
}

const firstDie = (system: System): string | undefined => Object.keys(system.constants ?? {})[0];

const rollerOf = (effect: Effect | undefined, sheets: SheetNames | undefined): string | undefined => {
  const params = effect?.params ?? [];
  const lists = new Set(params.filter(p => p.kind === 'sheet' && p.many).map(p => p.key));
  const names = sheets ? [...sheets.keys()] : params.filter(p => p.kind === 'sheet').map(p => p.key);
  return names.find(name => !lists.has(name));
};

const blankRoll = (system: System, taken: string[], effect?: Effect, sheets?: SheetNames): Step[] => {
  const die = firstDie(system);
  const by = rollerOf(effect, sheets);
  return [{ id: freeId(taken, 'бросок'), type: 'roll', ...(die ? { die } : {}), ...(by ? { by: { expr: `@${by}` } } : {}) } as unknown as Step];
};

const wholeRef = (value: unknown): string | null =>
  /^\s*@([\p{L}\p{N}_]+)\s*$/u.exec(String((value as { expr?: unknown } | undefined)?.expr ?? ''))?.[1] ?? null;

const freeRoll = (effect: Effect | undefined): string | undefined => {
  const steps = (effect?.steps ?? []) as (Step & { value?: unknown; versus?: unknown })[];
  const compared = new Set(steps.filter(step => step.type === 'check').flatMap(step => [wholeRef(step.value), wholeRef(step.versus)]));
  return [...steps].reverse().find(step => isThrow(step) && step.id && !compared.has(step.id))?.id;
};

const blankCheck = (taken: string[], effect?: Effect): Step[] => {
  const roll = freeRoll(effect);
  return [{ id: freeId(taken, 'проверка'), type: 'check', ...(roll ? { value: { expr: `@${roll}` } } : {}), versus: { expr: '10' } } as unknown as Step];
};

export const SEEN_BRICKS: StepTemplate[] = (['roll-add', 'roll-reroll', 'roll-plus', 'roll-bump'] as const).map(type => ({
  key: type, label: `+ ${STEP_WORDS[type].label.toLowerCase()}`, hint: STEP_WORDS[type].hint,
  make: () => [{ type, ...(type === 'roll-add' ? { count: { expr: '1' } } : type === 'roll-reroll' ? { upTo: { expr: '1' } } : { value: { expr: '1' } }) } as unknown as Step],
}));

export const BRICKS: StepTemplate[] = [
  {
    key: 'roll', label: '+ бросок',
    hint: 'Кто-то бросает кости: кость системы или число с листа по правилу из «Бросков». Итог читают шаги ниже.',
    make: (system, taken, effect, sheets) => blankRoll(system, taken, effect, sheets),
  },
  {
    key: 'check', label: '+ проверка',
    hint: 'Сравнить бросок или число с порогом. Итог — да или нет: его читают «Если» ниже.',
    make: (_system, taken, effect) => blankCheck(taken, effect),
  },
  {
    key: 'change', label: '+ изменение',
    hint: 'Изменить поле листа или повесить состояние. Единственное, что меняет мир.',
    make: () => [{ type: 'apply' } as unknown as Step],
  },
  {
    key: 'table', label: '+ таблица',
    hint: 'Прочитать строку таблицы по броску или числу: травма, исход, сложность по дистанции.',
    make: (system, taken) => [{
      id: freeId(taken, 'таблица'), type: 'table',
      table: rowTables(system)[0]?.[0] ?? '',
      dice: { expr: JSON.stringify(dice(1, 6)) },
    } as unknown as Step],
  },
  {
    key: 'each', label: '+ для каждого из списка',
    hint: 'Разделитель: шаги выше — один раз, ниже — по очереди для каждой цели из входа-списка (только у действия кнопкой) или для каждой строки таблицы.',
    make: (_system, _taken, effect) => {
      const found = (effect?.params ?? []).find(p => p.kind === 'sheet' && p.many)?.key;
      if (found || !effect || (effect.activation ?? 'manual') !== 'manual') return [{ type: 'each', of: found ?? '' } as unknown as Step];
      (effect.params ??= []).push({ key: 'цели', label: 'Цели', kind: 'sheet', many: true, item: { key: 'цель', label: 'Цель' } } as never);
      return [{ type: 'each', of: 'цели' } as unknown as Step];
    },
  },
  {
    key: 'branch', label: '+ если',
    hint: 'Ветвление: шаги внутри — только если условие верно; можно добавить «иначе, если» и «иначе».',
    make: () => [{ type: 'branch' } as unknown as Step, { type: 'end' } as unknown as Step],
  },
  {
    key: 'ask', label: `+ ${STEP_WORDS.ask.label.toLowerCase()}`,
    hint: STEP_WORDS.ask.hint,
    make: (_system, taken) => [{ id: freeId(taken, 'решение'), type: 'ask' } as unknown as Step],
  },
  {
    key: 'stop', label: '+ стоп',
    hint: 'Дальше не идём. До «Для каждого из» и в цене — действие не состоялось; в теле — стоп для этой цели.',
    make: () => [{ type: 'stop' } as unknown as Step],
  },
  {
    key: 'number', label: '+ число',
    hint: 'Число формулой: урон, лечение, одно число на несколько изменений.',
    make: (_system, taken) => [{ id: freeId(taken, 'число'), type: 'roll', fixed: { expr: '0' } } as unknown as Step],
  },
];
