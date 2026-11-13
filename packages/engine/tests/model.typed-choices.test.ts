import { describe, it, expect } from 'vitest';
import { SAMPLE_WORLDS, LITE_WORLDS } from '../src/model/systems.ts';
import { namesAt, type Place } from '../src/model/names-at.ts';
import { typedChoices, isTyped } from '../src/model/typed-choices.ts';
import { paramsOf } from '../src/model/inherit.ts';
import { fieldsOf } from '../src/model/sheet-columns.ts';
import type { System, Step } from '../src/model/types.ts';

const exprOf = (value: unknown): string =>
  (value && typeof value === 'object' && 'expr' in value ? String((value as { expr: unknown }).expr) : JSON.stringify(value)).trim();

function misses(system: System): string[] {
  const out: string[] = [];
  const look = (effectId: string, steps: readonly Step[] | undefined, placeOf: (index: number) => Place, where: string) => {
    (steps ?? []).forEach((step, index) => {
      const it = step as unknown as { effect?: unknown; args?: Record<string, unknown>; to?: unknown };
      const names = namesAt(system, effectId, placeOf(index));
      const check = (want: Parameters<typeof typedChoices>[2], value: unknown, what: string) => {
        if (value === undefined || value === null) return;
        const text = exprOf(value);
        if (text.includes('(') && !text.startsWith('первый(')) return;
        if (!typedChoices(system, names, want).some(one => one.expr === text)) out.push(`${effectId} · ${where} ${index} · ${what} = ${text}`);
      };
      if ((step.type === 'status' || step.type === 'ask') && it.to !== undefined) check({ kind: 'sheet' }, it.to, 'на кого');
      const called = typeof it.effect === 'string' ? system.effects?.[it.effect] : undefined;
      if (!called || !it.args) return;
      for (const param of paramsOf(system, called)) {
        if (param.kind === 'field') {
          const text = it.args[param.key] === undefined ? '' : exprOf(it.args[param.key]);
          const found = /^@([\p{L}\p{N}_]+)\.([\p{L}\p{N}_.]+)$/u.exec(text);
          if (!found) continue;
          const sheet = names.some(one => one.name === found[1] && one.kind === 'sheet' && !one.many);
          const row = names.find(one => one.name === found[2]!.split('.')[0] && one.kind === 'choice');
          const stored = fieldsOf(system).some(field => field.tag === found[2] && field.value.kind === 'stored');
          if (!sheet || !(stored || row)) out.push(`${effectId} · ${where} ${index} · ${it.effect}.${param.key} = ${text}`);
          continue;
        }
        if (!isTyped(param.kind)) continue;
        check({ kind: param.kind!, ...(param.from ? { from: param.from } : {}), ...(param.many ? { many: true } : {}) }, it.args[param.key], `${it.effect}.${param.key}`);
      }
    });
  };
  for (const [id, effect] of Object.entries(system.effects ?? {})) {
    look(id, effect.steps, index => ({ part: 'steps', index }), 'шаг');
    look(id, effect.cost, index => ({ part: 'cost', index }), 'плата');
    (effect.on ?? []).forEach((handler, at) => {
      look(id, handler.steps, index => ({ part: 'handler', handler: at, index }), `подписка ${at} шаг`);
      look(id, handler.cost, index => ({ part: 'handler-cost', handler: at, index }), `подписка ${at} плата`);
    });
  }
  return out;
}

describe('вход строгого вида: значение из образца есть в списке (формулы — пунктом «формулой…»)', () => {
  for (const world of [...SAMPLE_WORLDS, ...LITE_WORLDS]) {
    it(world.system.name ?? world.id ?? "?", () => {
      expect(misses(world.system)).toEqual([]);
    });
  }
});
