import { useWorld, freeId } from '../../store/world.ts';
import { TagsField } from './tags-field.tsx';
import { rollOfColumn, setColumnRoll, setEntryTags } from './rules/rolls.ts';
import { ViewGallery } from './view-gallery.tsx';
import { VIEWS, columnFamily, viewNeeds, takesBounds, TAKES_STEP } from '../../sheet/views/index.tsx';
import { BoundFormula } from './bound-field.tsx';
import { rowNames } from './row-names.ts';
import { Field, Input, Select, Chip, Button, NumInput, Segmented, Verdict } from '../../ui/primitives.tsx';
import { ROW, cellSource, onSheet, isSingle, fieldsOf, rowKeyOf } from '@vtt/engine/model/sheet-columns';
import type { System, Column, Control, SheetPart } from '@vtt/schema';

export function readyForSheet(draft: System, tableId: string): void {
  const table = draft.tables?.[tableId];
  if (!table) return;
  const converting = !onSheet(table);
  if (converting) table.owner = 'sheet';
  const columns = (table.columns ??= []);
  const inputs = columns.some(column => (table.rows ?? []).some(row => cellSource(column, row).kind === 'input'));
  if (columns.length && (inputs || !converting)) return;
  const taken = new Set(columns.map(c => c.key));
  let key = 'value';
  for (let n = 2; taken.has(key); n++) key = `value_${n}`;
  columns.unshift({ key, label: 'Значение', kind: 'number' });
}

const parseStart = (text: string): number | string => (/^-?\d+(\.\d+)?$/.test(text) ? Number(text) : text);

export function ColumnSheetFields({ tableId, column, system }: { tableId: string; column: Column; system: System }) {
  const editColumn = useWorld(s => s.editColumn);
  const table = system.tables![tableId]!;
  const single = isSingle(table);
  const stored = single ? column.expr === undefined : (table.rows ?? []).some(row => cellSource(column, row).kind === 'input');
  const first = fieldsOf(system).find(f => f.home === tableId && (single ? f.tag === column.key : f.cell?.column === column.key));
  const edit = (change: (draft: Column) => void) => editColumn(tableId, column.key, change);
  const editSystem = useWorld(s => s.editSystem);
  const rolled = rollOfColumn(system, tableId, column.key);

  return (
    <>
      <div className="inline inline--tight"><Chip>{stored ? 'вводит игрок' : 'считается'}</Chip></div>
      <div className="row">
        {stored && !column.many ? (
          <Field label="В новом листе">
            {column.kind === 'boolean' ? (
              <Select<string> label="в новом листе" value={column.default === undefined ? '' : column.default ? 'да' : 'нет'}
                options={[['', '— не задано'], ['да', 'да'], ['нет', 'нет']]}
                onChange={next => edit(draft => { if (!next) delete draft.default; else draft.default = next === 'да'; })} />
            ) : column.kind === 'choice' && column.from && system.tables?.[column.from] ? (
              <Select<string> label="в новом листе" value={column.default === undefined ? '' : String(column.default)}
                options={[['', '— не задано'], ...(system.tables[column.from]!.rows ?? []).map(row => [String(row.value), row.label ?? String(row.value)] as const)]}
                onChange={next => edit(draft => {
                  const row = (system.tables?.[column.from!]?.rows ?? []).find(r => String(r.value) === next);
                  if (!next || !row) delete draft.default; else draft.default = row.value as never;
                })} />
            ) : (
              <Input value={column.default === undefined ? '' : String(column.default)}
                onChange={text => edit(draft => { if (!text.trim()) delete draft.default; else draft.default = column.kind === 'number' ? parseStart(text) : text; })} />
            )}
          </Field>
        ) : null}
        {single ? null : (
          <Field label="Подпись">
            <Input value={column.title ?? ''} placeholder={first?.label ?? ''}
              onChange={next => edit(draft => { if (next.trim()) draft.title = next; else delete draft.title; })} />
          </Field>
        )}
      </div>
      <Field label="Бросок" hint="Как бросают — в «Правилах» → «Броски».">
        <div className="stack stack--tight">
          <Select
            value={rolled?.key ?? ''}
            options={[['', 'не бросают'], ...Object.entries(system.rolls ?? {}).map(([key, roll]) => [key, roll.label || key] as const)] as never}
            onChange={next => editSystem(draft => setColumnRoll(draft, tableId, column.key, next || null))}
          />
          {rolled && single ? (
            <TagsField system={system} value={rolled.entry.tags} empty="+ своё слово-метка…"
              onChange={tags => editSystem(draft => setEntryTags(draft, tableId, column.key, tags.filter((t): t is string => typeof t === 'string')))} />
          ) : null}
        </div>
      </Field>
    </>
  );
}

