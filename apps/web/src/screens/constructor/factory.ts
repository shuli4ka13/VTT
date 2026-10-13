import { STEP_WORDS } from '@vtt/engine/words/steps';
import { freeId } from '../../store/world.ts';
import { dice } from '../../words.ts';
import type { LaunchKind } from '@vtt/engine/model/effect-kinds';
import { COST_BLOCK } from '@vtt/engine/words/glossary';
import type { System, Effect, Handler, Binding, Step, SystemConstant, RollEdit, Table, Column } from '@vtt/schema';
import type { SheetNames } from '../../ui/formula-chips.tsx';
import type { RecordKind } from '@vtt/engine/model/owned';
import { filledStep } from './effects/call-args.ts';
import { fieldsOf } from '@vtt/engine/model/sheet-columns';
import { rowTables } from '@vtt/engine/model/tables';

export interface Made<T> { key: string; value: T }


export const newHandler = (): Handler => ({ on: 'before:*', steps: [] });

export const newEffect = (system: System, kind: LaunchKind): Made<Effect> => ({
  key: freeId(Object.keys(system.effects), 'effect'),
  value: kind === 'manual'
    ? {
      label: 'Новый эффект',
      params: [{ key: 'действующий', label: 'Кто действует', kind: 'sheet' }, { key: 'цели', label: 'Цели', kind: 'sheet', many: true, item: { key: 'цель', label: 'Цель' } }],
      steps: [{ type: 'each', of: 'цели' } as unknown as Step],
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

export const newDie = (system: System): Made<SystemConstant> => ({
  key: freeId(Object.keys(system.constants ?? {}), 'кость'),
  value: { label: '', kind: 'die', dice: [{ sides: 20 }] },
});

export const newRollEdit = (system: System): Made<RollEdit> => ({
  key: freeId(Object.keys(system.roll_edits ?? {}), 'правка'),
  value: { label: '', ops: [] },
});

export const newTable = (system: System): Made<Table> => ({
  key: freeId(Object.keys(system.tables ?? {}), 'таблица'),
  value: { label: '', key: 'word', rows: [{ value: '' }] },
});

export const simpleReceive = (tag: string, direction: 'subtract' | 'add'): Step => ({
  type: 'apply', target: { expr: `@лист.${tag}` }, ...(direction === 'subtract' ? {} : { direction }), value: { expr: '@amount' },
} as unknown as Step);

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

export const newCalled = (system: System): Made<Effect> => {
  const field = fieldsOf(system).find(f => f.value.kind === 'stored' && f.value.type === 'number');
  return {
    key: freeId(Object.keys(system.effects ?? {}), 'вызываемый'),
    value: {
      label: '',
      params: [{ key: 'лист', label: 'Лист', kind: 'sheet' }, { key: 'amount', label: 'Сколько', kind: 'number', role: 'amount' }],
      steps: field ? [simpleReceive(field.tag, 'subtract')] : [],
    } as Effect,
  };
};

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

const blankCheck = (system: System, taken: string[], effect?: Effect, sheets?: SheetNames): Step[] => {
  const die = firstDie(system);
  const id = freeId(taken, 'проверка');
  const roll = freeId([...taken, id], `${id}_бросок`);
  const by = rollerOf(effect, sheets);
  return [
    { id: roll, type: 'roll', ...(die ? { die } : {}), ...(by ? { by: { expr: `@${by}` } } : {}) } as unknown as Step,
    { id, type: 'check', value: { expr: `@${roll}` }, versus: { expr: '10' } } as unknown as Step,
  ];
};

export const SEEN_BRICKS: StepTemplate[] = (['roll-add', 'roll-reroll', 'roll-plus', 'roll-bump'] as const).map(type => ({
  key: type, label: `+ ${STEP_WORDS[type].label.toLowerCase()}`, hint: STEP_WORDS[type].hint,
  make: () => [{ type, ...(type === 'roll-add' ? { count: { expr: '1' } } : type === 'roll-reroll' ? { upTo: { expr: '1' } } : { value: { expr: '1' } }) } as unknown as Step],
}));

export const BRICKS: StepTemplate[] = [
  {
    key: 'check', label: '+ проверка',
    hint: 'Бросок и сравнение с порогом. Итог — да или нет: его читают «Если» ниже.',
    make: (system, taken, effect, sheets) => blankCheck(system, taken, effect, sheets),
  },
  {
    key: 'change', label: '+ изменение',
    hint: 'Изменить поле листа или повесить состояние. Единственное, что меняет мир.',
    make: () => [{ type: 'apply' } as unknown as Step],
  },
  {
    key: 'call', label: '+ вызов',
    hint: 'Вызвать любой эффект системы — выбрать его в списке «Какой эффект».',
    make: () => [{ type: 'emit' } as unknown as Step],
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
      const list = (effect?.params ?? []).find(p => p.kind === 'sheet' && p.many)?.key ?? '';
      return [{ type: 'each', of: list } as unknown as Step];
    },
  },
  {
    key: 'branch', label: '+ если',
    hint: 'Ветвление: шаги внутри — только если условие верно; можно добавить «иначе, если» и «иначе».',
    make: () => [{ type: 'branch' } as unknown as Step, { type: 'end' } as unknown as Step],
  },
  {
    key: 'stop', label: '+ стоп',
    hint: 'Дальше не идём. До «Для каждого из» и в цене — действие не состоялось; в теле — стоп для этой цели.',
    make: () => [{ type: 'stop' } as unknown as Step],
  },
  {
    key: 'number', label: '+ число',
    hint: 'Отдельное число или бросок: урон, лечение, одно число на несколько изменений.',
    make: (_system, taken) => [{ id: freeId(taken, 'число'), type: 'roll', fixed: { expr: '0' } } as unknown as Step],
  },
];
