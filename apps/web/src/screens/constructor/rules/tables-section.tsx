import { Card, CardHead, Field, Input, NumInput, Button, Fold, Segmented, Verdict } from '../../../ui/primitives.tsx';
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
        sub="По числу — ступеньки вроде бонуса мастерства. По значению — что на что менять: чем бьют → какая формула."
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
  const cases = table.cases ?? [];
  const byCases = cases.length > 0 || !ranges.length;
  const inUse = isUsed(usage, 'table', id);
  const broken = !byCases && rangesBroken(ranges);

  const edit = (change: (draft: RangeTable) => void) => editSystem(draft => {
    const target = draft.tables?.[id];
    if (target) change(target);
  });

  return (
    <Fold title={table.label || id} count={byCases ? cases.length : ranges.length}>
      <div className="dict-row">
        <Input
          value={table.label ?? ''}
          placeholder="таблица"
          onChange={label => edit(draft => { draft.label = label; })}
        />
        <Button
          size="sm" variant="danger" disabled={inUse}
          title={inUse ? 'таблица используется' : undefined}
          onClick={() => editSystem(draft => { delete draft.tables?.[id]; })}
        >
          Убрать
        </Button>
      </div>

      <Segmented
        value={byCases ? 'cases' : 'ranges'}
        options={[
          { key: 'ranges', label: 'по числу — от и до' },
          { key: 'cases', label: 'по значению — что на что' },
        ]}
        onChange={next => edit(draft => {
          if (next === 'cases') {
            draft.cases ??= [{ when: '', value: '' }];
            delete draft.ranges;
          } else {
            draft.ranges ??= [{ from: 1, to: 1, value: 0 }];
            delete draft.cases;
            delete draft.otherwise;
          }
        })}
      />

      {broken ? <Verdict tone="warn">диапазоны перекрываются или дырявы</Verdict> : null}

      {byCases ? (
        <>
          {cases.map((one, i) => (
            <div key={i} className="pair">
              <Input
                value={String(one.when)}
                placeholder="если это"
                mono
                onChange={next => edit(draft => {
                  const row = draft.cases?.[i];
                  if (row) row.when = parseFree(next);
                })}
              />
              <Input
                value={String(one.value)}
                placeholder="то вот это"
                mono
                onChange={next => edit(draft => {
                  const row = draft.cases?.[i];
                  if (row) row.value = parseFree(next);
                })}
              />
              <Button
                size="sm" variant="danger"
                onClick={() => edit(draft => { draft.cases?.splice(i, 1); })}
              >×</Button>
            </div>
          ))}

          <Button size="sm" onClick={() => edit(draft => {
            (draft.cases ??= []).push({ when: '', value: '' });
          })}>+ пара</Button>

          <Field label="Если ничего не совпало" hint="Пусто — движок скажет, что значения не знает.">
            <Input
              value={table.otherwise === undefined ? '' : String(table.otherwise)}
              placeholder="оставить пустым"
              mono
              onChange={next => edit(draft => {
                if (next === '') delete draft.otherwise; else draft.otherwise = parseFree(next);
              })}
            />
          </Field>
        </>
      ) : (
        <>
          {ranges.map((range, i) => (
            <div key={i} className="range-row">
              <NumInput value={range.from} onCommit={n => edit(draft => {
                const row = draft.ranges?.[i];
                if (row) row.from = n;
              })} />
              <NumInput value={range.to} onCommit={n => edit(draft => {
                const row = draft.ranges?.[i];
                if (row) row.to = n;
              })} />
              <Input value={String(range.value)} onChange={next => edit(draft => {
                const row = draft.ranges?.[i];
                if (row) row.value = parseFree(next);
              })} />
              <Button size="sm" variant="danger" onClick={() => edit(draft => {
                draft.ranges?.splice(i, 1);
              })}>×</Button>
            </div>
          ))}

          <Button size="sm" onClick={() => edit(draft => {
            const list = (draft.ranges ??= []);
            const from = list.length ? list[list.length - 1]!.to + 1 : 1;
            list.push({ from, to: from, value: 0 });
          })}>+ ступень</Button>
        </>
      )}
    </Fold>
  );
}
