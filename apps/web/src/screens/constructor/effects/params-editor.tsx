import { useState } from 'react';
import { kindsFor, kindWord } from '@vtt/engine/words/kinds';
import { choiceTables } from '@vtt/engine/model/tables';
import { ASKABLE } from '@vtt/engine/model/asks';
import { freeId, useWorld } from '../../../store/world.ts';
import { followKey, paramUsed, keyOf, referenced } from '../keys.ts';
import { KeyField } from '../../../ui/key-field.tsx';
import { BoundField } from '../bound-field.tsx';
import { Card, CardHead, Field, Input, Select, Button, LabelInput } from '../../../ui/primitives.tsx';
import { ColumnList } from './column-list.tsx';
import type { Effect, Param, System, ValueKind, Stage } from '@vtt/schema';
import { StagesEditor } from '../stages-editor.tsx';
import { ConditionField } from '../condition-field.tsx';

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

type Loose = Param & { role?: string; optional?: boolean };

export const kindWords = (param: Loose, system: System): string => {
  const kind = String(param.kind ?? 'number');
  if (kind === 'sheet') return param.many ? `несколько листов, каждый — «${param.item?.label ?? param.item?.key ?? 'Каждый'}»` : 'лист';
  if (kind === 'choice') {
    const table = param.from ? system.tables?.[param.from] : undefined;
    const row = param.many ? 'строки таблицы' : 'строка таблицы';
    return table || param.from ? `${row} «${table?.label || param.from}»` : row;
  }
  return kindWord(kind);
};

const defaultWords = (param: Loose, system: System): string => {
  const value = param.default;
  if (value === true) return 'да';
  if (value === false) return 'нет';
  if (typeof value === 'string' && String(param.kind) === 'effect') return system.effects?.[value]?.label || value || 'ничего';
  return value === undefined || value === '' ? '—' : String(value);
};

const askWords = (param: Loose, system: System): string => {
  const mode = modeOf(param);
  if (mode === 'empty') return ', можно не указывать';
  if (mode === 'value') return `, если не сказано — ${defaultWords(param, system)}`;
  if (mode === 'actor') return ', если не сказано — спросить игрока';
  if (mode === 'gm') return ', если не сказано — спросить ведущего';
  return '';
};

export function ParamsEditor({ id, effect, system, onEdit }: {
  id: string;
  effect: Effect;
  system: System;
  onEdit: (change: (draft: Effect) => void) => void;
}) {
  const params = (effect.params ?? []) as Loose[];
  const [opened, setOpened] = useState<string[]>([]);
  const change = (key: string, fn: (target: Loose) => void) => onEdit(draft => {
    const target = draft.params?.find(p => p.key === key) as Loose | undefined;
    if (target) fn(target);
  });
  const addParam = () => {
    const key = freeId(params.map(p => p.key), 'вход');
    setOpened(now => [...now, key]);
    onEdit(draft => {
      draft.params ??= [];
      draft.params.push({ key, label: 'Новый вход', kind: 'number' });
    });
  };
  const setMain = (key: string, on: boolean) => onEdit(draft => {
    for (const p of (draft.params ?? []) as Loose[]) {
      if (p.key === key && on) p.role = 'amount';
      else if (p.role === 'amount' && (p.key === key || on)) { delete p.role; delete (p as { stages?: unknown }).stages; }
    }
  });
  const used = (key: string) => { const st = useWorld.getState(); return paramUsed(st.system, st.compendium, id, key); };
  const keys = params.map(p => p.key);
  const move = (from: string, to: string, after: boolean) => onEdit(draft => {
    const list = draft.params ?? [];
    const moving = list.find(p => p.key === from);
    if (!moving) return;
    const rest = list.filter(p => p !== moving);
    const at = rest.findIndex(p => p.key === to);
    if (at < 0) return;
    rest.splice(at + (after ? 1 : 0), 0, moving);
    draft.params = rest;
  });
  const moveOpen = (from: string, to: string) => setOpened(now => now.map(k => (k === from ? to : k)));
  const relabel = (param: Loose, next: string) => {
    const key = followKey({ used: used(param.key), key: param.key, base: 'вход', before: param.label ?? '', after: next, taken: keys });
    if (key !== param.key) moveOpen(param.key, key);
    onEdit(draft => {
      const target = draft.params?.find(p => p.key === param.key) as Loose | undefined;
      if (!target) return;
      target.key = key;
      target.label = next;
    });
  };
  const rekey = (param: Loose, next: string) => {
    moveOpen(param.key, next);
    change(param.key, t => { t.key = next; });
  };
  const toggle = (key: string) => setOpened(now => (now.includes(key) ? now.filter(k => k !== key) : [...now, key]));
  const drop = (key: string) => onEdit(draft => {
    draft.params = (draft.params ?? []).filter(p => p.key !== key);
    if (!draft.params.length) delete draft.params;
  });

  return (
    <Card>
      <CardHead title="Что приходит" />
      {params.length === 0 ? (
        <div className="inline inline--tight">
          <span className="faint">Входов нет — эффект берёт всё с листов.</span>
          <Button size="sm" onClick={addParam}>+ вход</Button>
        </div>
      ) : (
        <ColumnList
          items={params}
          isOpen={key => opened.includes(key)}
          onToggle={toggle}
          onDrop={drop}
          onMove={move}
          dropTitle="убрать вход"
          summary={param => <>{kindWords(param, system)}{askWords(param, system)}</>}
          head={['Вход', 'Что это']}
          form={param => (
            <ParamForm param={param} keys={keys} system={system} effect={effect}
              locked={used(param.key)} change={fn => change(param.key, fn)}
              onLabel={next => relabel(param, next)} onKey={next => rekey(param, next)} onMain={on => setMain(param.key, on)} />
          )}
        />
      )}
      {params.length ? (
        <div className="inline inline--tight">
          <Button size="sm" onClick={addParam}>+ ещё одно</Button>
        </div>
      ) : null}
    </Card>
  );
}

