// Компендиум: предметы и действия. Данные ДЛЯ системы и чарника.
//
// Экран заполняет ФОРМУ, объявленную родом: спрашивает ровно те циферки,
// которые род объявил, и ничего сверх. Автоматизации здесь нет и быть
// не может — запись ссылается только на объявленное и нового не вводит,
// потому завести её волен и игрок, а не только автор.

import { useWorld, freeId } from '../../store/world.ts';
import { Columns, List, ListItem, ListGroup } from '../../ui/layout.tsx';
import {
  Card, CardHead, Field, Input, Select, Button, Empty, Verdict, Chip,
} from '../../ui/primitives.tsx';
import { ModifiersEditor } from '../constructor/modifiers.tsx';
import type { CompendiumRecord, RecordKind, System } from '@vtt/schema';

export function CompendiumScreen() {
  const system = useWorld(s => s.system);
  const compendium = useWorld(s => s.compendium);
  const activeId = useWorld(s => s.activeRecordId);
  const pick = useWorld(s => s.pick);
  const editCompendium = useWorld(s => s.editCompendium);

  const kinds = Object.entries(system.records ?? {});
  const all = [
    ...(compendium.items ?? []).map(r => ({ record: r, basis: 'item' as const })),
    ...(compendium.actions ?? []).map(r => ({ record: r, basis: 'action' as const })),
  ];
  const active = all.find(entry => entry.record.id === activeId) ?? null;

  const add = (rk: string, kind: RecordKind) => {
    const taken = all.map(e => e.record.id);
    const id = freeId(taken, kind.label ?? rk);
    editCompendium(draft => {
      const list = kind.kind === 'item' ? (draft.items ??= []) : (draft.actions ??= []);
      list.push({ id, rk, label: `Новая запись (${kind.label ?? rk})`, props: {} });
    });
    pick({ activeRecordId: id });
  };

  const groups = new Map<string, typeof all>();
  for (const entry of all) {
    const kind = system.records?.[String(entry.record.rk)];
    const group = kind?.group ?? 'Без рода';
    const list = groups.get(group);
    if (list) list.push(entry);
    else groups.set(group, [entry]);
  }

  return (
    <Columns
      left={{
        head: 'Записи',
        body: all.length === 0
          ? <Empty title="Компендиум пуст" hint="Заведите запись, выбрав род справа." />
          : (
            <List>
              {[...groups].map(([group, list]) => (
                <div key={group}>
                  <ListGroup>{group}</ListGroup>
                  {list.map(({ record }) => (
                    <ListItem
                      key={record.id}
                      name={record.label ?? record.id}
                      meta={system.records?.[String(record.rk)]?.label ?? 'род неизвестен'}
                      active={record.id === activeId}
                      onClick={() => pick({ activeRecordId: record.id })}
                    />
                  ))}
                </div>
              ))}
            </List>
          ),
      }}
      main={{
        head: active ? 'Запись' : undefined,
        body: active
          ? <RecordEditor record={active.record} system={system} />
          : <Empty
              title="Выберите запись слева"
              hint="Запись — это циферки по форме её рода: у меча спросят кость урона, у заклинания — чем спасаются."
            />,
      }}
      right={{
        head: 'Завести запись',
        body: kinds.length === 0
          ? <Empty title="Родов ещё нет" hint="Рода объявляются в конструкторе, на вкладке «Записи»." />
          : (
            <div className="stack stack--tight">
              {kinds.map(([rk, kind]) => (
                <button key={rk} type="button" className="card card--pick" onClick={() => add(rk, kind)}>
                  <span className="card__title" style={{ fontSize: 'var(--fs-4)' }}>{kind.label ?? rk}</span>
                  <span className="card__sub">{kind.hint ?? `спросят: ${kind.props?.length ?? 0}`}</span>
                </button>
              ))}
            </div>
          ),
      }}
    />
  );
}

function RecordEditor({ record, system }: { record: CompendiumRecord; system: System }) {
  const editCompendium = useWorld(s => s.editCompendium);
  const pick = useWorld(s => s.pick);

  const kind = system.records?.[String(record.rk)];

  const edit = (change: (draft: CompendiumRecord) => void) => {
    editCompendium(draft => {
      const target = [...(draft.items ?? []), ...(draft.actions ?? [])].find(r => r.id === record.id);
      if (target) change(target);
    });
  };

  const remove = () => {
    editCompendium(draft => {
      draft.items = (draft.items ?? []).filter(r => r.id !== record.id);
      draft.actions = (draft.actions ?? []).filter(r => r.id !== record.id);
    });
    pick({ activeRecordId: null });
  };

  const bindings = kind?.bindings ?? [];

  return (
    <>
      <Card>
        <CardHead
          title={<Input value={record.label ?? ''} onChange={label => edit(draft => { draft.label = label; })} />}
          badge={<span className="chip">{kind?.label ?? 'род неизвестен'}</span>}
          actions={<Button size="sm" variant="danger" onClick={remove}>Удалить</Button>}
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
          Рода «{String(record.rk)}» в системе нет — запись не знает, что о ней спрашивать.
        </Verdict>
      ) : null}

      {kind?.props?.length ? (
        <Card>
          <CardHead title="Циферки" />
          <div className="row">
            {kind.props.map(prop => (
              <Field
                key={prop.key}
                label={prop.label ?? prop.key}
                needed={record.props?.[prop.key] === undefined || record.props[prop.key] === ''}
              >
                {String(prop.kind) === 'effect' ? (
                  <Select
                    value={String(record.props?.[prop.key] ?? '')}
                    options={[['', '— нет —'],
                      ...Object.entries(system.effects)
                        .filter(([, e]) => (e.activation ?? 'manual') === 'passive')
                        .map(([key, e]) => [key, e.label ?? key] as const)] as never}
                    onChange={next => edit(draft => { (draft.props ??= {})[prop.key] = next; })}
                  />
                ) : (
                  <Input
                    mono={String(prop.kind) === 'dice' || String(prop.kind) === 'expr'}
                    placeholder={String(prop.kind) === 'dice' ? '2d6' : String(prop.kind) === 'expr' ? '#тег' : undefined}
                    value={String(record.props?.[prop.key] ?? '')}
                    onChange={next => edit(draft => {
                      (draft.props ??= {})[prop.key] =
                        String(prop.kind) === 'number' ? Number(next) || 0 : next;
                    })}
                  />
                )}
              </Field>
            ))}
          </div>
        </Card>
      ) : null}

      {bindings.length ? (
        <Card>
          <CardHead title="Что эта запись даст владельцу" />
          <div className="inline inline--tight">
            {bindings.map((binding, index) => (
              <Chip key={index} title={`эффект «${binding.effect}»`}>
                {binding.label ?? 'Применение'}
              </Chip>
            ))}
          </div>
        </Card>
      ) : null}

      {kind?.kind === 'item' ? (
        <ModifiersEditor
          system={system}
          modifiers={record.modifiers ?? []}
          onEdit={change => edit(draft => { change(draft.modifiers ??= []); })}
        />
      ) : null}
    </>
  );
}

