import { ButtonEditor } from './button-editor.tsx';
import { useWorld, freeId } from '../../store/world.ts';
import { ModifiersEditor } from './modifiers.tsx';
import { newRecordKind, newBinding, newProp } from './factory.ts';
import { Columns, List, ListItem } from '../../ui/layout.tsx';
import { useLookupPane } from './lookup-panel.tsx';
import {
  Card, CardHead, Field, Input, Select, Button, Empty, Verdict, Chip, DangerButton, LabelInput, Fold,
} from '../../ui/primitives.tsx';
import type { System, SheetKind, Table } from '@vtt/schema';
import { argsWithProps, propKeysOf, recordKinds, sheetKinds, recordsOf, DESK_ID, kindWord, blockOf, labelBlock } from '@vtt/engine';
import type { RecordKind, AnyKind } from '@vtt/engine';
import { TableColumnCard } from './rules/tables-section.tsx';
import { useState } from 'react';
import { BlockPick } from './block-pick.tsx';
import { GrantsEditor } from './grants-editor.tsx';
import { createEffect } from './effects/factory.ts';
import { blockTree, BlockBranches } from './block-tree.tsx';
import { newGroup } from './groups.ts';
import { focusNew } from '../../ui/focus-new.ts';

const BASIS = [
  ['item', 'вещь — надевают и снимают'],
  ['action', 'действие — учат и применяют'],
] as const;

function SheetKindCards({ id, kind, system, edit }: {
  id: string;
  kind: SheetKind;
  system: System;
  edit: (change: (draft: SheetKind) => void) => void;
}) {
  const editSystem = useWorld(s => s.editSystem);
  const common = (system.grants ?? []).map(key => system.effects[key]?.label || key);
  return (
    <>
      <Card>
        <CardHead
          title="Что даёт каждому листу этого типа"
          sub="Кнопки и правила, которые есть у каждого листа этого типа."
        />
        <GrantsEditor system={system} value={kind.grants}
          onCreate={() => createEffect('passive', (draft, key) => {
            const own = draft.sheets?.[id];
            if (own) own.grants = [...(own.grants ?? []), key];
          })}
          onChange={next => edit(draft => { if (next) draft.grants = next; else delete draft.grants; })} />
      </Card>
      {common.length ? <span className="faint">Ещё действует общее для всех листов: {common.map(name => `«${name}»`).join(', ')}.</span> : null}
      <Card>
        <CardHead title="Как считаются поля у этого типа" />
        <ModifiersEditor
          empty={{ title: 'своих формул у типа нет', hint: 'Например, «+2 к классу брони» каждому противнику. Правило, которое меняет бросок или чужой эффект, — эффектом «висит · правит» из вкладки «Эффекты», выданным выше.' }}
          fieldsOnly
          fieldLabel="+ формула поля"
          system={system}
          editSystem={editSystem}
          title=""
          modifiers={kind.modifiers ?? []}
          onEdit={change => edit(draft => { change(draft.modifiers ??= []); if (!draft.modifiers.length) delete draft.modifiers; })}
        />
      </Card>
    </>
  );
}

const ON_SHEET = [
  ['sheet', 'на лист — игрок видит'],
  ['service', 'служебное — только движку'],
] as const;


export function SheetKindEditor({ id, kind, system }: { id: string; kind: SheetKind; system: System }) {
  const editSystem = useWorld(s => s.editSystem);
  const edit = (change: (draft: SheetKind) => void) => editSystem(draft => {
    const target = draft.sheets?.[id];
    if (target) change(target);
  });
  const peers = sheetKinds(system).filter(([key]) => key !== id);
  return (
    <>
      <div className="row">
        <Field label="На основе" hint="Выдача и правки основы достанутся этому типу.">
          <Select
            value={kind.extends ?? ''}
            options={[['', '— сам по себе —'], ...peers.map(([key, other]) => [key, other.label ?? key] as const)] as never}
            onChange={next => edit(draft => { if (next) draft.extends = next; else delete draft.extends; })}
          />
        </Field>
        <Field label="Значок">
          <Input value={kind.icon ?? ''} placeholder="🛡" onChange={next => edit(draft => { if (next.trim()) draft.icon = next.trim(); else delete draft.icon; })} />
        </Field>
        <Field label="Подсказка заполняющему">
          <Input value={kind.hint ?? ''} onChange={next => edit(draft => { if (next.trim()) draft.hint = next; else delete draft.hint; })} />
        </Field>
      </div>
      <SheetKindCards id={id} kind={kind} system={system} edit={edit} />
    </>
  );
}

