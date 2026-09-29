import { useWorld } from '../../store/world.ts';
import { CONTROLS } from '../../sheet/controls/index.tsx';
import { Columns } from '../../ui/layout.tsx';
import { useLookupPane } from './lookup-panel.tsx';
import { Card, CardHead, Field, Select, Button, Empty, DangerButton } from '../../ui/primitives.tsx';
import { DonorPalette } from './donors.tsx';
import { newField } from './factory.ts';
import { ColumnOnSheet, placeOnSheet, sheetTables } from './table-field.tsx';
import { SheetSample } from './sheet-sample.tsx';
import { BlockPick } from './block-pick.tsx';
import { RollTagsPick } from './roll-tags-pick.tsx';
import { dieEntries } from './rules/dice-section.tsx';
import { NO_BLOCK } from '@vtt/engine/model/blocks';
import type { Field as FieldModel, System } from '@vtt/schema';

export function SheetTab() {
  const system = useWorld(s => s.system);
  const activeTag = useWorld(s => s.activeFieldTag);
  const pick = useWorld(s => s.pick);
  const editSystem = useWorld(s => s.editSystem);
  const active = system.fields.find(f => f.tag === activeTag) ?? null;
  const tables = sheetTables(system);
  const right = useLookupPane({ head: 'Готовое из образцов', body: <DonorPalette kind="blocks" /> });

  const addColumn = () => {
    const made = newField(system, NO_BLOCK);
    editSystem(draft => { draft.fields.push(made.value); });
    pick({ activeTab: 'dictionaries', activeFieldTag: made.key });
  };

  return (
    <Columns
      left={{
        head: 'Лист',
        tools: (
          <>
            <Button size="sm" onClick={addColumn}>+ колонка</Button>
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
  const editField = useWorld(s => s.editField);
  const pick = useWorld(s => s.pick);
  const edit = (change: (draft: FieldModel) => void) => editField(field.tag, change);

  if (field.cell) {
    const cell = field.cell;
    const table = system.tables?.[cell.table];
    const column = table?.columns?.find(c => c.key === cell.column);
    if (!table || !column) return null;
    return (
      <>
        <ColumnOnSheet tableId={cell.table} column={column} system={system} />
        <div className="inline inline--tight">
          <Button size="sm" onClick={() => pick({ activeTab: 'dictionaries', activeTableId: cell.table })}>
            Правила: таблица «{table.label || cell.table}» →
          </Button>
          <DangerButton size="sm" onConfirm={() => {
            editSystem(draft => { const target = draft.tables?.[cell.table]; if (target) delete target.sheet; });
            pick({ activeFieldTag: null });
          }}>Убрать таблицу с листа</DangerButton>
        </div>
      </>
    );
  }

  return (
    <>
      <Card>
        <CardHead title={field.label} />
        <Field label="Блок">
          <BlockPick of="fields" system={system} value={field.group}
            onChange={next => edit(draft => { if (next) draft.group = next; else delete draft.group; })} />
        </Field>
        {field.value.kind === 'stored' ? (
          <Field label="Как выглядит">
            <Select
              value={field.control ?? ''}
              options={[['', 'обычное поле'],
                ...(Object.keys(CONTROLS) as (keyof typeof CONTROLS)[]).map(key => [key, CONTROLS[key]] as const)] as never}
              onChange={next => edit(draft => { if (next) draft.control = next as typeof draft.control; else delete draft.control; })}
            />
          </Field>
        ) : null}
        <RollPick field={field} system={system} edit={edit} />
      </Card>
      <Button size="sm" onClick={() => pick({ activeTab: 'dictionaries', activeFieldTag: field.tag })}>
        Правила: колонка «{field.label}» →
      </Button>
    </>
  );
}

function RollPick({ field, system, edit }: {
  field: FieldModel;
  system: System;
  edit: (change: (draft: FieldModel) => void) => void;
}) {
  return (
    <Field label="Бросок">
      <div className="stack stack--tight">
        <Select
          value={!field.roll ? '' : field.roll.count ? 'pool' : 'bonus'}
          options={[['', 'не бросают'], ['bonus', 'поле — прибавка к кости'], ['pool', 'поле — число костей']] as const}
          onChange={next => edit(draft => {
            if (!next) { delete draft.roll; return; }
            const self = { expr: `@${draft.tag}` };
            const first = dieEntries(system)[0]?.[0];
            const roll = draft.roll ?? { label: `Проверка: ${draft.label}`, ...(first ? { die: { constant: first } } : {}) };
            if (next === 'pool') { roll.count = self; delete roll.bonus; } else { roll.bonus = self; delete roll.count; }
            draft.roll = roll;
          })}
        />
        {field.roll ? (
          <>
            <Select
              value={field.roll.die?.constant ?? ''}
              options={[['', '— какой костью —'], ...dieEntries(system).map(([key, c]) => [key, c.label || key] as const)] as never}
              onChange={key => edit(draft => {
                if (!draft.roll) return;
                if (key) draft.roll.die = { constant: key }; else delete draft.roll.die;
              })}
            />
            <RollTagsPick
              system={system}
              value={field.roll.tags}
              onChange={tags => edit(draft => {
                if (!draft.roll) return;
                if (tags.length) draft.roll.tags = tags; else delete draft.roll.tags;
              })}
            />
          </>
        ) : null}
      </div>
    </Field>
  );
}
