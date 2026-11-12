import { useMemo, useState } from 'react';
import type { Effect, System } from '@vtt/schema';
import { Button, Select } from '../../../../ui/primitives.tsx';
import { FormulaField } from '../../../../ui/formula-field.tsx';
import { namesOf, inputBadges } from '../../slots.tsx';
import type { SlotContext } from '../../slots.tsx';
import { DIE, EXPR, OWN_DIE, setAddendDie, whatOf, whatOptions } from './roll-what.ts';

type Loose = Record<string, unknown>;

const exprOf = (value: unknown): string => String((value as { expr?: unknown } | undefined)?.expr ?? '');

const NUMBER = 'number';

const NO_EFFECT = { params: [] } as unknown as Effect;

export function SlotFormula({ value, label, where, placeholder, system, context, onSet }: {
  value: unknown;
  label: string;
  where: string;
  placeholder: string;
  system: System;
  context?: SlotContext | undefined;
  onSet: (text: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const names = useMemo(() => (context ? namesOf(context) : undefined), [context]);
  const stored = exprOf(value);
  return (
    <div data-field={label}>
      <FormulaField
        value={draft ?? stored}
        system={system}
        where={where}
        {...(names ? { extraNames: names } : {})}
        {...(context?.sheets ? { sheets: context.sheets } : {})}
        {...(context ? { badges: inputBadges(context) } : {})}
        placeholder={placeholder}
        onChange={next => setDraft(next)}
        onCommit={typed => { setDraft(null); if (typed.trim() !== stored.trim()) onSet(typed.trim()); }}
        onCancel={() => setDraft(null)}
      />
    </div>
  );
}

export function AddendPick({ source, system, effect, context, where, dieOnly, onChange }: {
  source: Loose;
  system: System;
  effect?: Effect | undefined;
  context?: SlotContext | undefined;
  where: string;
  dieOnly?: boolean;
  onChange: (change: (it: Loose) => void) => void;
}) {
  const options = useMemo(
    () => whatOptions(system, effect ?? NO_EFFECT).filter(([key]) => key.startsWith(DIE) || key.startsWith(EXPR) || key === OWN_DIE),
    [system, effect],
  );
  const [hand, setHand] = useState(false);
  const [counting, setCounting] = useState(false);
  const carries = source.die !== undefined && source.die !== null;
  const written = typeof source.die === 'string' && !system.constants?.[source.die];
  const stored = !carries ? (dieOnly ? '' : NUMBER) : written ? OWN_DIE : whatOf({ die: source.die }, options);
  const what = hand ? OWN_DIE : stored;
  const dieMode = what !== NUMBER && what !== '';
  const ownValue = written ? { expr: source.die } : carries && typeof source.die === 'object' ? source.die : undefined;
  const counted = source.count !== undefined && source.count !== null;

  const pick = (next: string) => {
    if (next === OWN_DIE) { setHand(true); return; }
    setHand(false);
    if (next === NUMBER) onChange(it => { delete it.die; delete it.count; delete it.minus; });
    else if (next.startsWith(DIE)) onChange(it => setAddendDie(it, next.slice(DIE.length)));
    else if (next.startsWith(EXPR)) onChange(it => setAddendDie(it, { expr: next.slice(EXPR.length) }));
  };

  const choices = dieOnly ? options : [[NUMBER, 'число / формула', 'Число'] as const, ...options];

  return (
    <div className="inline inline--tight addend-pick" data-field="Сколько">
      <Select label="Сколько" value={what} options={choices} onChange={pick} />
      {what === NUMBER ? (
        <SlotFormula value={source.value} label="Число" where={where} placeholder="число или формула" system={system} context={context}
          onSet={text => onChange(it => { if (text) it.value = { expr: text }; else delete it.value; })} />
      ) : null}
      {what === OWN_DIE ? (
        <SlotFormula value={ownValue} label="Своя кость" where={`${where} · кость`} placeholder="2к6 или формула кости" system={system} context={context}
          onSet={text => { if (text) { setHand(false); onChange(it => setAddendDie(it, { expr: text })); } }} />
      ) : null}
      {dieMode && (counted || counting) ? (
        <SlotFormula value={source.count} label="Сколько костей" where={`${where} · сколько костей`} placeholder="сколько костей" system={system} context={context}
          onSet={text => onChange(it => { if (text) it.count = { expr: text }; else delete it.count; })} />
      ) : null}
      {dieMode && !counted && !counting ? <Button size="sm" variant="ghost" onClick={() => setCounting(true)}>+ сколько костей</Button> : null}
      {dieMode ? (
        <Select label="Прибавить или вычесть" value={source.minus === true ? 'minus' : ''} options={[['', 'прибавить'], ['minus', 'вычесть']] as const}
          onChange={next => onChange(it => { if (next === 'minus') it.minus = true; else delete it.minus; })} />
      ) : null}
    </div>
  );
}
