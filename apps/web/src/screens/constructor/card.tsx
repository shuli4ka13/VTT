import { useState, type ReactNode } from 'react';
import type { System, Effect, Step, SlotRef } from '@vtt/schema';
import { Card, CardHead, Field, Fold, Segmented, Verdict, Button, Select, Input } from '../../ui/primitives.tsx';
import type { CardGroup } from './cards.ts';
import {
  checkReadback, changeReadback, numberReadback, amountValueSegments, joinReadback, type Segment,
} from './readback.ts';
import { parseRollExpr, formatRollExpr, notationOf } from './roll-expr.ts';
import { compile } from '@vtt/engine/formula';
import { FormulaChips } from '../../ui/formula-chips.tsx';
import { labelOfTag } from '../../ui/formula.tsx';
import { SlotInput, chipOf, type SlotOption } from './slot-input.tsx';
import type { SlotContext, EarlierStep } from './slots.tsx';
import type { Problem } from './step-card.tsx';

const TITLES: Record<string, string> = { check: 'Проверка', change: 'Изменение', number: 'Число' };

type EditFn = (slotIndexInGroup: number, change: (draft: Step) => void) => void;
type WithNumber = (change: (amount: Step, apply: Step, id: string) => void) => void;

const firstDie = (system: System): string | undefined => Object.keys(system.constants ?? {})[0];

export function Readback({ segments }: { segments: Segment[] }) {
  return (
    <p className="readback">
      {segments.map((part, i) => {

        const prev = segments[i - 1];
        const glue = ('text' in part && /^[.,)]/.test(part.text))
          || (prev !== undefined && 'text' in prev && prev.text.endsWith('('));
        const lead = i === 0 || glue ? '' : ' ';
        return 'text' in part
          ? <span key={i}>{lead}{part.text}</span>
          : <span key={i}>{lead}<span className="readback__hole">{part.hole}</span></span>;
      })}
    </p>
  );
}

export function GroupCard({
  group, position, system, effect, earlier, problem, problemAction,
  edit, withNumber, onDelete, onMoveUp, onMoveDown, onAddParam,
}: {
  group: CardGroup;
  position: number;
  system: System;
  effect: Effect;
  earlier: EarlierStep[];
  problem: Problem | null;

  problemAction?: ReactNode;
  edit: (slotIndexInGroup: number, change: (draft: Step) => void) => void;

  withNumber?: (change: (amount: Step, apply: Step, id: string) => void) => void;
  onDelete: () => void;

  onMoveUp?: () => void;
  onMoveDown?: () => void;

  onAddParam?: (label: string, kind: string) => string;
}) {
  const context: SlotContext = { system, effect, earlier };
  const step = group.step as any;

  const [armed, setArmed] = useState(false);

  const actions = armed ? (
    <>
      <Button size="sm" variant="danger" onClick={onDelete}>убрать</Button>
      <Button size="sm" variant="ghost" onClick={() => setArmed(false)}>отмена</Button>
    </>
  ) : (
    <>
      <Button size="sm" variant="ghost" title="выше" disabled={!onMoveUp} onClick={onMoveUp}>↑</Button>
      <Button size="sm" variant="ghost" title="ниже" disabled={!onMoveDown} onClick={onMoveDown}>↓</Button>
      <Button size="sm" variant="ghost" title="убрать карточку" onClick={() => setArmed(true)}>×</Button>
    </>
  );

  if (group.kind === 'unknown') {
    return (
      <Card tone="bad">
        <CardHead title={`${position} · движок не знает типа «${group.step.type}»`}
          actions={actions} />
      </Card>
    );
  }

  const segments = group.kind === 'check' ? checkReadback(group.step, system, effect)
    : group.kind === 'change' ? changeReadback(group.step, group.amount, system, effect)
      : numberReadback(group.step, system, effect);

  return (
    <>
      <Card tone={problem ? 'bad' : undefined}>
        <CardHead
          title={`${position} · ${TITLES[group.kind]}`}

          badge={group.kind === 'change' ? null : (
            <Input
              value={step.id ?? ''}
              mono
              placeholder="имя"
              onChange={next => edit(0, draft => {
                const id = next.trim();
                if (id) (draft as any).id = id; else delete (draft as any).id;
              })}
            />
          )}
          actions={actions}
        />
        {problem ? <Verdict tone="bad" action={problemAction}>{problem.text}</Verdict> : null}
        <Readback segments={segments} />
        {group.kind === 'check' ? <CheckBody step={step} context={context} edit={edit} system={system} /> : null}
        {group.kind === 'change' ? <ChangeBody group={group} context={context} edit={edit} withNumber={withNumber} system={system} onAddParam={onAddParam} /> : null}
        {group.kind === 'number' ? <NumberBody step={step} context={context} edit={edit} onAddParam={onAddParam} /> : null}
      </Card>
      {breakLine(group)}
    </>
  );
}

