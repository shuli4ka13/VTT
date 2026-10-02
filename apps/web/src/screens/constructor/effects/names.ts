import { heardNames, listenerOf, HOLDER } from '@vtt/engine/model/references';
import type { SheetNames } from '../../../ui/formula-chips.tsx';
import type { System, Effect, Handler, Step, Param } from '@vtt/schema';

const sheetParams = (params: readonly Param[] | undefined): [string, string][] =>
  (params ?? []).filter(param => param.kind === 'sheet').map(param => [param.key, param.label ?? param.key]);

const loopOf = (steps: readonly Step[], upTo: number): [string, string] | null => {
  const at = steps.findIndex(step => step.type === 'each');
  if (at < 0 || at >= upTo) return null;
  const each = steps[at] as { of?: string; as?: string };
  return each.as ? [each.as, each.as] : null;
};

export function stepSheets(effect: Effect, part: 'steps' | 'cost' | 'attach' | 'detach', index: number): SheetNames {
  const out = new Map<string, string>(sheetParams(effect.params));
  if (part === 'steps') {
    const loop = loopOf(effect.steps ?? [], index);
    if (loop) out.set(loop[0], loop[1]);
  }
  if (part === 'attach' || part === 'detach') out.set(HOLDER, HOLDER);
  return out;
}

export function handlerSheets(system: System, effect: Effect, handler: Handler): SheetNames {
  const heard = heardNames(system, listenerOf(handler));
  const listened = heard.listened;
  const labels = new Map<string, string>(sheetParams(listened?.params));
  const out = new Map<string, string>();
  for (const name of heard.sheets) out.set(name, labels.get(name) ?? name);
  for (const [key, label] of sheetParams(effect.params)) out.set(key, label);
  out.set(HOLDER, HOLDER);
  return out;
}

export const holderPhrase = (name: string): string => `@${name} == @${HOLDER}`;
