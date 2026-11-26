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
import { argsWithProps, propKeysOf, recordKinds, sheetKinds, recordsOf, DESK_ID, kindWord, blockOf, labelBlock, GEAR_BLOCK, gearBlockLabel, blockLabel, flattenSystem } from '@vtt/engine';
import type { RecordKind, AnyKind } from '@vtt/engine';
import { TableColumnCard } from './rules/tables-section.tsx';
import { useState } from 'react';
import { BlockPick } from './block-pick.tsx';
import { GrantsEditor } from './grants-editor.tsx';
import { createEffect } from './effects/factory.ts';
import { blockTree, BlockBranches } from './block-tree.tsx';
import { newGroup } from './groups.ts';
import { focusNew } from '../../ui/focus-new.ts';
import { useT, t as tr } from '../../i18n/author.ts';

const basis = () => [
  ['item', tr('records:basis.item')],
  ['action', tr('records:basis.action')],
] as const;

function SheetKindCards({ id, kind, system, edit }: {
  id: string;
  kind: SheetKind;
  system: System;
  edit: (change: (draft: SheetKind) => void) => void;
}) {
  const t = useT('records');
  const editSystem = useWorld(s => s.editSystem);
  const common = (system.grants ?? []).map(key => system.effects[key]?.label || key);
  return (
    <>
      <Card>
        <CardHead
          title={t('sheetKind.grants.title')}
          sub={t('sheetKind.grants.sub')}
        />
        <GrantsEditor system={system} value={kind.grants}
          onCreate={() => createEffect('passive', (draft, key) => {
            const own = draft.sheets?.[id];
            if (own) own.grants = [...(own.grants ?? []), key];
          })}
          onChange={next => edit(draft => { if (next) draft.grants = next; else delete draft.grants; })} />
      </Card>
      {common.length ? <span className="faint">{t('sheetKind.grants.common', { names: common.map(name => `«${name}»`).join(', ') })}</span> : null}
      <Card>
        <CardHead title={t('sheetKind.fields.title')} />
        <ModifiersEditor
          empty={{ title: t('sheetKind.fields.emptyTitle'), hint: t('sheetKind.fields.emptyHint') }}
          fieldsOnly
          fieldLabel={t('sheetKind.fields.add')}
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

const onSheet = () => [
  ['sheet', tr('records:onSheet.sheet')],
  ['service', tr('records:onSheet.service')],
] as const;

export function SheetKindEditor({ id, kind, system }: { id: string; kind: SheetKind; system: System }) {
  const t = useT('records');
  const editSystem = useWorld(s => s.editSystem);
  const edit = (change: (draft: SheetKind) => void) => editSystem(draft => {
    const target = draft.sheets?.[id];
    if (target) change(target);
  });
  const peers = sheetKinds(system).filter(([key]) => key !== id);
  return (
    <>
      <div className="row">
        <Field label={t('sheetKind.extends')} hint={t('sheetKind.extendsHint')}>
          <Select
            value={kind.extends ?? ''}
            options={[['', t('sheetKind.standalone')], ...peers.map(([key, other]) => [key, other.label ?? key] as const)] as never}
            onChange={next => edit(draft => { if (next) draft.extends = next; else delete draft.extends; })}
          />
        </Field>
        <Field label={t('sheetKind.icon')}>
          <Input value={kind.icon ?? ''} placeholder="🛡" onChange={next => edit(draft => { if (next.trim()) draft.icon = next.trim(); else delete draft.icon; })} />
        </Field>
        <Field label={t('sheetKind.hint')}>
          <Input value={kind.hint ?? ''} onChange={next => edit(draft => { if (next.trim()) draft.hint = next; else delete draft.hint; })} />
        </Field>
      </div>
      <SheetKindCards id={id} kind={kind} system={system} edit={edit} />
    </>
  );
}

export function RecordsTab() {
  const t = useT('records');
  const system = useWorld(s => s.system);
  const activeKind = useWorld(s => s.activeRecordKind);
  const pick = useWorld(s => s.pick);
  const editSystem = useWorld(s => s.editSystem);

  const kinds = recordKinds(system) as [string, AnyKind][];
  const active = kinds.find(([key]) => key === activeKind)?.[1];

  const add = () => {
    focusNew(t('common:name.kind'));
    const made = newRecordKind(system);
    editSystem(draft => { (draft.tables ??= {})[made.key] = made.value; if (blockLabel(draft, GEAR_BLOCK) === GEAR_BLOCK) labelBlock(draft, GEAR_BLOCK, gearBlockLabel()); });
    pick({ activeRecordKind: made.key });
  };

  const addTo = (block: string, title?: string) => {
    focusNew(t('common:name.kind'));
    const made = newRecordKind(system);
    editSystem(draft => {
      (draft.tables ??= {})[made.key] = { ...made.value, block };
      if (title) labelBlock(draft, block, title);
    });
    pick({ activeRecordKind: made.key });
  };

  const tree = blockTree<[string, AnyKind]>(system, kinds, ([, kind]) => blockOf(system, kind));
  const flat = flattenSystem(system, true);
  const metaOf = (key: string, kind: AnyKind): string => {
    const ownProps = kind.columns?.length ?? 0;
    const ownButtons = (kind as RecordKind).bindings?.length ?? 0;
    const whole = flat.tables?.[key] as RecordKind | undefined;
    const baseProps = Math.max(0, (whole?.columns?.length ?? ownProps) - ownProps);
    const baseButtons = Math.max(0, (whole?.bindings?.length ?? ownButtons) - ownButtons);
    if (!kind.extends || (!baseProps && !baseButtons)) return t('list.meta', { props: ownProps, buttons: ownButtons });
    const props = baseProps ? t('list.propsBased', { own: ownProps, base: baseProps }) : t('list.props', { own: ownProps });
    const buttons = baseButtons ? t('list.buttonsBased', { own: ownButtons, base: baseButtons }) : t('list.buttons', { own: ownButtons });
    return t('list.metaParts', { props, buttons });
  };

  const lookup = useLookupPane();

  return (
    <Columns
      {...(lookup ? { right: lookup } : {})}
      left={{
        head: t('list.head'),
        tools: <Button size="sm" onClick={() => { const fresh = newGroup(system); addTo(fresh.key, fresh.title); }}>{t('list.addBlock')}</Button>,
        body: kinds.length === 0
          ? <Empty
              title={t('list.emptyTitle')}
              hint={t('list.emptyHint')}
              action={<Button size="sm" onClick={add}>{t('list.addKind')}</Button>}
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
                    meta={key === DESK_ID ? t('list.metaDesk') : system.sheets?.[key] ? t('list.metaSheet') : metaOf(key, kind)}
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
              title={t('list.pickTitle')}
              hint={t('list.pickHint')}
            />,
      }}
    />
  );
}

function BuiltIn({ kindId, system }: { kindId: string; system: System }) {
  const t = useT('records');
  const editSystem = useWorld(s => s.editSystem);
  const records = (system.library ?? []).filter(record => record.table === kindId);
  const book = useWorld(s => s.compendium);
  const candidates = recordsOf(book).filter(record => record.table === kindId && !records.some(own => own.id === record.id));
  if (!records.length && !candidates.length) return null;

  return (
    <Fold title={t('builtIn.title')} count={records.length}>
      <span className="faint">{t('builtIn.note')}</span>
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
            options={[['', t('builtIn.fromBook')], ...candidates.map(record => [record.id, record.label ?? record.id] as const)]}
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
  const t = useT('records');
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

          title={<LabelInput value={kind.label ?? ''} placeholder={t('common:name.kind')} onCommit={label => edit(draft => { draft.label = label; })} />}
          actions={
            <DangerButton size="sm" onConfirm={() => {
              editSystem(draft => { delete draft.tables?.[id]; });
              pick({ activeRecordKind: null });
            }}>{t('common:delete')}</DangerButton>
          }
        />
        <div className="row">
          <Field label={t('kind.basis')}>
            <Select value={kind.use ?? 'item'} options={basis()} onChange={next => edit(draft => { draft.use = next; })} />
          </Field>
          <Field label={t('kind.block')}>
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
            label={t('sheetKind.extends')}
            hint={t('kind.extendsHint')}
          >
            <Select
              value={kind.extends ?? ''}
              options={[['', t('sheetKind.standalone')],
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
          <Field label={t('sheetKind.icon')} hint={t('kind.iconHint')}>
            <Input value={kind.icon ?? ''} placeholder="🎲" onChange={next => edit(draft => { if (next.trim()) draft.icon = next.trim(); else delete draft.icon; })} />
          </Field>
          <Field label={t('sheetKind.hint')}>
            <Input value={kind.hint ?? ''} onChange={next => edit(draft => { if (next.trim()) draft.hint = next; else delete draft.hint; })} />
          </Field>
        </div>
      </Card>

      <BuiltIn kindId={id} system={system} />

      <Card>
        <CardHead
          title={t('kind.props.title')}
          sub={t('kind.props.sub')}
          actions={
            <Button size="sm" onClick={() => {
              const made = newProp(id, kind, system);
              edit(draft => { (draft.columns ??= []).push(made); });
              setPicked(made.key);
            }}>{t('kind.props.add')}</Button>
          }
        />
        {props.length === 0
          ? <span className="faint">{t('kind.props.none')}</span>
          : (
            <div className="inline inline--tight">
              {props.map(prop => (
                <Button key={prop.key} size="sm" variant={prop.key === picked ? 'primary' : 'ghost'}
                  title={[propDestiny(system, kind, prop.key), prop.expr !== undefined ? t('kind.props.byFormula') : ''].filter(Boolean).join(' · ')}
                  onClick={() => setPicked(prop.key === picked ? null : prop.key)}>
                  {prop.label || prop.key}<span className="prop-chip__kind" aria-hidden>{propKind(system, prop)}</span>
                </Button>
              ))}
            </div>
          )}
        {open ? (
          <TableColumnCard id={id} table={kind as Table} column={open} system={system} edit={edit} onClose={() => setPicked(null)}
            extra={<>
              <Field label={t('kind.props.where')}>
                <Select
                  value={open.onSheet === false ? 'service' : 'sheet'}
                  options={onSheet()}
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
          title={t('kind.buttons.title')}
          actions={
            <Button
              size="sm"
              disabled={Object.keys(system.effects).length === 0}
              onClick={() => edit(draft => {
                (draft.bindings ??= []).push(newBinding());
              })}
            >{t('kind.buttons.add')}</Button>
          }
        />
        {Object.keys(system.effects).length === 0 ? (
          <Verdict tone="warn">
            {t('kind.buttons.noEffects')}
          </Verdict>
        ) : null}

        {bindings.length === 0
          ? <span className="faint">{t('kind.buttons.none')}</span>
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
        <CardHead title={t('kind.hanging.title')} sub={t('kind.hanging.sub')} />
        <GrantsEditor system={system} value={kind.grants} hanging withArgs kindId={id}
          onChange={next => edit(draft => { if (next) draft.grants = next; else delete draft.grants; })} />
      </Card>


      {kind.use === 'item' ? (
        <Card>
          <CardHead
            title={t('kind.mods.title')}
            sub={t('kind.mods.sub')}
          />
          <ModifiersEditor
            empty={{
              title: t('kind.mods.emptyTitle'),
              hint: t('kind.mods.emptyHint'),
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
  if (prop.kind === 'choice') return `«${(prop.from && system.tables?.[prop.from]?.label) || prop.from || tr('records:kind.props.table')}»`;
  return kindWord(prop.kind);
}

function propDestiny(system: System, kind: RecordKind, propKey: string): string {
  const buttons = (kind.bindings ?? [])
    .filter(b => Object.values(argsWithProps(system, b, propKeysOf(kind)) ?? {}).some(arg =>
      new RegExp(`[@#]${propKey}(?![\\p{L}\\p{N}_])`, 'u').test(String((arg as { expr?: string }).expr ?? ''))))
    .map(b => `«${b.label ?? tr('records:kind.props.defaultButton')}»`);
  return buttons.length
    ? tr('records:kind.props.toButtons', { buttons: buttons.join(', ') })
    : tr('records:kind.props.nowhere');
}
