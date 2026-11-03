import { useWorld } from '../../store/world.ts';
import { Card, CardHead, Field, Button } from '../../ui/primitives.tsx';
import { PickOrder } from '../../ui/pick-order.tsx';
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
        {columns.length === 0 ? <span className="faint">У этого типа нет свойств.</span> : (
          <PickOrder keys={columns.map(column => column.key)} chosen={columns.filter(column => column.onSheet !== false).map(column => column.key)}
            labelOf={key => { const column = columns.find(one => one.key === key); return column?.label || key; }}
            onChange={next => editSystem(draft => {
              const target = draft.tables?.[table];
              if (!target?.columns) return;
              const byKey = new Map(target.columns.map(column => [column.key, column]));
              const hidden = target.columns.filter(column => !next.includes(column.key));
              target.columns = [...next.map(key => byKey.get(key)!).filter(Boolean), ...hidden];
              for (const column of target.columns) { if (next.includes(column.key)) delete column.onSheet; else column.onSheet = false; }
            })} />
        )}
      </Field>
    </Card>
  );
}
