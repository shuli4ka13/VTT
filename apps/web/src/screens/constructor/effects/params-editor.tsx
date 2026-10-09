import { useState } from 'react';
import { kindsFor } from '@vtt/engine/words/kinds';
import { choiceTables } from '@vtt/engine/model/tables';
import { ASKABLE } from '@vtt/engine/model/asks';
import { freeId, useWorld } from '../../../store/world.ts';
import { followKey, paramUsed, keyOf, referenced } from '../keys.ts';
import { KeyField } from '../../../ui/key-field.tsx';
import { BoundField } from '../bound-field.tsx';
import { Card, CardHead, Input, Select, Button } from '../../../ui/primitives.tsx';
import { SheetGrid } from '../../../ui/sheet-grid.tsx';
import { useDragList } from '../../../ui/drag-list.ts';
import type { GridColumn } from '../../../ui/sheet-grid.tsx';
import type { Effect, Param, System, ValueKind } from '@vtt/schema';

const SHEETS = 'sheet+many';
const PARAM_KINDS = [...kindsFor('param'), [SHEETS, 'список листов'] as const];

type Mode = 'must' | 'empty' | 'value' | 'actor' | 'gm';

const modeOf = (param: { ask?: { by?: string }; default?: unknown; optional?: boolean }): Mode =>
  param.ask ? (param.ask.by === 'gm' ? 'gm' : 'actor') : param.default !== undefined ? 'value' : param.optional ? 'empty' : 'must';

const modesFor = (kind: string, askable: boolean): (readonly [Mode, string])[] => [
  ['must', 'обязательно'],
  ['empty', 'можно пусто'],
  ...(kind === 'sheet' || kind === 'field' ? [] : [['value', 'по умолчанию'] as const]),
  ...(askable ? [['actor', 'спросить игрока'] as const, ['gm', 'спросить ведущего'] as const] : []),
];

const COLUMNS: GridColumn[] = [
  { key: 'label', label: 'Название', width: 170 },
  { key: 'kind', label: 'Тип', width: 140 },
  { key: 'from', label: 'Уточнение', width: 170, hint: 'у «из таблицы» — какая таблица; у списка листов — как зовётся каждый лист в шагах после «Для каждого из»' },
  { key: 'ask', label: 'Если не передали', width: 260, hint: 'как у аргумента функции: «обязательно» — без него проверка системы не пустит, движок остановится; «по умолчанию» — берётся заданное значение; «можно пусто» — вход необязателен; или спросить за столом' },
  { key: 'hint', label: 'Подсказка за столом', width: 170, hint: 'что увидит спрошенный' },
  { key: 'main', label: 'Правят сопротивления', width: 180, hint: 'это число меняют сопротивления и уязвимости цели: урон, лечение. Одно на эффект' },
  { key: 'bounds', label: 'Границы', width: 170, hint: 'для числа: не ниже и не выше — числом или формулой, например @удача' },
  { key: 'key', label: 'Имя в формулах', width: 150, hint: 'как вход зовётся в формулах: @имя. Идёт за названием, пока на него никто не ссылается' },
];

const RARE = ['hint', 'main', 'bounds', 'key'];

type Loose = Param & { role?: string; optional?: boolean };

