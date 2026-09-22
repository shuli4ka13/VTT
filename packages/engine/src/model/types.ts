export type {
  SlotRef, RefSide, Tag, Field, FieldValue, FieldOption, WordList, DiceTerm, DieConstant,
  SystemConstant, RangeTable, Table, TableColumn, TableRow, RollEditOp, RollEdit, Modifier, Param,
  Step, Guard, Ask, SystemEvent, Trigger, Effect,
  Activation, DurationKind, Stacking, Binding, RecordKind, System,
  StoredValue, WornEffect, Sheet, CompendiumRecord, Compendium, World,
} from '@vtt/schema';

export type Resolve = (tag: string) => unknown;

export type Die = (sides: number) => number;
