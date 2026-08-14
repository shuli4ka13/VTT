// Типы модели — ОДИН источник: схема мира (`@vtt/schema`).
//
// Раньше здесь лежал черновик, выписанный из образцов. Теперь формы задаёт
// схема, а движок их только реэкспортирует: два описания одной формы
// расходятся молча и всегда, а разойдясь — пропускают в базу мир, который
// движок посчитать не может.
//
// Зависимость ТОЛЬКО типовая: код движка zod не зовёт, `import type`
// стирается компиляцией, и рантайм-зависимостей у пакета по-прежнему ноль
// (закрыто сторожем в tests/guards.test.ts).

export type {
  SlotRef, RefSide, Tag, Field, FieldValue, DiceTerm, DieConstant,
  SystemConstant, RangeTable, RollEditOp, RollEdit, Modifier, Param,
  Step, Trigger, Effect,
  Activation, DurationKind, Stacking, Binding, RecordKind, System,
  StoredValue, WornEffect, Sheet, CompendiumRecord, Compendium, World,
} from '@vtt/schema';

/** Как движок спрашивает значение тега. Живёт здесь: это не форма данных. */
export type Resolve = (tag: string) => unknown;

/** Бросок кости: движок зовёт его, чтобы получить случайность извне. */
export type Die = (sides: number) => number;
