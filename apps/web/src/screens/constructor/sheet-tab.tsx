import { useWorld } from '../../store/world.ts';
import { Columns } from '../../ui/layout.tsx';
import { useLookupPane } from './lookup-panel.tsx';
import { Select, Button, Empty, DangerButton } from '../../ui/primitives.tsx';
import { DonorPalette } from './donors.tsx';
import { newColumn } from './factory.ts';
import { addColumn } from './rules/character-section.tsx';
import { ColumnOnSheet, placeOnSheet, sheetTables } from './table-field.tsx';
import { SheetSample } from './sheet-sample.tsx';
import { NO_BLOCK } from '@vtt/engine/model/blocks';
import type { System } from '@vtt/schema';
import type { Field as FieldModel } from '@vtt/engine/model/types';
import { fieldOf } from '@vtt/engine/model/sheet-columns';

export function SheetTab() {
  const system = useWorld(s => s.system);
  const activeTag = useWorld(s => s.activeFieldTag);
  const pick = useWorld(s => s.pick);
  const editSystem = useWorld(s => s.editSystem);
  const active = activeTag ? fieldOf(system, activeTag) ?? null : null;
  const tables = sheetTables(system);
  const right = useLookupPane({ head: 'Готовое из образцов', body: <DonorPalette kind="blocks" /> });

  const add = () => {
    const made = newColumn(system, NO_BLOCK);
    editSystem(draft => addColumn(draft, made.value));
    pick({ activeTab: 'dictionaries', activeFieldTag: made.key });
  };

  return (
    <Columns
      left={{
        head: 'Лист',
        tools: (
          <>
            <Button size="sm" onClick={add}>+ колонка</Button>
            {tables.length ? (
              <Select value="" options={[['', '+ таблица'], ...tables] as never} onChange={id => {
                if (!id) return;
                editSystem(draft => placeOnSheet(draft, id));
                pick({ activeFieldTag: null });
              }} />
            ) : null}
          </>
        ),
        body: active
          ? <ViewPanel field={active} system={system} />
          : <Empty title="Щёлкните поле на листе" />,
      }}
      main={{
        body: <SheetSample system={system} picked={activeTag} onPick={tag => pick({ activeFieldTag: tag, activeGroupName: null })} />,
      }}
      right={right}
    />
  );
}

function ViewPanel({ field, system }: { field: FieldModel; system: System }) {
  const editSystem = useWorld(s => s.editSystem);
  const pick = useWorld(s => s.pick);
  const table = system.tables?.[field.home];
  const column = table?.columns?.find(c => c.key === (field.cell?.column ?? field.tag));
  if (!table || !column) return null;

  return (
    <>
      <ColumnOnSheet tableId={field.home} column={column} system={system} />
      <div className="inline inline--tight">
        {field.cell ? (
          <>
            <Button size="sm" onClick={() => pick({ activeTab: 'dictionaries', activeTableId: field.home })}>
              Правила: таблица «{table.label || field.home}» →
            </Button>
            <DangerButton size="sm" onConfirm={() => {
              editSystem(draft => { const target = draft.tables?.[field.home]; if (target) delete target.owner; });
              pick({ activeFieldTag: null });
            }}>Убрать таблицу с листа</DangerButton>
          </>
        ) : (
          <Button size="sm" onClick={() => pick({ activeTab: 'dictionaries', activeFieldTag: field.tag })}>
            Правила: колонка «{field.label}» →
          </Button>
        )}
      </div>
    </>
  );
}