const OP_SIGN: Record<string, string> = { atLeast: '≥', notOver: '≤', over: '>', under: '<', equals: '=' };
const OP_NOT: Record<string, string> = { atLeast: '<', notOver: '>', over: '≤', under: '≥', equals: '≠' };

function breakLine(group: CardGroup) {
  if (group.kind !== 'check') return null;
  const s = group.step as any;
  if (group.step.type === 'compare') {
    if (s.breakIf === 'never') return null;
    const broken = s.breakIf === 'atMost' ? '≤' : '<';
    const pass = s.breakIf === 'atMost' ? '>' : '≥';
    return (
      <div className="card-forks">
        <p className="card-break card-break--on">{pass} — цепочка продолжается</p>
        <p className="card-break">{broken} — эффект кончается здесь</p>
      </div>
    );
  }
  const op = String(s.successWhen ?? 'atLeast');
  const onSuccess = (s.continueOn ?? 'success') === 'success';
  const sign = OP_SIGN[op] ?? '≥';
  const not = OP_NOT[op] ?? '<';
  return (
    <div className="card-forks">
      <p className="card-break card-break--on">{onSuccess ? sign : not} — цепочка продолжается</p>
      <p className="card-break">{onSuccess ? not : sign} — эффект кончается здесь</p>
    </div>
  );
}

function RollExprInput({ step, context, edit }: {
  step: any;
  context: SlotContext;
  edit: EditFn;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [trouble, setTrouble] = useState<string | null>(null);

  const [picked, setPicked] = useState<string | null>(null);
  const shown = draft ?? formatRollExpr(step.roll, context.system);

  const commit = () => {
    if (draft === null) return;
    if (!draft.trim()) {
      edit(0, target => { delete ((target as any).roll ??= {}).bonus; });
      setDraft(null); setTrouble(null); setPicked(null);
      return;
    }
    const parsed = parseRollExpr(draft, context.system, picked);
    if (parsed.error) { setTrouble(parsed.error); return; }
    const bad = badFormula(parsed.bonus);
    if (bad) { setTrouble(bad); return; }
    edit(0, target => {
      const roll = ((target as any).roll ??= {});
      roll.die = parsed.die;
      if (parsed.bonus === null) delete roll.bonus; else roll.bonus = parsed.bonus;
    });
    setDraft(null);
    setTrouble(null);
    setPicked(null);
  };

  return (
    <Field label="бросок" error={trouble}>
      <FormulaChips
        value={shown}
        system={context.system}
        side={String(step.side ?? 'sender') === 'target' ? 'target' : 'self'}
        placeholder="1d20 + @поле"
        extraOptions={Object.entries(context.system.constants ?? {})
          .filter(([, c]) => c.kind === 'die')
          .map(([key, c]) => ({
            group: 'кость системы',
            label: c.label || key,

            onPick: (insert: (piece: string) => string) => {
              setPicked(key);
              setDraft(insert(notationOf(context.system, key)));
            },
          }))}
        onChange={setDraft}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') { setDraft(null); setTrouble(null); setPicked(null); }
        }}
      />
    </Field>
  );
}

