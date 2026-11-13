import { useMemo } from 'react';
import type { CellValue } from '@vtt/schema';
import { ButtonEditor } from '../constructor/button-editor.tsx';
import { newBinding } from '../constructor/factory.ts';
import { bindingsOf } from '@vtt/engine/events/actions';
import { GrantsEditor } from '../constructor/grants-editor.tsx';
import { recordsOf, isItem, propsNeeded, recordKindOf, recordKinds } from '@vtt/engine/model/owned';
import { flattenSystem } from '@vtt/engine/model/inherit';
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
import type { RecordKind } from '@vtt/engine/model/owned';

export function CompendiumScreen() {
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
    const taken = all.map(e => e.record.id);
    const id = freeId(taken, `${kind.label ?? rk}_${randomTag()}`);
    editCompendium(draft => {
      (draft.records ??= []).push({ id, table: rk, label: `Новая запись (${kind.label ?? rk})`, cells: {} });
    });
    pick({ activeRecordId: id });
  };

  const tree = blockTree(system, all, entry => recordKindOf(system, entry.record.table)?.block);

  return (
    <Columns
      left={{
        head: 'Записи',
        body: all.length === 0
          ? <Empty title="Компендиум пуст" hint="Заведите запись, выбрав тип справа." />
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
                    meta={recordKindOf(system, record.table)?.label ?? 'тип неизвестен'}
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
              title="Выберите запись слева"
              hint="Запись — это циферки по форме её типа: что тип спрашивает, то и заполняете."
            />,
      }}
      right={{
        head: 'Завести запись',
        body: kinds.length === 0
          ? <Empty
            title="Книг ещё нет"
            hint={origin.systemMine
              ? `Книги-таблицы объявляются в конструкторе системы, на вкладке «${TABS.records}».`
              : `В системе «${origin.systemTitle ?? system.name}» не объявлено ни одного типа записей — `
                + 'заводить вещи не из чего. Это делает автор системы: попросите его добавить типы '
                + 'и опубликовать систему заново.'}
          />
          : (
            <div className="stack stack--tight">
              {kinds.map(([rk, kind]) => (
                <button key={rk} type="button" className="card card--pick" onClick={() => add(rk, kind)}>
                  <span className="card__title" style={{ fontSize: 'var(--fs-4)' }}>{kind.label ?? rk}</span>
                  <span className="card__sub">{kind.hint ?? `спросят: ${kind.columns?.length ?? 0}`}</span>
                </button>
              ))}
            </div>
          ),
      }}
    />
  );
}

function RecordEditor({ record, system, compendium }: { record: CompendiumRecord; system: System; compendium: Compendium }) {
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

  const mustFill = propsNeeded(system, kind, bindings);

  return (
    <>
      <Card>
        <CardHead
          title={<LabelInput value={record.label ?? ''} placeholder="как зовётся запись" onCommit={label => edit(draft => { draft.label = label; })} />}
          badge={<span className="chip">{kind?.label ?? 'тип неизвестен'}</span>}
          actions={<DangerButton size="sm" onConfirm={remove}>Удалить</DangerButton>}
        />
        <Field label="Таблица записи" hint="Из какой книги эта запись: от неё берутся колонки и общие кнопки.">
          <Select<string>
            value={String(record.table ?? '')}
            options={recordKinds(system).map(([key, other]) => [key, other.label || key] as const)}
            onChange={next => edit(draft => { draft.table = next; })}
          />
        </Field>
        <Field label="Описание">
          <textarea
            className="textarea"
            value={record.description ?? ''}
            onChange={e => edit(draft => { if (e.target.value) draft.description = e.target.value; else delete draft.description; })}
          />
        </Field>
      </Card>

      {!kind ? (
        <Verdict tone="bad">
          Таблицы «{String(record.table)}» в системе нет — запись не знает, что о ней спрашивать.
        </Verdict>
      ) : null}

      {}
      {bindings.length ? (
        <span className="faint">
          владелец получит: {bindings.map(b => b.label ?? 'Применение').join(' · ')}
        </span>
      ) : null}

      {kind?.columns?.length ? (
        <Card>
          <CardHead title="Циферки" />
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
              props={new Set((kind.columns ?? []).map(prop => prop.key))} names={namesOf(system, record.table)} label={binding.label ?? 'Применение'} />
          ))}
        </Card>
      ) : null}

      {kind ? (
        <Card>
          <CardHead
            title="Свои кнопки"
            sub="Кнопки только этой записи — поверх общих кнопок типа."
            actions={<Button size="sm" onClick={() => edit(draft => { (draft.bindings ??= []).push(newBinding()); })}>+ кнопка</Button>}
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
          )) : <span className="faint">Своих кнопок нет — у записи только кнопки её типа.</span>}
        </Card>
      ) : null}

      {kind ? (
        <Card>
          <CardHead
            title="Что даёт владельцу"
            sub="Пока запись надета или выучена."
          />
          <GrantsEditor system={system} value={record.grants}
            onChange={next => edit(draft => { if (next) draft.grants = next; else delete draft.grants; })} />
        </Card>
      ) : null}

      {kind ? (
        <Card>
          <CardHead title="Как увидит игрок" sub="Так запись выглядит на листе персонажа: подпись, описание, циферки «на лист» и кнопки." />
          <RecordView record={record} system={system} compendium={compendium} />
        </Card>
      ) : null}

      {kind ? (
        <ModifiersEditor
          system={system}
          table={record.table}
          title={kind.use === 'item' ? 'Что правит эта вещь' : 'Что правит эта запись'}
          empty={{
            title: 'Своих правок у вещи нет',
            hint: 'Добавка поверх общей для типа: кольцо даёт +1 к защите, проклятый клинок — помеху. Общее для всех вещей типа живёт на самом типе записи и здесь не повторяется.',
          }}
          modifiers={record.modifiers ?? []}
          onEdit={change => edit(draft => { change(draft.modifiers ??= []); if (!draft.modifiers.length) delete draft.modifiers; })}
        />
      ) : null}
    </>
  );
}

