import { freeId } from '../../store/world.ts';
import { dice } from '../../words.ts';
import { effectiveDefault } from './groups.ts';
import type { LaunchKind } from '@vtt/engine/model/effect-kinds';
import { COST_BLOCK } from '@vtt/engine/words/glossary';
import type {
  System, Effect, Handler, Field, RecordKind, Binding, Step, SystemConstant, RollEdit, Table,
} from '@vtt/schema';

export interface Made<T> { key: string; value: T }

type Prop = NonNullable<RecordKind['props']>[number];

export const newHandler = (): Handler => ({ on: '', steps: [] });

export const newEffect = (system: System, kind: LaunchKind): Made<Effect> => ({
  key: freeId(Object.keys(system.effects), 'effect'),
  value: kind === 'manual'
    ? { label: 'Новый эффект', activation: 'manual', params: [], steps: [] }
    : {
      label: 'Новый эффект', activation: 'passive', duration: { kind: 'permanent' },
      ...(kind === 'auto' ? { on: [newHandler()] } : { modifiers: [] }),
    },
});

export const newField = (system: System, group: string): Made<Field> => {
  const tag = freeId(system.fields.map(f => f.tag), 'field');
  const preset = effectiveDefault(system, group);
  return {
    key: tag,
    value: {
      tag,
      label: 'Новое поле',
      group,
      value: preset ? structuredClone(preset) : { kind: 'stored', type: 'number', default: 0 },
    },
  };
};

export const newRecordKind = (system: System): Made<RecordKind> => ({
  key: freeId(Object.keys(system.records ?? {}), 'kind'),
  value: { kind: 'item', label: 'Новый тип', group: 'Снаряжение', props: [], bindings: [] },
});

export const newBinding = (system: System): Binding => ({
  label: 'Применение', effect: Object.keys(system.effects)[0] ?? '', args: {},
});

export const newProp = (kind: RecordKind): Prop => ({
  key: freeId((kind.props ?? []).map(p => p.key), 'prop'),
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

export const simpleReceive = (tag: string, direction: 'subtract' | 'add', targetModifiers: boolean): Step => ({
  type: 'apply', target: { tag }, direction, value: { ref: 'event.amount' }, targetModifiers,
} as unknown as Step);

export const newCost = (system: System): Made<Effect> => ({
  key: freeId(Object.keys(system.effects ?? {}), 'стоимость'),
  value: { label: `${COST_BLOCK}: новая`, group: COST_BLOCK, activation: 'manual', params: [], steps: [] },
});

export const costsOf = (system: System): [string, Effect][] =>
  Object.entries(system.effects ?? {}).filter(([, effect]) => effect.group === COST_BLOCK);

export const payStep = (id: string, taken: readonly string[] = []): Step =>
  ({ id: freeId([...taken], 'стоимость'), type: 'emit', event: id, strict: true } as unknown as Step);

export const newCalled = (system: System): Made<Effect> => {
  const field = system.fields.find(f => f.value.kind === 'stored' && f.value.type === 'number');
  return {
    key: freeId(Object.keys(system.effects ?? {}), 'вызываемый'),
    value: {
      label: '',
      params: [{ key: 'amount', label: 'Сколько', kind: 'number', role: 'amount' }],
      steps: field ? [simpleReceive(field.tag, 'subtract', true)] : [],
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

const blankCheck = (system: System): Step => {
  const die = firstDie(system);
  return {
    type: 'threshold', successWhen: 'atLeast', continueOn: 'success',
    roll: { die: die ? { constant: die } : undefined },
  } as unknown as Step;
};

export const BRICKS: StepTemplate[] = [
  {
    key: 'check', label: '+ проверка',
    hint: 'Бросок или сравнение против поля цели. Может оборвать эффект.',
    make: (system, taken) => [{ ...blankCheck(system), id: freeId(taken, 'проверка') } as unknown as Step],
  },
  {
    key: 'change', label: '+ изменение',
    hint: 'Изменить поле цели или повесить состояние. Единственное, что меняет мир.',
    make: (_system, taken) => [{
      id: freeId(taken, 'изменение'), type: 'apply', direction: 'subtract', targetModifiers: true,
    } as unknown as Step],
  },
  {
    key: 'table', label: '+ таблица',
    hint: 'Прочитать строку таблицы по броску или числу: травма, исход, сложность по дистанции.',
    make: (system, taken) => [{
      id: freeId(taken, 'таблица'), type: 'table',
      table: { const: Object.keys(system.tables ?? {})[0] ?? '' },
      dice: { const: dice(1, 6) },
    } as unknown as Step],
  },
  {
    key: 'number', label: '+ число',
    hint: 'Отдельное число: превышение проверки или одно число на несколько изменений.',
    make: (_system, taken) => [{ id: freeId(taken, 'число'), type: 'amount', source: 'roll' } as unknown as Step],
  },
];
