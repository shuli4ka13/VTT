import { useWorld, freeId } from '../../store/world.ts';
import { TagsField } from './tags-field.tsx';
import { rollOfColumn, setColumnRoll, setEntryTags } from './rules/rolls.ts';
import { ViewGallery } from './view-gallery.tsx';
import { VIEWS, columnFamily, viewNeeds, takesBounds, TAKES_STEP } from '../../sheet/views/index.tsx';
import { BoundFormula } from './bound-field.tsx';
import { rowNames } from './row-names.ts';
import { Field, Input, Select, Chip, Button, NumInput, Segmented, Verdict, TextArea } from '../../ui/primitives.tsx';
import { useState } from 'react';
import { ROW, NOTE_LIMIT, cellSource, onSheet, isSingle, fieldsOf, rowKeyOf, isFormulaCell } from '@vtt/engine';
import type { System, Column, Control, SheetPart } from '@vtt/schema';
import { useT, t as tr, dataT } from '../../i18n/author.ts';

export function readyForSheet(draft: System, tableId: string): void {
  const td = dataT(draft);
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
  columns.unshift({ key, label: td('records:table.column.value'), kind: 'number' });
}

const parseStart = (text: string): number | string => (/^-?\d+(\.\d+)?$/.test(text) ? Number(text) : text);

const seesOptions = (): (readonly [string, string])[] => [
  ['', tr('records:table.sees.all')], ['owner', tr('records:table.sees.owner')], ['gm', tr('records:table.sees.gm')], ['none', tr('records:table.sees.none')],
];

const editsOptions = (): (readonly [string, string])[] => [
  ['', tr('records:table.edits.player')], ['gm', tr('records:table.edits.gm')], ['none', tr('records:table.edits.none')],
];

export function ColumnSheetFields({ tableId, column, system }: { tableId: string; column: Column; system: System }) {
  const t = useT('records');
  const editColumn = useWorld(s => s.editColumn);
  const table = system.tables![tableId]!;
  const single = isSingle(table);
  const stored = single ? column.expr === undefined : (table.rows ?? []).some(row => cellSource(column, row).kind === 'input');
  const first = fieldsOf(system).find(f => f.home === tableId && (single ? f.tag === column.key : f.cell?.column === column.key));
  const edit = (change: (draft: Column) => void) => editColumn(tableId, column.key, change);
  const editSystem = useWorld(s => s.editSystem);
  const rolled = rollOfColumn(system, tableId, column.key);
  const [asFormula, setAsFormula] = useState(false);
  const numeric = column.kind === 'number' || column.kind === undefined;
  const byFormula = numeric && (asFormula || isFormulaCell(column.default));

  return (
    <>
      <div className="inline inline--tight"><Chip>{stored ? t('table.stored') : t('table.computed')}</Chip></div>
      <div className="row">
        <Field label={t('table.seesLabel')}>
          <Select<string> label={t('table.seesAria')} value={column.sees ?? ''}
            options={seesOptions()}
            onChange={next => edit(draft => {
              if (next) draft.sees = next as NonNullable<Column['sees']>; else delete draft.sees;
              if (next === 'none' && stored) draft.edits = 'none';
            })} />
        </Field>
        {stored ? (
          <Field label={t('table.editsLabel')}>
            <Select<string> label={t('table.editsAria')} value={column.sees === 'none' ? 'none' : column.edits ?? ''}
              options={column.sees === 'none' ? editsOptions().filter(([key]) => key === 'none') : editsOptions()}
              onChange={next => edit(draft => { if (next) draft.edits = next as NonNullable<Column['edits']>; else delete draft.edits; })} />
          </Field>
        ) : null}
      </div>
      <div className="row">
        {stored && !column.many ? (
          <div className="start-field">
            <Field label={t('table.start')}>
              {column.kind === 'boolean' ? (
                <Select<string> label={t('table.startAria')} value={column.default === undefined ? '' : column.default ? 'yes' : 'no'}
                  options={[['', t('table.notSet')], ['yes', t('common:yes')], ['no', t('common:no')]]}
                  onChange={next => edit(draft => { if (!next) delete draft.default; else draft.default = next === 'yes'; })} />
              ) : column.kind === 'choice' && column.from && system.tables?.[column.from] ? (
                <Select<string> label={t('table.startAria')} value={column.default === undefined ? '' : String(column.default)}
                  options={[['', t('table.notSet')], ...(system.tables[column.from]!.rows ?? []).map(row => [String(row.value), row.label ?? String(row.value)] as const)]}
                  onChange={next => edit(draft => {
                    const row = (system.tables?.[column.from!]?.rows ?? []).find(r => String(r.value) === next);
                    if (!next || !row) delete draft.default; else draft.default = row.value as never;
                  })} />
              ) : column.kind === 'note' ? (
                <TextArea rows={3} max={NOTE_LIMIT} value={typeof column.default === 'string' ? column.default : ''} placeholder={t('table.startNote')}
                  onChange={text => edit(draft => { if (!text.trim()) delete draft.default; else draft.default = text; })} />
              ) : byFormula ? (
                <BoundFormula value={column.default} system={system} placeholder={t('table.startFormula')}
                  where={t('table.startWhere', { table: table.label || tableId, column: column.label || column.key })}
                  {...(single ? {} : { table: tableId, names: rowNames(system, tableId) })}
                  onChange={next => edit(draft => { if (next === null) delete draft.default; else draft.default = next; })} />
              ) : (
                <Input value={column.default === undefined ? '' : String(column.default)}
                  onChange={text => edit(draft => { if (!text.trim()) delete draft.default; else draft.default = column.kind === 'number' ? parseStart(text) : text; })} />
              )}
            </Field>
            {numeric && byFormula ? (
              <Button size="sm" variant="ghost" title={t('table.toNumberTitle')}
                onClick={() => { setAsFormula(false); if (isFormulaCell(column.default)) edit(draft => { delete draft.default; }); }}>{t('table.toNumber')}</Button>
            ) : numeric ? (
              <Button size="sm" variant="ghost" title={t('table.toFormulaTitle')}
                onClick={() => setAsFormula(true)}>{t('table.toFormula')}</Button>
            ) : null}
          </div>
        ) : null}
        {single ? null : (
          <Field label={t('table.title')}>
            <Input value={column.title ?? ''} placeholder={first?.label ?? ''}
              onChange={next => edit(draft => { if (next.trim()) draft.title = next; else delete draft.title; })} />
          </Field>
        )}
      </div>
      {column.kind === 'note' ? null : (
      <Field label={t('table.roll')} hint={t('table.rollHint')}>
        <div className="stack stack--tight">
          <Select
            value={rolled?.key ?? ''}
            options={[['', t('table.noRoll')], ...Object.entries(system.rolls ?? {}).map(([key, roll]) => [key, roll.label || key] as const)] as never}
            onChange={next => editSystem(draft => setColumnRoll(draft, tableId, column.key, next || null))}
          />
          {rolled && single ? (
            <TagsField system={system} value={rolled.entry.tags} empty={t('table.ownTag')}
              onChange={tags => editSystem(draft => setEntryTags(draft, tableId, column.key, tags.filter((t): t is string => typeof t === 'string')))} />
          ) : null}
        </div>
      </Field>
      )}
    </>
  );
}

