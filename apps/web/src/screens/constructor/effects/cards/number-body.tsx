import { tagWords } from '@vtt/engine/engine/roll-tags';
import { parseRollFormula, formatRollFormula } from '../../roll-formula.ts';
import { RollerPick, RollTags, setRoller } from './roll-line.tsx';
import { sheetChoices } from '../../slots.tsx';
import { useMemo, useState } from 'react';
import type { Step, ValueKind } from '@vtt/schema';
import { Button, Input, Select } from '../../../../ui/primitives.tsx';
import { Extras } from './extras.tsx';
import { stepNameTrouble, keyOf } from '../../keys.ts';
import { FormulaField } from '../../../../ui/formula-field.tsx';
import { asOneFormula, findRoll } from '@vtt/engine/model/amounts';
import { namesOf } from '../../slots.tsx';
import { inputBadges } from '../../slots.tsx';
import type { SlotContext } from '../../slots.tsx';
import type { EditFn } from '../words.ts';
import { hasField, isSingle } from '@vtt/engine/model/sheet-columns';
import type { Effect, System } from '@vtt/schema';

type Loose = Record<string, unknown>;

const loose = (draft: unknown): Loose => draft as Loose;

const COMPLEX = 'у сложной формулы кости ничьи — сначала выберите «просто кости»';

const textOf = (step: Loose): string =>
  [step.fixed, step.bonus]
    .map(part => (part as { expr?: unknown } | undefined)?.expr)
    .filter((part): part is string => typeof part === 'string' && part.trim() !== '')
    .join(' + ');

const looksLikeRoll = (text: string): boolean => {
  const found = findRoll(text);
  if (!found) return text.includes('кинуть(');
  return found.before.trim() === '' && /^\s*([+-]|$)/.test(found.after);
};

const exprOf = (value: unknown): string => String((value as { expr?: unknown } | undefined)?.expr ?? '');

const HEAD = /^\s*(@[\p{L}\p{N}_]+)/u;

const headOf = (address: string): string => HEAD.exec(address)?.[1] ?? '';

const TAIL = /^\s*@[\p{L}\p{N}_]+\.(.+?)\s*$/u;

const tailOf = (address: string): string => TAIL.exec(address)?.[1] ?? '';

const OWN = '\u0000';

interface Rollable { tail: string; label: string; group: string; rule: string }

export function rollableFields(system: System, effect: Effect): Rollable[] {
  const inputs: Rollable[] = [];
  const singles: Rollable[] = [];
  const rows: Rollable[] = [];
  for (const [key, roll] of Object.entries(system.rolls ?? {})) {
    const rule = roll.label || key;
    for (const one of roll.fields) {
      const table = system.tables?.[one.table];
      if (!table) continue;
      const name = table.columns?.find(column => column.key === one.column)?.label || one.column;
      if (isSingle(table)) { singles.push({ tail: one.column, label: name, group: 'Поля листа', rule }); continue; }
      for (const param of effect.params ?? []) {
        if (param.kind === 'choice' && param.from === one.table) inputs.push({ tail: `${param.key}.${one.column}`, label: `${param.label || param.key} → ${name}`, group: 'По входу эффекта', rule });
      }
      for (const row of table.rows ?? []) rows.push({ tail: `${one.table}.${row.value}.${one.column}`, label: `${row.label || row.value} → ${name}`, group: table.label || one.table, rule });
    }
  }
  return [...inputs, ...singles, ...rows];
}

const toField = (it: Loose, head: string): void => {
  delete it.die;
  delete it.count;
  delete it.fixed;
  delete it.bonus;
  delete it.by;
  it.field = { expr: head };
};

const toDice = (it: Loose): void => {
  const head = headOf(exprOf(it.field));
  delete it.field;
  delete it.shift;
  if (head) it.by = { expr: head };
};

const asRoll = (it: Loose, parsed: { die?: unknown; count?: unknown; bonus?: unknown }): void => {
  delete it.fixed;
  it.die = parsed.die;
  if (parsed.count) it.count = parsed.count; else delete it.count;
  if (parsed.bonus) it.bonus = parsed.bonus; else delete it.bonus;
};

