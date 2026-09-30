import { bindingsOf } from '@vtt/engine/events/envelope';
import { GrantsEditor } from '../constructor/grants-editor.tsx';
import { recordsOf, isItem, propsNeeded, recordKindOf, recordKinds } from '@vtt/engine/model/owned';
import { TABS } from '../../words.ts';
import { useWorld, freeId, randomTag } from '../../store/world.ts';
import { Columns, List, ListItem } from '../../ui/layout.tsx';
import { blockTree, BlockBranches } from '../constructor/block-tree.tsx';
import {
  Card, CardHead, Field, Empty, Verdict, DangerButton, LabelInput,
} from '../../ui/primitives.tsx';
import { ModifiersEditor } from '../constructor/modifiers.tsx';
import { RecordView } from '../../sheet/record-view.tsx';
import { ValueEditor } from '../../ui/value-editor.tsx';
import type { CompendiumRecord, System, Compendium } from '@vtt/schema';
import type { RecordKind } from '@vtt/engine/model/owned';

export function CompendiumScreen() {
  const system = useWorld(s => s.system);
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
              hint="Запись — это циферки по форме её типа: у меча спросят кость урона, у заклинания — чем спасаются."
            />,
      }}
      right={{
        head: 'Завести запись',
        body: kinds.length === 0
          ? <Empty
            title="Типов записей ещё нет"
            hint={origin.systemMine
              ? `Типы записей объявляются в конструкторе системы, на вкладке «${TABS.records}».`
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
        <Field label="Описание">
          <textarea
            className="textarea"
            value={record.description ?? ''}
            onChange={e => edit(draft => { draft.description = e.target.value; })}
          />
        </Field>
      </Card>

      {!kind ? (
        <Verdict tone="bad">
          Рода «{String(record.table)}» в системе нет — запись не знает, что о ней спрашивать.
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
                  onChange={next => edit(draft => { (draft.cells ??= {})[prop.key] = next; })}
                />
              </Field>
            ))}
          </div>
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

      {kind?.use === 'item' ? (
        <ModifiersEditor
          system={system}
          title="Что правит эта вещь"
          empty={{
            title: 'Своих правок у вещи нет',
            hint: 'Добавка поверх общей для типа: кольцо даёт +1 к защите, проклятый клинок — помеху. Общее для всех вещей типа живёт на самом типе записи и здесь не повторяется.',
          }}
          modifiers={record.modifiers ?? []}
          onEdit={change => edit(draft => { change(draft.modifiers ??= []); })}
        />
      ) : null}
    </>
  );
}

