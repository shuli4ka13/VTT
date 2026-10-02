import { z } from 'zod';

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

export const valueKind = z.enum(['number', 'text', 'boolean', 'expr', 'dice', 'choice', 'effect', 'record', 'field', 'table', 'sheet']);

const typed = {
  kind: valueKind.optional(),
  from: z.string().min(1).optional(),
  many: z.boolean().optional(),
};

export const tag = z.string().min(1).refine(v => !v.includes(':'), {
  message: 'двоеточие в теге запрещено — им размечены выведенные мишени',
});

export const fieldOption = z.object({
  value: z.union([z.number(), z.string(), z.boolean()]),
  label: z.string().min(1),
});

export const control = z.enum(['stepper', 'pips', 'toggle', 'ring', 'bar', 'die', 'choice']);

export const rollSpec = z.object({
  die: z.object({ constant: z.string().min(1) }),
  count: formula.optional(),
  bonus: formula.optional(),
  tags: z.array(z.string().min(1)).optional(),
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

export const cellView = z.object({
  label: z.string().optional(),
  block: z.string().optional(),
  roll: z.lazy(() => rollSpec.partial()).optional(),
  control: control.optional(),
  default: tableValue.optional(),
});

export const columnValue = z.object({
  ...typed,
  expr: z.string().optional(),
  default: tableValue.optional(),
  min: bound.optional(),
  max: bound.optional(),
});

export const column = columnValue.extend({
  key: tag,
  label: z.string().optional(),
  roll: z.lazy(() => rollSpec.partial({ die: true }).extend({ label: z.string().optional() })).optional(),
  control: control.optional(),
  block: z.string().optional(),
  title: z.string().optional(),
  onSheet: z.boolean().optional(),
  optional: z.boolean().optional(),
}).strict();

export const groupSpec = z.object({
  parent: z.string().optional(),
}).strict();

export const tableRow = z.object({
  value: tableValue.optional(),
  label: z.string().optional(),
  block: z.string().optional(),

  from: z.number().optional(),
  to: z.number().optional(),

  cells: z.record(z.string(), z.unknown()).optional(),
  view: z.record(z.string(), cellView).optional(),
});

export const tableKey = z.enum(['word', 'number', 'range']);

export const rollEditOp = z.object({ op: z.string().min(1) }).passthrough();

export const rollEdit = z.object({
  label: z.string().optional(),
  ops: z.array(rollEditOp),
  canceledBy: z.string().optional(),
}).passthrough();

export const valueModifier = z.object({
  kind: z.literal('value'),
  target: z.string().refine(target => !/^(event:|roll:|incoming:)/.test(target), 'вызов, бросок и входящее число правит правка вызова (kind: edit), а не поле'),
  op: z.string(),
  value: formula,
  stacking: z.string().optional(),
  if: formula.optional(),
}).strict();


export const editModifier = z.object({
  kind: z.literal('edit'),
  call: z.string().min(1),
  param: z.string(),
  edit: z.string().optional(),
  op: z.string().optional(),
  value: formula.optional(),
  stacking: z.string().optional(),
  if: formula.optional(),
  tags: z.array(z.string().min(1)).optional(),
  anyTags: z.array(z.string().min(1)).optional(),
  notTags: z.array(z.string().min(1)).optional(),
  where: z.object({
    table: z.string().min(1),
    column: z.string().min(1),
    is: tableValue,
  }).optional(),
}).strict();

export const modifier = z.discriminatedUnion('kind', [valueModifier, editModifier]);

export const activation = z.enum(['manual', 'passive']);
export const durationKind = z.enum(['permanent', 'uses', 'rounds', 'turns', 'combat', 'scene']);
export const reapply = z.enum(['ignore', 'refresh', 'stack']);

export const ask = z.object({
  by: z.enum(['actor', 'gm']).optional(),
  hint: z.string().optional(),
});

export const param = column.extend({
  ask: ask.optional(),

  role: z.enum(['amount']).optional(),
  optional: z.boolean().optional(),
}).strict();

export const step = z.object({
  id: z.string().optional(),
  type: z.string().min(1),

  if: formula.optional(),
}).passthrough();

export const handler = z.object({
  on: z.string().min(1),
  if: formula.optional(),
  confirm: z.boolean().optional(),
  cost: z.array(step).optional(),
  steps: z.array(step).optional(),
}).strict();

export const tagContract = z.object({
  label: z.string().optional(),
  includes: z.array(z.string().min(1)).optional(),
  inputs: z.array(z.object({ key: z.string().min(1), kind: valueKind, many: z.boolean().optional() }).strict()).optional(),
  each: z.string().min(1).optional(),
  outputs: z.array(z.string().min(1)).optional(),
}).strict();

export const effect = z.object({
  extends: z.string().min(1).optional(),
  group: z.string().optional(),
  tags: z.array(z.string().min(1)).optional(),
  bond: z.object({ effect: z.string().min(1), by: z.string().min(1) }).strict().optional(),
  label: z.string().optional(),
  icon: z.string().optional(),
  description: z.string().optional(),
  activation: activation.optional(),
  duration: z.object({
    kind: durationKind,
    max: z.number().int().positive().optional(),
    ends: z.enum(['turn-end', 'turn-start']).optional(),
    by: z.string().min(1).optional(),
  }).strict().optional(),
  reapply: reapply.optional(),
  params: z.array(param).optional(),
  steps: z.array(step).optional(),

  cost: z.array(step).optional(),
  modifiers: z.array(modifier).optional(),
  on: z.array(handler).optional(),
  attach: z.array(step).optional(),
  detach: z.array(step).optional(),
  grants: z.array(z.string().min(1)).optional(),
}).strict();

export const bindingArg = formula;

export const tableFill = z.enum(['actor', 'targets']);

export const binding = z.object({
  label: z.string().optional(),
  effect: z.string(),
  table: z.record(z.string(), tableFill).optional(),
  args: z.record(z.string(), bindingArg).optional(),
}).strict();

export const tableShape = z.enum(['rows', 'single', 'book']);
export const tableOwner = z.enum(['sheet', 'group', 'desk']);
export const tableUse = z.enum(['item', 'action']);

export const table = z.object({
  label: z.string().optional(),

  shape: tableShape.optional(),
  owner: tableOwner.optional(),
  block: z.string().optional(),

  key: tableKey.optional(),
  columns: z.array(column).optional(),
  rows: z.array(tableRow).optional(),
  otherwise: tableValue.optional(),

  extends: z.string().min(1).optional(),
  use: tableUse.optional(),
  icon: z.string().optional(),
  hint: z.string().optional(),
  grants: z.array(z.string().min(1)).optional(),
  bindings: z.array(binding).optional(),
  modifiers: z.array(modifier).optional(),
}).strict();

export const sheetKind = z.object({
  extends: z.string().min(1).optional(),
  label: z.string().optional(),
  icon: z.string().optional(),
  block: z.string().optional(),
  hint: z.string().optional(),
  blocks: z.array(z.string().min(1)).optional(),
  grants: z.array(z.string().min(1)).optional(),
  modifiers: z.array(modifier).optional(),
}).strict();

export const system = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  fields: z.never({ message: 'полей больше нет — это колонки таблицы листа (system.tables, shape: single)' }).optional(),
  groups: z.record(z.string(), groupSpec).optional(),
  effects: z.record(z.string(), effect),

  grants: z.array(z.string()).optional(),
  records: z.never({ message: 'типов записей больше нет — это таблицы со строками из книги (shape: book), типы листов — system.sheets' }).optional(),
  sheets: z.record(z.string(), sheetKind).optional(),
  constants: z.record(z.string(), systemConstant).optional(),
  tables: z.record(z.string(), table).optional(),
  tags: z.record(z.string(), tagContract).optional(),
  roll_edits: z.record(z.string(), rollEdit).optional(),

  initiative: z.lazy(() => rollSpec).optional(),

  mannequins: z.array(z.lazy(() => sheet)).optional(),
  library: z.array(z.lazy(() => compendiumRecord)).optional(),
}).passthrough();

