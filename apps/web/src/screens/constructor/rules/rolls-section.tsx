import { Card, CardHead, Button, DangerButton, Field, LabelInput, Select, Chip, Empty } from '../../../ui/primitives.tsx';
import { TagsField } from '../tags-field.tsx';
import { dieEntries } from './dice-section.tsx';
import { addRoll } from './rolls.ts';
import { fieldsOf, onSheet, isSingle } from '@vtt/engine/model/sheet-columns';
import type { System, SystemRoll } from '@vtt/schema';
import type { WorldState } from '../../../store/world.ts';

type EditSystem = WorldState['editSystem'];

const NUMBER_WORDS = [['bonus', 'число поля — прибавка к кости'], ['count', 'число поля — сколько костей']] as const;

function columnsOf(system: System): [string, string][] {
  const out: [string, string][] = [];
  for (const [id, table] of Object.entries(system.tables ?? {})) {
    if (!onSheet(table)) continue;
    for (const column of table.columns ?? []) {
      if ((column.kind ?? 'number') !== 'number') continue;
      const name = column.label || column.key;
      out.push([`${id}\u0000${column.key}`, isSingle(table) ? name : `${table.label || id} → ${name}`]);
    }
  }
  return out;
}

function RollCard({ id, roll, system, editSystem }: { id: string; roll: SystemRoll; system: System; editSystem: EditSystem }) {
  const edit = (change: (draft: SystemRoll) => void) => editSystem(draft => { const one = draft.rolls?.[id]; if (one) change(one); });
  const columns = columnsOf(system);
  const nameOf = (table: string, column: string) => columns.find(([key]) => key === `${table}\u0000${column}`)?.[1] ?? column;
  const taken = new Set(Object.values(system.rolls ?? {}).flatMap(one => one.fields.map(f => `${f.table}\u0000${f.column}`)));
  const free = columns.filter(([key]) => !taken.has(key));
  const sample = fieldsOf(system).find(f => roll.fields.some(one => one.table === f.home && (f.cell ? f.cell.column === one.column : f.tag === one.column)))?.roll;
  return (
    <Card>
      <CardHead
        title={<LabelInput value={roll.label ?? id} onCommit={next => edit(draft => { if (next.trim()) draft.label = next; else delete draft.label; })} />}
        sub={sample ? `метки сами: ${(sample.tags ?? []).join(', ')}` : 'метки сами: название броска, строка и её выборы'}
        actions={<DangerButton size="sm" onConfirm={() => editSystem(draft => { delete draft.rolls?.[id]; if (draft.rolls && !Object.keys(draft.rolls).length) delete draft.rolls; })}>Удалить</DangerButton>}
      />
      <div className="row">
        <Field label="Кость">
          <Select value={roll.die} options={dieEntries(system).map(([key, c]) => [key, c.label || key] as const) as never}
            onChange={next => edit(draft => { draft.die = next; })} />
        </Field>
        <Field label="Число поля">
          <Select value={roll.number ?? 'bonus'} options={NUMBER_WORDS as never}
            onChange={next => edit(draft => { if (next === 'count') draft.number = 'count'; else delete draft.number; })} />
        </Field>
      </div>
      <Field label="Что бросают" hint="Щелчок по этому полю на листе бросает этим броском.">
        <div className="inline inline--tight">
          {roll.fields.map(one => (
            <Chip key={`${one.table}.${one.column}`}>
              {nameOf(one.table, one.column)}
              <button type="button" className="chips__x" aria-label="убрать"
                onClick={() => edit(draft => { draft.fields = draft.fields.filter(f => !(f.table === one.table && f.column === one.column)); })}>×</button>
            </Chip>
          ))}
          {free.length ? (
            <Select value="" options={[['', '+ поле…'], ...free] as never}
              onChange={(next: string) => { if (!next) return; const [table, column] = next.split('\u0000'); edit(draft => { draft.fields.push({ table: table!, column: column! }); }); }} />
          ) : null}
        </div>
      </Field>
      <Field label="Общие слова-метки" hint="Добавляются ко всем броскам этого вида, кроме выведенных сами.">
        <TagsField system={system} value={roll.tags}
          onChange={tags => edit(draft => { const list = tags.filter((t): t is string => typeof t === 'string'); if (list.length) draft.tags = list; else delete draft.tags; })} />
      </Field>
    </Card>
  );
}

export function RollsSection({ system, editSystem }: { system: System; editSystem: EditSystem }) {
  const rolls = Object.entries(system.rolls ?? {});
  const die = dieEntries(system)[0]?.[0];
  return (
    <div className="stack">
      <CardHead title="Броски" sub="Щелчок по полю на листе: кость, что делает число поля, какие поля так бросают."
        actions={die ? <Button size="sm" onClick={() => editSystem(draft => { addRoll(draft, die); })}>+ бросок</Button> : null} />
      {rolls.length ? rolls.map(([id, roll]) => <RollCard key={id} id={id} roll={roll} system={system} editSystem={editSystem} />)
        : <Empty title="Бросков нет" hint={die ? 'Заведите бросок — и выберите поля, которые им бросают.' : 'Сначала заведите кость в «Костях».'} />}
    </div>
  );
}
