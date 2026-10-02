export type {
  SlotRef, Formula, ValueKind, Tag, Column, ColumnValue, CellView, TableShape, TableOwner, FieldOption, DiceTerm, DieConstant,
  SystemConstant, Table, TableRow, TableKey, RollEditOp, RollEdit, Modifier, Param,
  Step, Guard, Ask, Handler, Effect,
  Activation, DurationKind, Reapply, Binding, TableFill, TagContract, SheetKind, TableUse, System,
  StoredValue, WornEffect, Owned, Sheet, CompendiumRecord, Compendium, World,
} from '@vtt/schema';

export type Resolve = (tag: string) => unknown;

export type Die = (sides: number) => number;

import type { Column, RollSpec, Control } from '@vtt/schema';

export type TableColumn = Column;

export type FieldValue =
  | { kind: 'stored'; type: 'number' | 'text' | 'boolean' | 'choice'; from?: string; default: number | string | boolean; min?: number | string; max?: number | string }
  | { kind: 'formula'; expr: string; min?: number | string; max?: number | string };

export interface CellMark { table: string; row: string; column: string }

export type Holder = 'sheet' | 'group' | 'desk';

export interface Field {
  tag: string;
  label: string;
  group?: string;
  roll?: Partial<RollSpec> & { label?: string };
  value: FieldValue;
  control?: Control;
  lives?: 'group' | 'desk';
  home: string;
  cell?: CellMark;
}
