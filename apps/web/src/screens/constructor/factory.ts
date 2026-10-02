import { STEP_WORDS } from '@vtt/engine/words/steps';
import { freeId } from '../../store/world.ts';
import { dice } from '../../words.ts';
import { NO_BLOCK } from '@vtt/engine/model/blocks';
import type { LaunchKind } from '@vtt/engine/model/effect-kinds';
import { COST_BLOCK } from '@vtt/engine/words/glossary';
import type { System, Effect, Handler, Binding, Step, SystemConstant, RollEdit, Table, Column } from '@vtt/schema';
import type { RecordKind } from '@vtt/engine/model/owned';
import { fieldsOf } from '@vtt/engine/model/sheet-columns';
import { rowTables } from '@vtt/engine/model/tables';

export interface Made<T> { key: string; value: T }


export const newHandler = (): Handler => ({ on: 'before:*', steps: [] });

export const newEffect = (system: System, kind: LaunchKind): Made<Effect> => ({
  key: freeId(Object.keys(system.effects), 'effect'),
  value: kind === 'manual'
    ? {
      label: 'Новый эффект', activation: 'manual',
      params: [{ key: 'действующий', label: 'Кто действует', kind: 'sheet' }, { key: 'цели', label: 'Цели', kind: 'sheet', many: true }],
      steps: [{ type: 'each', of: 'цели', as: 'цель' } as unknown as Step],
    }
    : {
      label: 'Новый эффект', activation: 'passive', duration: { kind: 'permanent' },
      ...(kind === 'auto' ? { on: [newHandler()] } : { modifiers: [] }),
    },
});

export const newColumn = (system: System, block: string): Made<Column> => {
  const key = freeId([...fieldsOf(system).map(f => f.tag), ...Object.keys(system.tables ?? {})], 'field');
  return { key, value: { key, label: 'Новое поле', kind: 'number', ...(block && block !== NO_BLOCK ? { block } : {}) } };
};

export const newRecordKind = (system: System): Made<RecordKind> => ({
  key: freeId([...Object.keys(system.tables ?? {}), ...Object.keys(system.sheets ?? {})], 'kind'),
  value: { shape: 'book', use: 'item', label: 'Новый тип', block: 'Снаряжение', columns: [], bindings: [] },
});

export const newBinding = (system: System): Binding => ({
  label: 'Применение', effect: Object.keys(system.effects)[0] ?? '', args: {},
});

export const newProp = (kind: RecordKind): Column => ({
  key: freeId((kind.columns ?? []).map(p => p.key), 'prop'),
  label: 'Новое свойство',
  kind: 'number',
});

export const newDie = (system: System): Made<SystemConstant> => ({
  key: freeId(Object.keys(system.constants ?? {}), 'кость'),
  value: { label: '', kind: 'die', dice: [{ count: 1, sides: 20 }] },
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
  type: 'apply', target: { expr: `@лист.${tag}` }, direction, value: { expr: '@amount' },
} as unknown as Step);

export const newCost = (system: System): Made<Effect> => ({
  key: freeId(Object.keys(system.effects ?? {}), 'стоимость'),
  value: { label: `${COST_BLOCK}: новая`, group: COST_BLOCK, activation: 'manual', params: [], steps: [] },
});

export const costsOf = (system: System): [string, Effect][] =>
  Object.entries(system.effects ?? {}).filter(([, effect]) => effect.group === COST_BLOCK);

export const payStep = (id: string, taken: readonly string[] = []): Step =>
  ({ id: freeId([...taken], 'стоимость'), type: 'emit', effect: id } as unknown as Step);

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
  make(system: System, takenIds: string[]): Step[];
}

const firstDie = (system: System): string | undefined => Object.keys(system.constants ?? {})[0];

const blankCheck = (system: System, taken: string[]): Step[] => {
  const die = firstDie(system);
  const id = freeId(taken, 'проверка');
  const roll = freeId([...taken, id], `${id}_бросок`);
  return [
    { id: roll, type: 'roll', ...(die ? { die } : {}), by: { expr: '@действующий' } } as unknown as Step,
    { id, type: 'check', value: { expr: `@${roll}` }, versus: { expr: '10' }, successWhen: 'atLeast', continueOn: 'success' } as unknown as Step,
  ];
};

export const SEEN_BRICKS: StepTemplate[] = (['roll-add', 'roll-reroll', 'roll-plus'] as const).map(type => ({
  key: type, label: `+ ${STEP_WORDS[type].label.toLowerCase()}`, hint: STEP_WORDS[type].hint,
  make: () => [{ type, ...(type === 'roll-add' ? { count: { expr: '1' } } : type === 'roll-reroll' ? { upTo: { expr: '1' } } : { value: { expr: '1' } }) } as unknown as Step],
}));

export const BRICKS: StepTemplate[] = [
  {
    key: 'check', label: '+ проверка',
    hint: 'Бросок и сравнение с порогом. Может остановить эффект.',
    make: (system, taken) => blankCheck(system, taken),
  },
  {
    key: 'change', label: '+ изменение',
    hint: 'Изменить поле листа или повесить состояние. Единственное, что меняет мир.',
    make: (_system, taken) => [{
      id: freeId(taken, 'изменение'), type: 'apply', direction: 'subtract',
    } as unknown as Step],
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
    key: 'each', label: '+ для каждой цели',
    hint: 'Разделитель: шаги выше — один раз, ниже — для каждого листа из списка целей.',
    make: () => [{ type: 'each', of: 'цели', as: 'цель' } as unknown as Step],
  },
  {
    key: 'number', label: '+ число',
    hint: 'Отдельное число или бросок: урон, лечение, одно число на несколько изменений.',
    make: (_system, taken) => [{ id: freeId(taken, 'число'), type: 'roll', fixed: { expr: '0' } } as unknown as Step],
  },
];
