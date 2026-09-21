import type { System, Effect, Step } from '@vtt/schema';
import { Drawer, Button, Empty, Chip } from '../../../ui/primitives.tsx';
import { Readback } from './cards/group-card.tsx';
import { groupSteps } from '../cards.ts';
import { stepNames } from '../slots.tsx';
import { CARD_TITLES } from './words.ts';
import { checkReadback, changeReadback, numberReadback, sendReadback, joinReadback } from '../readback.ts';
import type { Segment } from '../readback.ts';
import { eventTagOf } from '@vtt/engine/engine/targets';
import { formulaAsLabels } from '../../../ui/formula.tsx';

type Loose = Record<string, unknown>;

const loose = (thing: unknown): Loose => thing as Loose;

function linesOf(
  kind: string, step: Step, amount: Step | null, system: System, effect: Effect, names: Map<string, string>,
): Segment[] {
  if (kind === 'check') return checkReadback(step, system, effect, names);
  if (kind === 'change') return changeReadback(step, amount, system, effect, names);
  if (kind === 'number') return numberReadback(step, system, effect, names);
  if (kind === 'send') return sendReadback(step, system, effect, names);
  return [{ text: CARD_TITLES[kind as keyof typeof CARD_TITLES] ?? 'шаг' }];
}

function namesInside(system: System, effect: Effect): Map<string, string> {
  const steps = (effect.steps ?? []) as Step[];
  const earlier = steps.map((step, at) => ({
    id: String(step.id ?? ''), type: step.type, at: at + 1,
    title: CARD_TITLES[(groupSteps([step])[0]?.kind ?? '') as keyof typeof CARD_TITLES],
  })).filter(step => step.id);
  return stepNames({ system, effect, earlier });
}

interface Meddler { by: string; how: string; tags: string[]; each: boolean }

const HOW: Record<string, string> = { mul: 'умножает на', set: 'делает равным', add: 'прибавляет' };

export function meddlersOf(system: System, eventId: string): Meddler[] {
  const mark = eventTagOf(eventId);
  const seen = new Map<string, Meddler & { values: Set<string> }>();
  for (const effect of Object.values(system.effects ?? {})) {
    for (const modifier of (effect.modifiers ?? []) as unknown[]) {
      const m = loose(modifier);
      if (m.target !== mark) continue;
      const raw = m.value && typeof m.value === 'object' ? loose(m.value) : null;
      const value = raw ? String(raw.expr ?? raw.const ?? '') : String(m.value ?? '');
      const op = String(m.op ?? 'add');
      const by = effect.label ?? 'правило';
      const key = `${by}\u0000${op}`;
      const found = seen.get(key) ?? { by, how: HOW[op] ?? op, tags: [], each: false, values: new Set<string>() };
      found.values.add(value);
      for (const tag of (Array.isArray(m.tags) ? m.tags : [])) {
        if (!found.tags.includes(String(tag))) found.tags.push(String(tag));
      }
      seen.set(key, found);
    }
  }
  return [...seen.values()].map(found => {
    const alone = found.values.size === 1 ? [...found.values][0]! : '';
    return {
      by: found.by,
      how: found.how,
      tags: found.tags,
      each: found.values.size > 1,
      ...(alone ? { how: `${found.how} ${formulaAsLabels(system, alone)}` } : {}),
    };
  });
}

export function WhatNext({ open, onClose, system, eventId, onEdit }: {
  open: boolean;
  onClose: () => void;
  system: System;
  eventId: string;
  onEdit: (id: string) => void;
}) {
  const called = system.effects?.[eventId];
  const steps = (called?.steps ?? []) as Step[];
  const cards = groupSteps(steps);
  const meddlers = meddlersOf(system, eventId);
  const names = called ? namesInside(system, called) : new Map<string, string>();

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={called?.label ?? eventId}
      sub="Это считается уже на листе цели — её полями и её правилами."
      footer={called ? (
        <Button onClick={() => { onEdit(eventId); onClose(); }}>править «{called.label}»</Button>
      ) : null}
    >
      {!called ? (
        <Empty title="Такого эффекта в системе нет" hint="Выберите, кого звать, в поле «Зовём эффект»." />
      ) : (
        <>
          <section className="stack stack--tight">
            <span className="field__label">Что цель может изменить по дороге</span>
            {meddlers.length ? meddlers.map((m, i) => (
              <div key={i} className="inline inline--tight">
                <Chip>{m.by}</Chip>
                <span className="faint">{m.each ? `${m.how} своё поле листа` : m.how}</span>
                {m.tags.length ? (
                  <span className="faint">
                    {m.tags.length > 6
                      ? `· по меткам: ${m.tags.slice(0, 6).join(', ')} и ещё ${m.tags.length - 6}`
                      : `· по меткам: ${m.tags.join(', ')}`}
                  </span>
                ) : <span className="faint">· всегда</span>}
              </div>
            )) : (
              <span className="faint">
                Ничего: сколько отправили, столько и дойдёт. Сопротивления и уязвимости — это правила,
                которые правят «{called.label}» по метке.
              </span>
            )}
          </section>

          <section className="stack stack--tight">
            <span className="field__label">Затем цель делает по порядку</span>
            {cards.length ? cards.map((card, i) => (
              <div key={i} className="drawer__step">
                <div className="drawer__step-head">
                  <span className="drawer__step-no num">{i + 1}</span>
                  <span className="drawer__step-name">
                    {CARD_TITLES[card.kind as keyof typeof CARD_TITLES] ?? card.kind}
                  </span>
                </div>
                <Readback segments={linesOf(card.kind, card.step, card.amount, system, called, names)} />
              </div>
            )) : (
              <Empty title="Шагов нет" hint="Этот эффект пока ничего не делает с целью." />
            )}
          </section>
        </>
      )}
    </Drawer>
  );
}

export const whatNextSummary = (system: System, eventId: string): string => {
  const called = system.effects?.[eventId];
  if (!called) return '';
  const steps = (called.steps ?? []) as Step[];
  const first = groupSteps(steps)[0];
  if (!first) return 'ничего не делает';
  return joinReadback(linesOf(first.kind, first.step, first.amount, system, called, namesInside(system, called)));
};
