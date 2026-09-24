export type {
  SlotRef, Formula, RefSide, Tag, Field, FieldValue, FieldOption, DiceTerm, DieConstant,
  SystemConstant, Table, TableColumn, TableRow, TableKey, RollEditOp, RollEdit, Modifier, Param,
  Step, Guard, Ask, Handler, Effect,
  Activation, DurationKind, Stacking, Binding, RecordKind, System,
  StoredValue, WornEffect, Sheet, CompendiumRecord, Compendium, World,
} from '@vtt/schema';

export type Resolve = (tag: string) => unknown;

export type Die = (sides: number) => number;
