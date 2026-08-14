// Схема мира. ОДИН источник правды на три потребителя: формы веба,
// валидация входа на сервере и проверка JSON-колонок БД.
//
// Типы выводятся из схем (`z.infer`), а не пишутся рядом: два описания одной
// формы расходятся молча и всегда, а разойдясь — пропускают в базу мир,
// который движок посчитать не может.
//
// Схема НЕ строгая к незнакомым ключам намеренно: мир приезжает из чужой
// системы и из старого формата, и терять поля при round-trip нельзя — это
// критерий приёмки №1. Поэтому `passthrough` там, где данные пользовательские.

import { z } from 'zod';

// ── ссылки на значения ──────────────────────────────────────────────────
// Слот шага заполняется одним из способов; сторона (`of`) говорит, чьим
// листом считать. Разбор — в движке (engine/refs.ts), здесь только форма.

export const refSide = z.enum(['source', 'target']);

/**
 * Порядок вариантов ЗНАЧИМ, и вариант `const` обязан быть последним.
 *
 * `z.unknown()` не требует наличия ключа, поэтому `{ const: z.unknown() }`
 * принимает ЛЮБОЙ объект — и, стоя первым, съедал бы `{ ref: 'hit.success' }`,
 * возвращая пустышку. Условие триггера молча пропадало при публикации мира,
 * и ответка переставала срабатывать: ошибка без сообщения, самая дорогая.
 *
 * Поэтому две страховки сразу: `const` идёт последним И требует своего ключа
 * явной проверкой — на случай, если порядок кто-то переставит.
 */
export const slotRef = z.union([
  z.object({ expr: z.string(), of: refSide.optional(), optional: z.boolean().optional() }),
  z.object({ tag: z.string(), of: refSide.optional(), optional: z.boolean().optional() }),
  z.object({ param: z.string(), optional: z.boolean().optional() }),
  z.object({ prop: z.string(), optional: z.boolean().optional() }),
  // `item` — прежнее имя формы `prop`, оставлено рабочим.
  z.object({ item: z.string(), optional: z.boolean().optional() }),
  z.object({ ref: z.string(), optional: z.boolean().optional() }),
  z.object({ constant: z.string(), optional: z.boolean().optional() }),
  z.object({ const: z.unknown(), optional: z.boolean().optional() })
    .refine(value => 'const' in value, { message: 'ссылка неизвестной формы' }),
]);

// ── поля листа ──────────────────────────────────────────────────────────

export const fieldValue = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('stored'),
    type: z.enum(['number', 'text', 'boolean']),
    default: z.union([z.number(), z.string(), z.boolean()]),
  }),
  z.object({ kind: z.literal('formula'), expr: z.string() }),
  z.object({ kind: z.literal('table'), table: z.string(), arg: z.string() }),
]);

/**
 * Тег машинный и неизменный, лейбл человеческий и переименуемый.
 * Формулы ссылаются ТОЛЬКО на тег — на этом держится критерий №2.
 * Двоеточие запрещено: им размечены выведенные мишени (`check:`, `incoming:`).
 */
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

// ── словари системы ─────────────────────────────────────────────────────

export const diceTerm = z.object({
  /** Число — обычный состав; ссылка — пул из листа (Тело + Оружие в Shadowrun). */
  count: z.union([z.number().int().positive(), slotRef]).optional(),
  sides: z.number().int().positive(),
  /** Имя части составного броска — Надежда/Страх в Daggerheart. */
  name: z.string().optional(),
  label: z.string().optional(),
});

/**
 * Чтение: КАК выпавшие кости становятся числом. Пусто — сумма; строка —
 * имя чтения без параметров («best»); объект — имя с параметрами
 * ({ kind: 'count', atLeast: 5 } — счёт успехов Shadowrun). Набор чтений —
 * реестр движка (engine/readings.ts), схема имена не перечисляет.
 */
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

/**
 * Ведущая кость: что бросается для действий в этом мире. Смена размера
 * здесь меняет ВСЕ броски системы, не требуя правки ни одной формулы.
 */
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

// ── правки броска: словарь автора ───────────────────────────────────────

/**
 * Один примитив правки. `op` — имя из реестра движка (engine/roll-edits.ts):
 * добавить кость, оставить лучшие, ступень кости, сдвиг порога, прибавка,
 * взрыв. Параметры — сверх op, их знает модуль примитива.
 */
export const rollEditOp = z.object({ op: z.string().min(1) }).passthrough();

/**
 * Запись словаря «Правки броска». Имя даёт АВТОР («Преимущество», «Фора»,
 * «Вдохновение») — механике доменные слова запрещены. Что запись делает —
 * список примитивов; «гасится: …» — ссылка на другую запись, и это данные,
 * а не закон движка. Нестакаемость записи с самой собой — закон движка:
 * два преимущества дают одно.
 */
export const rollEdit = z.object({
  label: z.string().optional(),
  ops: z.array(rollEditOp),
  canceledBy: z.string().optional(),
}).passthrough();

