import type { NamePlace as Place } from '@vtt/engine';
import type { Effect, Step } from '@vtt/schema';
import { t as tt } from '../../../i18n/author.ts';

export type CarrierPart = { part: 'steps' | 'cost' | 'attach' | 'detach' | 'handler' | 'handler-cost'; handler?: number };

type Edit = (change: (draft: Effect) => void) => void;

export const HOOKS = [
  { turn: 'attach', get title() { return tt('effects:hooks.attach.title'); }, get word() { return tt('effects:hooks.attach.word'); }, get hint() { return tt('effects:hooks.attach.hint'); } },
  { turn: 'detach', get title() { return tt('effects:hooks.detach.title'); }, get word() { return tt('effects:hooks.detach.word'); }, get hint() { return tt('effects:hooks.detach.hint'); } },
] as const;

export const costCarrier = (effect: Effect): Effect => ({ ...effect, steps: effect.cost ?? [] }) as Effect;

export const editCost = (edit: Edit): Edit => change => edit(draft => {
  const own = { ...draft, steps: draft.cost ?? [] } as Effect;
  change(own);
  const steps = own.steps ?? [];
  if (steps.length) draft.cost = steps; else delete draft.cost;
});

export const stepsOf = (effect: Effect, at: CarrierPart): Step[] => {
  switch (at.part) {
    case 'steps': return effect.steps ?? [];
    case 'cost': return effect.cost ?? [];
    case 'attach': return effect.attach ?? [];
    case 'detach': return effect.detach ?? [];
    case 'handler': return effect.on?.[at.handler ?? 0]?.steps ?? [];
    case 'handler-cost': return effect.on?.[at.handler ?? 0]?.cost ?? [];
  }
};

export const carrierOf = (effect: Effect, at: CarrierPart): Effect => {
  switch (at.part) {
    case 'steps': return effect;
    case 'cost': return costCarrier(effect);
    case 'attach':
    case 'detach': {
      const hook = HOOKS.find(one => one.turn === at.part)!;
      return { ...effect, label: `${effect.label ?? ''} · ${hook.title}`, steps: effect[at.part] ?? [] } as Effect;
    }
    case 'handler': {
      const index = at.handler ?? 0;
      const handler = effect.on?.[index];
      return { ...effect, label: `${effect.label ?? ''} · ${tt('effects:whileWhen.whenNo', { n: index + 1 })}`, steps: handler?.steps ?? [], cost: handler?.cost } as Effect;
    }
    case 'handler-cost': return costCarrier(carrierOf(effect, { part: 'handler', ...(at.handler !== undefined ? { handler: at.handler } : {}) }));
  }
};

export const editCarrier = (edit: Edit, at: CarrierPart): Edit => {
  switch (at.part) {
    case 'steps': return edit;
    case 'cost': return editCost(edit);
    case 'attach':
    case 'detach': {
      const turn = at.part;
      return change => edit(draft => {
        const view = { ...draft, steps: draft[turn] ?? [] } as Effect;
        change(view);
        draft[turn] = view.steps ?? [];
      });
    }
    case 'handler': {
      const index = at.handler ?? 0;
      return change => edit(draft => {
        const own = draft.on?.[index];
        if (!own) return;
        const view = { ...draft, steps: own.steps ?? [], cost: own.cost } as Effect;
        change(view);
        own.steps = view.steps ?? [];
        if (view.cost?.length) own.cost = view.cost; else delete own.cost;
      });
    }
    case 'handler-cost': return editCost(editCarrier(edit, { part: 'handler', ...(at.handler !== undefined ? { handler: at.handler } : {}) }));
  }
};

export const placeOf = (at: CarrierPart): ((index: number) => Place) => {
  switch (at.part) {
    case 'handler':
    case 'handler-cost': {
      const handler = at.handler ?? 0;
      return index => ({ part: at.part, handler, index });
    }
    default: {
      const part = at.part;
      return index => ({ part, index });
    }
  }
};