export function NumberBody({ step, context, edit, onAddParam, takenNames, onRename }: {
  step: Step;
  context: SlotContext;
  edit: EditFn;
  onAddParam?: (label: string, kind: ValueKind, want?: string) => string;
  takenNames?: readonly string[];
  onRename?: (from: string, to: string) => void;
}) {
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [nameTrouble, setNameTrouble] = useState<string | null>(null);
  const current = typeof (step as { id?: unknown }).id === 'string' ? (step as { id: string }).id : '';
  const [draft, setDraft] = useState<string | null>(null);
  const read = loose(step);
  const fielded = read.field !== undefined;
  const owned = Boolean(read.by);
  const [trouble, setTrouble] = useState<string | null>(null);
  const stored = owned
    ? (read.die !== undefined ? formatRollFormula(read) : textOf(read))
    : textOf(read) || (asOneFormula(step) ?? '');
  const shown = draft ?? stored;
  const names = useMemo(() => namesOf(context), [context]);
  const pickable = !fielded && (owned || !('error' in parseRollFormula(stored, context.system)));

  const unknown = [...new Set([...shown.matchAll(/@([\p{L}\p{N}_.]+)/gu)].map(m => m[1]!))]
    .filter(name => !name.includes('.'))
    .filter(name => !names.has(name) && !hasField(context.system, name) && !tagWords(context.system).has(name));

  const commit = (typed: string) => {
    if (typed.trim() === stored.trim()) { setDraft(null); setTrouble(null); return; }
    if (owned) {
      const parsed = parseRollFormula(typed, context.system);
      if ('error' in parsed) { setTrouble(typed.trim() && !looksLikeRoll(typed) ? COMPLEX : parsed.error); return; }
      edit(0, target => asRoll(loose(target), parsed));
      setDraft(null);
      setTrouble(null);
      return;
    }
    edit(0, target => {
      const it = loose(target);
      delete it.die;
      delete it.bonus;
      delete it.count;
      if (typed.trim()) it.fixed = { expr: typed };
      else delete it.fixed;
    });
    setDraft(null);
  };

  const pick = (next: string) => {
    const pending = !next && draft !== null && draft.trim() !== stored.trim() ? draft : null;
    setTrouble(null);
    if (pending !== null) setDraft(null);
    edit(0, target => {
      const it = loose(target);
      const wasOwned = Boolean(it.by);
      setRoller(it, next);
      if (!next) {
        if (pending !== null) {
          delete it.die;
          delete it.count;
          delete it.bonus;
          if (pending.trim()) it.fixed = { expr: pending }; else delete it.fixed;
          return;
        }
        if (it.die === undefined || it.fixed !== undefined) return;
        const text = formatRollFormula(it);
        delete it.die;
        delete it.count;
        delete it.bonus;
        it.fixed = { expr: text };
        return;
      }
      const expr = (it.fixed as { expr?: unknown } | undefined)?.expr;
      if (wasOwned || typeof expr !== 'string') return;
      const parsed = parseRollFormula(expr, context.system);
      if (!('error' in parsed)) asRoll(it, parsed);
    });
  };

  const taken = takenNames ?? [
    ...context.earlier.map(one => one.id),
    ...(context.effect.params ?? []).map(p => p.key),
  ];

  const commitName = () => {
    if (nameDraft === null) return;
    const typed = nameDraft;
    const trouble = stepNameTrouble(typed, current, taken.filter(one => one !== current));
    if (trouble) { setNameTrouble(trouble); return; }
    const next = keyOf(typed);
    setNameDraft(null);
    setNameTrouble(null);
    if (next === current) return;
    if (onRename) onRename(current, next);
    else edit(0, target => { target.id = next; });
  };

  const formula = (
    <FormulaField
      value={shown}
      system={context.system}
      where="число · сколько"
      extraNames={names}
      {...(context.sheets ? { sheets: context.sheets } : {})}
      badges={inputBadges(context)}
      placeholder="наберите @ и выберите название"
      invalid={Boolean(trouble)}
      onChange={next => { setTrouble(null); setDraft(next); }}
      onCommit={commit}
      onCancel={() => { setTrouble(null); setDraft(null); }}
    />
  );

  const addressText = exprOf(read.field);
  const [addressDraft, setAddressDraft] = useState<string | null>(null);
  const [shiftDraft, setShiftDraft] = useState<string | null>(null);
  const [byHand, setByHand] = useState(false);
  const hasRolls = Object.keys(context.system.rolls ?? {}).length > 0;
  const firstSheet = [...sheetChoices(context).singles.keys()][0];

  const kind = fielded ? 'field' : owned ? 'dice' : 'formula';

  const setMode = (next: string) => {
    if (next === kind) return;
    if (kind === 'dice' && next === 'formula') { pick(''); return; }
    setAddressDraft(null);
    setShiftDraft(null);
    setByHand(false);
    setDraft(null);
    setTrouble(null);
    edit(0, target => {
      const it = loose(target);
      if (next === 'field') { toField(it, headOf(exprOf(it.by)) || (firstSheet ? `@${firstSheet}` : '')); return; }
      toDice(it);
      if (next === 'formula') delete it.by;
    });
  };

  const mode = hasRolls && (fielded || owned || !pickable) ? (
    <select className="roll-by" data-field="Что это" aria-label="Что это" value={kind}
      title="Формула — число считается, кости в ней ничьи. Кости — бросок листа, запись костей в этой строке. Поле листа — бросок листа по правилу из «Правил → Броски»: кость, успех и степени берутся оттуда."
      onChange={event => setMode(event.target.value)}>
      <option value="formula">формула</option>
      {kind === 'formula' ? null : <option value="dice">кости</option>}
      <option value="field">поле листа</option>
    </select>
  ) : null;

  const name = (
    <Input
      mono
      value={nameDraft ?? current}
      placeholder="имя"
      invalid={Boolean(nameTrouble)}
      onChange={next => { setNameTrouble(null); setNameDraft(next); }}
      onBlur={commitName}
      onKeyDown={event => {
        if (event.key === 'Enter') commitName();
        if (event.key === 'Escape') { setNameDraft(null); setNameTrouble(null); }
      }}
    />
  );

  if (fielded) {
    const head = headOf(addressText);
    const tail = tailOf(addressText);
    const fields = rollableFields(context.system, context.effect);
    const chosen = fields.find(one => one.tail === tail);
    const hand = byHand || (tail !== '' && !chosen);
    const setAddress = (next: string) => edit(0, target => { loose(target).field = { expr: next }; });
    return (
      <>
        <div className="inline inline--tight number-line">
          {name}
          <span className="number-line__eq">=</span>
          <div data-field="Формула" className="number-line__formula roll-formula">
            {hand ? null : <RollerPick by={{ expr: head }} context={context} keep onPick={next => setAddress(tail ? `${next}.${tail}` : next)} />}
            {mode}
            {hand ? (
              <div data-field="Адрес поля" className="number-line__formula">
                <FormulaField
                  value={addressDraft ?? addressText}
                  system={context.system}
                  where="бросок поля · какое поле"
                  extraNames={names}
                  {...(context.sheets ? { sheets: context.sheets } : {})}
                  badges={inputBadges(context)}
                  placeholder="наберите @ и выберите поле"
                  onChange={next => setAddressDraft(next)}
                  onCommit={typed => {
                    setAddressDraft(null);
                    if (typed.trim() === addressText.trim()) return;
                    setAddress(typed.trim());
                  }}
                  onCancel={() => setAddressDraft(null)}
                />
              </div>
            ) : (
              <Select
                label="Какое поле"
                value={tail}
                options={[...fields.map(one => [one.tail, one.label, one.group] as const), [OWN, 'своим адресом…', 'Другое'] as const]}
                onChange={next => { if (next === OWN) setByHand(true); else setAddress(`${head}.${next}`); }}
              />
            )}
          </div>
        </div>
        {nameTrouble ? <span className="field__error">{nameTrouble}</span> : null}
        {hand
          ? <Button size="sm" variant="ghost" onClick={() => { setByHand(false); setAddressDraft(null); if (!chosen) setAddress(head); }}>выбрать поле из списка</Button>
          : !fields.length
            ? <span className="field__error">в «Правилах → Броски» ни у одного броска не выбраны поля</span>
            : chosen ? <span className="faint">по правилу «{chosen.rule}» из «Правил → Броски»: кость, успех и степени — оттуда</span> : null}
        <Extras items={[{
          key: 'shift',
          label: 'поправка к числу поля',
          on: read.shift !== undefined || shiftDraft !== null,
          add: () => {},
          drop: () => { setShiftDraft(null); edit(0, target => { delete loose(target).shift; }); },
          node: (
            <div className="field">
              <span className="field__label">Поправка к числу поля</span>
              <div data-field="Поправка">
                <FormulaField
                  value={shiftDraft ?? exprOf(read.shift)}
                  system={context.system}
                  where="бросок поля · поправка"
                  extraNames={names}
                  {...(context.sheets ? { sheets: context.sheets } : {})}
                  badges={inputBadges(context)}
                  placeholder="например +20 за лёгкую задачу"
                  onChange={next => setShiftDraft(next)}
                  onCommit={typed => {
                    setShiftDraft(null);
                    if (typed.trim() === exprOf(read.shift).trim()) return;
                    edit(0, target => {
                      const it = loose(target);
                      if (typed.trim()) it.shift = { expr: typed.trim() }; else delete it.shift;
                    });
                  }}
                  onCancel={() => setShiftDraft(null)}
                />
              </div>
            </div>
          ),
        }]} />
        <RollTags label="Ещё метки" roll={read} system={context.system} onRoll={change => edit(0, draft => change(loose(draft)))} />
      </>
    );
  }

  return (
    <>
      <div className="inline inline--tight number-line">
        {name}
        <span className="number-line__eq">=</span>
        <div data-field="Формула" className={`number-line__formula${pickable || mode ? ' roll-formula' : ''}`}>
          {pickable ? <RollerPick by={read.by} context={context} onPick={pick} /> : null}
          {mode}
          {formula}
        </div>
      </div>
      {nameTrouble ? <span className="field__error">{nameTrouble}</span> : null}
      {trouble ? <span className="field__error">{trouble}</span> : null}

      {onAddParam ? unknown.map(name => (
        <Button
          key={name} size="sm" variant="ghost"
          onClick={() => { onAddParam(name, 'number', name); }}
        >{`взять «${name}» из записи`}</Button>
      )) : null}

      {owned ? <RollTags roll={read} system={context.system} onRoll={change => edit(0, draft => change(loose(draft)))} /> : null}
    </>
  );
}
