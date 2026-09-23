import type { ReactNode } from 'react';
import { SheetGrid } from './sheet-grid.tsx';

export interface RowField {
  key: string;
  label: string;
  width: number;
  hint?: string;
  node: ReactNode;
}

export function FieldRow({ id, fields, tail, tailWidth = 100 }: {
  id: string;
  fields: RowField[];
  tail?: ReactNode;
  tailWidth?: number;
}) {
  return (
    <SheetGrid
      id={`row.${id}`}
      columns={fields.map(({ key, label, width, hint }) => ({ key, label, width, ...(hint ? { hint } : {}) }))}
      tail={tail ? tailWidth : null}
    >
      {fields.map(field => <div key={field.key} className="field-row__cell">{field.node}</div>)}
      {tail ? <div className="field-row__cell">{tail}</div> : null}
    </SheetGrid>
  );
}
