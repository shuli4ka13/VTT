import { useMemo } from 'react';
import type { CellValue } from '@vtt/schema';
import { ButtonEditor } from '../constructor/button-editor.tsx';
import { newBinding } from '../constructor/factory.ts';
import { chainOf, bindingsOf, recordsOf, isItem, propsNeeded, recordKindOf, recordKinds, flattenSystem } from '@vtt/engine';
import type { RecordKind } from '@vtt/engine';
import { GrantsEditor } from '../constructor/grants-editor.tsx';
import { CallSummary } from '../constructor/call-editor.tsx';
import { namesOf } from '../constructor/button-editor.tsx';
import { TABS } from '../../words.ts';
import { useWorld, freeId, randomTag } from '../../store/world.ts';
import { Columns, List, ListItem } from '../../ui/layout.tsx';
import { blockTree, BlockBranches } from '../constructor/block-tree.tsx';
import {
  Card, CardHead, Field, Empty, Verdict, DangerButton, LabelInput, Button, Select,
} from '../../ui/primitives.tsx';
import { ModifiersEditor } from '../constructor/modifiers.tsx';
import { RecordView } from '../../sheet/record-view.tsx';
import { ValueEditor } from '../../ui/value-editor.tsx';
import type { CompendiumRecord, System, Compendium } from '@vtt/schema';
import { dataT, useT } from '../../i18n/author.ts';
import { useEffectView } from '../../store/effect-view.ts';

export function CompendiumScreen() {
  const t = useT('book');
  const authored = useWorld(s => s.system);
  const system = useMemo(() => flattenSystem(authored, true), [authored]);
  const origin = useWorld(s => s.origin);
  const compendium = useWorld(s => s.compendium);
  const activeId = useWorld(s => s.activeRecordId);
  const pick = useWorld(s => s.pick);
  const editCompendium = useWorld(s => s.editCompendium);

  const kinds = recordKinds(system);
  const all = recordsOf(compendium).map(r => ({ record: r, basis: isItem(system, r) ? 'item' as const : 'action' as const }));
  const active = all.find(entry => entry.record.id === activeId) ?? null;

  const add = (rk: string, kind: RecordKind) => {
    const td = dataT(system);
    const taken = all.map(e => e.record.id);
    const id = freeId(taken, `${kind.label ?? rk}_${randomTag()}`);
    editCompendium(draft => {
      (draft.records ??= []).push({ id, table: rk, label: td('book:new.record', { name: kind.label ?? rk }), cells: {} });
    });
    pick({ activeRecordId: id });
  };

  const tree = blockTree(system, all, entry => recordKindOf(system, entry.record.table)?.block);

  return (
    <Columns
      left={{
        head: t('list.head'),
        body: all.length === 0
          ? <Empty title={t('list.emptyTitle')} hint={t('list.emptyHint')} />
          : (
            <List>
              <BlockBranches
                list="book"
                nodes={tree}
                isActive={({ record }) => record.id === activeId}
                render={({ record }) => (
                  <ListItem
                    key={record.id}
                    name={record.label ?? record.id}
                    meta={recordKindOf(system, record.table)?.label ?? t('list.unknownKind')}
                    active={record.id === activeId}
                    onClick={() => pick({ activeRecordId: record.id })}
                  />
                )}
              />
            </List>
          ),
      }}
      main={{
        body: active
          ? <RecordEditor record={active.record} system={system} compendium={compendium} />
          : <Empty
              title={t('pick.title')}
              hint={t('pick.hint')}
            />,
      }}
      right={{
        head: t('add.head'),
        body: kinds.length === 0
          ? <Empty
            title={t('noBooks.title')}
            hint={origin.systemMine
              ? t('noBooks.mine', { tab: TABS.records })
              : t('noBooks.foreign', { name: origin.systemTitle ?? system.name })}
          />
          : (
            <div className="stack stack--tight">
              {kinds.map(([rk, kind]) => (
                <button key={rk} type="button" className="card card--pick" onClick={() => add(rk, kind)}>
                  <span className="card__title" style={{ fontSize: 'var(--fs-4)' }}>{kind.label ?? rk}</span>
                  <span className="card__sub">{kind.hint ?? t('add.asks', { n: kind.columns?.length ?? 0 })}</span>
                </button>
              ))}
            </div>
          ),
      }}
    />
  );
}

