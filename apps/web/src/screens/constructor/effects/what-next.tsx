import type { System, Effect, Step } from '@vtt/schema';
import { Drawer, Button, Empty, Chip } from '../../../ui/primitives.tsx';
import { Readback } from './cards/group-card.tsx';
import { groupSteps } from '../cards.ts';
import { stepNames, fieldedOf } from '../slots.tsx';
import { CARD_TITLES, titleOf } from './words.ts';
import { checkReadback, changeReadback, numberReadback, rollReadback, sendReadback } from '../readback.ts';
import type { Segment } from '../readback.ts';
import { formulaAsLabels } from '../../../ui/formula.tsx';
import { tagsSaid } from '../tag-said.ts';
import { useT, t as tt } from '../../../i18n/author.ts';

type Loose = Record<string, unknown>;

const loose = (thing: unknown): Loose => thing as Loose;

export function linesOf(
  kind: string, step: Step, amount: Step | null, system: System, effect: Effect, names: Map<string, string>,
): Segment[] {
  if (kind === 'check') return checkReadback(step, system, effect, names);
  if (kind === 'roll') return rollReadback(step, system, effect, names);
  if (kind === 'change') return changeReadback(step, amount, system, effect, names);
  if (kind === 'number') return numberReadback(step, system, effect, names);
  if (kind === 'send') return sendReadback(step, system, effect, names);
  return [{ text: CARD_TITLES[kind as keyof typeof CARD_TITLES] ?? tt('effects:whatNext.step') }];
}

function namesInside(system: System, effect: Effect): Map<string, string> {
  const steps = (effect.steps ?? []) as Step[];
  const earlier = steps.map(step => ({
    id: String(step.id ?? ''), ...(step.label ? { label: step.label } : {}), type: step.type, ...fieldedOf(system, effect.params ?? [], step),
    title: titleOf(groupSteps([step])[0]?.kind ?? '', step, system),
  })).filter(step => step.id);
  return stepNames({ system, effect, earlier });
}

interface Meddler { by: string; how: string; tags: string[]; each: boolean; where?: string }

const howOf = (op: string): string => (op === 'mul' ? tt('effects:whatNext.how.mul') : op === 'set' ? tt('effects:whatNext.how.set') : op === 'add' ? tt('effects:whatNext.how.add') : op);

function whereText(system: System, raw: unknown): string | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const w = raw as { table?: string; column?: string; is?: unknown };
  const table = w.table ? system.tables?.[w.table] : undefined;
  const column = (table?.columns ?? []).find(c => c.key === w.column);
  return tt('effects:whatNext.where', { column: (column?.label || w.column || '').toLowerCase(), is: String(w.is ?? '') });
}

export function meddlersOf(system: System, eventId: string): Meddler[] {
  const seen = new Map<string, Meddler & { values: Set<string> }>();
  for (const effect of Object.values(system.effects ?? {})) {
    for (const modifier of (effect.modifiers ?? []) as unknown[]) {
      const m = loose(modifier);
      if (m.kind !== 'edit' || m.call !== eventId) continue;
      const raw = m.value && typeof m.value === 'object' ? loose(m.value) : null;
      const value = raw ? String(raw.expr ?? '') : String(m.value ?? '');
      const op = String(m.op ?? 'add');
      const by = effect.label ?? tt('effects:whatNext.rule');
      const where = whereText(system, m.where);
      const key = `${by}\u0000${op}\u0000${where ?? ''}`;
      const found = seen.get(key) ?? {
        by, how: howOf(op), tags: [], each: false, values: new Set<string>(), ...(where ? { where } : {}),
      };
      found.values.add(value);
      for (const tag of [...(Array.isArray(m.tags) ? m.tags : []), ...(Array.isArray(m.anyTags) ? m.anyTags : [])]) {
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
      ...(found.where ? { where: found.where } : {}),
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
  const t = useT('effects');
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
      sub={t('whatNext.sub')}
      footer={called ? (
        <Button onClick={() => { onEdit(eventId); onClose(); }}>{t('whatNext.edit', { name: called.label })}</Button>
      ) : null}
    >
      {!called ? (
        <Empty title={t('whatNext.missingTitle')} hint={t('whatNext.missingHint')} />
      ) : (
        <>
          <section className="stack stack--tight">
            <span className="field__label">{t('whatNext.meddlers')}</span>
            {meddlers.length ? meddlers.map((m, i) => (
              <div key={i} className="inline inline--tight">
                <Chip>{m.by}</Chip>
                <span className="faint">{m.each ? t('whatNext.ownField', { how: m.how }) : m.how}</span>
                {m.where ? <span className="faint">· {m.where}</span> : null}
                {m.tags.length ? (
                  <span className="faint">
                    {m.tags.length > 6
                      ? t('whatNext.tagsMore', { list: tagsSaid(system, m.tags.slice(0, 6)), n: m.tags.length - 6 })
                      : t('whatNext.tags', { list: tagsSaid(system, m.tags) })}
                  </span>
                ) : null}
              </div>
            )) : (
              <span className="faint">
                {t('whatNext.none', { name: called.label })}
              </span>
            )}
          </section>

          <section className="stack stack--tight">
            <span className="field__label">{t('whatNext.then')}</span>
            {cards.length ? cards.map((card, i) => (
              <div key={i} className="drawer__step">
                <div className="drawer__step-head">
                  <span className="drawer__step-no num">{i + 1}</span>
                  <span className="drawer__step-name">
                    {titleOf(card.kind, card.step, system)}
                  </span>
                </div>
                <Readback segments={linesOf(card.kind, card.step, card.amount, system, called, names)} />
              </div>
            )) : (
              <Empty title={t('whatNext.noSteps')} hint={t('whatNext.noStepsHint')} />
            )}
          </section>
        </>
      )}
    </Drawer>
  );
}
