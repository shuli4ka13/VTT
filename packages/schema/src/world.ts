import { z } from 'zod';

export const formula = z.object({ expr: z.string() }).strict();

export const slotRef = z.union([formula, z.string()]);

const bound = z.union([z.number(), z.object({ expr: z.string() }).strict()]);

export const valueKind = z.enum(['number', 'text', 'note', 'boolean', 'dice', 'choice', 'effect', 'record', 'field', 'table', 'column', 'sheet', 'roll']);

const typed = {
  kind: valueKind.optional(),
  from: z.string().min(1).optional(),
  many: z.boolean().optional(),
};

export const tag = z.string().min(1).refine(v => !v.includes(':'), {
  message: 'двоеточие в теге запрещено — им размечены выведенные мишени',
});

export const i18n = z.record(z.string(), z.record(z.string(), z.string())).optional();

export const fieldOption = z.object({
  i18n,
  value: z.union([z.number(), z.string(), z.boolean()]),
  label: z.string().min(1),
});

export const controlKind = z.enum(['signed', 'big', 'stepper', 'slider', 'pips', 'charges', 'bar', 'toggle', 'ring', 'choice', 'chips', 'die']);

export const control = z.object({
  i18n,
  kind: controlKind,
  step: z.number().positive().optional(),
  worse: z.enum(['low', 'high']).optional(),
  yes: z.string().min(1).optional(),
  no: z.string().min(1).optional(),
  minus: z.string().min(1).optional(),
  plus: z.string().min(1).optional(),
}).strict();

export const rollDegree = z.object({ label: z.string().min(1), if: formula }).strict();

export const degreeScale = z.object({ table: z.string().min(1), of: z.literal('margin').optional() }).strict();

export const rollDegrees = z.union([z.array(rollDegree), degreeScale]);

export const rollSpec = z.object({
  die: z.string().min(1),
  count: formula.optional(),
  bonus: formula.optional(),
  sides: formula.optional(),
  keep: z.union([formula, z.string()]).optional(),
  degrees: rollDegrees.optional(),
  under: z.literal(true).optional(),
  threshold: formula.optional(),
  tags: z.array(z.string().min(1)).optional(),
}).strict();

export const diceTerm = z.object({
  i18n,
  count: z.union([z.number().int().positive(), formula]).optional(),
  sides: z.number().int().positive(),
  name: z.string().optional(),
  label: z.string().optional(),
}).strict();

const perDie = z.number().int();

export const diceReading = z.union([
  z.enum(['sum', 'best', 'worst']),
  z.object({ kind: z.literal('sum') }).strict(),
  z.object({ kind: z.enum(['best', 'worst']), keep: z.number().int().positive().optional() }).strict(),
  z.object({ kind: z.literal('count'), atLeast: perDie.optional(), notOver: perDie.optional(), over: perDie.optional(), under: perDie.optional() }).strict()
    .refine(read => [read.atLeast, read.notOver, read.over, read.under].filter(one => one !== undefined).length === 1, { message: 'счёту успехов нужен ровно один порог на кость' }),
]);

export const dieConstant = z.object({
  i18n,
  label: z.string().optional(),
  kind: z.literal('die'),
  dice: z.array(diceTerm),
  read: diceReading.optional(),
}).strict();

export const systemConstant = z.object({
  i18n,
  label: z.string().optional(),
  kind: z.string().optional(),
  dice: z.array(diceTerm).optional(),
  read: diceReading.optional(),
}).passthrough().superRefine((constant, ctx) => {
  if (constant.kind !== 'die') return;
  const strict = dieConstant.safeParse(constant);
  if (strict.success) return;
  for (const issue of strict.error.issues) ctx.addIssue({ code: 'custom', message: issue.message, path: [...issue.path] });
});

export const rollZero = z.object({ count: z.number().int().positive(), keep: z.enum(['best', 'worst']).optional() }).strict();

export const tableValue = z.union([z.number(), z.string(), z.boolean()]);

const startValue = z.union([tableValue, z.array(tableValue)]);

export const cellValue = z.union([tableValue, formula, z.array(tableValue), z.null()]);

export const cellView = z.object({
  i18n,
  label: z.string().optional(),
  roll: z.lazy(() => rollSpec.partial()).optional(),
  default: z.union([startValue, formula]).optional(),
  min: bound.optional(),
  max: bound.optional(),
}).strict();

