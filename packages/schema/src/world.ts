import { z } from 'zod';

export const refSide = z.enum(['source', 'target']);

export const formula = z.object({ expr: z.string() }).strict();

export const slotRef = z.union([
  formula,
  z.object({ tag: z.string() }).strict(),
  z.object({ param: z.string(), optional: z.boolean().optional() }).strict(),
  z.object({ prop: z.string(), optional: z.boolean().optional() }).strict(),
  z.object({ constant: z.string() }).strict(),
  z.object({ const: z.unknown() }).strict()
    .refine(value => 'const' in value, { message: 'ссылка неизвестной формы' }),
]);

const bound = z.union([z.number(), z.string()]);

export const valueKind = z.enum(['number', 'text', 'boolean', 'expr', 'dice', 'choice', 'effect', 'record', 'tag']);

const typed = {
  kind: valueKind.optional(),
  from: z.string().min(1).optional(),
  many: z.boolean().optional(),
};

export const fieldValue = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('stored'),
    type: z.enum(['number', 'text', 'boolean', 'choice']),
    from: z.string().min(1).optional(),
    default: z.union([z.number(), z.string(), z.boolean()]),
    min: bound.optional(),
    max: bound.optional(),
  }),
  z.object({ kind: z.literal('formula'), expr: z.string() }),
]);

export const groupSpec = z.object({
  parent: z.string().optional(),
  default: fieldValue.optional(),
}).passthrough();

export const tag = z.string().min(1).refine(v => !v.includes(':'), {
  message: 'двоеточие в теге запрещено — им размечены выведенные мишени',
});

export const control = z.enum(['stepper', 'pips', 'toggle', 'ring', 'bar', 'die', 'choice']);

export const fieldOption = z.object({
  value: z.union([z.number(), z.string(), z.boolean()]),
  label: z.string().min(1),
});

export const field = z.object({
  tag,
  label: z.string(),
  group: z.string().optional(),
  roll: z.object({
    label: z.string().optional(),
    die: z.object({ constant: z.string().min(1) }).optional(),
    pool: z.boolean().optional(),
    tags: z.array(z.string().min(1)).optional(),
  }).passthrough().optional(),
  value: fieldValue,

  control: control.optional(),

  lives: z.enum(['desk', 'group']).optional(),
}).passthrough();

export const diceTerm = z.object({

  count: z.union([z.number().int().positive(), slotRef]).optional(),
  sides: z.number().int().positive(),

  name: z.string().optional(),
  label: z.string().optional(),

  bonus: z.boolean().optional(),

  minus: z.boolean().optional(),
});

export const diceReading = z.union([
  z.string(),
  z.object({ kind: z.string().min(1) }).passthrough(),
]);

export const systemConstant = z.object({
  label: z.string().optional(),
  kind: z.string().optional(),
  dice: z.array(diceTerm).optional(),
  read: diceReading.optional(),
}).passthrough();

export const dieConstant = z.object({
  label: z.string().optional(),
  kind: z.literal('die'),
  dice: z.array(diceTerm),
  read: diceReading.optional(),
}).passthrough();

export const tableValue = z.union([z.number(), z.string(), z.boolean()]);

export const tableColumn = z.object({
  key: z.string().min(1),
  label: z.string().optional(),
  ...typed,
});

export const tableRow = z.object({
  value: tableValue.optional(),
  label: z.string().optional(),

  from: z.number().optional(),
  to: z.number().optional(),

  cells: z.record(z.string(), z.unknown()).optional(),
});

export const tableKey = z.enum(['word', 'number', 'range']);

export const table = z.object({
  label: z.string().optional(),

  key: tableKey.optional(),
  columns: z.array(tableColumn).optional(),
  rows: z.array(tableRow).optional(),
  otherwise: tableValue.optional(),
}).passthrough();

export const rollEditOp = z.object({ op: z.string().min(1) }).passthrough();

export const rollEdit = z.object({
  label: z.string().optional(),
  ops: z.array(rollEditOp),
  canceledBy: z.string().optional(),
}).passthrough();

