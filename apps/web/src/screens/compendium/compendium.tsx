import { useState } from 'react';
import { useWorld, freeId, randomTag } from '../../store/world.ts';
import { Columns, List, ListItem, ListGroup } from '../../ui/layout.tsx';
import {
  Card, CardHead, Field, Input, Select, Empty, Verdict, DangerButton, NumInput,
} from '../../ui/primitives.tsx';
import { ModifiersEditor } from '../constructor/modifiers.tsx';
import type { CompendiumRecord, RecordKind, System } from '@vtt/schema';

export function CompendiumScreen() {
  const system = useWorld(s => s.system);
  const origin = useWorld(s => s.origin);
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
    const id = freeId(taken, `${kind.label ?? rk}_${randomTag()}`);
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
          ? <Empty
            title="Родов ещё нет"
            hint={origin.systemMine
              ? 'Рода объявляются в конструкторе системы, на вкладке «Записи».'
              : `В системе «${origin.systemTitle ?? system.name}» не объявлено ни одного рода записей — `
                + 'заводить вещи не из чего. Это делает автор системы: попросите его добавить рода '
                + 'и опубликовать систему заново.'}
          />
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
          Рода «{String(record.rk)}» в системе нет — запись не знает, что о ней спрашивать.
        </Verdict>
      ) : null}

      {}
      {bindings.length ? (
        <span className="faint">
          владелец получит: {bindings.map(b => b.label ?? 'Применение').join(' · ')}
        </span>
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
                ) : String(prop.kind) === 'dice' ? (
                  <DiceProp
                    value={String(record.props?.[prop.key] ?? '')}
                    onChange={next => edit(draft => { (draft.props ??= {})[prop.key] = next; })}
                  />
                ) : String(prop.kind) === 'number' ? (
                  <NumInput
                    value={Number(record.props?.[prop.key] ?? 0)}
                    onCommit={n => edit(draft => { (draft.props ??= {})[prop.key] = n; })}
                  />
                ) : (
                  <Input
                    mono={String(prop.kind) === 'expr'}
                    placeholder={String(prop.kind) === 'expr' ? 'формула' : undefined}
                    value={String(record.props?.[prop.key] ?? '')}
                    onChange={next => edit(draft => { (draft.props ??= {})[prop.key] = next; })}
                  />
                )}
              </Field>
            ))}
          </div>
        </Card>
      ) : null}

      {kind?.kind === 'item' ? (
        <ModifiersEditor
          system={system}
          title="Что правит эта вещь"
          empty={{
            title: 'Своих правок у вещи нет',
            hint: 'Добавка поверх родовой: кольцо даёт +1 к защите, проклятый клинок — помеху. Общее для всех вещей рода живёт на самом роде и здесь не повторяется.',
          }}
          modifiers={record.modifiers ?? []}
          onEdit={change => edit(draft => { change(draft.modifiers ??= []); })}
        />
      ) : null}
    </>
  );
}

function DiceProp({ value, onChange }: {
  value: string;
  onChange: (next: string) => void;
}) {
  const m = /^(\d+)?\s*[dдк]\s*(\d+)$/iu.exec(value.trim());
  const stored = { count: m ? (m[1] ?? '1') : '', sides: m ? m[2]! : '' };

  const [draft, setDraft] = useState<{ count: string; sides: string } | null>(null);
  const shown = draft ?? stored;

  const commit = (next: { count: string; sides: string }) => {
    const c = Number(next.count);
    const n = Number(next.sides);
    if (Number.isInteger(c) && c > 0 && Number.isInteger(n) && n > 1) {
      onChange(`${c}d${n}`);
      setDraft(null);
    }
  };

  const edit = (part: 'count' | 'sides') => (text: string) => {
    const next = { ...shown, [part]: text };
    setDraft(next);
    commit(next);
  };

  return (
    <div className="dice-term">
      <span className="dice-term__num">
        <Input mono value={shown.count} placeholder="1"
          onChange={edit('count')} onBlur={() => commit(shown)} />
      </span>
      <span className="dice-term__d">к</span>
      <span className="dice-term__num">
        <Input mono value={shown.sides} placeholder="8"
          onChange={edit('sides')} onBlur={() => commit(shown)} />
      </span>
    </div>
  );
}
