import { MultiChoice } from '../../ui/multi-choice.tsx';
import { TABS } from '../../words.ts';
import { listOf } from '@vtt/engine/model/lists';
import { useWorld, freeId, randomTag } from '../../store/world.ts';
import { Columns, List, ListItem, ListGroup } from '../../ui/layout.tsx';
import {
  Card, CardHead, Field, Input, Select, Empty, Verdict, DangerButton, NumInput, LabelInput, Chip,
} from '../../ui/primitives.tsx';
import { ModifiersEditor } from '../constructor/modifiers.tsx';
import { RecordView } from '../../sheet/record-view.tsx';
import { DiceProp } from '../../ui/dice-prop.tsx';
import type { CompendiumRecord, RecordKind, System, Compendium } from '@vtt/schema';

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
    const group = kind?.group ?? 'Без типа';
    const list = groups.get(group);
    if (list) list.push(entry);
    else groups.set(group, [entry]);
  }

  return (
    <Columns
      left={{
        head: 'Записи',
        body: all.length === 0
          ? <Empty title="Компендиум пуст" hint="Заведите запись, выбрав тип справа." />
          : (
            <List>
              {[...groups].map(([group, list]) => (
                <div key={group}>
                  <ListGroup>{group}</ListGroup>
                  {list.map(({ record }) => (
                    <ListItem
                      key={record.id}
                      name={record.label ?? record.id}
                      meta={system.records?.[String(record.rk)]?.label ?? 'тип неизвестен'}
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
                  <span className="card__sub">{kind.hint ?? `спросят: ${kind.props?.length ?? 0}`}</span>
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

  const mustFill = new Set<string>();
  for (const binding of bindings) {
    for (const [key, arg] of Object.entries(binding.args ?? {})) {
      const ref = arg as { prop?: string; optional?: boolean; by?: { prop?: string } };
      if (ref?.optional) continue;
      const need = (system.effects[binding.effect]?.params ?? []).find(p => p.key === key);
      if (need?.optional) continue;
      if (ref?.prop) mustFill.add(ref.prop);
      if (ref?.by?.prop) mustFill.add(ref.by.prop);
    }
  }
  const hangable = Object.entries(system.effects)
    .filter(([id, effect]) => (effect.activation ?? 'manual') !== 'manual' && !(record.grants ?? []).includes(id));

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
                needed={mustFill.has(prop.key)
                  && (record.props?.[prop.key] === undefined || record.props[prop.key] === ''
                    || (Array.isArray(record.props[prop.key]) && !(record.props[prop.key] as unknown[]).length))}
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
                ) : String(prop.kind) === 'record' ? (
                  <Select
                    value={String(record.props?.[prop.key] ?? '')}
                    options={[['', '— нет —'],
                      ...[...(compendium.items ?? []), ...(compendium.actions ?? [])]
                        .filter(other => other.id !== record.id)
                        .map(other => [other.id, other.label ?? other.id] as const)] as never}
                    onChange={next => edit(draft => { (draft.props ??= {})[prop.key] = next; })}
                  />
                ) : String(prop.kind) === 'choice' && prop.many ? (
                  <MultiChoice
                    value={record.props?.[prop.key]}
                    options={listOf(system, prop.from) ?? []}
                    onChange={next => edit(draft => { (draft.props ??= {})[prop.key] = next; })}
                  />
                ) : String(prop.kind) === 'choice' ? (
                  <Select
                    value={String(record.props?.[prop.key] ?? '')}
                    options={[['', listOf(system, prop.from) ? '— выберите —' : '— словарь не выбран —'],
                      ...(listOf(system, prop.from) ?? [])
                        .map(option => [String(option.value), option.label ?? String(option.value)] as const),
                    ] as never}
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

      {kind ? (
        <Card>
          <CardHead
            title="Что висит на владельце"
            sub="Пока запись надета или выучена, эти эффекты действуют сами."
          />
          <div className="inline inline--tight">
            {(record.grants ?? []).map(id => (
              <Chip
                key={id}
                active
                onRemove={() => edit(draft => {
                  const left = (draft.grants ?? []).filter(x => x !== id);
                  if (left.length) draft.grants = left; else delete draft.grants;
                })}
              >
                {system.effects[id]?.label ?? id}
              </Chip>
            ))}
            {hangable.length ? (
              <Select
                value=""
                options={[['', (record.grants?.length ? '+ ещё эффект…' : '+ повесить эффект…')],
                  ...hangable.map(([id, effect]) => [id, effect.label ?? id] as const)] as never}
                onChange={next => { if (next) edit(draft => { draft.grants = [...(draft.grants ?? []), next]; }); }}
              />
            ) : <span className="faint">В системе нет эффектов, которые висят или срабатывают сами.</span>}
          </div>
        </Card>
      ) : null}

      {kind ? (
        <Card>
          <CardHead title="Как увидит игрок" sub="Так запись выглядит на листе персонажа: подпись, описание, циферки «на лист» и кнопки." />
          <RecordView record={record} system={system} compendium={compendium} />
        </Card>
      ) : null}

      {kind?.kind === 'item' ? (
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