export const stageCombine = z.object({
  set: z.enum(['last', 'min', 'max']).optional(),
  add: z.enum(['sum', 'min', 'max']).optional(),
  mul: z.enum(['product', 'min', 'max']).optional(),
}).strict();

export const stage = z.object({
  i18n,
  key: z.string().min(1),
  label: z.string().optional(),
  combine: stageCombine.optional(),
  round: z.enum(['down', 'up', 'near']).optional(),
  atLeast: z.number().optional(),
  upTo: z.number().optional(),
  upToTimes: z.number().optional(),
}).strict();

export const columnValue = z.object({
  ...typed,
  expr: formula.optional(),
  default: z.union([startValue, formula]).optional(),
  min: bound.optional(),
  max: bound.optional(),
});

export const column = columnValue.extend({
  i18n,
  key: tag,
  label: z.string().optional(),
  hint: z.string().optional(),
  roll: z.never({ message: 'бросок поля задаётся в «Бросках» системы (system.rolls), а не у колонки' }).optional(),
  title: z.string().optional(),
  onSheet: z.boolean().optional(),
  optional: z.boolean().optional(),
  stages: z.array(stage).optional(),
  bound: z.enum(['from', 'to']).optional(),
  sees: z.enum(['owner', 'gm', 'none']).optional(),
  edits: z.enum(['gm', 'none']).optional(),
}).strict();

export const sheetPart = z.object({
  table: z.string().min(1),
  columns: z.array(z.string().min(1)).optional(),
  rows: z.array(z.string().min(1)).optional(),
  by: z.string().min(1).optional(),
  views: z.record(z.string(), control).optional(),
}).strict();

export const sheetList = z.enum(['hanging', 'things', 'actions']);

export const sheetBlock = z.object({
  i18n,
  key: z.string().min(1),
  label: z.string().min(1).optional(),
  parent: z.string().min(1).optional(),
  page: z.string().min(1).optional(),
  width: z.number().int().min(1).max(12).optional(),
  under: z.literal(true).optional(),
  height: z.number().int().min(40).max(3000).optional(),
  split: z.number().int().min(2).max(12).optional(),
  list: sheetList.optional(),
  kinds: z.array(z.string().min(1)).optional(),
  per: z.number().int().min(1).max(12).optional(),
  parts: z.array(sheetPart),
}).strict();

export const sheetPage = z.object({
  i18n,
  key: z.string().min(1),
  label: z.string().min(1).optional(),
  top: z.literal(true).optional(),
}).strict();

export const groupSpec = z.object({
  i18n,
  label: z.string().min(1).optional(),
  parent: z.string().optional(),
}).strict();

export const tableRow = z.object({
  i18n,
  value: tableValue.optional(),
  label: z.string().optional(),

  from: z.number().optional(),
  to: z.number().optional(),

  cells: z.record(z.string(), cellValue).optional(),
  view: z.record(z.string(), cellView).optional(),
}).strict();

export const tableKey = z.enum(['word', 'number', 'range']);

export const rollField = z.object({
  table: z.string().min(1),
  column: z.string().min(1),
  tags: z.array(z.string().min(1)).optional(),
  threshold: slotRef.optional(),
  keep: slotRef.optional(),
}).strict();

export const systemRoll = z.object({
  i18n,
  label: z.string().optional(),
  die: z.string().min(1),
  number: z.enum(['bonus', 'count', 'sides', 'under', 'over']).optional(),
  pair: z.literal(true).optional(),
  keep: slotRef.optional(),
  zero: rollZero.optional(),
  total: formula.optional(),
  degrees: rollDegrees.optional(),
  success: formula.optional(),
  margin: formula.optional(),
  tags: z.array(z.string().min(1)).optional(),
  fields: z.array(rollField),
}).strict();

const opPart = z.string().min(1).optional();
const opNumber = z.number().optional();
const opCount = z.number().int().positive().optional();

