import { useWorld } from '../../store/world.ts';
import { Card, CardHead, Field, Button } from '../../ui/primitives.tsx';
import type { System } from '@vtt/schema';

export function ThingPanel({ table, system }: { table: string; system: System }) {
  const editSystem = useWorld(s => s.editSystem);
  const pick = useWorld(s => s.pick);
  const kind = system.tables?.[table];
  const columns = kind?.columns ?? [];
  return (
    <Card>
      <CardHead title={`${kind?.label || table} в снаряжении`}
        actions={<Button size="sm" variant="ghost" onClick={() => pick({ activeThing: null })}>×</Button>} />
      <Field label="Что видно в строке" hint="Снятое не видно и игроку за столом; движок его по-прежнему считает.">
        <div className="stack stack--tight">
          {columns.length === 0 ? <span className="faint">У этого типа нет свойств.</span> : null}
          {columns.map(column => (
            <label key={column.key} className="inline inline--tight">
              <input type="checkbox" checked={column.onSheet !== false}
                onChange={event => {
                  const on = event.currentTarget.checked;
                  editSystem(draft => {
                    const target = draft.tables?.[table]?.columns?.find(one => one.key === column.key);
                    if (!target) return;
                    if (on) delete target.onSheet; else target.onSheet = false;
                  });
                }} />
              {column.label || column.key}
            </label>
          ))}
        </div>
      </Field>
    </Card>
  );
}