export function RecordsTab() {
  const system = useWorld(s => s.system);
  const activeKind = useWorld(s => s.activeRecordKind);
  const pick = useWorld(s => s.pick);
  const editSystem = useWorld(s => s.editSystem);

  const kinds = recordKinds(system) as [string, AnyKind][];
  const active = kinds.find(([key]) => key === activeKind)?.[1];

  const add = () => {
    focusNew('как зовётся тип');
    const made = newRecordKind(system);
    editSystem(draft => { (draft.tables ??= {})[made.key] = made.value; });
    pick({ activeRecordKind: made.key });
  };

  const addTo = (block: string, title?: string) => {
    focusNew('как зовётся тип');
    const made = newRecordKind(system);
    editSystem(draft => {
      (draft.tables ??= {})[made.key] = { ...made.value, block };
      if (title) labelBlock(draft, block, title);
    });
    pick({ activeRecordKind: made.key });
  };

  const tree = blockTree<[string, AnyKind]>(system, kinds, ([, kind]) => blockOf(system, kind));

  const lookup = useLookupPane();

  return (
    <Columns
      {...(lookup ? { right: lookup } : {})}
      left={{
        head: 'книги',
        tools: <Button size="sm" onClick={() => { const fresh = newGroup(system); addTo(fresh.key, fresh.title); }}>+ блок</Button>,
        body: kinds.length === 0
          ? <Empty
              title="типов ещё нет"
              hint="тип — форма заполнения: какие циферки спросить у человека и к каким эффектам их привязать."
              action={<Button size="sm" onClick={add}>+ тип</Button>}
            />
          : (
            <List>
              <BlockBranches
                list="records"
                nodes={tree}
                isActive={([key]) => key === activeKind}
                addTo={addTo}
                lineage={{
                  keyOf: ([key]) => key,
                  baseOf: ([, kind]) => kind.extends,
                }}
                render={([key, kind]) => (
                  <ListItem
                    key={key}
                    name={kind.label ?? key}
                    meta={key === DESK_ID ? 'тип стола' : system.sheets?.[key] ? 'тип листа' : `свойств: ${kind.columns?.length ?? 0} · кнопок: ${kind.bindings?.length ?? 0}`}
                    active={key === activeKind}
                    onClick={() => pick({ activeRecordKind: key })}
                  />
                )}
              />
            </List>
          ),
      }}
      main={{
        body: active && activeKind
          ? <KindEditor key={activeKind} id={activeKind} kind={active} system={system} />
          : <Empty
              title="Выберите тип слева"
              hint="У записи спрашивают только её циферки, а кнопка появляется у владельца сама. Это и настраивается здесь."
            />,
      }}
    />
  );
}

function BuiltIn({ kindId, system }: { kindId: string; system: System }) {
  const editSystem = useWorld(s => s.editSystem);
  const records = (system.library ?? []).filter(record => record.table === kindId);
  const book = useWorld(s => s.compendium);
  const candidates = recordsOf(book).filter(record => record.table === kindId && !records.some(own => own.id === record.id));
  if (!records.length && !candidates.length) return null;

  return (
    <Fold title="Едут вместе с системой" count={records.length}>
      <span className="faint">Встроенные записи системы — едут в любой мир на этой системе, перед книгами.</span>
      <div className="inline inline--tight">
        {records.map(record => (
          <Chip
            key={record.id}
            {...(record.description ? { title: record.description } : {})}
            onRemove={() => editSystem(draft => {
              draft.library = (draft.library ?? []).filter(r => r.id !== record.id);
              if (!draft.library.length) delete draft.library;
            })}
          >
            {record.label ?? record.id}
          </Chip>
        ))}
        {candidates.length ? (
          <Select<string>
            value=""
            options={[['', '+ из книги…'], ...candidates.map(record => [record.id, record.label ?? record.id] as const)]}
            onChange={id => {
              const found = candidates.find(record => record.id === id);
              if (found) editSystem(draft => { draft.library = [...(draft.library ?? []), structuredClone(found)]; });
            }}
          />
        ) : null}
      </div>
    </Fold>
  );
}

