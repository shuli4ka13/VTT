import { kindsFor } from '@vtt/engine/words/kinds';
import { choiceTables } from '@vtt/engine/model/tables';
import { useWorld, freeId } from '../../store/world.ts';
import { ModifiersEditor } from './modifiers.tsx';
import { newRecordKind, newBinding, newProp } from './factory.ts';
import { Columns, List, ListItem } from '../../ui/layout.tsx';
import { useLookupPane } from './lookup-panel.tsx';
import {
  Card, CardHead, Field, Input, Select, Button, Empty, Verdict, Chip, DangerButton, LabelInput,
} from '../../ui/primitives.tsx';
import type { System, RecordKind, Binding, Param, Effect, ValueKind } from '@vtt/schema';
import { SlotInput } from './slot-input.tsx';
import { BlockPick } from './block-pick.tsx';
import { blockOf } from '@vtt/engine/model/blocks';
import { listOf } from '@vtt/engine/model/lists';
import { blockTree, BlockBranches } from './block-tree.tsx';
import { freeGroupName } from './groups.ts';

const BASIS = [
  ['item', 'вещь — надевают и снимают'],
  ['action', 'действие — учат и применяют'],
] as const;

const PROP_KINDS = kindsFor('prop');

const ON_SHEET = [
  ['sheet', 'на лист — игрок видит'],
  ['service', 'служебное — только движку'],
] as const;