export function ParamsEditor({ id, effect, system, onEdit }: {
  id: string;
  effect: Effect;
  system: System;
  onEdit: (change: (draft: Effect) => void) => void;
}) {
  const params = (effect.params ?? []) as Loose[];
  const change = (key: string, fn: (target: Loose) => void) => onEdit(draft => {
    const target = draft.params?.find(p => p.key === key) as Loose | undefined;
    if (target) fn(target);
  });
  const addParam = () => onEdit(draft => {
    draft.params ??= [];
    draft.params.push({ key: freeId(draft.params.map(p => p.key), 'вход'), label: 'Новый вход', kind: 'number' });
  });
  const setMain = (key: string, on: boolean) => onEdit(draft => {
    for (const p of (draft.params ?? []) as Loose[]) {
      if (p.key === key && on) p.role = 'amount';
      else if (p.key === key || on) delete p.role;
    }
  });
  const used = (key: string) => { const st = useWorld.getState(); return paramUsed(st.system, st.compendium, id, key); };
  const keys = params.map(p => p.key);
  const drag = useDragList((from, to, after) => onEdit(draft => {
    const list = draft.params ?? [];
    const moving = list.find(p => p.key === from);
    if (!moving) return;
    const rest = list.filter(p => p !== moving);
    const at = rest.findIndex(p => p.key === to);
    if (at < 0) return;
    rest.splice(at + (after ? 1 : 0), 0, moving);
    draft.params = rest;
  }));
  const relabel = (param: Loose, next: string) => onEdit(draft => {
    const target = draft.params?.find(p => p.key === param.key) as Loose | undefined;
    if (!target) return;
    target.key = followKey({ used: used(target.key), key: target.key, base: 'вход', before: target.label ?? '', after: next, taken: keys });
    target.label = next;
  });
  const rekey = (param: Loose, next: string) => change(param.key, t => { t.key = next; });
  const tables = choiceTables(system).map(([key, list]) => [key, list.label || key] as const);
  const rare = params.some(p => p.ask?.hint || p.role === 'amount' || p.min !== undefined || p.max !== undefined);
  const [more, setMore] = useState(rare);
  const full = more || rare;
  const columns = full ? COLUMNS : COLUMNS.filter(c => !RARE.includes(c.key));

  return (
    <Card>
      <CardHead title="Что приходит" {...(params.length ? { sub: 'То, что у каждого вызова своё. Поля листов сюда не нужны — они пишутся прямо в шагах.' } : {})} />
      {params.length === 0 ? (
        <div className="inline inline--tight">
          <span className="faint">Ничего — эффект берёт всё с листов.</span>
          <Button size="sm" onClick={addParam}>+ вход</Button>
        </div>
      ) : (
        <SheetGrid id={full ? 'params' : 'params-short'} columns={columns}>
          {params.map(param => {
            const kind = String(param.kind ?? 'number');
            const askable = (ASKABLE as readonly string[]).includes(kind);
            const cells = [
              <span key={`${param.key}:label`} className={`sheet-grid__line drag-item${drag.mark(param.key)}`} {...(params.length > 1 ? drag.props(param.key) : {})}>
                {params.length > 1 ? <span className="drag-grip" aria-hidden title="перетащите, чтобы поменять порядок">⋮⋮</span> : null}
                <Input value={param.label ?? ''} onChange={next => relabel(param, next)} />
              </span>,
              <Select
                key={`${param.key}:kind`}
                value={kind === 'sheet' && param.many ? SHEETS : kind}
                options={PARAM_KINDS}
                onChange={next => change(param.key, t => {
                  t.kind = (next === SHEETS ? 'sheet' : next) as ValueKind;
                  if (next === SHEETS) { t.many = true; t.item ??= { key: freeId(keys, 'каждый'), label: 'Каждый' }; } else { delete t.many; delete t.item; }
                  if (next !== 'number') delete t.role;
                  if (next !== 'choice') delete t.from;
                  if (!(ASKABLE as readonly string[]).includes(next)) delete t.ask;
                })}
              />,
              kind === 'choice' ? (
                <Select
                  key={`${param.key}:from`}
                  value={String(param.from ?? '')}
                  options={[['', '— какая —'], ...tables] as never}
                  onChange={next => change(param.key, t => { if (next) t.from = next; else delete t.from; })}
                />
              ) : kind === 'sheet' && param.many ? (
                <span key={`${param.key}:from`} className="sheet-grid__line" title="как зовётся один лист из списка в шагах после «Для каждого из»">
                  <span className="faint">каждый:</span>
                  <Input value={param.item?.label ?? param.item?.key ?? ''} placeholder="Цель"
                    onChange={next => change(param.key, t => {
                      const label = next.trim();
                      if (!label) { delete t.item; return; }
                      const st = useWorld.getState();
                      const before = t.item?.key ?? '';
                      const used = Boolean(before) && referenced({ s: st.system, c: st.compendium }, before, { steps: effect.steps ?? [], cost: effect.cost ?? [] });
                      const key = followKey({ used, key: before || keyOf(label), base: 'каждый', before: t.item?.label ?? '', after: label, taken: keys.filter(k => k !== before) });
                      t.item = { key, label };
                    })} />
                </span>
              ) : <span key={`${param.key}:from`} className="faint">—</span>,
              <span key={`${param.key}:ask`} className="sheet-grid__line">
                <Select<string>
                  label={`«${param.label ?? param.key}» — если не передали`}
                  value={modeOf(param)}
                  options={modesFor(kind, askable)}
                  onChange={next => change(param.key, t => {
                    delete t.ask; delete t.default; delete t.optional;
                    if (next === 'empty') t.optional = true;
                    if (next === 'value') t.default = (kind === 'number' ? 0 : kind === 'boolean' ? false : '') as never;
                    if (next === 'actor' || next === 'gm') t.ask = { by: next };
                  })}
                />
                {modeOf(param) === 'value' ? (
                  <DefaultCell param={param} system={system}
                    onChange={next => change(param.key, t => { t.default = (next ?? '') as never; })} />
                ) : null}
              </span>,
              param.ask ? (
                <Input
                  key={`${param.key}:hint`}
                  value={param.ask.hint ?? ''}
                  placeholder="что подсказать"
                  onChange={next => change(param.key, t => {
                    if (!t.ask) return;
                    if (next) t.ask.hint = next; else delete t.ask.hint;
                  })}
                />
              ) : <span key={`${param.key}:hint`} className="faint">—</span>,
              kind === 'number' ? (
                <input
                  key={`${param.key}:main`} type="checkbox" className="sheet-grid__check"
                  aria-label={`«${param.label ?? param.key}» правят сопротивления`}
                  checked={param.role === 'amount'}
                  onChange={e => setMain(param.key, e.target.checked)}
                />
              ) : <span key={`${param.key}:main`} className="faint">—</span>,
              kind === 'number' ? (
                <span key={`${param.key}:bounds`} className="sheet-grid__line">
                  <BoundField value={param.min} placeholder="не ниже" onChange={next => change(param.key, t => { if (next === null) delete t.min; else t.min = next; })} />
                  <BoundField value={param.max} placeholder="не выше" onChange={next => change(param.key, t => { if (next === null) delete t.max; else t.max = next; })} />
                </span>
              ) : <span key={`${param.key}:bounds`} className="faint">—</span>,
              <KeyField key={`${param.key}:key`} value={param.key} locked={used(param.key)} taken={keys} onChange={next => rekey(param, next)} />,
              <Button key={`${param.key}:drop`} size="sm" variant="ghost" title="убрать вход" onClick={() => onEdit(draft => {
                draft.params = (draft.params ?? []).filter(p => p.key !== param.key);
                if (!draft.params.length) delete draft.params;
              })}>×</Button>,
            ];
            return full ? cells : cells.filter((_, at) => at >= COLUMNS.length || !RARE.includes(COLUMNS[at]!.key));
          })}
        </SheetGrid>
      )}

      {params.length ? (
        <div className="inline inline--tight">
          <Button size="sm" onClick={addParam}>+ вход</Button>
          {full && !more ? null : (
            <Button size="sm" variant="ghost" onClick={() => setMore(!more)}>{more ? 'меньше' : 'ещё'}</Button>
          )}
        </div>
      ) : null}
    </Card>
  );
}