function ChangeValue({ amount, apply, applyIndex, context, edit, withNumber, onCreateFromRecord }: {

  amount?: Step;

  apply: Step;
  applyIndex: number;
  context: SlotContext;
  edit: EditFn;

  withNumber?: WithNumber;
  onCreateFromRecord?: () => SlotRef;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [trouble, setTrouble] = useState<string | null>(null);
  const target = (apply as Record<string, any>).target;

  const amountId = String((amount as Record<string, any> | undefined)?.id ?? '');

  const asExpr = (): string => {
    const a = apply as Record<string, any>;
    const value = a.value;
    if (value && typeof value === 'object' && 'expr' in value) return String(value.expr);

    const amountName = amountId ? `#${amountId}` : '';
    const targetName = target && typeof target === 'object' && 'tag' in target ? `#${target.tag}` : '';
    const direction = String(a.direction ?? 'subtract');
    if (direction === 'set') return amountName;
    if (!targetName) return amountName;

    return `${targetName} ${direction === 'add' ? '+' : '-'} ${amountName}`;
  };

  const shown = draft ?? asExpr();

  const rawValue = (apply as Record<string, any>).value;
  const senderMarks: string[] = rawValue && typeof rawValue === 'object' && Array.isArray(rawValue.sender)
    ? rawValue.sender : [];

  const dice = (amount as Record<string, any> | undefined)?.dice;
  const bonus = (amount as Record<string, any> | undefined)?.bonus;
  const diceChip = chipOf(dice, context);
  const bonusText = exprText(bonus);
  const both = Boolean(diceChip && bonusText);

  const sentChip = (label: ReactNode, onRemove: () => void, key: string) => (
    <span key={key} className="chips__chip chips__chip--sent">
      {label}
      <span className="chips__side" title="посчитано отправителем, приходит числом">у отправителя</span>
      <button
        type="button" className="chips__x" aria-label="убрать слагаемое"
        onMouseDown={e => { e.preventDefault(); onRemove(); }}
      >×</button>
    </span>
  );

  const names = amountId && amount ? {
    [amountId]: (
      <>
        {both ? <span className="chips__paren" aria-hidden>(</span> : null}
        {diceChip ? sentChip(
          diceChip.label,
          () => edit(0, step => { delete (step as Record<string, unknown>).dice; }),
          'dice',
        ) : null}
        {both ? <span className="chips__plus" aria-hidden>+</span> : null}
        {bonusText ? sentChip(
          bonusText.replace(/#([\p{L}\p{N}_]+)/gu, (_, tag: string) => labelOfTag(context.system, tag)),
          () => edit(0, step => { delete (step as Record<string, unknown>).bonus; }),
          'bonus',
        ) : null}
        {both ? <span className="chips__paren" aria-hidden>)</span> : null}
      </>
    ),
  } : undefined;

  const DICE = /(\d+)?\s*[dдк]\s*(\d+)/iu;

  const mentions = (text: string, id: string) =>
    new RegExp(`#${id}(?![\\p{L}\\p{N}_])`, 'u').test(text);

  const sendThrough = (
    fill: (amount: Record<string, any>) => void,

    place?: (name: string) => string,
  ) => {
    const line = (draft ?? asExpr()).trim();
    const put = (a: Step, apply: Step, id: string) => {
      fill(a as Record<string, any>);
      const name = `#${id}`;
      const next = (place ? place(name) : (mentions(line, id) ? line : (line ? `${line} + ${name}` : name)))
        .replace(/\s+/g, ' ').trim();
      const target = apply as Record<string, any>;
      target.direction = 'set';

      const kept = senderMarks.filter(tag => mentions(next, tag));
      target.value = { expr: next, of: 'target', sender: kept.length ? kept : undefined };
    };
    if (!withNumber && !amountId) {

      setTrouble('кость бросает отправитель — заведите карточку «число» и назовите её');
      return;
    }
    if (withNumber) withNumber(put);
    else {

      edit(0, a => fill(a as Record<string, any>));
      edit(applyIndex, apply => put({} as Step, apply, amountId));
    }
    setDraft(null);
    setTrouble(null);
  };

  const commit = () => {
    if (draft === null) return;
    const text = draft.trim();

    const rolled = text.match(DICE);
    if (rolled) {
      const notation = `${rolled[1] ?? 1}d${rolled[2]}`;
      const picked = parseRollExpr(notation, context.system).die;

      const next = (name: string) => (mentions(text, name.slice(1))
        ? text.replace(DICE, '').replace(/\+\s*\+/g, '+').replace(/[-+*/]\s*$/, '').replace(/\s+/g, ' ').trim()
        : text.replace(DICE, name));

      const bad = badFormula({ expr: next('#x') });
      if (bad) { setTrouble(bad); return; }
      sendThrough(a => { a.dice = picked; }, next);
      return;
    }

    const bad = text ? badFormula({ expr: text }) : null;
    if (bad) { setTrouble(bad); return; }

    edit(applyIndex, step => {
      const a = step as Record<string, any>;
      if (!text) { delete a.value; return; }
      a.direction = 'set';

      const kept = senderMarks.filter(tag => mentions(text, tag));
      a.value = { expr: text, of: 'target', sender: kept.length ? kept : undefined };
    });
    setDraft(null);
    setTrouble(null);
  };

  const putIntoAmount = (ref: SlotRef, place?: (name: string) => string) =>
    sendThrough(a => { a.dice = ref; }, place);

  const flipSide = (tag: string) => {
    const line = (draft ?? asExpr()).trim();
    edit(applyIndex, step => {
      const a = step as Record<string, any>;
      const value = (a.value && typeof a.value === 'object' && 'expr' in a.value)
        ? a.value : { expr: line, of: 'target' };
      const marked: string[] = Array.isArray(value.sender) ? value.sender : [];
      const sender = marked.includes(tag) ? marked.filter(t => t !== tag) : [...marked, tag];
      a.direction = 'set';
      a.value = { ...value, sender: sender.length ? sender : undefined };
    });
    setDraft(null);
    setTrouble(null);
  };

  const needs = (context.effect.params ?? []).map(p => ({
    group: 'из записи',
    label: p.label ?? p.key,
    onPick: (insert: (piece: string) => string) => putIntoAmount({ param: p.key } as SlotRef, insert),
  }));
  if (onCreateFromRecord) {
    needs.push({
      group: 'из записи',
      label: 'новая потребность…',
      onPick: (insert: (piece: string) => string) => putIntoAmount(onCreateFromRecord(), insert),
    });
  }

  for (const [key, c] of Object.entries(context.system.constants ?? {})) {
    if (c.kind !== 'die') continue;
    needs.push({
      group: 'кость системы',
      label: c.label || key,
      onPick: (insert: (piece: string) => string) => putIntoAmount({ constant: key } as SlotRef, insert),
    });
  }

  return (
    <>
      {}
      <Field
        label="что меняется"
        needed={!target}
        hint={target ? undefined : 'Поле цели: что этот шаг поменяет.'}
      >
        <SlotInput
          value={target}
          context={context}
          allow={['tag', 'param']}
          side="target"
          placeholder="поле цели"
          onChange={next => edit(applyIndex, target => {
            const t = target as Record<string, unknown>;
            if (next) t.target = next; else delete t.target;
          })}
          onCreateFromRecord={onCreateFromRecord}
        />
      </Field>

      {}
      <Field
        label="станет"
        error={trouble}
        hint="Обычная математика. Подпись у поля — чей лист его считает: щёлкните, чтобы взять у отправителя — он пришлёт своё число."
      >
        <FormulaChips
          value={shown}
          system={context.system}
          names={names}
          side="target"
          placeholder="например: @хп − @урон"
          extraOptions={needs}
          fromSender={senderMarks}
          onFlipSide={flipSide}
          onChange={setDraft}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') { setDraft(null); setTrouble(null); }
          }}
        />
      </Field>
    </>
  );
}