export function RecordsTab() {
  const system = useWorld(s => s.system);
  const activeKind = useWorld(s => s.activeRecordKind);
  const pick = useWorld(s => s.pick);
  const editSystem = useWorld(s => s.editSystem);

  const kinds = Object.entries(system.records ?? {});
  const active = activeKind ? system.records?.[activeKind] : undefined;

  const add = () => {
    const made = newRecordKind(system);
    editSystem(draft => { (draft.records ??= {})[made.key] = made.value; });
    pick({ activeRecordKind: made.key });
  };

  const addTo = (block: string) => {
    const made = newRecordKind(system);
    editSystem(draft => { (draft.records ??= {})[made.key] = { ...made.value, group: block }; });
    pick({ activeRecordKind: made.key });
  };

  const tree = blockTree<[string, RecordKind]>(system, kinds, ([, kind]) => blockOf(system, kind));

  const lookup = useLookupPane();

  return (
    <Columns
      {...(lookup ? { right: lookup } : {})}
      left={{
        head: 'типы записей',
        tools: <Button size="sm" onClick={() => addTo(freeGroupName(system, 'Новый блок'))}>+ блок</Button>,
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
                    meta={`свойств: ${kind.props?.length ?? 0} · действий: ${kind.bindings?.length ?? 0}`}
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
          ? <KindEditor id={activeKind} kind={active} system={system} />
          : <Empty
              title="Выберите тип слева"
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

          title={<LabelInput value={kind.label ?? ''} placeholder="как зовётся тип" onCommit={label => edit(draft => { draft.label = label; })} />}
          actions={
            <DangerButton size="sm" onConfirm={() => {
              editSystem(draft => { delete draft.records?.[id]; });
              pick({ activeRecordKind: null });
            }}>Удалить</DangerButton>
          }
        />
        <div className="row">
          <Field label="Чем является">
            <Select value={kind.kind} options={BASIS} onChange={next => edit(draft => { draft.kind = next; })} />
          </Field>
          <Field label="Блок">
            <BlockPick
              system={system}
              value={kind.group}
              onChange={next => edit(draft => {
                if (next) draft.group = next; else delete draft.group;
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
                ...Object.entries(system.records ?? {})
                  .filter(([key]) => key !== id)
                  .map(([key, other]) => [key, other.label ?? key] as const)] as never}
              onChange={next => edit(draft => {
                if (next) draft.extends = next; else delete draft.extends;
              })}
            />
          </Field>
        </div>
        <Field label="Подсказка заполняющему">
          <Input value={kind.hint ?? ''} onChange={next => edit(draft => { draft.hint = next; })} />
        </Field>
      </Card>

      <Card>
        <CardHead
          title="Что запись даёт владельцу"
          actions={
            <Button
              size="sm"
              disabled={Object.keys(system.effects).length === 0}
              onClick={() => edit(draft => {
                (draft.bindings ??= []).push(newBinding(system));
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
          ? <span className="faint">Ничего не подключено: тип ничего не автоматизирует.</span>
          : bindings.map((binding, index) => (
            <BindingEditor
              key={index}
              binding={binding}
              system={system}
              recordKind={kind}
              onEdit={change => edit(draft => { change(draft.bindings![index]!); })}
              onDelete={() => edit(draft => { draft.bindings!.splice(index, 1); })}
              onFillWithProp={param => edit(draft => {
                draft.props ??= [];
                const label = param.label ?? param.key;
                const newKey = freeId(draft.props.map(p => p.key), label);
                draft.props.push({
                  key: newKey, label, kind: param.kind ?? 'number',
                  ...(param.from ? { from: param.from } : {}),
                });
                const target = draft.bindings![index]!;
                target.args ??= {};
                target.args[param.key] = { prop: newKey };
              })}
            />
          ))}
      </Card>

      <Card>
        <CardHead
          title="Что спросить у человека"
          sub="Форма записи. Обычно собирается сама — кнопкой «завести свойство» при подключении эффекта; руками сюда добавляют справочное: вес, цену."
          actions={
            <Button size="sm" onClick={() => edit(draft => {
              (draft.props ??= []).push(newProp(draft));
            })}>+ свойство</Button>
          }
        />
        {props.length === 0
          ? <span className="faint">Свойств нет: записи этого типа — чистые данные без автоматизации.</span>
          : props.map(prop => (

            <div key={prop.key} className="stack stack--tight">
              <div className="row">
                <Field label="Как спросить">
                  <Input
                    value={prop.label ?? ''}
                    onChange={next => edit(draft => {
                      const target = draft.props?.find(p => p.key === prop.key);
                      if (target) target.label = next;
                    })}
                  />
                </Field>
                <Field label="Тип">
                  <Select
                    value={String(prop.kind ?? 'number')}
                    options={PROP_KINDS}
                    onChange={next => edit(draft => {
                      const target = draft.props?.find(p => p.key === prop.key);
                      if (target) target.kind = next as ValueKind;
                    })}
                  />
                </Field>
                {String(prop.kind) === 'choice' ? (
                  <Field label="Сколько значений">
                    <Select
                      value={prop.many ? 'many' : 'one'}
                      options={[['one', 'одно'], ['many', 'несколько']] as const}
                      onChange={next => edit(draft => {
                        const target = draft.props?.find(p => p.key === prop.key);
                        if (!target) return;
                        if (next === 'many') target.many = true; else delete target.many;
                      })}
                    />
                  </Field>
                ) : null}
                {String(prop.kind) === 'choice' ? (
                  <Field label="Из какой таблицы" needed={!prop.from}>
                    <Select
                      value={String(prop.from ?? '')}
                      options={[['', '— какая таблица —'],
                        ...choiceTables(system)
                          .map(([key, list]) => [key, list.label || key] as const)] as never}
                      onChange={next => edit(draft => {
                        const target = draft.props?.find(p => p.key === prop.key);
                        if (!target) return;
                        if (next) target.from = next; else delete target.from;
                      })}
                    />
                  </Field>
                ) : null}
                <Field label="Где показывать">
                  <Select
                    value={prop.onSheet === false ? 'service' : 'sheet'}
                    options={ON_SHEET}
                    onChange={next => edit(draft => {
                      const target = draft.props?.find(p => p.key === prop.key);
                      if (!target) return;
                      if (next === 'service') target.onSheet = false; else delete target.onSheet;
                    })}
                  />
                </Field>
                <Field label=" ">
                  <Button size="sm" variant="danger" onClick={() => edit(draft => {
                    draft.props = (draft.props ?? []).filter(p => p.key !== prop.key);
                  })}>Убрать</Button>
                </Field>
              </div>
              <span className="faint">{propDestiny(kind, prop.key)}</span>
            </div>
          ))}
      </Card>

      {}
      {kind.kind === 'item' ? (
        <Card>
          <CardHead
            title="Что правит каждая вещь этого типа"
            sub="Пишется один раз — действует, пока надета любая вещь этого типа. То, что своё у конкретной вещи, правится в компендиуме."
          />
          <ModifiersEditor
            empty={{
              title: 'тип пока ничего не правит',
              hint: 'Пассивная половина типа: бонус к полю или правка броска, пока надета любая вещь этого типа. «Тяжёлый доспех мешает красться» пишется здесь один раз — кольчуга и латы получат его без единой строчки на себе.',
            }}
            system={system}
            editSystem={editSystem}
            title=""
            modifiers={kind.modifiers ?? []}
            onEdit={change => edit(draft => { change(draft.modifiers ??= []); })}
          />
        </Card>
      ) : null}

    </>
  );
}

function BindingEditor({ binding, system, recordKind, onEdit, onDelete, onFillWithProp }: {
  binding: Binding;
  system: System;

  recordKind: RecordKind;
  onEdit: (change: (draft: Binding) => void) => void;
  onDelete: () => void;

  onFillWithProp: (param: Param) => void;
}) {
  const effect = system.effects[binding.effect];
  const params = effect?.params ?? [];
  const isClosed = (key: string) => {
    const value = binding.args?.[key];
    return value !== undefined && value !== null;
  };
  const unclosed = params.filter(param => !isClosed(param.key) && !param.optional && !param.ask);

  return (
    <Card tone="flat">
      <div className="row">
        <Field label="Как назвать кнопку" hint="То, что игрок увидит на листе.">
          <Input value={binding.label ?? ''} onChange={label => onEdit(draft => { draft.label = label; })} />
        </Field>
        <Field label="Какой эффект применяется" needed={!binding.effect}>
          <Select
            value={binding.effect}
            options={[['', '— какой эффект —'],
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
          <span className="field__label">Что отправляем в «{effect?.label || binding.effect}» — его «Что приходит»</span>
          {params.map(param => (
            <div key={param.key} className={`need-fill ${isClosed(param.key) ? 'need-fill--ok' : ''}`}>
              <Field label={param.label ?? param.key}>
                <SlotInput
                  where={`${binding.label || effect?.label || binding.effect} · ${param.label ?? param.key}`}
                  value={binding.args?.[param.key] as never}
                  context={{ system, effect: effect ?? ({ label: '' } as Effect), earlier: [], recordKind }}
                  allow={['prop', 'expr', 'const', 'table', 'empty']}
                  keep={['prop', 'const']}
                  placeholder="число или формула — или выберите ниже"
                  extraOptions={[
                    ...(isClosed(param.key) ? [] : [{
                      group: 'Завести',
                      label: `новое свойство «${param.label ?? param.key}»`,
                      ref: { prop: '' } as never,
                      synthetic: true,
                      onPick: () => onFillWithProp(param),
                    }]),
                    ...(listOf(system, param.from) ?? []).map(option => ({
                      group: (system.tables?.[String(param.from)]?.label) || 'из таблицы',
                      label: option.label ?? String(option.value),
                      ref: { const: String(option.value) } as never,
                    })),
                  ]}
                  onChange={next => onEdit(draft => {
                    draft.args ??= {};
                    if (next) draft.args[param.key] = next as never;
                    else delete draft.args[param.key];
                  })}
                />
              </Field>
              {!isClosed(param.key) ? (
                <div className="inline inline--tight need-fill__ways">
                  <span className="faint">взять:</span>
                  {sourcesFor(param, recordKind, system).map(source => (
                    <Button
                      key={source.label} size="sm" variant="ghost"
                      onClick={() => onEdit(draft => { draft.args ??= {}; draft.args[param.key] = source.ref as never; })}
                    >
                      {source.label}
                    </Button>
                  ))}
                  <Button size="sm" onClick={() => onFillWithProp(param)}>
                    + новое свойство «{param.label ?? param.key}»
                  </Button>
                </div>
              ) : null}
              {asksAtTable(param, isClosed(param.key))}
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

const FITS: Record<string, string[]> = {
  number: ['number', 'expr'],
  dice: ['dice'],
  text: ['text'],
  effect: ['effect'],
  record: ['record'],
};

function sourcesFor(param: Param, kind: RecordKind, system: System): { label: string; ref: unknown }[] {
  const props = kind.props ?? [];
  const want = String(param.kind ?? 'number');
  const own = props
    .filter(prop => (want === 'choice'
      ? prop.kind === 'choice' && prop.from === param.from
      : (FITS[want] ?? []).includes(String(prop.kind ?? 'number'))))
    .map(prop => ({ label: `свойство «${prop.label ?? prop.key}»`, ref: { prop: prop.key } }));
  if (want !== 'number') return own;
  const viaTable = props
    .filter(prop => prop.kind === 'choice' && prop.from && system.tables?.[prop.from]?.columns?.length)
    .flatMap(prop => (system.tables![prop.from!]!.columns ?? [])
      .filter(column => ['number', 'expr'].includes(String(column.kind ?? 'number')))
      .map(column => ({
        label: `«${prop.label ?? prop.key}» → столбец «${column.label || column.key}»`,
        ref: { expr: `@${prop.key}.${column.key}` },
      })));
  return [...own, ...viaTable];
}

function asksAtTable(param: Param, closed: boolean) {
  if (closed || !param.ask) return null;
  return <span className="faint need-fill__ways">{`не заполните — спросят ${param.ask.by === 'gm' ? 'ведущего' : 'игрока'} за столом`}</span>;
}

function propDestiny(kind: RecordKind, propKey: string): string {
  const buttons = (kind.bindings ?? [])
    .filter(b => Object.values(b.args ?? {}).some(arg =>
      arg !== null && typeof arg === 'object' && (arg as { prop?: string }).prop === propKey))
    .map(b => `«${b.label ?? 'Применение'}»`);
  return buttons.length
    ? `уходит в кнопку ${buttons.join(', ')}`
    : 'никуда не уходит — просто справка на записи';
}
