// Вкладка «Записи»: какие бывают РОДА записей компендиума.
//
// Род — это ФОРМА ЗАПОЛНЕНИЯ. Запись не объявляет, что она делает: это
// объявляет её род через `props` (какие циферки спросить у человека) и
// `bindings` (к каким эффектам их привязать).
//
// Отсюда «протягивание»: у меча спрашивают кость урона, а «Атака» появляется
// у владельца сама. В PoC привязки правились только в данных — руками через
// интерфейс протягивание показать было нельзя. Здесь можно, и это главное,
// что здесь есть.

import { useWorld, freeId } from '../../store/world.ts';
import { Columns, List, ListItem, ListGroup } from '../../ui/layout.tsx';
import {
  Card, CardHead, Field, Input, Select, Button, Empty, Verdict, Fold, Chip,
} from '../../ui/primitives.tsx';
import { SlotEditor } from './slots.tsx';
import type { System, RecordKind, Binding } from '@vtt/schema';

const BASIS = [
  ['item', 'вещь — надевают и снимают'],
  ['action', 'действие — учат и применяют'],
] as const;

const PROP_KINDS = [
  ['dice', 'кость (2d6)'],
  ['number', 'число'],
  ['text', 'текст'],
  ['expr', 'формула'],
  ['effect', 'ссылка на эффект'],
] as const;

export function RecordsTab() {
  const system = useWorld(s => s.system);
  const activeKind = useWorld(s => s.activeRecordKind);
  const pick = useWorld(s => s.pick);
  const editSystem = useWorld(s => s.editSystem);

  const kinds = Object.entries(system.records ?? {});
  const active = activeKind ? system.records?.[activeKind] : undefined;

  const add = () => {
    const key = freeId(Object.keys(system.records ?? {}), 'kind');
    editSystem(draft => {
      draft.records = draft.records ?? {};
      draft.records[key] = { kind: 'item', label: 'Новый род', group: 'Снаряжение', props: [], bindings: [] };
    });
    pick({ activeRecordKind: key });
  };

  const groups = new Map<string, [string, RecordKind][]>();
  for (const [key, kind] of kinds) {
    const group = kind.group ?? 'Прочее';
    const list = groups.get(group);
    if (list) list.push([key, kind]);
    else groups.set(group, [[key, kind]]);
  }

  return (
    <Columns
      left={{
        head: 'Рода записей',
        tools: <Button size="sm" onClick={add}>+ род</Button>,
        body: kinds.length === 0
          ? <Empty
              title="Родов ещё нет"
              hint="Род — форма заполнения: какие циферки спросить у человека и к каким эффектам их привязать."
            />
          : (
            <List>
              {[...groups].map(([group, list]) => (
                <div key={group}>
                  <ListGroup>{group}</ListGroup>
                  {list.map(([key, kind]) => (
                    <ListItem
                      key={key}
                      icon={kind.icon ?? '⬡'}
                      name={kind.label ?? key}
                      meta={`свойств: ${kind.props?.length ?? 0} · действий: ${kind.bindings?.length ?? 0}`}
                      active={key === activeKind}
                      onClick={() => pick({ activeRecordKind: key })}
                    />
                  ))}
                </div>
              ))}
            </List>
          ),
      }}
      main={{
        head: active ? 'Род записи' : undefined,
        body: active && activeKind
          ? <KindEditor id={activeKind} kind={active} system={system} />
          : <Empty
              title="Выберите род слева"
              hint="У меча спрашивают только кость урона — а «Атака» появляется у владельца сама. Это и настраивается здесь."
            />,
      }}
    />
  );
}