function badFormula(bonus: unknown): string | null {
  if (!bonus || typeof bonus !== 'object' || !('expr' in (bonus as object))) return null;
  const text = String((bonus as { expr: unknown }).expr ?? '').trim();
  if (!text) return null;
  try { compile(text); return null; } catch (err) {
    return (err as Error).message;
  }
}

function exprText(bonus: unknown): string {
  if (!bonus || typeof bonus !== 'object') return '';
  const b = bonus as Record<string, unknown>;
  if ('expr' in b) return String(b.expr ?? '');
  if ('const' in b) return String(b.const ?? '');
  return '';
}

function CheckBody({ step, context, edit, system }: {
  step: any;
  context: SlotContext;
  edit: EditFn;
  system: System;
}) {
  const mode = step.type === 'compare' ? 'plain' : 'roll';
  const tables = Object.entries(system.tables ?? {});

  return (
    <>
      {}
      <Segmented
        value={mode}
        options={[{ key: 'roll', label: 'броском' }, { key: 'plain', label: 'без броска' }]}
        onChange={next => edit(0, draft => {
          const d = draft as any;
          if (next === 'roll') {
            draft.type = 'threshold';
            d.roll ??= { die: firstDie(system) ? { constant: firstDie(system) } : undefined, check: null };
            d.side ??= 'sender'; d.successWhen ??= 'atLeast'; d.continueOn ??= 'success';
          } else {
            draft.type = 'compare';
            d.breakIf ??= 'less';
          }
        })}
      />

      {}
      {mode === 'roll' ? (
        <div className="row">
          <RollExprInput step={step} context={context} edit={edit} />
          <Field label="успех">
            <Select
              value={String(step.successWhen ?? 'atLeast')}
              options={[['atLeast', '≥'], ['notOver', '≤'],
                ['over', '>'], ['under', '<'], ['equals', '=']] as const}
              onChange={next => edit(0, draft => { (draft as any).successWhen = next; })}
            />
          </Field>
          <Field label="против">
            <SlotInput
              value={step.versus} context={context} allow={['tag', 'expr', 'const', 'param', 'ref']} side="target"
              onChange={next => edit(0, draft => { (draft as any).versus = next ?? undefined; })}
            />
          </Field>
        </div>
      ) : (
        <div className="row">
          <Field label="что сравниваем">
            <SlotInput
              value={step.value} context={context} allow={['ref']}
              onChange={next => edit(0, draft => { (draft as any).value = next ?? undefined; })}
            />
          </Field>
          <Field label="обрыв, если">
            <Select
              value={String(step.breakIf ?? 'less')}
              options={[['less', '< меньше правого'], ['atMost', '≤ не больше правого'],
                ['never', 'обрыва нет — разница идёт дальше']] as const}
              onChange={next => edit(0, draft => { (draft as any).breakIf = next; })}
            />
          </Field>
          <Field label="против">
            <SlotInput
              value={step.versus} context={context} allow={['tag', 'expr', 'const', 'param', 'ref']} side="target"
              onChange={next => edit(0, draft => { (draft as any).versus = next ?? undefined; })}
            />
          </Field>
        </div>
      )}

      {mode === 'roll' ? (
        <Fold title="Тонкости">
          <Field label="кто бросает">
            <Select
              value={String(step.side ?? 'sender')}
              options={[['sender', 'отправитель'], ['target', 'цель']] as const}
              onChange={next => edit(0, draft => { (draft as any).side = next; })}
            />
          </Field>
          <Field label="дальше при">
            <Select
              value={String(step.continueOn ?? 'success')}
              options={[['success', 'успехе'], ['fail', 'провале']] as const}
              onChange={next => edit(0, draft => { (draft as any).continueOn = next; })}
            />
          </Field>
          {}
          <Field label="какой это бросок" hint="Вид броска из словаря — чтобы правило «преимущество на атаки» знало, куда целиться. Правки «на любой бросок» этот бросок поймает в любом случае.">
            <Select
              value={String(step.roll?.check ?? '')}
              options={[['', '— просто бросок: только общие правки —'],
                ...(context.system.rolls ?? []).map(r => [r.tag, r.label] as const)] as never}
              onChange={next => edit(0, draft => { ((draft as any).roll ??= {}).check = next || null; })}
            />
          </Field>
          {}
          <Field
            label="степени успеха"
            hint={tables.length
              ? 'Вместо «да/нет» исход читается ступенями по таблице: «провал / успех с ценой / полный успех».'
              : 'Сначала заведите таблицу ступеней в «Словарях».'}
          >
            <Select
              value={String(step.degrees?.table ?? '')}
              options={[['', '— не считать, просто да/нет —'],
                ...tables.map(([key, t]) => [key, t.label || key] as const)] as never}
              onChange={next => edit(0, draft => {
                const d = draft as any;
                if (!next) delete d.degrees;
                else d.degrees = { table: next, of: d.degrees?.of ?? 'total' };
              })}
            />
          </Field>
          {step.degrees?.table ? (
            <Field label="ступень по">
              <Select
                value={String(step.degrees.of ?? 'total')}
                options={[['total', 'итогу броска'], ['margin', 'запасу против порога']] as const}
                onChange={next => edit(0, draft => { (draft as any).degrees.of = next; })}
              />
            </Field>
          ) : null}
        </Fold>
      ) : null}
    </>
  );
}