export const valueModifier = z.object({
  kind: z.literal('value'),
  target: z.string(),
  op: z.string(),
  value: formula,
  stacking: z.string().optional(),
  condition: formula.optional(),

  tags: z.array(z.string().min(1)).optional(),
  notTags: z.array(z.string().min(1)).optional(),

  where: z.object({
    table: z.string().min(1),
    column: z.string().min(1),
    is: tableValue,
  }).optional(),
}).passthrough();

export const rollModifier = z.object({
  kind: z.literal('roll'),
  target: z.string(),
  tags: z.array(z.string().min(1)).optional(),
  edit: z.string().optional(),
  op: z.string().optional(),
  value: formula.optional(),
  stacking: z.string().optional(),
  condition: formula.optional(),
}).passthrough();

export const modifier = z.discriminatedUnion('kind', [valueModifier, rollModifier]);

export const activation = z.enum(['manual', 'passive']);
export const durationKind = z.enum(['permanent', 'uses', 'rounds', 'turns', 'combat', 'scene']);
export const stacking = z.enum(['ignore', 'refresh', 'stack']);

export const ask = z.object({
  by: z.enum(['actor', 'gm']).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  hint: z.string().optional(),
});

export const param = z.object({
  key: z.string().min(1),
  label: z.string().optional(),
  ...typed,

  ask: ask.optional(),

  role: z.enum(['amount']).optional(),
  optional: z.boolean().optional(),
}).passthrough();

export const guard = formula;

export const scale = z.object({
  times: z.number().positive(),
  when: guard.optional(),
});

export const step = z.object({
  id: z.string().optional(),
  type: z.string().min(1),
  side: refSide.optional(),

  when: guard.optional(),
}).passthrough();

export const handler = z.object({
  on: z.string(),
  role: z.enum(['target', 'sender']).optional(),
  phase: z.enum(['before', 'after']).optional(),
  ask: z.boolean().optional(),
  to: z.enum(['self', 'other']).optional(),
  if: guard.nullable().optional(),
  claims: z.array(z.string().min(1)).optional(),
  self: z.array(step).optional(),
  steps: z.array(step).optional(),
}).passthrough();

export const effect = z.object({
  extends: z.string().min(1).optional(),
  group: z.string().optional(),
  bond: z.union([z.boolean(), z.string().min(1)]).optional(),
  label: z.string().optional(),
  icon: z.string().optional(),
  description: z.string().optional(),
  activation: activation.optional(),
  duration: z.object({
    kind: durationKind,
    max: z.number().int().positive().optional(),
    ends: z.enum(['turn-end', 'turn-start']).optional(),
    whose: z.enum(['own', 'source']).optional(),
  }).optional(),
  stacking: stacking.optional(),
  params: z.array(param).optional(),
  steps: z.array(step).optional(),

  self: z.array(step).optional(),
  modifiers: z.array(modifier).optional(),
  on: z.array(handler).optional(),
  attach: z.array(step).optional(),
  detach: z.array(step).optional(),
  grants: z.array(z.string().min(1)).optional(),
}).passthrough();

export const bindingArg = formula;

export const binding = z.object({
  label: z.string().optional(),
  effect: z.string(),
  args: z.record(z.string(), bindingArg).optional(),
}).passthrough();

export const recordKind = z.object({
  extends: z.string().min(1).optional(),

  kind: z.enum(['item', 'action', 'sheet']),
  label: z.string().optional(),
  icon: z.string().optional(),
  group: z.string().optional(),
  hint: z.string().optional(),

  blocks: z.array(z.string().min(1)).optional(),
  grants: z.array(z.string().min(1)).optional(),
  props: z.array(z.object({
    key: z.string().min(1),
    label: z.string().optional(),
    ...typed,
    onSheet: z.boolean().optional(),
  }).passthrough()).optional(),
  bindings: z.array(binding).optional(),

  modifiers: z.array(modifier).optional(),
}).passthrough();