function KindEditor({ id, kind, system }: { id: string; kind: AnyKind; system: System }) {
  const editSystem = useWorld(s => s.editSystem);
  const pick = useWorld(s => s.pick);
  const [picked, setPicked] = useState<string | null>(null);

  const edit = (change: (draft: RecordKind) => void) => {
    editSystem(draft => {
      const target = draft.tables?.[id];
      if (target) change(target);
    });
  };

  const props = kind.columns ?? [];
  const bindings = kind.bindings ?? [];
  const peers = recordKinds(system) as [string, { label?: string }][];
  const open = picked ? props.find(prop => prop.key === picked) : undefined;

  return (
    <>
      <Card>
        <CardHead

          title={<LabelInput value={kind.label ?? ''} placeholder="как зовётся тип" onCommit={label => edit(draft => { draft.label = label; })} />}
          actions={
            <DangerButton size="sm" onConfirm={() => {
              editSystem(draft => { delete draft.tables?.[id]; });
              pick({ activeRecordKind: null });
            }}>Удалить</DangerButton>
          }
        />
        <div className="row">
          <Field label="Чем является">
            <Select value={kind.use ?? 'item'} options={BASIS} onChange={next => edit(draft => { draft.use = next; })} />
          </Field>
          <Field label="Блок">
            <BlockPick
              of="records"
              system={system}
              value={kind.block}
              onChange={next => edit(draft => {
                if (next) draft.block = next; else delete draft.block;
              })}
            />
          </Field>
          <Field
            label="На основе"
            hint="Свойства и кнопки основы достанутся этому типу; своя первая кнопка правит первую кнопку основы."
          >
            <Select
              value={kind.extends ?? ''}
              options={[['', '— сам по себе —'],
                ...peers
                  .filter(([key]) => key !== id)
                  .map(([key, other]) => [key, other.label ?? key] as const)] as never}
              onChange={next => edit(draft => {
                if (next) draft.extends = next; else delete draft.extends;
              })}
            />
          </Field>
        </div>
        <div className="row">
          <Field label="Значок" hint="Один символ на кнопках записей этой книги">
            <Input value={kind.icon ?? ''} placeholder="🎲" onChange={next => edit(draft => { if (next.trim()) draft.icon = next.trim(); else delete draft.icon; })} />
          </Field>
          <Field label="Подсказка заполняющему">
            <Input value={kind.hint ?? ''} onChange={next => edit(draft => { if (next.trim()) draft.hint = next; else delete draft.hint; })} />
          </Field>
        </div>
      </Card>

      <BuiltIn kindId={id} system={system} />

      <Card>
        <CardHead
          title="Свойства"
          sub="Что заполняют у каждой записи этого типа в книге."
          actions={
            <Button size="sm" onClick={() => {
              const made = newProp(kind);
              edit(draft => { (draft.columns ??= []).push(made); });
              setPicked(made.key);
            }}>+ свойство</Button>
          }
        />
        {props.length === 0
          ? <span className="faint">Свойств нет.</span>
          : (
            <div className="inline inline--tight">
              {props.map(prop => (
                <Button key={prop.key} size="sm" variant={prop.key === picked ? 'primary' : 'ghost'}
                  title={[propDestiny(system, kind, prop.key), prop.expr !== undefined ? 'считается формулой' : ''].filter(Boolean).join(' · ')}
                  onClick={() => setPicked(prop.key === picked ? null : prop.key)}>
                  {prop.label || prop.key}<span className="prop-chip__kind" aria-hidden>{propKind(system, prop)}</span>
                </Button>
              ))}
            </div>
          )}
        {open ? (
          <TableColumnCard id={id} table={kind as Table} column={open} system={system} edit={edit} onClose={() => setPicked(null)}
            extra={<>
              <Field label="Где показывать">
                <Select
                  value={open.onSheet === false ? 'service' : 'sheet'}
                  options={ON_SHEET}
                  onChange={next => edit(draft => {
                    const target = draft.columns?.find(p => p.key === open.key);
                    if (!target) return;
                    if (next === 'service') target.onSheet = false; else delete target.onSheet;
                  })}
                />
              </Field>
              <span className="faint">{propDestiny(system, kind, open.key)}</span>
            </>} />
        ) : null}
      </Card>


      <Card>
        <CardHead
          title="Кнопки на листе"
          actions={
            <Button
              size="sm"
              disabled={Object.keys(system.effects).length === 0}
              onClick={() => edit(draft => {
                (draft.bindings ??= []).push(newBinding());
              })}
            >+ кнопка</Button>
          }
        />
        {Object.keys(system.effects).length === 0 ? (
          <Verdict tone="warn">
            В системе ещё нет эффектов — подключать нечего. Заведите их на вкладке «Эффекты».
          </Verdict>
        ) : null}

        {bindings.length === 0
          ? <span className="faint">Кнопок нет.</span>
          : bindings.map((binding, index) => (
            <ButtonEditor
              key={index}
              binding={binding}
              system={system}
              recordKind={kind}
              kindId={id}
              onEdit={change => edit(draft => { change(draft.bindings![index]!); })}
              onDelete={() => edit(draft => { draft.bindings!.splice(index, 1); })}
              onFillWithProps={list => edit(draft => {
                draft.columns ??= [];
                const target = draft.bindings![index]!;
                for (const param of list) {
                  const label = param.label ?? param.key;
                  const taken = draft.columns.map(p => p.key);
                  const newKey = taken.includes(param.key) ? freeId(taken, label) : param.key;
                  draft.columns.push({
                    key: newKey, label, kind: param.kind ?? 'number',
                    ...(param.from ? { from: param.from } : {}),
                  });
                  target.args ??= {};
                  target.args[param.key] = { expr: `@${newKey}` };
                }
              })}
            />
          ))}
      </Card>

      <Card>
        <CardHead title="Висит на владельце" sub="Пока запись у листа." />
        <GrantsEditor system={system} value={kind.grants} hanging
          onChange={next => edit(draft => { if (next) draft.grants = next; else delete draft.grants; })} />
      </Card>


      {kind.use === 'item' ? (
        <Card>
          <CardHead
            title="Что правит каждая вещь этого типа"
            sub="Пишется один раз — действует, пока надета любая вещь этого типа. То, что своё у конкретной вещи, правится в компендиуме."
          />
          <ModifiersEditor
            empty={{
              title: 'тип пока ничего не правит',
              hint: 'Правки, пока у листа есть любая вещь этого типа. Пишутся один раз здесь — каждая запись типа получает их без строчки на себе.',
            }}
            system={system}
            editSystem={editSystem}
            table={id}
            title=""
            modifiers={kind.modifiers ?? []}
            onEdit={change => edit(draft => { change(draft.modifiers ??= []); if (!draft.modifiers.length) delete draft.modifiers; })}
          />
        </Card>
      ) : null}

    </>
  );
}

function propKind(system: System, prop: { kind?: string; from?: string }): string {
  if (prop.kind === 'choice') return `«${(prop.from && system.tables?.[prop.from]?.label) || prop.from || 'таблица'}»`;
  return kindWord(prop.kind);
}

function propDestiny(system: System, kind: RecordKind, propKey: string): string {
  const buttons = (kind.bindings ?? [])
    .filter(b => Object.values(argsWithProps(system, b, propKeysOf(kind)) ?? {}).some(arg =>
      new RegExp(`[@#]${propKey}(?![\\p{L}\\p{N}_])`, 'u').test(String((arg as { expr?: string }).expr ?? ''))))
    .map(b => `«${b.label ?? 'Применение'}»`);
  return buttons.length
    ? `уходит в кнопку ${buttons.join(', ')}`
    : 'никуда не уходит — просто справка на записи';
}
