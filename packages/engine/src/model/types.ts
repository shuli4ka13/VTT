export type {
  SlotRef, Formula, ValueKind, RefSide, Tag, Field, FieldValue, FieldOption, DiceTerm, DieConstant,
  SystemConstant, Table, TableColumn, TableRow, TableKey, TableView, TableViewColumn, RollEditOp, RollEdit, Modifier, Param,
  Step, Guard, Ask, Handler, Effect,
  Activation, DurationKind, Reapply, Binding, RecordKind, System,
  StoredValue, WornEffect, Owned, Sheet, CompendiumRecord, Compendium, World,
} from '@vtt/schema';

export type Resolve = (tag: string) => unknown;

export type Die = (sides: number) => number;