function ParamForm({ param, keys, system, effect, locked, change, onLabel, onKey, onMain }: {
  param: Loose; keys: string[]; system: System; effect: Effect; locked: boolean;
  change: (fn: (target: Loose) => void) => void;
  onLabel: (next: string) => void; onKey: (next: string) => void; onMain: (on: boolean) => void;
}) {
  const kind = String(param.kind ?? 'number');
  const askable = (ASKABLE as readonly string[]).includes(kind);
  const tables = choiceTables(system).map(([key, list]) => [key, list.label || key] as const);
  const rare = Boolean(param.ask?.hint) || Boolean(param.ask?.if) || (kind === 'sheet' && Boolean(param.from)) || Boolean(param.role) || param.min !== undefined || param.max !== undefined;
  const [more, setMore] = useState(rare);
  const full = more || rare;
  return (
    <div className="param-form">
      <div className="param-form__row">
        <Field label="Название"><LabelInput value={param.label ?? ''} onCommit={onLabel} /></Field>
        <Field label="Вид">
          <Select
            value={kind === 'sheet' && param.many ? SHEETS : kind}
            options={PARAM_KINDS}
            onChange={next => change(t => {
              t.kind = (next === SHEETS ? 'sheet' : next) as ValueKind;
              if (next === SHEETS) { t.many = true; t.item ??= { key: freeId(keys, 'каждый'), label: 'Каждый' }; } else { delete t.many; delete t.item; }
              if (next !== 'number') { if (t.role === 'amount') delete t.role; delete (t as { stages?: unknown }).stages; }
              if (next !== 'sheet' && (t.role === 'target' || t.role === 'actor')) delete t.role;
              if (next !== 'choice' && next !== 'sheet' && next !== SHEETS) delete t.from;
              if (!(ASKABLE as readonly string[]).includes(next)) delete t.ask;
            })}
          />
        </Field>
        {kind === 'choice' ? (
          <Field label="Таблица">
            <Select
              value={String(param.from ?? '')}
              options={[['', '— какая —'], ...tables] as never}
              onChange={next => change(t => { if (next) t.from = next; else delete t.from; })}
            />
          </Field>
        ) : null}
        {kind === 'sheet' && param.many ? (
          <Field label="Каждый" hint="как зовётся один лист из списка в шагах после «Для каждого из»">
            <Input value={param.item?.label ?? param.item?.key ?? ''} placeholder="Цель"
              onChange={next => change(t => {
                const label = next.trim();
                if (!label) { delete t.item; return; }
                const st = useWorld.getState();
                const before = t.item?.key ?? '';
                const inUse = Boolean(before) && referenced({ s: st.system, c: st.compendium }, before, { steps: effect.steps ?? [], cost: effect.cost ?? [] });
                const key = followKey({ used: inUse, key: before || keyOf(label), base: 'каждый', before: t.item?.label ?? '', after: label, taken: keys.filter(k => k !== before) });
                t.item = { key, label };
              })} />
          </Field>
        ) : null}
        <Field label="Если не передали">
          <span className="param-form__pair" title="«обязательно» — без него проверка системы не пустит; «по умолчанию» — берётся заданное значение; «можно пусто» — вход необязателен; или спросить за столом">
            <Select<string>
              label={`«${param.label ?? param.key}» — если не передали`}
              value={modeOf(param)}
              options={modesFor(kind, askable)}
              onChange={next => change(t => {
                delete t.ask; delete t.default; delete t.optional;
                if (next === 'empty') t.optional = true;
                if (next === 'value') t.default = (kind === 'number' ? 0 : kind === 'boolean' ? false : '') as never;
                if (next === 'actor' || next === 'gm') t.ask = { by: next };
              })}
            />
            {modeOf(param) === 'value' ? (
              <DefaultCell param={param} system={system}
                onChange={next => change(t => { t.default = (next ?? '') as never; })} />
            ) : null}
          </span>
        </Field>
      </div>
      {full ? (
        <div className="param-form__row">
          {param.ask ? (
            <Field label="Подсказка за столом" hint="что увидит спрошенный">
              <Input
                value={param.ask.hint ?? ''}
                placeholder="что подсказать"
                onChange={next => change(t => {
                  if (!t.ask) return;
                  if (next) t.ask.hint = next; else delete t.ask.hint;
                })}
              />
            </Field>
          ) : null}
          {param.ask ? (
            <ConditionField
              value={param.ask.if?.expr}
              onChange={expr => change(t => {
                if (!t.ask) return;
                if (expr) t.ask.if = { expr }; else delete t.ask.if;
              })}
              system={system}
              title="Спрашивать, только если"
              where={`вход «${param.label ?? param.key}» · спрашивать`}
              quick={(effect.params ?? []).filter(one => one.key !== param.key && one.kind === 'boolean').map(one => ({ ref: one.key, label: one.label ?? one.key, kind: 'boolean' as const }))}
              placeholder="например: @сложность > 0"
            />
          ) : null}
          {kind === 'sheet' && Object.keys(system.sheets ?? {}).length ? (
            <Field label="Только лист типа" hint="пусто — подойдёт любой лист">
              <Select
                value={String(param.from ?? '')}
                options={[['', '— любой —'], ...Object.entries(system.sheets ?? {}).map(([key, one]) => [key, (one as { label?: string }).label || key] as const)] as never}
                onChange={next => change(t => { if (next) t.from = next; else delete t.from; })}
              />
            </Field>
          ) : null}
          {kind === 'sheet' && !param.many ? (
            <Field label="Приходит сам" hint="когда другой эффект вызвал этот и лист не передал. Пример: «Удар» в «Для каждого из» вызывает «Урон» — «Урон» сам получит ту цель, по которой сейчас идёт «Удар»">
              <Select
                value={param.role === 'target' || param.role === 'actor' ? param.role : ''}
                options={[['', 'нет — пусть передают'], ['target', 'цель, по которой идёт вызвавший'], ['actor', 'кто нажал кнопку']] as const}
                onChange={next => change(t => { if (next) t.role = next as 'target' | 'actor'; else delete t.role; })}
              />
            </Field>
          ) : null}
          {kind === 'number' ? (
            <>
              <Field label="Величина" hint="это число могут править висящие эффекты — по этапам, которые вы объявите. Одна на эффект">
                <input
                  type="checkbox" className="sheet-grid__check"
                  aria-label={`«${param.label ?? param.key}» — величина`}
                  checked={param.role === 'amount'}
                  onChange={e => onMain(e.target.checked)}
                />
              </Field>
              {param.role === 'amount' ? (
                <StagesEditor
                  stages={(param as { stages?: Stage[] }).stages}
                  onChange={next => change(t => { const x = t as { stages?: Stage[] }; if (next) x.stages = next; else delete x.stages; })}
                />
              ) : null}
              <Field label="Границы" hint="не ниже и не выше — числом или формулой, например @удача">
                <span className="param-form__pair">
                  <BoundField value={param.min} placeholder="не ниже" onChange={next => change(t => { if (next === null) delete t.min; else t.min = next; })} />
                  <BoundField value={param.max} placeholder="не выше" onChange={next => change(t => { if (next === null) delete t.max; else t.max = next; })} />
                </span>
              </Field>
            </>
          ) : null}
          <Field label="Имя в формулах" hint="как вход зовётся в формулах: @имя. Идёт за названием, пока на него никто не ссылается">
            <KeyField value={param.key} locked={locked} taken={keys} onChange={onKey} />
          </Field>
        </div>
      ) : null}
      {full && !more ? null : (
        <div className="inline inline--tight">
          <Button size="sm" variant="ghost" onClick={() => setMore(!more)}>{more ? 'меньше' : 'ещё'}</Button>
        </div>
      )}
    </div>
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
