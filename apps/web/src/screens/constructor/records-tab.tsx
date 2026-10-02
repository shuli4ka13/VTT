import { paramsOf } from '@vtt/engine/model/inherit';
import { tableOf } from '@vtt/engine/model/buttons';
import { useWorld, freeId } from '../../store/world.ts';
import { ModifiersEditor } from './modifiers.tsx';
import { MultiChoice } from '../../ui/multi-choice.tsx';
import { newRecordKind, newBinding, newProp } from './factory.ts';
import { Columns, List, ListItem } from '../../ui/layout.tsx';
import { useLookupPane } from './lookup-panel.tsx';
import {
  Card, CardHead, Field, Input, Select, Button, Empty, Verdict, Chip, DangerButton, LabelInput, Fold,
} from '../../ui/primitives.tsx';
import type { System, SheetKind, Table, Binding, Param, Effect } from '@vtt/schema';
import type { RecordKind } from '@vtt/engine/model/owned';
import { TableColumnCard } from './rules/tables-section.tsx';
import { useState } from 'react';
import { CallEditor } from './call-editor.tsx';
import { BlockPick, fieldBlocks } from './block-pick.tsx';
import { GrantsEditor } from './grants-editor.tsx';
import { argsWithProps, propKeysOf, recordKinds, sheetKinds, kindsOf } from '@vtt/engine/model/owned';
import { DESK_ID } from '@vtt/engine/engine/owners';
import type { AnyKind } from '@vtt/engine/model/owned';
import { blockOf } from '@vtt/engine/model/blocks';
import { blockTree, BlockBranches } from './block-tree.tsx';
import { freeGroupName } from './groups.ts';

const BASIS = [
  ['item', 'вещь — надевают и снимают'],
  ['action', 'действие — учат и применяют'],
] as const;

function SheetKindCards({ kind, system, edit }: {
  kind: SheetKind;
  system: System;
  edit: (change: (draft: SheetKind) => void) => void;
}) {
  const editSystem = useWorld(s => s.editSystem);
  const blocks = fieldBlocks(system).map(name => ({ value: name, label: name }));
  return (
    <>
      <Card>
        <CardHead
          title="Какие блоки на листе этого типа"
          sub="Пусто — все блоки."
        />
        <MultiChoice
          value={kind.blocks ?? []}
          options={blocks}
          onChange={next => edit(draft => {
            const list = (Array.isArray(next) ? next : []).map(String);
            if (list.length) draft.blocks = list; else delete draft.blocks;
          })}
        />
      </Card>
      <Card>
        <CardHead
          title="Что даёт каждому листу этого типа"
          sub="Спасброски от смерти — персонажам, рывок — всем, кто ходит."
        />
        <GrantsEditor system={system} value={kind.grants}
          onChange={next => edit(draft => { if (next) draft.grants = next; else delete draft.grants; })} />
      </Card>
      <Card>
        <CardHead title="Что правит на каждом листе этого типа" />
        <ModifiersEditor
          empty={{ title: 'тип пока ничего не правит', hint: 'Например, «+2 к классу брони» каждому противнику.' }}
          system={system}
          editSystem={editSystem}
          title=""
          modifiers={kind.modifiers ?? []}
          onEdit={change => edit(draft => { change(draft.modifiers ??= []); })}
        />
      </Card>
    </>
  );
}

const ON_SHEET = [
  ['sheet', 'на лист — игрок видит'],
  ['service', 'служебное — только движку'],
] as const;