function DefaultCell({ param, system, onChange }: { param: Loose; system: System; onChange: (next: string | number | boolean | undefined) => void }) {
  const kind = String(param.kind ?? 'number');
  const value = param.default;
  if (kind === 'sheet' || kind === 'field') return <span className="faint">—</span>;
  if (kind === 'effect') {
    return (
      <Select<string> label={`«${param.label ?? param.key}» — если не передали`} value={typeof value === 'string' ? value : ''}
        options={[['', 'ничего'], ...Object.entries(system.effects).map(([id, effect]) => [id, effect.label || id] as const)]}
        onChange={next => onChange(next || undefined)} />
    );
  }
  if (kind === 'boolean') {
    return (
      <Select<string> label={`«${param.label ?? param.key}» — если не передали`} value={value === true ? 'да' : value === false ? 'нет' : ''}
        options={[['', '—'], ['да', 'да'], ['нет', 'нет']]}
        onChange={next => onChange(next === 'да' ? true : next === 'нет' ? false : undefined)} />
    );
  }
  return (
    <Input value={value === undefined ? '' : String(value)} placeholder="—"
      onChange={text => {
        const trimmed = text.trim();
        if (!trimmed) { onChange(undefined); return; }
        const number = Number(trimmed.replace(',', '.'));
        onChange(kind === 'number' && Number.isFinite(number) ? number : trimmed);
      }} />
  );
}
