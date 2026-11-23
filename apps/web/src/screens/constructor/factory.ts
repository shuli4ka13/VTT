import { STEP_WORDS, COST_BLOCK, GEAR_BLOCK, fieldsOf, rowTables, stepSaid } from '@vtt/engine';
import type { LaunchKind, RecordKind } from '@vtt/engine';
import { freeId } from '../../store/world.ts';
import { dice } from '../../words.ts';
import type { System, Effect, Handler, Binding, Step, SystemConstant, RollEdit, Table, Column } from '@vtt/schema';
import type { SheetNames } from '../../ui/formula-chips.tsx';
import { filledStep } from './effects/call-args.ts';
import { isThrow } from './cards-kind.ts';
import { dataT, t } from '../../i18n/author.ts';

export interface Made<T> { key: string; value: T }

export const saidId = (taken: string[], word: string, key: string = word): { id: string; label?: string } => {
  const id = freeId(taken, key);
  return stepSaid({ id }) === word ? { id } : { id, label: word };
};

export const KEYS = {
  actor: 'deystvuyuschiy', targets: 'celi', target: 'cel', each: 'kazhdyy',
  die: 'kost', rollEdit: 'pravka', table: 'tablica', cost: 'stoimost', roll: 'brosok', tag: 'metka', result: 'itog', column: 'kolonka',
} as const;

const STEP_KEYS = { roll: 'brosok', check: 'proverka', table: 'tablica', ask: 'reshenie', number: 'chislo' } as const;

export type NamedStep = keyof typeof STEP_KEYS;

const stepWord = (system: System | null | undefined, kind: NamedStep): string => {
  const td = dataT(system);
  switch (kind) {
    case 'roll': return td('data:step.roll');
    case 'check': return td('data:step.check');
    case 'table': return td('data:step.table');
    case 'ask': return td('data:step.ask');
    case 'number': return td('data:step.number');
  }
};

export const namedStep = (system: System | null | undefined, taken: string[], kind: NamedStep): { id: string; label?: string } =>
  saidId(taken, stepWord(system, kind), STEP_KEYS[kind]);


export const newHandler = (): Handler => ({ on: 'before:*', steps: [] });

export const newEffect = (system: System, kind: LaunchKind): Made<Effect> => {
  const td = dataT(system);
  return {
    key: freeId(Object.keys(system.effects), 'effect'),
    value: kind === 'manual'
      ? {
        label: td('data:effect.new'),
        params: [{ key: KEYS.actor, label: td('data:effect.actor'), kind: 'sheet' }],
        steps: [],
      }
      : {
        label: td('data:effect.new'), activation: 'passive', duration: { kind: 'permanent' },
        ...(kind === 'auto' ? { on: [newHandler()] } : {}),
      },
  };
};

export const newColumn = (system: System, _block?: string): Made<Column> => {
  const key = freeId([...fieldsOf(system).map(f => f.tag), ...Object.keys(system.tables ?? {})], 'field');
  return { key, value: { key, label: dataT(system)('data:field.new'), kind: 'number' } };
};

export const newRecordKind = (system: System): Made<RecordKind> => ({
  key: freeId([...Object.keys(system.tables ?? {}), ...Object.keys(system.sheets ?? {})], 'kind'),
  value: { shape: 'book', use: 'item', label: dataT(system)('data:kind.new'), block: GEAR_BLOCK },
});

export const newBinding = (): Binding => ({ effect: '' });

export const newProp = (kind: RecordKind, system: System | null | undefined): Column => ({
  key: freeId((kind.columns ?? []).map(p => p.key), 'prop'),
  label: dataT(system)('data:prop.new'),
  kind: 'number',
});

export type DieKind = 'one' | 'sum' | 'hits' | 'best' | 'percent' | 'parts';

export const dieKinds = (): readonly (readonly [DieKind, string])[] => [
  ['one', t('constructor:die.one')],
  ['sum', t('constructor:die.sum')],
  ['hits', t('constructor:die.hits')],
  ['best', t('constructor:die.best')],
  ['percent', t('constructor:die.percent')],
  ['parts', t('constructor:die.parts')],
];

const DIE_SHAPES: Record<DieKind, Omit<SystemConstant, 'label' | 'kind'>> = {
  one: { dice: [{ sides: 20 }] },
  sum: { dice: [{ count: 2, sides: 6 }] },
  hits: { dice: [{ sides: 6 }], read: { kind: 'count', atLeast: 5 } },
  best: { dice: [{ sides: 6 }], read: 'best' },
  percent: { dice: [{ sides: 100 }] },
  parts: { dice: [{ sides: 12, name: 'first' }, { sides: 12, name: 'second' }] },
};

const namedParts = (system: System, shape: Omit<SystemConstant, 'label' | 'kind'>): Omit<SystemConstant, 'label' | 'kind'> => {
  const td = dataT(system);
  const said: Record<string, string> = { first: td('data:die.first'), second: td('data:die.second') };
  const dice = (shape as { dice?: { name?: string }[] }).dice ?? [];
  return { ...shape, dice: dice.map(part => (part.name && said[part.name] ? { ...part, label: said[part.name] } : part)) } as never;
};

export const newDie = (system: System, kind: DieKind = 'one'): Made<SystemConstant> => ({
  key: freeId(Object.keys(system.constants ?? {}), KEYS.die),
  value: { label: '', kind: 'die', ...namedParts(system, structuredClone(DIE_SHAPES[kind])) },
});