export const holds = (part: SheetPart, table: string, column: string, row?: string): boolean =>
  part.table === table && (!part.columns || part.columns.includes(column)) && (!row || !part.rows || part.rows.includes(row));

export function BlockViewField({ tableId, column, system, block, row, cell = row }: { tableId: string; column: Column; system: System; block: string; row?: string; cell?: string }) {
  const t = useT('records');
  const td = dataT(system);
  const editColumn = useWorld(s => s.editColumn);
  const editSystem = useWorld(s => s.editSystem);
  const table = system.tables![tableId]!;
  const single = isSingle(table);
  const own = row ? (table.rows ?? []).find(r => rowKeyOf(r) === row) : undefined;
  const stored = single ? column.expr === undefined : own ? cellSource(column, own).kind === 'input' : (table.rows ?? []).some(r => cellSource(column, r).kind === 'input');
  const edit = (change: (draft: Column) => void) => editColumn(tableId, column.key, change);
  const part = (system.blocks ?? []).find(b => b.key === block)?.parts.find(p => holds(p, tableId, column.key, cell));
  const key = row ? `${row}.${column.key}` : column.key;
  const control = part?.views?.[key];
  const base = part?.views?.[column.key];
  const kind = control?.kind;
  const lacking = kind ? viewNeeds(kind, column) : [];
  const editView = (change: (views: Record<string, Control>) => void) => editSystem(draft => {
    const target = (draft.blocks ?? []).find(b => b.key === block)?.parts.find(p => holds(p, tableId, column.key, cell));
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
      columns.splice(at, 0, { key, label: td('records:table.column.max', { name }), kind: 'number' });
      const own = columns.find(c => c.key === column.key);
      if (own) own.max = { expr: single ? `@${key}` : `@${ROW}.${key}` };
    });
  };
  const title = row
    ? t('table.viewRow', { name: own?.label ?? row, block })
    : single ? t('table.viewRow', { name: column.label || column.key, block }) : t('table.viewColumn', { name: column.label || column.key, block });
  if (column.kind === 'note') return <span className="faint">{t('table.note')}</span>;
  return (
    <>
      <Field label={title}>
        <ViewGallery
          label={row ? title : t('table.view')}
          value={kind}
          family={columnFamily(column)}
          computed={!stored}
          plain={row
            ? { label: t('table.likeColumn'), hint: base ? t('table.likeColumnHint', { view: VIEWS[base.kind].label }) : t('table.noColumnView') }
            : { label: t('table.plain'), hint: stored ? t('table.plainStored') : t('table.plainComputed') }}
          needs={next => viewNeeds(next, column)}
          onChange={next => editView(views => {
            if (!next) { delete views[key]; return; }
            const keep = views[key] ?? { kind: next };
            views[key] = {
              kind: next,
              ...(TAKES_STEP.includes(next) && keep.step !== undefined ? { step: keep.step } : {}),
              ...(next === 'bar' && keep.worse ? { worse: keep.worse } : {}),
              ...(next === 'bar' && keep.minus ? { minus: keep.minus } : {}),
              ...(next === 'bar' && keep.plus ? { plus: keep.plus } : {}),
              ...(next === 'toggle' && keep.yes ? { yes: keep.yes } : {}),
              ...(next === 'toggle' && keep.no ? { no: keep.no } : {}),
            };
          })}
        />
      </Field>
      {kind && (!row || !base) && (lacking.length || takesBounds(kind, column) || TAKES_STEP.includes(kind) || ['bar', 'toggle', 'ring', 'choice', 'chips'].includes(kind)) ? (
        <div className="view-settings">
          {lacking.length ? <Verdict tone="warn">{t('table.lacking', { view: VIEWS[kind].label, what: lacking.join(', ') })}</Verdict> : null}
          {takesBounds(kind, column) ? (
            <div className="row">
              <Field label={kind === 'slider' || kind === 'ring' || kind === 'choice' ? t('table.low') : t('table.notBelow')}>
                <BoundFormula value={column.min} system={system} table={tableId} {...(single ? {} : { names: rowNames(system, tableId) })} where={t('table.whereLow', { table: table.label || tableId, column: column.label || column.key })}
                  onChange={next => edit(draft => { if (next === null) delete draft.min; else draft.min = next; })} />
              </Field>
              <Field label={kind === 'stepper' ? t('table.notAbove') : kind === 'ring' || kind === 'choice' ? t('table.top') : t('table.topTotal')}>
                <BoundFormula value={column.max} system={system} table={tableId} {...(single ? {} : { names: rowNames(system, tableId) })} where={t('table.whereTop', { table: table.label || tableId, column: column.label || column.key })} placeholder={t('table.topPlaceholder')}
                  onChange={next => edit(draft => { if (next === null) delete draft.max; else draft.max = next; })} />
              </Field>
            </div>
          ) : null}
          {takesBounds(kind, column) && column.max === undefined && kind !== 'stepper' ? (
            <Button size="sm" variant="ghost" onClick={addTop}>{t('table.addTop')}</Button>
          ) : null}
          {TAKES_STEP.includes(kind) ? (
            <Field label={t('table.step')}>
              <NumInput value={control?.step ?? 1} least={0}
                onCommit={n => setControl({ step: n > 0 && n !== 1 ? n : undefined })} />
            </Field>
          ) : null}
          {kind === 'bar' ? (
            <Field label={t('table.redWhen')}>
              <Segmented value={control?.worse ?? 'low'}
                options={[{ key: 'low', label: t('table.worseLow') }, { key: 'high', label: t('table.worseHigh') }]}
                onChange={next => setControl({ worse: next === 'high' ? 'high' : undefined })} />
            </Field>
          ) : null}
          {kind === 'bar' && stored ? (
            <div className="row">
              <Field label={t('table.minusButton')}>
                <Input value={control?.minus ?? ''} placeholder="−" onChange={text => setControl({ minus: text.trim() || undefined })} />
              </Field>
              <Field label={t('table.plusButton')}>
                <Input value={control?.plus ?? ''} placeholder="+" onChange={text => setControl({ plus: text.trim() || undefined })} />
              </Field>
            </div>
          ) : null}
          {kind === 'toggle' || ((kind === 'ring' || kind === 'choice') && column.kind === 'boolean') ? (
            <div className="row">
              <Field label={t('table.yesLabel')}>
                <Input value={control?.yes ?? ''} placeholder={t('common:yes')} onChange={text => setControl({ yes: text.trim() || undefined })} />
              </Field>
              <Field label={t('table.noLabel')}>
                <Input value={control?.no ?? ''} placeholder={t('common:no')} onChange={text => setControl({ no: text.trim() || undefined })} />
              </Field>
            </div>
          ) : null}
          {kind === 'ring' || kind === 'choice' || kind === 'chips' ? (
            <span className="faint">
              {column.kind === 'boolean'
                ? <>{t('table.stepsBool')}</>
                : column.kind !== 'choice' && kind !== 'chips'
                  ? <>{t('table.stepsNumbers')}</>
                  : column.from
                    ? <>{t('table.stepsTable', { table: system.tables?.[column.from]?.label || column.from })}</>
                    : <>{t('table.stepsNone')}</>}
            </span>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