function ChangeBody({ group, context, edit, withNumber, system, onAddParam }: {
  group: CardGroup;
  context: SlotContext;
  edit: EditFn;
  withNumber?: WithNumber;
  system: System;
  onAddParam?: (label: string, kind: string) => string;
}) {
  const step = group.step as any;
  const mode = step.type === 'status' ? 'status' : 'apply';
  const applyIndex = group.amount ? 1 : 0;

  const fromRecord = (label: string, kind: string) =>
    onAddParam ? () => ({ param: onAddParam(label, kind) }) : undefined;

  const statusOptions: SlotOption[] = Object.entries(system.effects ?? {})
    .filter(([, e]) => (e.activation ?? 'manual') === 'passive')
    .map(([id, e]) => ({ group: 'Состояния', label: e.label ?? id, ref: { const: id } }));

  return (
    <>
      {}
      <Segmented
        value={mode}
        options={[{ key: 'apply', label: 'поле' }, { key: 'status', label: 'состояние' }]}
        onChange={next => edit(applyIndex, draft => {
          const d = draft as any;
          if (next === 'status') {
            draft.type = 'status';
            d.mode ??= 'apply';
          } else {
            draft.type = 'apply';
            d.direction ??= 'subtract';
            d.targetModifiers ??= true;
          }
        })}
      />

      {mode === 'apply' ? (
        <>
          {}
          <ChangeValue
            amount={group.amount ?? undefined} apply={step} applyIndex={applyIndex}
            context={context} edit={edit} withNumber={withNumber}
            onCreateFromRecord={fromRecord('сколько — кости', 'dice')} />

          <Fold title="Тонкости">
            {}
            <Field label="сопротивления цели">
              <Select
                value={String(step.targetModifiers ?? true)}
                options={[['true', 'учитываются'], ['false', 'не учитываются']] as const}
                onChange={next => edit(applyIndex, draft => { (draft as any).targetModifiers = next === 'true'; })}
              />
            </Field>
          </Fold>
        </>
      ) : (
        <>
          {}
          {group.amount ? (
            <span className="faint">
              величина сохранена — вернётся, если снова выбрать «поле»
            </span>
          ) : null}
          <Field label="что делаем">
            <Select
              value={String(step.mode ?? 'apply')}
              options={[['apply', 'вешаем'], ['remove', 'снимаем']] as const}
              onChange={next => edit(applyIndex, draft => { (draft as any).mode = next; })}
            />
          </Field>
          <Field label="какое">
            <SlotInput
              value={step.effect} context={context} extraOptions={statusOptions}
              onChange={next => edit(applyIndex, draft => { (draft as any).effect = next ?? undefined; })}
              onCreateFromRecord={fromRecord('какое', 'effect')}
            />
          </Field>
        </>
      )}
    </>
  );
}

