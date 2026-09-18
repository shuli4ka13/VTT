export type {
  SlotRef, RefSide, Tag, Field, FieldValue, DiceTerm, DieConstant,
  SystemConstant, RangeTable, RollEditOp, RollEdit, Modifier, Param,
  Step, Guard, SystemEvent, Trigger, Effect,
  Activation, DurationKind, Stacking, Binding, RecordKind, System,
  StoredValue, WornEffect, Sheet, CompendiumRecord, Compendium, World,
} from '@vtt/schema';

export type Resolve = (tag: string) => unknown;

export type Die = (sides: number) => number;
