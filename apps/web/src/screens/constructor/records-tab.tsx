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
  Card, CardHead, Field, Input, Select, Button, Empty, Verdict, Chip,
} from '../../ui/primitives.tsx';
import { SlotEditor } from './slots.tsx';
import type { System, RecordKind, Binding, Param } from '@vtt/schema';

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

// Чем эффект просит заполнить потребность (`param.kind`, effects-tab.tsx)
// → каким свойством рода это заводится кнопкой. Не тождество: у потребности
// есть виды, которых у свойства нет («выбор», «поле листа» — последнее
// считает лист заполняющей стороны, а не сама запись) — они падают
// в «формулу», единственный вид без своего смысла.
const PARAM_TO_PROP_KIND: Record<string, string> = {
  dice: 'dice',
  number: 'number',
  effect: 'effect',
  tag: 'text',
};
const propKindFor = (paramKind?: string) => PARAM_TO_PROP_KIND[paramKind ?? ''] ?? 'expr';

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
          <Field label="Чем является">
            <Select value={kind.kind} options={BASIS} onChange={next => edit(draft => { draft.kind = next; })} />
          </Field>
          <Field label="Раздел">
            <Input value={kind.group ?? ''} onChange={next => edit(draft => { draft.group = next; })} />
          </Field>
        </div>
        <Field label="Подсказка заполняющему">
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
        {props.length === 0
          ? <span className="faint">Свойств нет: записи этого рода — чистые данные без автоматизации.</span>
          : props.map(prop => (
            <div key={prop.key} className="row">
              <Field label="Ключ">
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
            >+ подключить эффект</Button>
          }
        />
        {Object.keys(system.effects).length === 0 ? (
          <Verdict tone="warn">
            В системе ещё нет эффектов — подключать нечего. Заведите их на вкладке «Эффекты».
          </Verdict>
        ) : null}

        {bindings.length === 0
          ? <span className="faint">Ничего не подключено: род ничего не автоматизирует.</span>
          : bindings.map((binding, index) => (
            <BindingEditor
              key={index}
              binding={binding}
              system={system}
              onEdit={change => edit(draft => { change(draft.bindings![index]!); })}
              onDelete={() => edit(draft => { draft.bindings!.splice(index, 1); })}
              onFillWithProp={param => edit(draft => {
                draft.props ??= [];
                const label = param.label ?? param.key;
                const newKey = freeId(draft.props.map(p => p.key), label);
                draft.props.push({ key: newKey, label, kind: propKindFor(param.kind) });
                const target = draft.bindings![index]!;
                target.args ??= {};
                target.args[param.key] = { prop: newKey };
              })}
            />
          ))}
      </Card>
    </>
  );
}

function BindingEditor({ binding, system, onEdit, onDelete, onFillWithProp }: {
  binding: Binding;
  system: System;
  onEdit: (change: (draft: Binding) => void) => void;
  onDelete: () => void;
  /** Заводит роду новое свойство под конкретную потребность и тем же кликом
      закрывает её этим свойством — без похода к соседней карточке «Что
      спросить у человека». */
  onFillWithProp: (param: Param) => void;
}) {
  const effect = system.effects[binding.effect];
  const params = effect?.params ?? [];
  const isClosed = (key: string) => {
    const value = binding.args?.[key];
    return value !== undefined && value !== null;
  };
  const unclosed = params.filter(param => !isClosed(param.key));

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
          <Button size="sm" variant="danger" onClick={onDelete}>Убрать</Button>
        </Field>
      </div>

      {params.length ? (
        <div className="stack stack--tight">
          <span className="field__label">Что эффект берёт из записи</span>
          {params.map(param => (
            <div key={param.key} className={`need-fill ${isClosed(param.key) ? 'need-fill--ok' : ''}`}>
              <Field label={param.label ?? param.key}>
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
              {!isClosed(param.key) ? (
                <Button size="sm" onClick={() => onFillWithProp(param)}>
                  + завести свойство «{param.label ?? param.key}»
                </Button>
              ) : null}
            </div>
          ))}
          {unclosed.length ? (
            <Verdict tone="bad">
              не закрыто: {unclosed.map(param => param.label ?? param.key).join(', ')}
            </Verdict>
          ) : null}
        </div>
      ) : effect ? (
        <Chip>эффект ничего не берёт из записи</Chip>
      ) : null}
    </Card>
  );
}