function NumberBody({ step, context, edit, onAddParam }: {
  step: any;
  context: SlotContext;
  edit: EditFn;
  onAddParam?: (label: string, kind: string) => string;
}) {
  const source = typeof step.source === 'object' ? 'roll' : (step.source ?? 'roll');
  const fromRecord = (label: string, kind: string) =>
    onAddParam ? () => ({ param: onAddParam(label, kind) }) : undefined;

  return (
    <>
      <Field label="откуда">
        <Select
          value={String(source)}
          options={[
            ['roll', 'свой бросок'], ['margin', 'превышение проверки'], ['item', 'фикс записи'],
          ] as const}
          onChange={next => edit(0, draft => { (draft as any).source = next; })}
        />
      </Field>

      {source === 'roll' ? (
        <>
          <Field label="кости">
            <SlotInput
              value={step.dice} context={context} dice placeholder="кости или из записи"
              onChange={next => edit(0, draft => { (draft as any).dice = next ?? undefined; })}
              onCreateFromRecord={fromRecord('кости', 'dice')}
            />
          </Field>
          <Field label="прибавка">
            <SlotInput
              value={step.bonus} context={context}
              onChange={next => edit(0, draft => { (draft as any).bonus = next ?? undefined; })}
            />
          </Field>
        </>
      ) : null}

      {source === 'margin' ? (
        <Field label="какое превышение">
          <SlotInput
            value={step.margin} context={context} allow={['ref']}
            onChange={next => edit(0, draft => { (draft as any).margin = next ?? undefined; })}
          />
        </Field>
      ) : null}

      {source === 'item' ? (
        <Field label="фикс записи">
          <SlotInput
            value={step.fixed} context={context}
            onChange={next => edit(0, draft => { (draft as any).fixed = next ?? undefined; })}
            onCreateFromRecord={fromRecord('фикс записи', 'expr')}
          />
        </Field>
      ) : null}
    </>
  );
}