export const rollEditShape = z.discriminatedUnion('op', [
  z.object({ op: z.literal('addDie'), count: opCount, sides: opCount, part: opPart }).strict(),
  z.object({ op: z.literal('wild') }).strict(),
  z.object({ op: z.literal('keepBest'), n: opCount, part: opPart }).strict(),
  z.object({ op: z.literal('keepWorst'), n: opCount, part: opPart }).strict(),
  z.object({ op: z.literal('dieStep'), by: z.number().int().optional(), part: opPart, ladder: z.array(z.number().int().positive()).min(2).optional() }).strict(),
  z.object({ op: z.literal('shiftVersus'), by: z.number() }).strict(),
  z.object({ op: z.literal('shiftDegree'), by: z.number().int() }).strict(),
  z.object({ op: z.literal('floorDie'), least: opNumber, part: opPart }).strict(),
  z.object({ op: z.literal('explode'), at: z.enum(['max', 'min']).optional(), limit: opCount, apart: z.literal(true).optional(), part: opPart }).strict(),
  z.object({ op: z.literal('flip'), prefer: z.enum(['low', 'high']).optional(), part: opPart }).strict(),
  z.object({ op: z.literal('reroll'), n: opCount, part: opPart }).strict(),
  z.object({ op: z.literal('plus'), value: formula.optional(), die: z.union([z.string().min(1), formula]).optional(), count: z.union([z.number().int().positive(), formula]).optional(), minus: z.literal(true).optional() }).strict()
    .refine(op => (op.value === undefined) !== (op.die === undefined), { message: 'прибавке нужна либо формула, либо кость' }),
]);

export const rollEditOp = z.object({ op: z.string().min(1) }).passthrough().superRefine((op, ctx) => {
  const exact = rollEditShape.safeParse(op);
  if (exact.success) return;
  for (const issue of exact.error.issues) ctx.addIssue({ code: 'custom', message: issue.message, path: [...issue.path] });
});

export const rollEdit = z.object({
  i18n,
  label: z.string().optional(),
  ops: z.array(rollEditOp),
  cancels: z.array(z.string().min(1)).optional(),
  stacks: z.literal(true).optional(),
  once: z.literal(true).optional(),
  tags: z.array(z.string().min(1)).optional(),
  anyTags: z.array(z.string().min(1)).optional(),
  notTags: z.array(z.string().min(1)).optional(),
}).strict();

export const valueModifier = z.object({
  kind: z.literal('value'),
  target: z.string().refine(target => !/^(event:|roll:|incoming:)/.test(target), 'вызов, бросок и входящее число правит правка вызова (kind: edit), а не поле'),
  op: z.string(),
  value: formula,
  stage: z.string().optional(),
  if: formula.optional(),
}).strict();


export const editModifier = z.object({
  kind: z.literal('edit'),
  call: z.string().min(1),
  param: z.string(),
  edit: z.string().optional(),
  op: z.string().optional(),
  value: formula.optional(),
  die: z.union([z.string().min(1), formula]).optional(),
  count: formula.optional(),
  minus: z.literal(true).optional(),
  stage: z.string().optional(),
  if: formula.optional(),
  tags: z.array(z.string().min(1)).optional(),
  anyTags: z.array(z.string().min(1)).optional(),
  notTags: z.array(z.string().min(1)).optional(),
  where: z.object({
    table: z.string().min(1),
    column: z.string().min(1),
    is: tableValue,
  }).strict().optional(),
}).strict().refine(mod => !(mod.value && mod.die), { message: 'прибавка — число или кость, не обе' });

export const modifier = z.discriminatedUnion('kind', [valueModifier, editModifier]);

export const activation = z.enum(['manual', 'passive']);
export const durationKind = z.enum(['permanent', 'uses', 'rounds', 'turns', 'combat', 'scene', 'minutes', 'hours', 'days']);
export const reapply = z.enum(['ignore', 'refresh', 'stack']);

export const ask = z.object({
  i18n,
  by: z.enum(['actor', 'gm']),
  hint: z.string().optional(),
  if: formula.optional(),
}).strict();

export const param = column.extend({
  ask: ask.optional(),
  perTarget: z.boolean().optional(),
  measure: z.boolean().optional(),
  count: formula.optional(),
  repeat: z.boolean().optional(),
  item: z.object({ key: tag, label: z.string().optional(), i18n }).strict().optional(),

  role: z.enum(['amount', 'target', 'actor']).optional(),
  optional: z.boolean().optional(),
}).strict();