// ── модификаторы: две породы, и это принципиально ───────────────────────

export const valueModifier = z.object({
  kind: z.literal('value'),
  target: z.string(),
  op: z.string(),
  value: z.unknown(),
  stacking: z.string().optional(),
  condition: z.string().nullable().optional(),
}).passthrough();

/**
 * Правит БРОСОК. Двумя способами:
 *   edit — ссылка на запись словаря «Правки броска» (`system.roll_edits`):
 *          не число, не складывается, гашение объявлено в самой записи;
 *   op   — числовая прибавка к броску («+5 ко всем проверкам»): обычная
 *          арифметика, на состав и чтение костей не влияет.
 * Старая форма `effect: 'advantage'|'disadvantage'` переводится в edit
 * конвертером (model/unify.ts) — движок её не знает.
 */
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

// ── эффекты ─────────────────────────────────────────────────────────────

export const activation = z.enum(['manual', 'triggered', 'passive']);
export const durationKind = z.enum(['permanent', 'temporary', 'uses']);
export const stacking = z.enum(['ignore', 'refresh', 'stack']);

export const param = z.object({
  key: z.string().min(1),
  label: z.string().optional(),
  kind: z.string().optional(),
  /** `target` — параметр обязана посчитать цель, отправитель не может. */
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
}).passthrough();

/**
 * Род эффекта задаётся тем, КОГДА он срабатывает, и определяет нагрузку:
 * активируемый и триггерный несут конвейер шагов, пассивный — модификаторы.
 * Схема нагрузку не сужает: конструктор хранит обе, чтобы смена рода
 * туда-обратно не выбрасывала работу.
 */
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

// ── рода записей компендиума ────────────────────────────────────────────

/**
 * Аргумент привязки. Двух видов, как его читает движок (engine/refs.ts):
 * ГОТОВОЕ ЗНАЧЕНИЕ (строка, число, логическое) либо структурная ссылка —
 * прежде всего { prop }: «возьми из свойств самой записи».
 */
export const bindingArg = z.union([
  slotRef,
  z.string(), z.number(), z.boolean(), z.null(),
]);

/** Привязка рода к эффекту — то самое «протягивание». */
export const binding = z.object({
  label: z.string().optional(),
  effect: z.string().min(1),
  args: z.record(bindingArg).optional(),
}).passthrough();

export const recordKind = z.object({
  /** Базис хранения — короткий словарь движка; всё человеческое даёт система. */
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
}).passthrough();

// ── система ─────────────────────────────────────────────────────────────

export const system = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  fields: z.array(field),
  effects: z.record(effect),
  /** Пассивные эффекты, включённые на ВСЕХ: ссылки, не копии. */
  room_rules: z.array(z.string()).optional(),
  records: z.record(recordKind).optional(),
  constants: z.record(systemConstant).optional(),
  tables: z.record(rangeTable).optional(),
  rolls: z.array(z.object({ tag: z.string(), label: z.string() })).optional(),
  /** Словарь «Правки броска»: записи с именами автора, ссылаются модификаторы. */
  roll_edits: z.record(rollEdit).optional(),
  action_types: z.record(z.object({
    label: z.string(),
    icon: z.string().optional(),
  }).passthrough()).optional(),
  advantage: z.object({ methods: z.record(z.boolean()).optional() }).passthrough().optional(),
}).passthrough();

// ── чарник ──────────────────────────────────────────────────────────────
// Чистый DTO: только сохранённые значения и ссылки.

/** Хранимое значение обязано быть СКАЛЯРОМ — так вычисленное не попадёт в DTO. */
export const storedValue = z.union([z.number(), z.string(), z.boolean(), z.null()]);

export const wornEffect = z.object({
  effectId: z.string().min(1),
  usesLeft: z.number().int().optional(),
}).catchall(storedValue);

export const sheet = z.object({
  id: z.string().min(1),
  systemId: z.string(),
  /** Персонаж игрока или ведущего: метка владения, а не правило системы. */
  kind: z.enum(['pc', 'npc']),
  name: z.string(),
  values: z.record(storedValue),
  /** Ссылки по id, не копии: копия записи в чарнике — уже расхождение. */
  equipped: z.array(z.string()),
  effects: z.array(wornEffect),
  actions: z.array(z.string()),
}).strict();

// ── компендиум ──────────────────────────────────────────────────────────

export const compendiumRecord = z.object({
  id: z.string().min(1),
  /** Род записи: ключ в `system.records`. */
  rk: z.string().optional(),
  label: z.string().optional(),
  description: z.string().optional(),
  props: z.record(z.unknown()).optional(),
  modifiers: z.array(modifier).optional(),
  /** Своя привязка перебивает привязку рода — так живут штучные вещи. */
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

// ── выведенные типы ─────────────────────────────────────────────────────
// Пишутся ОДИН раз — здесь. Всё остальное берёт их отсюда.

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
