import { formulaWords } from '../../../ui/formula-words.ts';
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
import { originsOf, type Origin } from '@vtt/engine/model/origins';
import { StagesEditor } from '../stages-editor.tsx';

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

const kindWords = (param: Loose, system: System): string => {
  const kind = String(param.kind ?? 'number');
  if (kind === 'sheet') return param.many ? `несколько листов, каждый — «${param.item?.label ?? param.item?.key ?? 'Каждый'}»` : 'лист';
  if (kind === 'choice') {
    const table = param.from ? system.tables?.[param.from] : undefined;
    return table || param.from ? `из «${table?.label || param.from}»` : 'из таблицы';
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
          <span className="faint">Ничего — эффект берёт всё с листов.</span>
          <Button size="sm" onClick={addParam}>+ ещё одно</Button>
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
          after={param => <Origins effectId={id} param={param} system={system} />}
          head={['Вход', 'Что это', 'Откуда берётся']}
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
  const rare = Boolean(param.ask?.hint) || Boolean(param.role) || param.min !== undefined || param.max !== undefined;
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
              if (next !== 'choice') delete t.from;
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
          {kind === 'sheet' && !param.many ? (
            <Field label="Приходит сам" hint="если вызов не передал лист явно: текущая цель вызывающего или тот, кто действует">
              <Select
                value={param.role === 'target' || param.role === 'actor' ? param.role : ''}
                options={[['', 'нет — передают явно'], ['target', 'текущая цель'], ['actor', 'кто действует']] as const}
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

const SOURCE_WORDS: Record<string, string> = {
  actor: 'кто нажал', targets: 'выбранные цели', cell: 'заполняют в книге', formula: 'считается у типа',
  call: 'от эффекта', self: 'приходит само', ask: 'спросить за столом',
};

function sourceDetail(system: System, kind: string, many: readonly Origin[]): string {
  if (kind === 'cell') return many.map(origin => `${origin.place}: поле «${origin.field}»`).join('\n');
  if (kind === 'formula') return many.map(origin => `${origin.place}${origin.button ? ` («${origin.button}»)` : ''}: ${origin.formula ? formulaWords(system, origin.formula) : '…'}`).join('\n');
  return many.map(origin => origin.text).join('\n');
}

function Origins({ effectId, param, system }: { effectId: string; param: Param; system: System }) {
  const compendium = useWorld(s => s.compendium);
  const pick = useWorld(s => s.pick);
  const list = cachedOrigins(system, compendium, effectId, param).filter(origin => origin.kind !== 'default');
  if (!list.length) {
    const quiet = param.optional || param.default !== undefined;
    return (
      <span className="sources">
        <span className={`source ${quiet ? 'source--self' : 'source--none'}`}
          title={quiet ? 'Никто не передаёт — берётся умолчание входа' : 'Никто не передаёт этот вход: добавьте поле с таким же названием в тип вещи или передайте его из вызывающего эффекта'}>
          {quiet ? 'по умолчанию' : 'никто не передаёт'}
        </span>
      </span>
    );
  }
  const kinds = [...new Set(list.map(origin => origin.kind))];
  const go = (many: readonly Origin[]) => {
    const kind = many.find(origin => origin.table)?.table;
    if (kind) return () => pick({ activeTab: 'records', activeRecordKind: kind });
    const effect = many.find(origin => origin.effect)?.effect;
    return effect ? () => pick({ activeTab: 'effects', activeEffectId: effect, activeStepIndex: null }) : undefined;
  };
  return (
    <span className="sources">
      {kinds.map(kind => {
        const many = list.filter(origin => origin.kind === kind);
        const open = kind === 'cell' || kind === 'formula' || kind === 'call' ? go(many) : undefined;
        const title = `${sourceDetail(system, kind, many)}${open ? '\nщелчок — открыть' : ''}`;
        return open
          ? <button key={kind} type="button" className={`source source--${kind} source--link`} title={title} onClick={open}>{SOURCE_WORDS[kind] ?? kind}</button>
          : <span key={kind} className={`source source--${kind}`} title={title}>{SOURCE_WORDS[kind] ?? kind}</span>;
      })}
    </span>
  );
}

const ORIGINS = new WeakMap<System, { compendium: unknown; at: Map<string, Origin[]> }>();

function cachedOrigins(system: System, compendium: Parameters<typeof originsOf>[1], effectId: string, param: Param): Origin[] {
  let hit = ORIGINS.get(system);
  if (!hit || hit.compendium !== compendium) { hit = { compendium, at: new Map() }; ORIGINS.set(system, hit); }
  const key = `${effectId}|${param.key}|${param.role ?? ''}|${String(param.default ?? '')}`;
  let out = hit.at.get(key);
  if (!out) { out = originsOf(system, compendium, effectId, param); hit.at.set(key, out); }
  return out;
}
