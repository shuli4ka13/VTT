import { Card, CardHead, Field, Select, Chip, Button } from '../../../ui/primitives.tsx';
import { FormulaField } from '../../../ui/formula-field.tsx';
import { registry } from '@vtt/engine/engine/steps/index';
import { MOMENTS as TIMES, fieldOf } from '@vtt/engine/events/moments';
import { MOMENT_PREFIX, FIELD_PREFIX } from '@vtt/engine/events/bus';
import type { MomentKey } from '@vtt/engine/events/moments';

import { MOMENTS } from './words.ts';
import type { Moment } from './words.ts';
import type { System, Handler } from '@vtt/schema';
import { calledOf } from '@vtt/engine/engine/effects';

function conditionsOf(system: System, listened: string | undefined): (readonly [string, string])[] {
  const source = listened ? system.effects[listened] : undefined;
  if (!source) return [];
  const out: (readonly [string, string])[] = [];
  (source.steps ?? []).forEach((step, index) => {
    if (!step.id) return;
    const mod = registry.get(step.type);
    for (const output of (mod?.outputs ?? []) as { path: string; label: string; kind?: string }[]) {
      if (output.kind !== 'boolean') continue;
      out.push([`${step.id}${output.path}`, `шаг ${index + 1} · ${output.label}`] as const);
    }
  });
  return out;
}

function conditionsOfAny(system: System): (readonly [string, string])[] {
  const seen = new Map<string, string>();
  for (const [key, effect] of Object.entries(system.effects)) {
    if ((effect.activation ?? 'manual') !== 'manual') continue;
    for (const [ref, label] of conditionsOf(system, key)) if (!seen.has(ref)) seen.set(ref, label);
  }
  return [...seen].map(([ref, label]) => [ref, label] as const);
}

const BY_FORMULA = ':формула';

const SEED_NAMES = new Map([['worn.carry', 'запомненное число']]);

export const momentOf = (handler: Handler): Moment => {
  const before = handler.phase === 'before';
  const sender = handler.role === 'sender';
  if (handler.ask) return sender ? 'ask-sender' : before ? 'ask-target' : 'ask-after';
  if (sender) return 'after-out';
  return before ? 'before-in' : 'after-in';
};

const SHAPE: Record<Moment, Pick<Handler, 'role' | 'phase' | 'ask'>> = {
  'after-in': {},
  'after-out': { role: 'sender' },
  'before-in': { phase: 'before' },
  'ask-target': { phase: 'before', ask: true },
  'ask-sender': { role: 'sender', phase: 'before', ask: true },
  'ask-after': { ask: true },
};

const applyMoment = (draft: Handler, moment: Moment): void => {
  delete draft.role; delete draft.phase; delete draft.ask;
  Object.assign(draft, SHAPE[moment]);
  if (!draft.on && SHAPE[moment].ask) draft.on = '*';
  if (moment === 'before-in' || moment === 'ask-target' || moment === 'ask-sender') delete draft.to;
  if (moment !== 'ask-sender') delete draft.claims;
};