export const system = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  fields: z.array(field),
  groups: z.record(z.string(), groupSpec).optional(),
  effects: z.record(z.string(), effect),

  grants: z.array(z.string()).optional(),
  records: z.record(z.string(), recordKind).optional(),
  constants: z.record(z.string(), systemConstant).optional(),
  tables: z.record(z.string(), table).optional(),
  roll_edits: z.record(z.string(), rollEdit).optional(),
  advantage: z.object({ methods: z.record(z.string(), z.boolean()).optional() }).passthrough().optional(),

  initiative: z.object({
    die: z.object({ constant: z.string().min(1) }),
    bonus: slotRef.optional(),
    tags: z.array(z.string().min(1)).optional(),
  }).passthrough().optional(),

  mannequins: z.array(z.lazy(() => sheet)).optional(),
  library: z.array(z.lazy(() => compendiumRecord)).optional(),
}).passthrough();

export const storedValue = z.union([z.number(), z.string(), z.boolean(), z.null()]);

export const wornEffect = z.object({
  effectId: z.string().min(1),
  usesLeft: z.number().int().optional(),
}).catchall(storedValue);

export const owned = z.object({
  of: z.string().min(1),
  off: z.boolean().optional(),
  values: z.record(z.string(), storedValue).optional(),
}).strict();

export const sheet = z.object({
  id: z.string().min(1),
  systemId: z.string(),
  of: z.string().min(1).optional(),
  group: z.string().min(1).optional(),
  name: z.string(),
  values: z.record(z.string(), storedValue),

  has: z.array(owned),
  effects: z.array(wornEffect),
}).strict();

export const compendiumRecord = z.object({
  id: z.string().min(1),

  rk: z.string().optional(),
  label: z.string().optional(),
  description: z.string().optional(),
  props: z.record(z.string(), z.unknown()).optional(),
  modifiers: z.array(modifier).optional(),

  bindings: z.array(binding).optional(),

  grants: z.array(z.string().min(1)).optional(),
}).passthrough();

export const compendium = z.object({
  records: z.array(compendiumRecord).optional(),
}).passthrough();

export const world = z.object({
  system,
  compendium,
  sheets: z.array(sheet),
}).passthrough();

export type SlotRef = z.infer<typeof slotRef>;
export type Formula = z.infer<typeof formula>;
export type ValueKind = z.infer<typeof valueKind>;
export type RefSide = z.infer<typeof refSide>;
export type Tag = z.infer<typeof tag>;
export type DiceTerm = z.infer<typeof diceTerm>;
export type DiceReading = z.infer<typeof diceReading>;
export type DieConstant = z.infer<typeof dieConstant>;
export type SystemConstant = z.infer<typeof systemConstant>;
export type RollEditOp = z.infer<typeof rollEditOp>;
export type RollEdit = z.infer<typeof rollEdit>;
export type Table = z.infer<typeof table>;
export type TableColumn = z.infer<typeof tableColumn>;
export type TableRow = z.infer<typeof tableRow>;
export type TableKey = z.infer<typeof tableKey>;
export type Activation = z.infer<typeof activation>;
export type DurationKind = z.infer<typeof durationKind>;
export type Stacking = z.infer<typeof stacking>;
export type StoredValue = z.infer<typeof storedValue>;
export type Field = z.infer<typeof field>;
export type FieldValue = z.infer<typeof fieldValue>;
export type GroupSpec = z.infer<typeof groupSpec>;
export type Modifier = z.infer<typeof modifier>;
export type Param = z.infer<typeof param>;
export type Step = z.infer<typeof step>;
export type Ask = z.infer<typeof ask>;
export type Control = z.infer<typeof control>;
export type FieldOption = z.infer<typeof fieldOption>;
export type Guard = z.infer<typeof guard>;
export type Scale = z.infer<typeof scale>;
export type Handler = z.infer<typeof handler>;
export type Effect = z.infer<typeof effect>;
export type Binding = z.infer<typeof binding>;
export type BindingArg = z.infer<typeof bindingArg>;
export type RecordKind = z.infer<typeof recordKind>;
export type System = z.infer<typeof system>;
export type WornEffect = z.infer<typeof wornEffect>;
export type Owned = z.infer<typeof owned>;
export type Sheet = z.infer<typeof sheet>;
export type CompendiumRecord = z.infer<typeof compendiumRecord>;
export type Compendium = z.infer<typeof compendium>;
export type World = z.infer<typeof world>;
