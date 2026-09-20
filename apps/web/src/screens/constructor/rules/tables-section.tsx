import { Card, CardHead, Input, NumInput, Button, Fold, Verdict } from '../../../ui/primitives.tsx';
import { newTable } from '../factory.ts';
import { inUse as isUsed } from '../usage.ts';
import type { UsageIndex } from '../usage.ts';
import type { System, RangeTable } from '@vtt/schema';
import type { WorldState } from '../../../store/world.ts';

type EditSystem = WorldState['editSystem'];
interface Props { system: System; editSystem: EditSystem; usage: UsageIndex }

const parseFree = (text: string): number | string | boolean =>
  /^-?\d+(\.\d+)?$/.test(text) ? Number(text)
    : text === 'true' ? true
      : text === 'false' ? false
        : text;

const rangesBroken = (ranges: { from: number; to: number }[]): boolean => {
  if (ranges.length < 2) return false;
  const sorted = [...ranges].sort((a, b) => a.from - b.from);
  return sorted.some((r, i) => i > 0 && sorted[i - 1]!.to + 1 !== r.from);
};

const addTable = (editSystem: EditSystem) => editSystem(draft => {
  const made = newTable(draft);
  (draft.tables ??= {})[made.key] = made.value;
});

export function TablesSection({ system, editSystem, usage }: Props) {
  const entries = Object.entries(system.tables ?? {});

  return (
    <Card>
      <CardHead
        title="Таблицы"
        sub="Ступеньки, которые формулой не сказать: бонус мастерства по уровню, исход хода по итогу броска."
        actions={<Button size="sm" onClick={() => addTable(editSystem)}>+ таблица</Button>}
      />
      <div className="stack stack--tight">
        {entries.length === 0 ? (
          <span className="faint">Таблиц пока нет — например, бонус мастерства по уровню.</span>
        ) : entries.map(([key, table]) => (
          <TableRow key={key} id={key} table={table} editSystem={editSystem} usage={usage} />
        ))}
      </div>
    </Card>
  );
}

function TableRow({ id, table, editSystem, usage }: Omit<Props, 'system'> & { id: string; table: RangeTable }) {
  const ranges = table.ranges ?? [];
  const inUse = isUsed(usage, 'table', id);
  const broken = rangesBroken(ranges);

  return (
    <Fold title={table.label || id} count={ranges.length}>
      <div className="dict-row">
        <Input
          value={table.label ?? ''}
          placeholder="таблица"
          onChange={label => editSystem(draft => {
            draft.tables ??= {};
            const cur = draft.tables?.[id];
            if (cur) cur.label = label;
          })}
        />
        <Button
          size="sm" variant="danger" disabled={inUse}
          title={inUse ? 'таблица используется' : undefined}
          onClick={() => editSystem(draft => { delete draft.tables?.[id]; })}
        >
          Убрать
        </Button>
      </div>

      {broken ? <Verdict tone="warn">диапазоны перекрываются или дырявы</Verdict> : null}

      {ranges.map((range, i) => (
        <div key={i} className="range-row">
          <NumInput
            value={range.from}
            onCommit={n => editSystem(draft => {
              const r = draft.tables?.[id]?.ranges[i];
              if (r) r.from = n;
            })}
          />
          <NumInput
            value={range.to}
            onCommit={n => editSystem(draft => {
              const r = draft.tables?.[id]?.ranges[i];
              if (r) r.to = n;
            })}
          />
          <Input
            value={String(range.value)}
            onChange={next => editSystem(draft => {
              const r = draft.tables?.[id]?.ranges[i];
              if (r) r.value = parseFree(next);
            })}
          />
          <Button
            size="sm" variant="danger"
            onClick={() => editSystem(draft => { draft.tables?.[id]?.ranges.splice(i, 1); })}
          >
            ×
          </Button>
        </div>
      ))}

      <Button
        size="sm"
        onClick={() => editSystem(draft => {
          const list = draft.tables?.[id]?.ranges;
          if (!list) return;
          const from = list.length ? list[list.length - 1]!.to + 1 : 1;
          list.push({ from, to: from, value: 0 });
        })}
      >
        + диапазон
      </Button>
    </Fold>
  );
}