export function HandlerCard({ id, index, handler, system, edit, onRemove }: {
  id: string;
  index: number;
  handler: Handler;
  system: System;
  edit: (change: (draft: Handler) => void) => void;
  onRemove: () => void;
}) {
  const moment = momentOf(handler);
  const asks = handler.ask === true;
  const listened = handler.on;
  const anyAction = !listened || listened === '*';
  const isMoment = Boolean(listened?.startsWith(MOMENT_PREFIX)) || Boolean(fieldOf(listened));
  const conditions = isMoment ? [] : anyAction ? conditionsOfAny(system) : conditionsOf(system, listened);
  const watchable = system.fields.filter(f => f.value.kind !== 'stored' || f.value.type === 'boolean');
  const aims = moment === 'after-in' || moment === 'after-out' || moment === 'ask-after';
  const raw = handler.if as { expr?: string } | null | undefined;
  const formula = raw && typeof raw === 'object' && 'expr' in raw ? String(raw.expr ?? '') : null;

  return (
    <Card>
      <CardHead
        title={`Когда №${index + 1}`}
        sub="Что случилось — и что эффект делает в ответ."
        actions={<Button size="sm" variant="ghost" title="убрать это «когда»" onClick={onRemove}>×</Button>}
      />

      <div className="row">
        <Field label="Что случилось" needed={!asks && !listened}>
          <Select
            value={listened ?? (asks ? '*' : '')}
            options={[
              ...(asks ? [['*', 'любое действие'] as const] : [['', '— что случилось —'] as const]),
              ...calledOf(system)
                .map(([key, e]) => [`event:${key}`, `пришёл «${e.label || key}»`] as const),
              ...Object.entries(system.effects)
                .filter(([key, e]) => key !== id && (e.activation ?? 'manual') === 'manual')
                .map(([key, e]) => [key, `действие «${e.label ?? key}»`] as const),
              ...(asks ? [] : (Object.keys(TIMES) as MomentKey[])
                .map(key => [`${MOMENT_PREFIX}${key}`, `время: ${TIMES[key]}`] as const)),
              ...(asks ? [] : watchable
                .map(f => [`${FIELD_PREFIX}${f.tag}`, `поле «${f.label}» стало верным`] as const)),
            ] as never}
            onChange={next => edit(draft => { draft.on = next || (asks ? '*' : ''); })}
          />
        </Field>

        {isMoment ? null : (
          <Field label="С кем и когда">
            <Select
              value={moment}
              options={MOMENTS as never}
              onChange={next => edit(draft => { applyMoment(draft, next as Moment); })}
            />
          </Field>
        )}

        <Field
          label="Только если"
          hint={formula !== null ? 'Сработает, только когда формула верна.'
            : isMoment ? 'У времени и поля нет исходов — выберите «формулой…», если нужно условие.'
              : conditions.length ? undefined : 'У того, что слушаем, нет шагов с исходом «да/нет» — сработает всегда.'}
        >
          <Select<string>
            value={formula !== null ? BY_FORMULA : String((handler.if as { ref?: string } | null | undefined)?.ref ?? '')}
            options={[['', 'всегда'], ...conditions, [BY_FORMULA, 'формулой…']]}
            onChange={next => edit(draft => {
              if (next === BY_FORMULA) draft.if = { expr: formula ?? '' };
              else if (next) draft.if = { ref: next };
              else delete draft.if;
            })}
          />
          {formula !== null ? (
            <FormulaField
              value={formula}
              system={system}
              where={`когда №${index + 1} · только если`}
              extraNames={SEED_NAMES}
              owners
              placeholder="например: @получатель.хиты <= 0"
              onCommit={next => edit(draft => { draft.if = { expr: next }; })}
            />
          ) : null}
        </Field>

        {isMoment || !aims ? null : (
          <Field label="Кому" hint="Куда уходит цепочка шагов этого «когда».">
            <Select
              value={handler.to ?? 'self'}
              options={(moment === 'after-out'
                ? [['self', 'себе'], ['other', 'цели моего действия']]
                : [['other', 'тому, кто действовал — ответкой'], ['self', 'себе']]) as never}
              onChange={next => edit(draft => { if (next === 'other') draft.to = 'other'; else delete draft.to; })}
            />
          </Field>
        )}
      </div>

      {moment === 'ask-sender' ? (
        <Field label="Перебросить с правкой" hint="Если выбрано — после согласия бросок собирается заново с этими правками из словаря.">
          <div className="inline inline--tight">
            {Object.entries(system.roll_edits ?? {}).map(([key, e]) => {
              const picked = (handler.claims ?? []).includes(key);
              return (
                <Chip key={key} active={picked} onClick={() => edit(draft => {
                  const list = new Set(draft.claims ?? []);
                  if (picked) list.delete(key); else list.add(key);
                  if (list.size) draft.claims = [...list]; else delete draft.claims;
                })}>
                  {e.label || key}
                </Chip>
              );
            })}
            {Object.keys(system.roll_edits ?? {}).length === 0
              ? <span className="faint">Правок броска в словаре нет.</span> : null}
          </div>
        </Field>
      ) : null}
    </Card>
  );
}
