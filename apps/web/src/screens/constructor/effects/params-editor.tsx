import { useState } from 'react';
import { kindsFor } from '@vtt/engine/words/kinds';
import { choiceTables } from '@vtt/engine/model/tables';
import { ASKABLE } from '@vtt/engine/model/asks';
import { freeId } from '../../../store/world.ts';
import { Card, CardHead, Input, Select, Button } from '../../../ui/primitives.tsx';
import { SheetGrid } from '../../../ui/sheet-grid.tsx';
import type { GridColumn } from '../../../ui/sheet-grid.tsx';
import type { Effect, Param, System, ValueKind } from '@vtt/schema';

const PARAM_KINDS = kindsFor('param');

const ASK_OPTIONS = [
  ['', 'нет'],
  ['actor', 'спросить игрока'],
  ['gm', 'спросить ведущего'],
] as const;

const COLUMNS: GridColumn[] = [
  { key: 'label', label: 'Название', width: 170 },
  { key: 'kind', label: 'Тип', width: 120 },
  { key: 'from', label: 'Из таблицы', width: 140, hint: 'для типа «из таблицы» — из какой' },
  { key: 'ask', label: 'Если не передали', width: 160, hint: 'нет — обязан передать тот, кто вызывает; иначе спросят за столом' },
  { key: 'hint', label: 'Подсказка за столом', width: 170, hint: 'что увидит спрошенный' },
  { key: 'main', label: 'Правят сопротивления', width: 180, hint: 'это число меняют сопротивления и уязвимости цели: урон, лечение. Одно на эффект' },
  { key: 'required', label: 'Обязателен', width: 100 },
];

const RARE = ['hint', 'main', 'required'];

type Loose = Param & { role?: string; optional?: boolean };

export function ParamsEditor({ effect, system, onEdit }: {
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
  const tables = choiceTables(system).map(([key, list]) => [key, list.label || key] as const);
  const [more, setMore] = useState(false);
  const full = more || params.some(p => p.ask?.hint || p.role === 'amount' || p.optional);
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
              <Input key={`${param.key}:label`} value={param.label ?? ''} onChange={next => change(param.key, t => { t.label = next; })} />,
              <Select
                key={`${param.key}:kind`}
                value={kind}
                options={PARAM_KINDS}
                onChange={next => change(param.key, t => {
                  t.kind = next as ValueKind;
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
              ) : <span key={`${param.key}:from`} className="faint">—</span>,
              askable ? (
                <Select
                  key={`${param.key}:ask`}
                  value={param.ask?.by ?? (param.ask ? 'actor' : '')}
                  options={ASK_OPTIONS}
                  onChange={next => change(param.key, t => {
                    if (next) t.ask = { ...(t.ask ?? {}), by: next };
                    else delete t.ask;
                  })}
                />
              ) : <span key={`${param.key}:ask`} className="faint">—</span>,
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
              <input
                key={`${param.key}:required`} type="checkbox" className="sheet-grid__check"
                aria-label={`«${param.label ?? param.key}» обязателен`}
                checked={!param.optional}
                onChange={e => change(param.key, t => { if (e.target.checked) delete t.optional; else t.optional = true; })}
              />,
              <Button key={`${param.key}:drop`} size="sm" variant="ghost" title="убрать вход" onClick={() => onEdit(draft => {
                draft.params = (draft.params ?? []).filter(p => p.key !== param.key);
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