export function RecordsTab() {
  const system = useWorld(s => s.system);
  const activeKind = useWorld(s => s.activeRecordKind);
  const pick = useWorld(s => s.pick);
  const editSystem = useWorld(s => s.editSystem);

  const kinds = kindsOf(system);
  const active = kinds.find(([key]) => key === activeKind)?.[1];

  const add = () => {
    const made = newRecordKind(system);
    editSystem(draft => { (draft.tables ??= {})[made.key] = made.value; });
    pick({ activeRecordKind: made.key });
  };

  const addTo = (block: string) => {
    const made = newRecordKind(system);
    editSystem(draft => { (draft.tables ??= {})[made.key] = { ...made.value, block }; });
    pick({ activeRecordKind: made.key });
  };

  const tree = blockTree<[string, AnyKind]>(system, kinds, ([, kind]) => blockOf(system, kind));

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
                    meta={key === DESK_ID ? 'тип стола' : system.sheets?.[key] ? 'тип листа' : `свойств: ${kind.columns?.length ?? 0} · действий: ${kind.bindings?.length ?? 0}`}
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

function BuiltIn({ kindId, system }: { kindId: string; system: System }) {
  const editSystem = useWorld(s => s.editSystem);
  const records = (system.library ?? []).filter(record => record.table === kindId);
  if (!records.length) return null;

  return (
    <Fold title="Едут вместе с системой" count={records.length}>
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
      </div>
    </Fold>
  );
}

function KindEditor({ id, kind, system }: { id: string; kind: AnyKind; system: System }) {
  const editSystem = useWorld(s => s.editSystem);
  const pick = useWorld(s => s.pick);
  const [picked, setPicked] = useState<string | null>(null);
  const isSheet = Boolean(system.sheets?.[id]);

  const edit = (change: (draft: RecordKind) => void) => {
    editSystem(draft => {
      const target = draft.tables?.[id];
      if (target) change(target);
    });
  };
  const editSheet = (change: (draft: SheetKind) => void) => {
    editSystem(draft => {
      const target = draft.sheets?.[id];
      if (target) change(target);
    });
  };
  const editAny = (change: (draft: { label?: string; block?: string; extends?: string; hint?: string }) => void) =>
    (isSheet ? editSheet(change) : edit(change));

  const props = kind.columns ?? [];
  const bindings = kind.bindings ?? [];
  const peers = (isSheet ? sheetKinds(system) : recordKinds(system)) as [string, { label?: string }][];
  const open = picked ? props.find(prop => prop.key === picked) : undefined;

  return (
    <>
      <Card>
        <CardHead

          title={<LabelInput value={kind.label ?? ''} placeholder="как зовётся тип" onCommit={label => editAny(draft => { draft.label = label; })} />}
          actions={
            <DangerButton size="sm" onConfirm={() => {
              editSystem(draft => { if (isSheet) delete draft.sheets?.[id]; else delete draft.tables?.[id]; });
              pick({ activeRecordKind: null });
            }}>Удалить</DangerButton>
          }
        />
        <div className="row">
          {isSheet ? null : (
            <Field label="Чем является">
              <Select value={kind.use ?? 'item'} options={BASIS} onChange={next => edit(draft => { draft.use = next; })} />
            </Field>
          )}
          <Field label="Блок">
            <BlockPick
              of="records"
              system={system}
              value={kind.block}
              onChange={next => editAny(draft => {
                if (next) draft.block = next; else delete draft.block;
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
                ...peers
                  .filter(([key]) => key !== id)
                  .map(([key, other]) => [key, other.label ?? key] as const)] as never}
              onChange={next => editAny(draft => {
                if (next) draft.extends = next; else delete draft.extends;
              })}
            />
          </Field>
        </div>
        <Field label="Подсказка заполняющему">
          <Input value={kind.hint ?? ''} onChange={next => editAny(draft => { draft.hint = next; })} />
        </Field>
      </Card>

      {isSheet ? null : <BuiltIn kindId={id} system={system} />}

      {isSheet ? <SheetKindCards kind={kind} system={system} edit={editSheet} /> : (
        <>
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
                draft.columns ??= [];
                const label = param.label ?? param.key;
                const taken = draft.columns.map(p => p.key);
                const newKey = taken.includes(param.key) ? freeId(taken, label) : param.key;
                draft.columns.push({
                  key: newKey, label, kind: param.kind ?? 'number',
                  ...(param.from ? { from: param.from } : {}),
                });
                if (newKey !== param.key) {
                  const target = draft.bindings![index]!;
                  target.args ??= {};
                  target.args[param.key] = { expr: `@${newKey}` };
                }
              })}
            />
          ))}
        <Field label="И как есть — висит или кнопкой под своим именем">
          <GrantsEditor system={system} value={kind.grants}
            onChange={next => edit(draft => { if (next) draft.grants = next; else delete draft.grants; })} />
        </Field>
      </Card>

      <Card>
        <CardHead
          title="Что спросить у человека"
          sub="Форма записи. Обычно собирается сама — кнопкой «завести свойство» при подключении эффекта; руками сюда добавляют справочное: вес, цену."
          actions={
            <Button size="sm" onClick={() => {
              const made = newProp(kind);
              edit(draft => { (draft.columns ??= []).push(made); });
              setPicked(made.key);
            }}>+ свойство</Button>
          }
        />
        {props.length === 0
          ? <span className="faint">Свойств нет: записи этого типа — чистые данные без автоматизации.</span>
          : (
            <div className="inline inline--tight">
              {props.map(prop => (
                <Button key={prop.key} size="sm" variant={prop.key === picked ? 'primary' : 'ghost'}
                  title={propDestiny(system, kind, prop.key)}
                  onClick={() => setPicked(prop.key === picked ? null : prop.key)}>
                  {prop.label || prop.key}{prop.expr !== undefined ? ' =' : ''}
                </Button>
              ))}
            </div>
          )}
        {open ? (
          <TableColumnCard id={id} table={kind as Table} column={open} system={system} edit={edit} onClose={() => setPicked(null)}
            extra={<>
              <Field label="Где показывать">
                <Select
                  value={open.onSheet === false ? 'service' : 'sheet'}
                  options={ON_SHEET}
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

        </>
      )}

      {}
      {!isSheet && kind.use === 'item' ? (
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
  const implicit = new Set((recordKind.columns ?? []).map(prop => prop.key));
  const closed = (key: string) => binding.args?.[key] !== undefined || implicit.has(key);
  const buttons = Object.entries(system.effects).filter(([, e]) => (e.activation ?? 'manual') !== 'passive');

  return (
    <Card tone="flat">
      <CardHead
        title={<LabelInput value={binding.label ?? ''} placeholder="как назвать кнопку" onCommit={label => onEdit(draft => { draft.label = label; })} />}
        actions={<DangerButton size="sm" onConfirm={onDelete}>Удалить</DangerButton>}
      />
      <CallEditor
        system={system}
        effect={binding.effect}
        effects={buttons}
        onEffect={next => onEdit(draft => { draft.effect = next; })}
        args={binding.args as Record<string, unknown> | undefined}
        fromProps={implicit}
        filled={effect ? tableOf(binding, { params: paramsOf(system, effect) }) : {}}
        context={{ system, effect: effect ?? ({ label: '' } as Effect), earlier: [], recordKind }}
        where={binding.label || effect?.label || binding.effect}
        allow={['prop', 'table']}
        onArg={(key, next) => onEdit(draft => {
          draft.args ??= {};
          if (next) draft.args[key] = next as never; else delete draft.args[key];
          if (!Object.keys(draft.args).length) delete draft.args;
        })}
        extraFor={param => [
          ...(closed(param.key) ? [] : [{
            group: 'Завести', label: `новое свойство «${param.label ?? param.key}»`,
            ref: { expr: '' } as never, synthetic: true, onPick: () => onFillWithProp(param),
          }]),
          ...sourcesFor(param, recordKind, system).map(source => ({ group: 'Свойства записи', label: source.label, ref: source.ref as never })),
        ]}
      />
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
  const props = kind.columns ?? [];
  const want = String(param.kind ?? 'number');
  const own = props
    .filter(prop => (want === 'choice'
      ? prop.kind === 'choice' && prop.from === param.from
      : (FITS[want] ?? []).includes(String(prop.kind ?? 'number'))))
    .map(prop => ({ label: `свойство «${prop.label ?? prop.key}»`, ref: { expr: `@${prop.key}` } }));
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

function propDestiny(system: System, kind: RecordKind, propKey: string): string {
  const buttons = (kind.bindings ?? [])
    .filter(b => Object.values(argsWithProps(system, b, propKeysOf(kind)) ?? {}).some(arg =>
      new RegExp(`[@#]${propKey}(?![\\p{L}\\p{N}_])`, 'u').test(String((arg as { expr?: string }).expr ?? ''))))
    .map(b => `«${b.label ?? 'Применение'}»`);
  return buttons.length
    ? `уходит в кнопку ${buttons.join(', ')}`
    : 'никуда не уходит — просто справка на записи';
}