function RecordEditor({ record, system, compendium }: { record: CompendiumRecord; system: System; compendium: Compendium }) {
  const t = useT('book');
  const editCompendium = useWorld(s => s.editCompendium);
  const pick = useWorld(s => s.pick);

  const kind = recordKindOf(system, record.table);

  const edit = (change: (draft: CompendiumRecord) => void) => {
    editCompendium(draft => {
      const target = recordsOf(draft).find(r => r.id === record.id);
      if (target) change(target);
    });
  };

  const remove = () => {
    editCompendium(draft => {
      draft.records = recordsOf(draft).filter(r => r.id !== record.id);
    });
    pick({ activeRecordId: null });
  };

  const bindings = bindingsOf(record, system);
  const ts = useT('sunChain');
  const hasChain = (chainOf(system, compendium, record.id)?.buttons.length ?? 0) > 0;

  const mustFill = propsNeeded(system, kind, bindings);

  const apply = t('record.apply');

  return (
    <>
      <Card>
        <CardHead
          title={<LabelInput value={record.label ?? ''} placeholder={t('common:name.record')} onCommit={label => edit(draft => { draft.label = label; })} />}
          badge={<span className="chip">{kind?.label ?? t('list.unknownKind')}</span>}
          actions={<>{hasChain ? <Button size="sm" title={ts('enterHint')} onClick={() => useEffectView.getState().openChain(record.id)}>{ts('enter')}</Button> : null}<DangerButton size="sm" onConfirm={remove}>{t('common:delete')}</DangerButton></>}
        />
        <Field label={t('record.table.label')} hint={t('record.table.hint')}>
          <Select<string>
            value={String(record.table ?? '')}
            options={recordKinds(system).map(([key, other]) => [key, other.label || key] as const)}
            onChange={next => edit(draft => { draft.table = next; })}
          />
        </Field>
        <Field label={t('record.description')}>
          <textarea
            className="textarea"
            value={record.description ?? ''}
            onChange={e => edit(draft => { if (e.target.value) draft.description = e.target.value; else delete draft.description; })}
          />
        </Field>
      </Card>

      {!kind ? (
        <Verdict tone="bad">
          {t('record.missing', { name: String(record.table) })}
        </Verdict>
      ) : null}

      {}
      {bindings.length ? (
        <span className="faint">
          {t('record.owns', { list: bindings.map(b => b.label ?? apply).join(' · ') })}
        </span>
      ) : null}

      {kind?.columns?.length ? (
        <Card>
          <CardHead title={t('record.props')} />
          <div className="row">
            {kind.columns.map(prop => (
              <Field
                key={prop.key}
                label={prop.label ?? prop.key}
                needed={mustFill.has(prop.key)
                  && (record.cells?.[prop.key] === undefined || record.cells[prop.key] === ''
                    || (Array.isArray(record.cells[prop.key]) && !(record.cells[prop.key] as unknown[]).length))}
              >
                <ValueEditor
                  type={prop}
                  value={record.cells?.[prop.key]}
                  system={system}
                  compendium={compendium}
                  onlyWorn
                  except={record.id}
                  onChange={next => edit(draft => {
                    if (next === undefined || next === '' || (Array.isArray(next) && !next.length)) {
                      if (draft.cells) delete draft.cells[prop.key];
                    } else (draft.cells ??= {})[prop.key] = next as CellValue;
                  })}
                />
              </Field>
            ))}
          </div>
          {bindings.map((binding, index) => (
            <CallSummary key={index} system={system} effect={binding.effect} args={binding.args as Record<string, unknown> | undefined}
              props={new Set((kind.columns ?? []).map(prop => prop.key))} names={namesOf(system, record.table)} label={binding.label ?? apply} />
          ))}
        </Card>
      ) : null}

      {kind ? (
        <Card>
          <CardHead
            title={t('record.buttons.title')}
            sub={t('record.buttons.sub')}
            actions={<Button size="sm" onClick={() => edit(draft => { (draft.bindings ??= []).push(newBinding()); })}>{t('record.buttons.add')}</Button>}
          />
          {(record.bindings ?? []).length ? (record.bindings ?? []).map((binding, index) => (
            <ButtonEditor
              key={index}
              binding={binding}
              system={system}
              recordKind={kind}
              {...(record.table ? { kindId: record.table } : {})}
              onEdit={change => edit(draft => { const own = draft.bindings?.[index]; if (own) change(own); })}
              onDelete={() => edit(draft => {
                draft.bindings = (draft.bindings ?? []).filter((_, at) => at !== index);
                if (!draft.bindings.length) delete draft.bindings;
              })}
            />
          )) : <span className="faint">{t('record.buttons.none')}</span>}
        </Card>
      ) : null}

      {kind ? (
        <Card>
          <CardHead
            title={t('record.grants.title')}
            sub={t('record.grants.sub')}
          />
          <GrantsEditor system={system} value={record.grants} withArgs kindId={record.table}
            onChange={next => edit(draft => { if (next) draft.grants = next; else delete draft.grants; })} />
        </Card>
      ) : null}

      {kind ? (
        <Card>
          <CardHead title={t('record.preview.title')} sub={t('record.preview.sub')} />
          <RecordView record={record} system={system} compendium={compendium} />
        </Card>
      ) : null}

      {kind ? (
        <ModifiersEditor
          system={system}
          table={record.table}
          title={kind.use === 'item' ? t('record.modifiers.item') : t('record.modifiers.other')}
          empty={{
            title: t('record.modifiers.emptyTitle'),
            hint: t('record.modifiers.emptyHint'),
          }}
          modifiers={record.modifiers ?? []}
          onEdit={change => edit(draft => { change(draft.modifiers ??= []); if (!draft.modifiers.length) delete draft.modifiers; })}
        />
      ) : null}
    </>
  );
}