export const newRollEdit = (system: System): Made<RollEdit> => ({
  key: freeId(Object.keys(system.roll_edits ?? {}), KEYS.rollEdit),
  value: { label: '', ops: [] },
});

export const newTable = (system: System): Made<Table> => ({
  key: freeId(Object.keys(system.tables ?? {}), KEYS.table),
  value: { label: '', key: 'word', rows: [{ value: '' }] },
});

export const newCost = (system: System): Made<Effect> => ({
  key: freeId(Object.keys(system.effects ?? {}), KEYS.cost),
  value: { label: dataT(system)('data:cost.new'), group: COST_BLOCK, steps: [] },
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
  return [{ ...namedStep(system, taken, 'roll'), type: 'roll', ...(die ? { die } : {}), ...(by ? { by: { expr: `@${by}` } } : {}) } as unknown as Step];
};

const wholeRef = (value: unknown): string | null =>
  /^\s*@([\p{L}\p{N}_]+)\s*$/u.exec(String((value as { expr?: unknown } | undefined)?.expr ?? ''))?.[1] ?? null;

const freeRoll = (effect: Effect | undefined): string | undefined => {
  const steps = (effect?.steps ?? []) as (Step & { value?: unknown; versus?: unknown })[];
  const compared = new Set(steps.filter(step => step.type === 'check').flatMap(step => [wholeRef(step.value), wholeRef(step.versus)]));
  return [...steps].reverse().find(step => isThrow(step) && step.id && !compared.has(step.id))?.id;
};

const blankCheck = (system: System, taken: string[], effect?: Effect): Step[] => {
  const roll = freeRoll(effect);
  return [{ ...namedStep(system, taken, 'check'), type: 'check', ...(roll ? { value: { expr: `@${roll}` } } : {}), versus: { expr: '10' } } as unknown as Step];
};

export const SEEN_BRICKS: StepTemplate[] = (['roll-add', 'roll-reroll', 'roll-plus', 'roll-bump'] as const).map(type => ({
  key: type,
  get label() { return `+ ${STEP_WORDS[type].label.toLowerCase()}`; },
  get hint() { return STEP_WORDS[type].hint; },
  make: () => [{ type, ...(type === 'roll-add' ? { count: { expr: '1' } } : type === 'roll-reroll' ? { upTo: { expr: '1' } } : { value: { expr: '1' } }) } as unknown as Step],
}));

export const BRICKS: StepTemplate[] = [
  {
    key: 'roll',
    get label() { return t('constructor:brick.roll.label'); },
    get hint() { return t('constructor:brick.roll.hint'); },
    make: (system, taken, effect, sheets) => blankRoll(system, taken, effect, sheets),
  },
  {
    key: 'check',
    get label() { return t('constructor:brick.check.label'); },
    get hint() { return t('constructor:brick.check.hint'); },
    make: (system, taken, effect) => blankCheck(system, taken, effect),
  },
  {
    key: 'change',
    get label() { return t('constructor:brick.change.label'); },
    get hint() { return t('constructor:brick.change.hint'); },
    make: () => [{ type: 'apply' } as unknown as Step],
  },
  {
    key: 'table',
    get label() { return t('constructor:brick.table.label'); },
    get hint() { return t('constructor:brick.table.hint'); },
    make: (system, taken) => [{
      ...namedStep(system, taken, 'table'), type: 'table',
      table: rowTables(system)[0]?.[0] ?? '',
      dice: { expr: JSON.stringify(dice(1, 6)) },
    } as unknown as Step],
  },
  {
    key: 'each',
    get label() { return t('constructor:brick.each.label'); },
    get hint() { return t('constructor:brick.each.hint'); },
    make: (system, _taken, effect) => {
      const found = (effect?.params ?? []).find(p => p.kind === 'sheet' && p.many)?.key;
      if (found || !effect || (effect.activation ?? 'manual') !== 'manual') return [{ type: 'each', of: found ?? '' } as unknown as Step];
      const td = dataT(system);
      (effect.params ??= []).push({ key: KEYS.targets, label: td('data:effect.targets'), kind: 'sheet', many: true, item: { key: KEYS.target, label: td('data:effect.target') } } as never);
      return [{ type: 'each', of: KEYS.targets } as unknown as Step];
    },
  },
  {
    key: 'branch',
    get label() { return t('constructor:brick.branch.label'); },
    get hint() { return t('constructor:brick.branch.hint'); },
    make: () => [{ type: 'branch' } as unknown as Step, { type: 'end' } as unknown as Step],
  },
  {
    key: 'ask',
    get label() { return `+ ${STEP_WORDS.ask.label.toLowerCase()}`; },
    get hint() { return STEP_WORDS.ask.hint; },
    make: (system, taken) => [{ ...namedStep(system, taken, 'ask'), type: 'ask' } as unknown as Step],
  },
  {
    key: 'stop',
    get label() { return t('constructor:brick.stop.label'); },
    get hint() { return t('constructor:brick.stop.hint'); },
    make: () => [{ type: 'stop' } as unknown as Step],
  },
  {
    key: 'number',
    get label() { return t('constructor:brick.number.label'); },
    get hint() { return t('constructor:brick.number.hint'); },
    make: (system, taken) => [{ ...namedStep(system, taken, 'number'), type: 'roll', fixed: { expr: '0' } } as unknown as Step],
  },
];