function KindEditor({ id, kind, system }: { id: string; kind: RecordKind; system: System }) {
  const editSystem = useWorld(s => s.editSystem);
  const pick = useWorld(s => s.pick);

  const edit = (change: (draft: RecordKind) => void) => {
    editSystem(draft => {
      const target = draft.records?.[id];
      if (target) change(target);
    });
  };

  const props = kind.props ?? [];
  const bindings = kind.bindings ?? [];

  return (
    <>
      <Card>
        <CardHead
          title={<Input value={kind.label ?? ''} onChange={label => edit(draft => { draft.label = label; })} />}
          badge={<span className="chip mono">{id}</span>}
          actions={
            <Button size="sm" variant="danger" onClick={() => {
              editSystem(draft => { delete draft.records?.[id]; });
              pick({ activeRecordKind: null });
            }}>Удалить</Button>
          }
        />
        <div className="row">
          <Field label="Чем является" hint="Короткий словарь движка: вещь надевают, действие учат.">
            <Select value={kind.kind} options={BASIS} onChange={next => edit(draft => { draft.kind = next; })} />
          </Field>
          <Field label="Раздел" hint="Как рода сгруппированы в компендиуме.">
            <Input value={kind.group ?? ''} onChange={next => edit(draft => { draft.group = next; })} />
          </Field>
          <Field label="Значок">
            <Input value={kind.icon ?? ''} onChange={next => edit(draft => { draft.icon = next; })} />
          </Field>
        </div>
        <Field label="Подсказка заполняющему" hint="Одной строкой: что от человека вообще требуется.">
          <Input value={kind.hint ?? ''} onChange={next => edit(draft => { draft.hint = next; })} />
        </Field>
      </Card>

      <Card>
        <CardHead
          title="Что спросить у человека"
          actions={
            <Button size="sm" onClick={() => edit(draft => {
              draft.props ??= [];
              draft.props.push({
                key: freeId(draft.props.map(p => p.key), 'prop'),
                label: 'Новое свойство',
                kind: 'number',
              });
            })}>+ свойство</Button>
          }
        />
        <p className="card__sub">
          Только циферки, которые от записи к записи РАЗНЫЕ. Всё, что одинаково
          у всех, — закон мира, и его место в эффекте, а не здесь.
        </p>

        {props.length === 0
          ? <span className="faint">Свойств нет: записи этого рода — чистые данные без автоматизации.</span>
          : props.map(prop => (
            <div key={prop.key} className="row">
              <Field label="Ключ" hint="Машинный. На него ссылаются шаги эффектов.">
                <Input mono value={prop.key} onChange={() => { /* ключ неизменен */ }} />
              </Field>
              <Field label="Как спросить">
                <Input
                  value={prop.label ?? ''}
                  onChange={next => edit(draft => {
                    const target = draft.props?.find(p => p.key === prop.key);
                    if (target) target.label = next;
                  })}
                />
              </Field>
              <Field label="Чем заполняют">
                <Select
                  value={String(prop.kind ?? 'number')}
                  options={PROP_KINDS}
                  onChange={next => edit(draft => {
                    const target = draft.props?.find(p => p.key === prop.key);
                    if (target) target.kind = next;
                  })}
                />
              </Field>
              <Field label=" ">
                <Button size="sm" variant="danger" onClick={() => edit(draft => {
                  draft.props = (draft.props ?? []).filter(p => p.key !== prop.key);
                })}>Убрать</Button>
              </Field>
            </div>
          ))}
      </Card>

      <Card>
        <CardHead
          title="Что запись даёт владельцу"
          actions={
            <Button
              size="sm"
              disabled={Object.keys(system.effects).length === 0}
              onClick={() => edit(draft => {
                draft.bindings ??= [];
                draft.bindings.push({ label: 'Применение', effect: Object.keys(system.effects)[0] ?? '', args: {} });
              })}
            >+ привязка</Button>
          }
        />
        <p className="card__sub">
          Это и есть протягивание: надел меч — получил «Атаку», снял — потерял.
          Привязка написана один раз у рода, а каждая запись подставляет свои циферки.
        </p>

        {Object.keys(system.effects).length === 0 ? (
          <Verdict tone="warn">
            В системе ещё нет эффектов — привязывать нечего. Заведите их на вкладке «Эффекты».
          </Verdict>
        ) : null}

        {bindings.length === 0
          ? <span className="faint">Привязок нет: род ничего не автоматизирует.</span>
          : bindings.map((binding, index) => (
            <BindingEditor
              key={index}
              binding={binding}
              system={system}
              onEdit={change => edit(draft => { change(draft.bindings![index]!); })}
              onDelete={() => edit(draft => { draft.bindings!.splice(index, 1); })}
            />
          ))}
      </Card>
    </>
  );
}

function BindingEditor({ binding, system, onEdit, onDelete }: {
  binding: Binding;
  system: System;
  onEdit: (change: (draft: Binding) => void) => void;
  onDelete: () => void;
}) {
  const effect = system.effects[binding.effect];
  const params = effect?.params ?? [];

  return (
    <Card tone="flat">
      <div className="row">
        <Field label="Как назвать кнопку" hint="То, что игрок увидит на листе.">
          <Input value={binding.label ?? ''} onChange={label => onEdit(draft => { draft.label = label; })} />
        </Field>
        <Field label="Какой эффект применяется" needed={!binding.effect}>
          <Select
            value={binding.effect}
            options={[['', '— выберите —'],
              ...Object.entries(system.effects)
                .filter(([, e]) => (e.activation ?? 'manual') !== 'passive')
                .map(([key, e]) => [key, e.label ?? key] as const)] as never}
            onChange={next => onEdit(draft => { draft.effect = next; })}
          />
        </Field>
        <Field label=" ">
          <Button size="sm" variant="danger" onClick={onDelete}>Убрать привязку</Button>
        </Field>
      </div>

      {params.length ? (
        <Fold title="Чем заполнить дырки эффекта" count={params.length} open>
          <p className="faint" style={{ fontSize: 'var(--fs-2)' }}>
            Эффект объявил параметры — здесь решается, откуда их брать.
            «Свойство записи» и делает род формой: у огненного шара спасают
            Ловкостью, у страха Мудростью, а привязка одна.
          </p>
          {params.map(param => (
            <Field key={param.key} label={param.label ?? param.key}>
              <SlotEditor
                value={binding.args?.[param.key]}
                onChange={next => onEdit(draft => {
                  draft.args ??= {};
                  if (next) draft.args[param.key] = next;
                  else delete draft.args[param.key];
                })}
                context={{ system, effect: effect!, earlier: [] }}
                allow={['prop', 'const', 'expr', 'empty']}
              />
            </Field>
          ))}
        </Fold>
      ) : effect ? (
        <div className="inline inline--tight">
          <Chip>дырок нет</Chip>
          <span className="faint">эффект заполнен целиком — записи остаётся только её циферки</span>
        </div>
      ) : null}
    </Card>
  );
}
