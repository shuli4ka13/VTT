import { z } from 'zod';

export const refSide = z.enum(['source', 'target']);

export const slotRef = z.union([

  z.object({
    expr: z.string(), of: refSide.optional(),
    sender: z.array(z.string()).optional(), optional: z.boolean().optional(),
  }),
  z.object({ tag: z.string(), of: refSide.optional(), optional: z.boolean().optional() }),
  z.object({ param: z.string(), optional: z.boolean().optional() }),
  z.object({ prop: z.string(), optional: z.boolean().optional() }),

  z.object({ item: z.string(), optional: z.boolean().optional() }),
  z.object({ ref: z.string(), optional: z.boolean().optional() }),
  z.object({ constant: z.string(), optional: z.boolean().optional() }),
  z.object({ const: z.unknown(), optional: z.boolean().optional() })
    .refine(value => 'const' in value, { message: 'ссылка неизвестной формы' }),
]);

const bound = z.union([z.number(), z.string()]);

export const fieldValue = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('stored'),
    type: z.enum(['number', 'text', 'boolean']),
    default: z.union([z.number(), z.string(), z.boolean()]),
    min: bound.optional(),
    max: bound.optional(),
  }),
  z.object({ kind: z.literal('formula'), expr: z.string() }),
  z.object({ kind: z.literal('table'), table: z.string(), arg: z.string() }),
]);

export const groupSpec = z.object({
  parent: z.string().optional(),
  default: fieldValue.optional(),
}).passthrough();

export const tag = z.string().min(1).refine(v => !v.includes(':'), {
  message: 'двоеточие в теге запрещено — им размечены выведенные мишени',
});

export const field = z.object({
  tag,
  label: z.string(),
  group: z.string().optional(),
  roll: z.object({ label: z.string().optional() }).passthrough().optional(),
  value: fieldValue,
}).passthrough();

export const diceTerm = z.object({

  count: z.union([z.number().int().positive(), slotRef]).optional(),
  sides: z.number().int().positive(),

  name: z.string().optional(),
  label: z.string().optional(),
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

export const rangeTable = z.object({
  label: z.string().optional(),
  ranges: z.array(z.object({
    from: z.number(),
    to: z.number(),
    value: z.union([z.number(), z.string(), z.boolean()]),
  })),
});

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
  value: z.unknown(),
  stacking: z.string().optional(),
  condition: z.string().nullable().optional(),
}).passthrough();

export const rollModifier = z.object({
  kind: z.literal('roll'),
  target: z.string(),
  edit: z.string().min(1).optional(),
  op: z.string().optional(),
  value: z.unknown().optional(),
  stacking: z.string().optional(),
  condition: z.string().nullable().optional(),
}).passthrough();

export const modifier = z.discriminatedUnion('kind', [valueModifier, rollModifier]);

export const activation = z.enum(['manual', 'triggered', 'passive']);
export const durationKind = z.enum(['permanent', 'temporary', 'uses']);
export const stacking = z.enum(['ignore', 'refresh', 'stack']);

export const param = z.object({
  key: z.string().min(1),
  label: z.string().optional(),
  kind: z.string().optional(),

  of: refSide.optional(),
}).passthrough();

export const step = z.object({
  id: z.string().optional(),
  type: z.string().min(1),
  side: refSide.optional(),
}).passthrough();

export const trigger = z.object({
  on: z.string().min(1),
  when: z.string().optional(),
  condition: slotRef.nullable().optional(),

  to: z.enum(['sender', 'self']).optional(),
}).passthrough();

export const effect = z.object({
  label: z.string().optional(),
  icon: z.string().optional(),
  category: z.string().optional(),
  description: z.string().optional(),
  activation: activation.optional(),
  cost: z.string().optional(),
  duration: z.object({
    kind: durationKind,
    max: z.number().int().positive().optional(),
  }).optional(),
  stacking: stacking.optional(),
  params: z.array(param).optional(),
  steps: z.array(step).optional(),
  modifiers: z.array(modifier).optional(),
  trigger: trigger.optional(),
}).passthrough();

export const bindingArg = z.union([
  slotRef,
  z.string(), z.number(), z.boolean(), z.null(),
]);

export const binding = z.object({
  label: z.string().optional(),
  effect: z.string().min(1),
  args: z.record(z.string(), bindingArg).optional(),
}).passthrough();

export const recordKind = z.object({

  kind: z.enum(['item', 'action']),
  label: z.string().optional(),
  icon: z.string().optional(),
  group: z.string().optional(),
  hint: z.string().optional(),
  props: z.array(z.object({
    key: z.string().min(1),
    label: z.string().optional(),
    kind: z.string().optional(),
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

  room_rules: z.array(z.string()).optional(),
  records: z.record(z.string(), recordKind).optional(),
  constants: z.record(z.string(), systemConstant).optional(),
  tables: z.record(z.string(), rangeTable).optional(),
  rolls: z.array(z.object({ tag: z.string(), label: z.string() })).optional(),

  roll_edits: z.record(z.string(), rollEdit).optional(),
  action_types: z.record(z.string(), z.object({
    label: z.string(),
    icon: z.string().optional(),
  }).passthrough()).optional(),
  advantage: z.object({ methods: z.record(z.string(), z.boolean()).optional() }).passthrough().optional(),
}).passthrough();

export const storedValue = z.union([z.number(), z.string(), z.boolean(), z.null()]);

export const wornEffect = z.object({
  effectId: z.string().min(1),
  usesLeft: z.number().int().optional(),
}).catchall(storedValue);

export const sheet = z.object({
  id: z.string().min(1),
  systemId: z.string(),

  kind: z.enum(['pc', 'npc']),
  name: z.string(),
  values: z.record(z.string(), storedValue),

  equipped: z.array(z.string()),
  effects: z.array(wornEffect),
  actions: z.array(z.string()),
}).strict();

export const compendiumRecord = z.object({
  id: z.string().min(1),

  rk: z.string().optional(),
  label: z.string().optional(),
  description: z.string().optional(),
  props: z.record(z.string(), z.unknown()).optional(),
  modifiers: z.array(modifier).optional(),

  activities: z.array(binding).optional(),
}).passthrough();

export const compendium = z.object({
  items: z.array(compendiumRecord).optional(),
  actions: z.array(compendiumRecord).optional(),
}).passthrough();

export const world = z.object({
  system,
  compendium,
  sheets: z.array(sheet),
}).passthrough();

export type SlotRef = z.infer<typeof slotRef>;
export type RefSide = z.infer<typeof refSide>;
export type Tag = z.infer<typeof tag>;
export type DiceTerm = z.infer<typeof diceTerm>;
export type DiceReading = z.infer<typeof diceReading>;
export type DieConstant = z.infer<typeof dieConstant>;
export type SystemConstant = z.infer<typeof systemConstant>;
export type RollEditOp = z.infer<typeof rollEditOp>;
export type RollEdit = z.infer<typeof rollEdit>;
export type RangeTable = z.infer<typeof rangeTable>;
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
export type Trigger = z.infer<typeof trigger>;
export type Effect = z.infer<typeof effect>;
export type Binding = z.infer<typeof binding>;
export type BindingArg = z.infer<typeof bindingArg>;
export type RecordKind = z.infer<typeof recordKind>;
export type System = z.infer<typeof system>;
export type WornEffect = z.infer<typeof wornEffect>;
export type Sheet = z.infer<typeof sheet>;
export type CompendiumRecord = z.infer<typeof compendiumRecord>;
export type Compendium = z.infer<typeof compendium>;
export type World = z.infer<typeof world>;
