import { useWorld, freeId } from '../../store/world.ts';
import { BlockPick } from './block-pick.tsx';
import { TagsField } from './tags-field.tsx';
import { dieEntries } from './rules/dice-section.tsx';
import { ViewGallery } from './view-gallery.tsx';
import { VIEWS, columnFamily, viewNeeds, takesBounds, TAKES_STEP } from '../../sheet/views/index.tsx';
import { BoundField } from './bound-field.tsx';
import { Field, Input, Select, Chip, Button, NumInput, Segmented, Verdict } from '../../ui/primitives.tsx';
import { isRange } from '@vtt/engine/model/tables';
import { ROW, cellSource, onSheet, isSingle, fieldsOf } from '@vtt/engine/model/sheet-columns';
import type { System, Column, Control } from '@vtt/schema';

export const sheetTables = (system: System): [string, string][] =>
  Object.entries(system.tables ?? {})
    .filter(([, table]) => !isRange(table) && !onSheet(table) && (table.rows ?? []).length > 0)
    .map(([id, table]) => [id, table.label || id]);

export function placeOnSheet(draft: System, tableId: string): void {
  const table = draft.tables?.[tableId];
  if (!table) return;
  table.owner = 'sheet';
  table.block ??= table.label || tableId;
  if ((table.columns ?? []).some(column => (table.rows ?? []).some(row => cellSource(column, row).kind === 'input'))) return;
  const columns = (table.columns ??= []);
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
  const self = single ? `@${column.key}` : `@${ROW}.${column.key}`;
  const edit = (change: (draft: Column) => void) => editColumn(tableId, column.key, change);

  return (
    <>
      <div className="inline inline--tight"><Chip>{stored ? 'вводит игрок' : 'считается'}</Chip></div>
      <div className="row">
        <Field label="Блок">
          <BlockPick of="fields" system={system} value={column.block ?? table.block}
            onChange={next => edit(draft => { if (next) draft.block = next; else delete draft.block; })} />
        </Field>
        {stored && !column.many ? (
          <Field label="В новом листе">
            <Input value={column.default === undefined ? '' : String(column.default)}
              onChange={text => edit(draft => { if (!text.trim()) delete draft.default; else draft.default = parseStart(text); })} />
          </Field>
        ) : null}
        {single ? null : (
          <Field label="Подпись">
            <Input value={column.title ?? ''} placeholder={first?.label ?? ''}
              onChange={next => edit(draft => { if (next.trim()) draft.title = next; else delete draft.title; })} />
          </Field>
        )}
      </div>
      <Field label="Бросок">
        <div className="stack stack--tight">
          <Select
            value={!column.roll ? '' : column.roll.count ? 'pool' : 'bonus'}
            options={[['', 'не бросают'], ['bonus', 'значение — прибавка к кости'], ['pool', 'значение — число костей']] as const}
            onChange={next => edit(draft => {
              if (!next) { delete draft.roll; return; }
              const die = dieEntries(system)[0]?.[0];
              const roll = draft.roll ?? { ...(single ? { label: `Проверка: ${draft.label ?? draft.key}` } : {}), ...(die ? { die } : {}) };
              if (next === 'pool') { roll.count = { expr: self }; delete roll.bonus; } else { roll.bonus = { expr: self }; delete roll.count; }
              draft.roll = roll;
            })}
          />
          {column.roll ? (
            <>
              <Select
                value={column.roll.die ?? ''}
                options={[['', '— какой костью —'], ...dieEntries(system).map(([key, c]) => [key, c.label || key] as const)] as never}
                onChange={key => edit(draft => {
                  if (!draft.roll) return;
                  if (key) draft.roll.die = key; else delete draft.roll.die;
                })}
              />
              <TagsField
                system={system}
                value={column.roll.tags}
                templates={single ? [] : [
                  { value: '{value}', label: 'ключ строки' },
                  ...(table.columns ?? []).filter(other => other.key !== column.key).map(other => ({ value: `{${other.key}}`, label: `«${other.label || other.key}» строки` })),
                ]}
                onChange={tags => edit(draft => {
                  if (!draft.roll) return;
                  const list = tags.filter((t): t is string => typeof t === 'string');
                  if (list.length) draft.roll.tags = list; else delete draft.roll.tags;
                })}
              />
              {single ? (
                <Input value={column.roll.label ?? ''} placeholder="подпись броска"
                  onChange={next => edit(draft => { if (!draft.roll) return; if (next.trim()) draft.roll.label = next; else delete draft.roll.label; })} />
              ) : null}
            </>
          ) : null}
        </div>
      </Field>
    </>
  );
}

