// Типы модели. ЧЕРНОВИК до этапа 2: там их заменят типы, выведенные
// из Zod-схем (`packages/schema`). Пока формы выписаны из фактических
// данных образцов — src/model/system.js PoC остаётся источником правды.
//
// Индексные сигнатуры `[k: string]: unknown` стоят намеренно: движок
// обязан переживать поля, о которых не знает, — мир приезжает из чужой
// системы и из старого формата.

// ── ссылки на значения ──────────────────────────────────────────────────
// Слот шага заполняется одним из шести способов; сторона разрешения (`of`)
// говорит, чьим листом считать. Подробности — engine/refs.ts.

export interface ConstRef { const: unknown; optional?: boolean }
export interface ExprRef { expr: string; of?: RefSide; optional?: boolean }
export interface TagRef { tag: string; of?: RefSide; optional?: boolean }
export interface ParamRef { param: string; optional?: boolean }
export interface PropRef { prop: string; optional?: boolean }
/** Историческое имя `{ item }` — принимается наравне с `{ prop }`. */
export interface ItemRef { item: string; optional?: boolean }
export interface StepRef { ref: string; optional?: boolean }
export interface ConstantRef { constant: string; optional?: boolean }

export type RefSide = 'source' | 'target';

export type SlotRef =
  | ConstRef | ExprRef | TagRef | ParamRef | PropRef | ItemRef | StepRef | ConstantRef;

// ── поля листа ──────────────────────────────────────────────────────────

export type StoredType = 'number' | 'text' | 'boolean';

export interface StoredValue { kind: 'stored'; type: StoredType; default: unknown }
export interface FormulaValue { kind: 'formula'; expr: string }
export interface TableValue { kind: 'table'; table: string; arg: string }
export type FieldValue = StoredValue | FormulaValue | TableValue;

export interface Field {
  tag: string;
  label: string;
  group?: string;
  /** Поле бросаемо: в интерфейсе у него появляется кнопка броска. */
  roll?: { label?: string };
  value: FieldValue;
  [k: string]: unknown;
}

// ── словари системы ─────────────────────────────────────────────────────

export interface DiceTerm { count: number; sides: number }

export interface DieConstant {
  label?: string;
  kind: 'die';
  dice: DiceTerm[];
  [k: string]: unknown;
}
export type SystemConstant = DieConstant | { label?: string; kind?: string; [k: string]: unknown };

export interface TableRange { from: number; to: number; value: unknown }
export interface RangeTable { label?: string; ranges: TableRange[] }

export interface RollTarget { tag: string; label: string }
export interface ActionType { label: string; icon?: string }

// ── эффекты ─────────────────────────────────────────────────────────────

export type Activation = 'manual' | 'triggered' | 'passive';
export type DurationKind = 'permanent' | 'temporary' | 'uses';
export type Stacking = 'ignore' | 'refresh' | 'stack';

export interface Duration { kind: DurationKind; max?: number }

export interface Param {
  key: string;
  label?: string;
  /** Как спрашивать значение: выражение, кость, ссылка на эффект, число. */
  kind?: string;
  /** `target` — параметр обязан посчитать получатель, а не отправитель. */
  of?: RefSide;
  [k: string]: unknown;
}

/** Правит ЗНАЧЕНИЕ: обычная арифметика, складывается по правилу стакинга. */
export interface ValueModifier {
  kind: 'value';
  target: string;
  op: 'add' | 'mul' | 'set' | string;
  value: unknown;
  stacking?: string;
  condition?: string | null;
  [k: string]: unknown;
}

/** Правит БРОСОК: не число, не складывается, помеха гасит преимущество. */
export interface RollModifier {
  kind: 'roll';
  target: string;
  effect: 'advantage' | 'disadvantage';
  method?: string;
  condition?: string | null;
  [k: string]: unknown;
}

export type Modifier = ValueModifier | RollModifier;

export interface Trigger {
  /** Идентификатор эффекта, на который отвечаем. */
  on: string;
  when?: string;
  condition?: SlotRef | null;
  [k: string]: unknown;
}

export interface Step {
  id?: string;
  type: string;
  side?: RefSide;
  [k: string]: unknown;
}

export interface Effect {
  label?: string;
  icon?: string;
  category?: string;
  description?: string;
  activation?: Activation;
  cost?: string;
  duration?: Duration;
  stacking?: Stacking;
  params?: Param[];
  steps?: Step[];
  modifiers?: Modifier[];
  trigger?: Trigger;
  [k: string]: unknown;
}

// ── рода записей компендиума ────────────────────────────────────────────

/** Базис хранения — короткий словарь движка. Всё человеческое даёт система. */
export type RecordBasis = 'item' | 'action';

export interface RecordProp {
  key: string;
  label?: string;
  kind?: string;
  [k: string]: unknown;
}

/** Привязка рода к эффекту — то самое «протягивание». */
export interface Binding {
  label?: string;
  effect: string;
  args?: Record<string, SlotRef>;
  [k: string]: unknown;
}

export interface RecordKind {
  kind: RecordBasis;
  label?: string;
  icon?: string;
  group?: string;
  hint?: string;
  props?: RecordProp[];
  bindings?: Binding[];
  [k: string]: unknown;
}

// ── система ─────────────────────────────────────────────────────────────

export interface System {
  id?: string;
  name?: string;
  fields: Field[];
  effects: Record<string, Effect>;
  /** Пассивные эффекты, включённые на ВСЕХ чарников мира: ссылки, не копии. */
  room_rules?: string[];
  records?: Record<string, RecordKind>;
  constants?: Record<string, SystemConstant>;
  tables?: Record<string, RangeTable>;
  rolls?: RollTarget[];
  action_types?: Record<string, ActionType>;
  advantage?: { methods?: Record<string, boolean> };
  [k: string]: unknown;
}

// ── чарник ──────────────────────────────────────────────────────────────
// Чистый DTO: только сохранённые значения и ссылки. Ни методов,
// ни вычисленных величин — это критерий приёмки №1.

export interface WornEffect {
  id: string;
  /** Сколько срабатываний осталось у эффекта с `duration.kind === 'uses'`. */
  uses?: number;
  [k: string]: unknown;
}

export interface Sheet {
  id: string;
  name?: string;
  kind?: string;
  system?: string;
  values: Record<string, unknown>;
  /** Надетые предметы компендиума — ссылки по id. */
  equipped?: string[];
  /** Известные действия компендиума — ссылки по id. */
  known?: string[];
  /** Висящие эффекты системы. */
  effects?: WornEffect[];
  [k: string]: unknown;
}

// ── компендиум ──────────────────────────────────────────────────────────
// Данные ДЛЯ системы и чарника: циферки плюс ссылки на эффекты.
// Шагов автоматизации здесь нет и быть не может.

export interface CompendiumRecord {
  id: string;
  /** Род записи: ключ в `system.records`. */
  rk?: string;
  label?: string;
  description?: string;
  props?: Record<string, unknown>;
  modifiers?: Modifier[];
  /** Своя привязка перебивает привязку рода — так живут штучные вещи. */
  activities?: Binding[];
  [k: string]: unknown;
}

export interface Compendium {
  items?: CompendiumRecord[];
  actions?: CompendiumRecord[];
  [k: string]: unknown;
}

export interface World {
  system: System;
  compendium: Compendium;
  sheets: Sheet[];
  [k: string]: unknown;
}

// ── вычисление ──────────────────────────────────────────────────────────

export type Resolve = (tag: string) => unknown;

/** Бросок кости: движок зовёт его, чтобы получить случайность извне. */
export type Die = (sides: number) => number;