export const step = z.object({
  i18n,
  id: z.string().optional(),
  label: z.string().min(1).optional(),
  type: z.string().min(1),

  if: formula.optional(),
}).passthrough();

export const confirm = z.object({
  i18n,
  question: z.string().min(1).optional(),
  show: z.array(z.enum(['actor', 'action', 'roll', 'versus'])).min(1).optional(),
  to: z.enum(['actor', 'target', 'gm']).optional(),
}).strict();

export const handler = z.object({
  i18n,
  on: z.string().min(1),
  if: formula.optional(),
  tags: z.array(z.string().min(1)).optional(),
  anyTags: z.array(z.string().min(1)).optional(),
  notTags: z.array(z.string().min(1)).optional(),
  confirm: confirm.optional(),
  cost: z.array(step).optional(),
  steps: z.array(step).optional(),
}).strict();

export const tagContract = z.object({
  i18n,
  label: z.string().optional(),
  includes: z.array(z.string().min(1)).optional(),
  inputs: z.array(z.object({ key: z.string().min(1), kind: valueKind, from: z.string().min(1).optional(), many: z.boolean().optional() }).strict()).optional(),
  each: z.string().min(1).optional(),
  outputs: z.array(z.object({ key: z.string().min(1), kind: valueKind, from: z.string().min(1).optional(), many: z.boolean().optional() }).strict()).optional(),
  traits: z.array(z.object({ key: z.string().min(1), from: z.string().min(1).optional() }).strict()).optional(),
  said: z.record(z.string(), z.string().min(1)).optional(),
}).strict();

export const effect = z.object({
  i18n,
  group: z.string().optional(),
  tags: z.array(z.string().min(1)).optional(),
  bond: z.object({ effect: z.string().min(1), by: z.string().min(1), if: formula.optional(), many: z.boolean().optional(), args: z.record(z.string(), formula).optional() }).strict().optional(),
  label: z.string().optional(),
  icon: z.string().optional(),
  description: z.string().optional(),
  note: z.string().optional(),
  activation: activation.optional(),
  duration: z.object({
    kind: durationKind,
    max: z.union([z.number().int().positive(), formula]).optional(),
    ends: z.enum(['turn-end', 'turn-start']).optional(),
    by: z.string().min(1).optional(),
  }).strict().optional(),
  reapply: reapply.optional(),
  params: z.array(param).optional(),
  returns: z.array(column.extend({ no: z.string().optional() }).strict()).optional(),
  steps: z.array(step).optional(),

  cost: z.array(step).optional(),
  modifiers: z.array(modifier).optional(),
  on: z.array(handler).optional(),
  attach: z.array(step).optional(),
  detach: z.array(step).optional(),
  grants: z.array(z.string().min(1)).optional(),
}).strict();

export const bindingArg = formula;

export const binding = z.object({
  i18n,
  label: z.string().optional(),
  effect: z.string(),
  args: z.record(z.string(), bindingArg).optional(),
  if: formula.optional(),
}).strict();

export const tableShape = z.enum(['rows', 'single', 'book']);
export const tableOwner = z.enum(['sheet', 'group', 'desk']);
export const tableUse = z.enum(['item', 'action']);

export const table = z.object({
  i18n,
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
  group: z.string().optional(),
  note: z.string().optional(),
  grants: z.array(z.string().min(1)).optional(),
  bindings: z.array(binding).optional(),
  modifiers: z.array(modifier).optional(),
}).strict();

export const sheetKind = z.object({
  i18n,
  extends: z.string().min(1).optional(),
  label: z.string().optional(),
  icon: z.string().optional(),
  hint: z.string().optional(),
  blocks: z.array(z.string().min(1)).optional(),
  grants: z.array(z.string().min(1)).optional(),
  modifiers: z.array(valueModifier).optional(),
}).strict();