export function ColumnViewField({ tableId, column, system }: { tableId: string; column: Column; system: System }) {
  const editColumn = useWorld(s => s.editColumn);
  const editSystem = useWorld(s => s.editSystem);
  const table = system.tables![tableId]!;
  const single = isSingle(table);
  const stored = single ? column.expr === undefined : (table.rows ?? []).some(row => cellSource(column, row).kind === 'input');
  const edit = (change: (draft: Column) => void) => editColumn(tableId, column.key, change);
  const kind = column.control?.kind;
  const lacking = kind ? viewNeeds(kind, column) : [];
  const setControl = (patch: Partial<Control>) => edit(draft => {
    const next = { ...(draft.control ?? { kind: kind! }), ...patch } as Record<string, unknown>;
    for (const [key, value] of Object.entries(patch)) if (value === undefined) delete next[key];
    draft.control = next as Control;
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
      <Field label="Вид">
        <ViewGallery
          value={kind}
          family={columnFamily(column)}
          computed={!stored}
          plain={stored ? { label: 'Обычное поле', hint: 'окошко для числа или текста' } : { label: 'Просто число', hint: 'значение как есть' }}
          needs={next => viewNeeds(next, column)}
          onChange={next => edit(draft => {
            if (!next) { delete draft.control; return; }
            const keep = draft.control ?? { kind: next };
            draft.control = {
              kind: next,
              ...(TAKES_STEP.includes(next) && keep.step !== undefined ? { step: keep.step } : {}),
              ...(next === 'bar' && keep.worse ? { worse: keep.worse } : {}),
              ...(next === 'toggle' && keep.yes ? { yes: keep.yes } : {}),
              ...(next === 'toggle' && keep.no ? { no: keep.no } : {}),
            };
          })}
        />
      </Field>
      {kind && (lacking.length || takesBounds(kind, column) || TAKES_STEP.includes(kind) || ['bar', 'toggle', 'ring', 'choice', 'chips'].includes(kind)) ? (
        <div className="view-settings">
          {lacking.length ? <Verdict tone="warn">Виду «{VIEWS[kind].label}» не хватает: {lacking.join(', ')}. Пока не задано, на листе вместо него «—».</Verdict> : null}
          {takesBounds(kind, column) ? (
            <div className="row">
              <Field label={kind === 'slider' || kind === 'ring' || kind === 'choice' ? 'Низ' : 'Не ниже'}>
                <BoundField value={column.min} onChange={next => edit(draft => { if (next === null) delete draft.min; else draft.min = next; })} />
              </Field>
              <Field label={kind === 'stepper' ? 'Не выше' : kind === 'ring' || kind === 'choice' ? 'Верх' : 'Верх — сколько всего'}>
                <BoundField value={column.max} placeholder="число или формула: 3, @макс"
                  onChange={next => edit(draft => { if (next === null) delete draft.max; else draft.max = next; })} />
              </Field>
            </div>
          ) : null}
          {takesBounds(kind, column) && column.max === undefined && kind !== 'stepper' ? (
            <Button size="sm" variant="ghost" onClick={addTop}>+ колонка для верха</Button>
          ) : null}
          {TAKES_STEP.includes(kind) ? (
            <Field label="Шаг">
              <NumInput value={column.control?.step ?? 1} least={0}
                onCommit={n => setControl({ step: n > 0 && n !== 1 ? n : undefined })} />
            </Field>
          ) : null}
          {kind === 'bar' ? (
            <Field label="Красная, когда">
              <Segmented value={column.control?.worse ?? 'low'}
                options={[{ key: 'low', label: 'мало' }, { key: 'high', label: 'много' }]}
                onChange={next => setControl({ worse: next === 'high' ? 'high' : undefined })} />
            </Field>
          ) : null}
          {kind === 'toggle' || ((kind === 'ring' || kind === 'choice') && column.kind === 'boolean') ? (
            <div className="row">
              <Field label="Подпись «да»">
                <Input value={column.control?.yes ?? ''} placeholder="да" onChange={text => setControl({ yes: text.trim() || undefined })} />
              </Field>
              <Field label="Подпись «нет»">
                <Input value={column.control?.no ?? ''} placeholder="нет" onChange={text => setControl({ no: text.trim() || undefined })} />
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