export const holds = (part: SheetPart, table: string, column: string, row?: string): boolean =>
  part.table === table && (!part.columns || part.columns.includes(column)) && (!row || !part.rows || part.rows.includes(row));

export function BlockViewField({ tableId, column, system, block, row, cell = row }: { tableId: string; column: Column; system: System; block: string; row?: string; cell?: string }) {
  const editColumn = useWorld(s => s.editColumn);
  const editSystem = useWorld(s => s.editSystem);
  const table = system.tables![tableId]!;
  const single = isSingle(table);
  const own = row ? (table.rows ?? []).find(r => rowKeyOf(r) === row) : undefined;
  const stored = single ? column.expr === undefined : own ? cellSource(column, own).kind === 'input' : (table.rows ?? []).some(r => cellSource(column, r).kind === 'input');
  const edit = (change: (draft: Column) => void) => editColumn(tableId, column.key, change);
  const part = (system.blocks ?? []).find(b => b.name === block)?.parts.find(p => holds(p, tableId, column.key, cell));
  const key = row ? `${row}.${column.key}` : column.key;
  const control = part?.views?.[key];
  const base = part?.views?.[column.key];
  const kind = control?.kind;
  const lacking = kind ? viewNeeds(kind, column) : [];
  const editView = (change: (views: Record<string, Control>) => void) => editSystem(draft => {
    const target = (draft.blocks ?? []).find(b => b.name === block)?.parts.find(p => holds(p, tableId, column.key, cell));
    if (!target) return;
    const views = { ...target.views };
    change(views);
    if (Object.keys(views).length) target.views = views; else delete target.views;
  });
  const setControl = (patch: Partial<Control>) => editView(views => {
    const next = { ...(views[key] ?? { kind: kind! }), ...patch } as Record<string, unknown>;
    for (const [name, value] of Object.entries(patch)) if (value === undefined) delete next[name];
    views[key] = next as Control;
  });
  const addTop = () => {
    const taken = [...fieldsOf(system).map(f => f.tag), ...(table.columns ?? []).map(c => c.key), ...Object.keys(system.tables ?? {})];
    const key = freeId(taken, `${column.key}_max`);
    const name = column.label || column.key;
    editSystem(draft => {
      const target = draft.tables?.[tableId];
      if (!target) return;
      const columns = (target.columns ??= []);
      const at = columns.findIndex(c => c.key === column.key);
      columns.splice(at, 0, { key, label: `Максимум: ${name}`, kind: 'number' });
      const own = columns.find(c => c.key === column.key);
      if (own) own.max = { expr: single ? `@${key}` : `@${ROW}.${key}` };
    });
  };
  return (
    <>
      <Field label={row ? `Вид только у «${own?.label ?? row}»` : `Вид в блоке «${block}»`}>
        <ViewGallery
          label={row ? `Вид только у «${own?.label ?? row}»` : 'Вид'}
          value={kind}
          family={columnFamily(column)}
          computed={!stored}
          plain={row
            ? { label: 'Как у колонки', hint: base ? `вид колонки в этом блоке: ${VIEWS[base.kind].label}` : 'у колонки в этом блоке вида нет — как есть' }
            : { label: 'Как есть', hint: stored ? 'окошко: игрок вписывает число или текст' : 'значение без оформления — его считает формула, вписать нельзя' }}
          needs={next => viewNeeds(next, column)}
          onChange={next => editView(views => {
            if (!next) { delete views[key]; return; }
            const keep = views[key] ?? { kind: next };
            views[key] = {
              kind: next,
              ...(TAKES_STEP.includes(next) && keep.step !== undefined ? { step: keep.step } : {}),
              ...(next === 'bar' && keep.worse ? { worse: keep.worse } : {}),
              ...(next === 'toggle' && keep.yes ? { yes: keep.yes } : {}),
              ...(next === 'toggle' && keep.no ? { no: keep.no } : {}),
            };
          })}
        />
      </Field>
      {kind && (!row || !base) && (lacking.length || takesBounds(kind, column) || TAKES_STEP.includes(kind) || ['bar', 'toggle', 'ring', 'choice', 'chips'].includes(kind)) ? (
        <div className="view-settings">
          {lacking.length ? <Verdict tone="warn">Виду «{VIEWS[kind].label}» не хватает: {lacking.join(', ')}. Пока не задано, на листе вместо него «—».</Verdict> : null}
          {takesBounds(kind, column) ? (
            <div className="row">
              <Field label={kind === 'slider' || kind === 'ring' || kind === 'choice' ? 'Низ' : 'Не ниже'}>
                <BoundFormula value={column.min} system={system} table={tableId} {...(single ? {} : { names: rowNames(system, tableId) })} where={`${table.label || tableId} · ${column.label || column.key} · низ`}
                  onChange={next => edit(draft => { if (next === null) delete draft.min; else draft.min = next; })} />
              </Field>
              <Field label={kind === 'stepper' ? 'Не выше' : kind === 'ring' || kind === 'choice' ? 'Верх' : 'Верх — сколько всего'}>
                <BoundFormula value={column.max} system={system} table={tableId} {...(single ? {} : { names: rowNames(system, tableId) })} where={`${table.label || tableId} · ${column.label || column.key} · верх`} placeholder="число или формула: 3 или @ и название"
                  onChange={next => edit(draft => { if (next === null) delete draft.max; else draft.max = next; })} />
              </Field>
            </div>
          ) : null}
          {takesBounds(kind, column) && column.max === undefined && kind !== 'stepper' ? (
            <Button size="sm" variant="ghost" onClick={addTop}>+ колонка для верха</Button>
          ) : null}
          {TAKES_STEP.includes(kind) ? (
            <Field label="Шаг">
              <NumInput value={control?.step ?? 1} least={0}
                onCommit={n => setControl({ step: n > 0 && n !== 1 ? n : undefined })} />
            </Field>
          ) : null}
          {kind === 'bar' ? (
            <Field label="Красная, когда">
              <Segmented value={control?.worse ?? 'low'}
                options={[{ key: 'low', label: 'мало' }, { key: 'high', label: 'много' }]}
                onChange={next => setControl({ worse: next === 'high' ? 'high' : undefined })} />
            </Field>
          ) : null}
          {kind === 'toggle' || ((kind === 'ring' || kind === 'choice') && column.kind === 'boolean') ? (
            <div className="row">
              <Field label="Подпись «да»">
                <Input value={control?.yes ?? ''} placeholder="да" onChange={text => setControl({ yes: text.trim() || undefined })} />
              </Field>
              <Field label="Подпись «нет»">
                <Input value={control?.no ?? ''} placeholder="нет" onChange={text => setControl({ no: text.trim() || undefined })} />
              </Field>
            </div>
          ) : null}
          {kind === 'ring' || kind === 'choice' || kind === 'chips' ? (
            <span className="faint">
              {column.kind === 'boolean'
                ? <>Две ступени: «нет» и «да» — подписи выше.</>
                : column.kind !== 'choice' && kind !== 'chips'
                  ? <>Ступени — числа от низа до верха (не больше 8). Нужны слова — тип «выбор» и таблица.</>
                  : column.from
                    ? <>Ступени — строки таблицы «{system.tables?.[column.from]?.label || column.from}» по порядку; подписи берутся оттуда.</>
                    : <>Варианты задаются так: тип «выбор» → «Из таблицы».</>}
            </span>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