export const storedValue = z.union([z.number(), z.string(), z.boolean(), z.null()]);

export const wornEffect = z.object({
  effectId: z.string().min(1),
  inst: z.string().min(1).optional(),
  usesLeft: z.number().int().optional(),
  turnsLeft: z.number().int().optional(),
  until: z.number().int().optional(),
  combat: z.boolean().optional(),
  scene: z.boolean().optional(),
  args: z.record(z.string(), storedValue).optional(),
  bond: z.object({ sheet: z.string().min(1), effect: z.string().min(1) }).strict().optional(),
}).strict();

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

  table: z.string().optional(),
  label: z.string().optional(),
  description: z.string().optional(),
  cells: z.record(z.string(), z.unknown()).optional(),
  modifiers: z.array(modifier).optional(),

  bindings: z.array(binding).optional(),

  grants: z.array(z.string().min(1)).optional(),
}).strict();

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
export type RollSpec = z.infer<typeof rollSpec>;
export type ValueKind = z.infer<typeof valueKind>;
export type Tag = z.infer<typeof tag>;
export type DiceTerm = z.infer<typeof diceTerm>;
export type DiceReading = z.infer<typeof diceReading>;
export type DieConstant = z.infer<typeof dieConstant>;
export type SystemConstant = z.infer<typeof systemConstant>;
export type RollEditOp = z.infer<typeof rollEditOp>;
export type RollEdit = z.infer<typeof rollEdit>;
export type Table = z.infer<typeof table>;
export type TableRow = z.infer<typeof tableRow>;
export type TableKey = z.infer<typeof tableKey>;
export type Activation = z.infer<typeof activation>;
export type DurationKind = z.infer<typeof durationKind>;
export type Reapply = z.infer<typeof reapply>;
export type StoredValue = z.infer<typeof storedValue>;
export type Column = z.infer<typeof column>;
export type ColumnValue = z.infer<typeof columnValue>;
export type CellView = z.infer<typeof cellView>;
export type TableShape = z.infer<typeof tableShape>;
export type TableOwner = z.infer<typeof tableOwner>;
export type GroupSpec = z.infer<typeof groupSpec>;
export type Modifier = z.infer<typeof modifier>;
export type Param = z.infer<typeof param>;
export type Step = z.infer<typeof step>;
export type Ask = z.infer<typeof ask>;
export type Control = z.infer<typeof control>;
export type FieldOption = z.infer<typeof fieldOption>;
export type Guard = z.infer<typeof formula>;
export type Handler = z.infer<typeof handler>;
export type Effect = z.infer<typeof effect>;
export type Binding = z.infer<typeof binding>;
export type TagContract = z.infer<typeof tagContract>;
export type TableFill = z.infer<typeof tableFill>;
export type BindingArg = z.infer<typeof bindingArg>;
export type SheetKind = z.infer<typeof sheetKind>;
export type TableUse = z.infer<typeof tableUse>;
export type System = z.infer<typeof system>;
export type WornEffect = z.infer<typeof wornEffect>;
export type Owned = z.infer<typeof owned>;
export type Sheet = z.infer<typeof sheet>;
export type CompendiumRecord = z.infer<typeof compendiumRecord>;
export type Compendium = z.infer<typeof compendium>;
export type World = z.infer<typeof world>;
