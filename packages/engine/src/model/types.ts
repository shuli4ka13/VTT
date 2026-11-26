export type {
  SlotRef, Formula, ValueKind, Tag, Column, ColumnValue, CellView, TableShape, TableOwner, FieldOption, DiceTerm, DieConstant,
  SystemConstant, Table, TableRow, TableKey, RollEditOp, RollEdit, Modifier, Param, Stage,
  Step, Guard, Ask, Handler, Effect,
  Activation, DurationKind, Reapply, Binding, TagContract, SheetKind, TableUse, System,
  StoredValue, WornEffect, ItemGrant, Owned, Sheet, CompendiumRecord, Compendium, World,
} from '@vtt/schema';

export type Resolve = (tag: string) => unknown;

export type Die = (sides: number) => number;

import type { Column, RollSpec, Control } from '@vtt/schema';

export type TableColumn = Column;

export type FieldValue =
  | { kind: 'stored'; type: 'number' | 'text' | 'note' | 'boolean' | 'choice'; from?: string; many?: true; default: number | string | boolean | (number | string | boolean)[]; start?: string; min?: number | string; max?: number | string }
  | { kind: 'formula'; expr: string; min?: number | string; max?: number | string };

export interface CellMark { table: string; row: string; column: string }

export type Holder = 'sheet' | 'group' | 'desk';

export interface Placement { group: string; section?: string; sectionAt?: number; sectionBy?: string; control?: Control; order?: number }

export interface Field {
  tag: string;
  label: string;
  hint?: string;
  group?: string;
  section?: string;
  sectionAt?: number;
  sectionBy?: string;
  order?: number;
  placements?: Placement[];
  roll?: Partial<RollSpec> & { label?: string; pair?: true; success?: { expr: string }; margin?: { expr: string }; total?: { expr: string }; zero?: { count: number; keep?: 'best' | 'worst' } };
  value: FieldValue;
  control?: Control;
  lives?: 'group' | 'desk';
  home: string;
  cell?: CellMark;
  sees?: 'owner' | 'gm' | 'none';
  edits?: 'gm' | 'none';
  dice?: true;
}
