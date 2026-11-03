import type { TableRow } from '@vtt/schema';
import { isBlank } from '@vtt/engine/model/blank';

export type RowViewKey = 'default' | 'min' | 'max';

export function setRowView(row: TableRow, column: string, key: RowViewKey, value: unknown, general: unknown): void {
  const { [key]: _old, ...rest } = row.view?.[column] ?? {};
  const same = JSON.stringify(value) === JSON.stringify(general);
  const next = isBlank(value) || same ? rest : { ...rest, [key]: value };
  const views = { ...row.view };
  if (Object.keys(next).length) views[column] = next as never; else delete views[column];
  if (Object.keys(views).length) row.view = views; else delete row.view;
}
