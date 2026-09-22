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
  z.object({
    table: z.string().min(1),
    by: z.lazy((): z.ZodTypeAny => slotRef),

    column: z.string().min(1).optional(),
    optional: z.boolean().optional(),
  }),
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
  z.object({ kind: z.literal('table'), table: z.string(), arg: z.string(), column: z.string().min(1).optional() }),
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

export const wordList = z.object({
  label: z.string().min(1),
  of: z.enum(['number', 'text']).optional(),
  values: z.array(fieldOption).min(1),
}).passthrough();

export const field = z.object({
  tag,
  label: z.string(),
  group: z.string().optional(),
  roll: z.object({ label: z.string().optional() }).passthrough().optional(),
  value: fieldValue,

  control: control.optional(),
  options: z.array(fieldOption).optional(),
  optionsFrom: z.string().min(1).optional(),
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

export const columnKind = z.enum(['number', 'text', 'expr', 'dice', 'choice', 'effect', 'record', 'tag']);

export const tableColumn = z.object({
  key: z.string().min(1),
  label: z.string().optional(),
  kind: columnKind.optional(),

  from: z.string().min(1).optional(),
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

export const rangeTable = table;

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
  edit: z.string().optional(),
  op: z.string().optional(),
  value: z.unknown().optional(),
  stacking: z.string().optional(),
  condition: z.string().nullable().optional(),
}).passthrough();

export const modifier = z.discriminatedUnion('kind', [valueModifier, rollModifier]);

export const activation = z.enum(['manual', 'triggered', 'passive', 'reaction']);
export const durationKind = z.enum(['permanent', 'temporary', 'uses', 'rounds', 'turns', 'scene']);
export const stacking = z.enum(['ignore', 'refresh', 'stack']);

export const ask = z.object({
  by: z.enum(['actor', 'gm']).optional(),
  kind: z.enum(['number', 'text', 'choice']).optional(),
  options: z.array(z.string().min(1)).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  hint: z.string().optional(),
});

export const param = z.object({
  key: z.string().min(1),
  label: z.string().optional(),
  kind: z.string().optional(),

  from: z.string().optional(),

  of: refSide.optional(),

  ask: ask.optional(),
}).passthrough();

export const guard = z.union([
  z.object({
    ref: z.string().min(1), is: z.unknown().optional(), not: z.boolean().optional(),
    atLeast: z.union([z.number(), z.object({ tag: z.string().min(1) })]).optional(),
    atMost: z.union([z.number(), z.object({ tag: z.string().min(1) })]).optional(),
    has: z.string().optional(),
  }),
  z.object({ expr: z.string(), of: refSide.optional() }),
]);

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

export const systemEvent = z.object({
  label: z.string().optional(),
  tags: z.array(z.string().min(1)).optional(),
  receive: z.array(step).optional(),
}).passthrough();

export const trigger = z.object({
  on: z.string(),
  when: z.string().optional(),
  condition: slotRef.nullable().optional(),

  to: z.enum(['sender', 'self', 'target']).optional(),

  direction: z.enum(['in', 'out']).optional(),

  window: z.enum(['sender', 'target', 'after']).optional(),
  claims: z.array(z.string().min(1)).optional(),
}).passthrough();

export const effect = z.object({
  extends: z.string().min(1).optional(),
  group: z.string().optional(),
  tagsFrom: z.string().min(1).optional(),
  bond: z.union([z.boolean(), z.string().min(1)]).optional(),
  label: z.string().optional(),
  tags: z.array(z.string().min(1)).optional(),
  icon: z.string().optional(),
  category: z.string().optional(),
  description: z.string().optional(),
  activation: activation.optional(),
  cost: z.string().optional(),
  duration: z.object({
    kind: durationKind,
    max: z.number().int().positive().optional(),
    ends: z.enum(['turn-end', 'turn-start']).optional(),
  }).optional(),
  stacking: stacking.optional(),
  params: z.array(param).optional(),
  steps: z.array(step).optional(),

  self: z.array(step).optional(),
  modifiers: z.array(modifier).optional(),
  trigger: trigger.optional(),
}).passthrough();

export const bindingArg = z.union([
  slotRef,
  z.string(), z.number(), z.boolean(), z.null(),
]);

export const binding = z.object({
  label: z.string().optional(),
  effect: z.string(),
  args: z.record(z.string(), bindingArg).optional(),
}).passthrough();

export const recordKind = z.object({
  extends: z.string().min(1).optional(),

  kind: z.enum(['item', 'action']),
  label: z.string().optional(),
  icon: z.string().optional(),
  group: z.string().optional(),
  hint: z.string().optional(),
  props: z.array(z.object({
    key: z.string().min(1),
    label: z.string().optional(),
    kind: z.string().optional(),

    from: z.string().optional(),
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

  room_rules: z.array(z.string()).optional(),
  records: z.record(z.string(), recordKind).optional(),
  constants: z.record(z.string(), systemConstant).optional(),
  tables: z.record(z.string(), table).optional(),
  rolls: z.array(z.object({
    tag: z.string(), label: z.string(),
    words: z.object({ success: z.string(), fail: z.string() }).optional(),
  })).optional(),

  roll_edits: z.record(z.string(), rollEdit).optional(),
  lists: z.record(z.string(), wordList).optional(),
  action_types: z.record(z.string(), z.object({
    label: z.string(),
    icon: z.string().optional(),

    perTurn: z.number().int().positive().optional(),
    perTurnField: z.string().optional(),
    within: z.string().optional(),
  }).passthrough()).optional(),
  advantage: z.object({ methods: z.record(z.string(), z.boolean()).optional() }).passthrough().optional(),

  events: z.record(z.string(), systemEvent).optional(),

  initiative: z.object({
    die: z.object({ constant: z.string().min(1) }),
    bonus: slotRef.optional(),
    check: z.string().optional(),
  }).passthrough().optional(),

  mannequins: z.array(z.lazy(() => sheet)).optional(),
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

  grants: z.array(z.string().min(1)).optional(),
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
export type RangeTable = z.infer<typeof table>;
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
export type WordList = z.infer<typeof wordList>;
export type FieldOption = z.infer<typeof fieldOption>;
export type Guard = z.infer<typeof guard>;
export type Scale = z.infer<typeof scale>;
export type SystemEvent = z.infer<typeof systemEvent>;
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