export const system = z.object({
  langs: z.array(z.string().min(2)).min(1).optional(),
  id: z.string().optional(),
  name: z.string().optional(),
  fields: z.never({ message: 'полей больше нет — это колонки таблицы листа (system.tables, shape: single)' }).optional(),
  groups: z.record(z.string(), groupSpec).optional(),
  blocks: z.array(sheetBlock).optional(),
  pages: z.array(sheetPage).optional(),
  sample: z.record(z.string(), z.lazy(() => storedValue)).optional(),
  effects: z.record(z.string(), effect),

  grants: z.array(z.string()).optional(),
  records: z.never({ message: 'типов записей больше нет — это таблицы со строками из книги (shape: book), типы листов — system.sheets' }).optional(),
  sheets: z.record(z.string(), sheetKind).optional(),
  constants: z.record(z.string(), systemConstant).optional(),
  tables: z.record(z.string(), table).optional(),
  tags: z.record(z.string(), tagContract).optional(),
  roll_edits: z.record(z.string(), rollEdit).optional(),
  rolls: z.record(z.string(), z.lazy(() => systemRoll)).optional(),

  grid: z.object({
    step: z.number().positive(),
    unit: z.string().optional(),
    diagonal: z.enum(['one', 'alt', 'line']).optional(),
  }).strict().optional(),

  initiative: z.lazy(() => rollSpec.extend({ ties: z.array(z.string().min(1)).optional() })).optional(),
  health: z.object({
    value: z.string().min(1),
    max: z.string().min(1),
    steps: z.object({ table: z.string().min(1), from: z.string(), state: z.string().min(1).optional() }).strict().optional(),
  }).strict().optional(),
  limits: z.object({
    handlerDepth: z.number().int().positive().optional(),
    budget: z.number().int().positive().optional(),
    settleRounds: z.number().int().positive().optional(),
    callDepth: z.number().int().positive().optional(),
    probes: z.number().int().positive().optional(),
  }).strict().optional(),

  library: z.array(z.lazy(() => compendiumRecord)).optional(),
}).strict();

export const storedValue = z.union([z.number(), z.string(), z.boolean(), z.null(), z.array(z.union([z.number(), z.string(), z.boolean()]))]);

export const wornEffect = z.object({
  effectId: z.string().min(1),
  inst: z.string().min(1).optional(),
  usesLeft: z.number().int().optional(),
  turnsLeft: z.number().int().optional(),
  until: z.number().int().optional(),
  atSec: z.number().optional(),
  combat: z.boolean().optional(),
  scene: z.boolean().optional(),
  args: z.record(z.string(), storedValue).optional(),
  bond: z.object({ sheet: z.string().min(1), effect: z.string().min(1), inst: z.string().min(1).optional() }).strict().optional(),
}).strict();

export const owned = z.object({
  of: z.string().min(1),
  id: z.string().min(1).optional(),
  in: z.string().min(1).optional(),
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
  quiet: z.array(z.string().min(1)).optional(),
}).strict();

export const compendiumRecord = z.object({
  i18n,
  id: z.string().min(1),

  table: z.string().optional(),
  label: z.string().optional(),
  description: z.string().optional(),
  cells: z.record(z.string(), cellValue).optional(),
  modifiers: z.array(modifier).optional(),

  bindings: z.array(binding).optional(),

  grants: z.array(z.string().min(1)).optional(),
}).strict();

export const compendium = z.object({
  records: z.array(compendiumRecord).optional(),
}).strict();

export const world = z.object({
  system,
  compendium,
  sheets: z.array(sheet),
}).strict();

export type SlotRef = z.infer<typeof slotRef>;
export type CellValue = z.infer<typeof cellValue>;
export type Formula = z.infer<typeof formula>;
export type RollSpec = z.infer<typeof rollSpec>;
export type SystemRoll = z.infer<typeof systemRoll>;
export type RollField = z.infer<typeof rollField>;
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
export type Stage = z.infer<typeof stage>;
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
export type SheetBlock = z.infer<typeof sheetBlock>;
export type SheetPart = z.infer<typeof sheetPart>;
export type SheetPage = z.infer<typeof sheetPage>;
export type SheetList = z.infer<typeof sheetList>;
export type ControlKind = z.infer<typeof controlKind>;
export type FieldOption = z.infer<typeof fieldOption>;
export type Guard = z.infer<typeof formula>;
export type Handler = z.infer<typeof handler>;
export type Effect = z.infer<typeof effect>;
export type Binding = z.infer<typeof binding>;
export type TagContract = z.infer<typeof tagContract>;
export type Confirm = z.infer<typeof confirm>;
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
