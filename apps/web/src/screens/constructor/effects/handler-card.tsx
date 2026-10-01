import { Card, CardHead, Field, Select, Chip, Fold, DangerButton } from '../../../ui/primitives.tsx';
import { FormulaField } from '../../../ui/formula-field.tsx';
import { registry } from '@vtt/engine/engine/steps/index';
import { MOMENTS as TIMES } from '@vtt/engine/events/moments';
import { MOMENT_PREFIX, FIELD_PREFIX, GAINED_PREFIX, LOST_PREFIX } from '@vtt/engine/events/bus';
import type { MomentKey } from '@vtt/engine/events/moments';

import { MOMENTS } from './words.ts';
import type { Moment } from './words.ts';
import type { System, Handler } from '@vtt/schema';
import { calledOf } from '@vtt/engine/engine/effects';
import { fieldsOf } from '@vtt/engine/model/sheet-columns';
import { TARGETS_SEED } from '@vtt/engine/model/references';

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

const DONE_NAMES = new Map([...SEED_NAMES, [TARGETS_SEED, 'цели действия: строка на цель']]);

const SHAPE: Record<Moment, Pick<Handler, 'on' | 'confirm'>> = {
  'after-in': { on: 'affected' },
  'after-out': { on: 'acted' },
  done: { on: 'done' },
  'before-in': { on: 'targeted' },
  'ask-target': { on: 'targeted', confirm: true },
  'ask-sender': { on: 'acting', confirm: true },
  'ask-after': { on: 'affected', confirm: true },
};

export const momentOf = (handler: Handler): Moment | null =>
  (Object.keys(SHAPE) as Moment[]).find(key => SHAPE[key].on === handler.on && (SHAPE[key].confirm ?? false) === (handler.confirm ?? false)) ?? null;

const applyMoment = (draft: Handler, moment: Moment): void => {
  delete draft.confirm;
  Object.assign(draft, SHAPE[moment]);
  if (moment === 'before-in' || moment === 'ask-target' || moment === 'ask-sender' || moment === 'done') delete draft.to;
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
  const listened = handler.of;
  const anyAction = !listened;
  const isMoment = moment === null;
  const hanging = Object.entries(system.effects).filter(([key, e]) => key !== id && (e.activation ?? 'manual') === 'passive');
  const conditions = isMoment ? [] : anyAction ? conditionsOfAny(system) : conditionsOf(system, listened);
  const watchable = fieldsOf(system).filter(f => f.value.kind !== 'stored' || f.value.type === 'boolean');
  const aims = moment === 'after-in' || moment === 'after-out' || moment === 'ask-after';
  const written = handler.if?.expr ?? null;
  const picked = written !== null ? conditions.find(([ref]) => written.trim() === `@${ref}`)?.[0] ?? null : null;
  const formula = written !== null && picked === null ? written : null;

  return (
    <Card>
      <CardHead
        title={`Когда №${index + 1}`}
        sub="Что случилось — и что эффект делает в ответ."
        actions={<DangerButton size="sm" onConfirm={onRemove}>Удалить</DangerButton>}
      />

      <div className="row">
        <Field label="Когда" needed={!handler.on}>
          <Select
            value={moment ?? handler.on ?? ''}
            options={[
              ...(handler.on ? [] : [['', '— когда —'] as const]),
              ...MOMENTS,
              ...(Object.keys(TIMES) as MomentKey[])
                .map(key => [`${MOMENT_PREFIX}${key}`, `время: ${TIMES[key]}`] as const),
              ...watchable
                .map(f => [`${FIELD_PREFIX}${f.tag}`, `поле «${f.label}» стало верным`] as const),
              ...hanging
                .map(([key, e]) => [`${GAINED_PREFIX}${key}`, `на мне появилось «${e.label ?? key}»`] as const),
              ...hanging
                .map(([key, e]) => [`${LOST_PREFIX}${key}`, `с меня ушло «${e.label ?? key}»`] as const),
            ] as never}
            onChange={next => edit(draft => {
              if (next in SHAPE) { applyMoment(draft, next as Moment); return; }
              draft.on = next;
              delete draft.of; delete draft.confirm; delete draft.to; delete draft.claims;
            })}
          />
        </Field>

        {isMoment ? null : (
          <Field label="Какое действие">
            <Select
              value={listened ?? ''}
              options={[
                ['', 'любое'] as const,
                ...calledOf(system)
                  .map(([key, e]) => [`event:${key}`, `пришёл «${e.label || key}»`] as const),
                ...Object.entries(system.effects)
                  .filter(([key, e]) => key !== id && (e.activation ?? 'manual') === 'manual')
                  .map(([key, e]) => [key, `действие «${e.label ?? key}»`] as const),
              ] as never}
              onChange={next => edit(draft => { if (next) draft.of = next; else delete draft.of; })}
            />
          </Field>
        )}

        <Fold title="Только если" summary={formula !== null ? `если ${formula}` : picked ? `если ${conditions.find(([ref]) => ref === picked)?.[1] ?? picked}` : 'всегда'}>
        <Field
          label="Делать"
          hint={formula !== null ? 'Сработает, только когда формула верна.'
            : isMoment ? 'У времени, поля и появления эффекта нет исходов — выберите «формулой…», если нужно условие.'
              : conditions.length ? undefined : 'У того, что слушаем, нет шагов с исходом «да/нет» — сработает всегда.'}
        >
          <Select<string>
            value={formula !== null ? BY_FORMULA : picked ?? ''}
            options={[['', 'всегда'], ...conditions, [BY_FORMULA, 'формулой…']]}
            onChange={next => edit(draft => {
              if (next === BY_FORMULA) draft.if = { expr: written ?? '' };
              else if (next) draft.if = { expr: `@${next}` };
              else delete draft.if;
            })}
          />
          {formula !== null ? (
            <FormulaField
              value={formula}
              system={system}
              where={`когда №${index + 1} · только если`}
              extraNames={moment === 'done' ? DONE_NAMES : SEED_NAMES}
              owners
              placeholder={moment === 'done' ? 'например: сколько(@цели.hit.success, да) >= 1' : 'например: @получатель.хиты <= 0'}
              onCommit={next => edit(draft => { draft.if = { expr: next }; })}
            />
          ) : null}
        </Field>
        </Fold>

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
