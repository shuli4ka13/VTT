import { EngineError } from './errors.ts';
import type { System, DieConstant } from '../model/types.ts';

export function dieConstant(system: System, name: string): DieConstant {
  const constants = system.constants;
  if (!constants || !Object.keys(constants).length) {
    throw new EngineError(
      `система «${system.id || '?'}» не объявляет констант — ведущую кость взять неоткуда`);
  }
  const def = constants[name];
  if (!def) {
    throw new EngineError(
      `система не объявляет константы «${name}» — есть: ${Object.keys(constants).join(', ')}`);
  }
  if (def.kind !== 'die') {
    throw new EngineError(`константа «${name}» — не кость (${def.kind}); ею не бросают`);
  }
  return def as DieConstant;
}

export type CountResolver = (ref: unknown, what: string) => number;

export function unfoldDice(def: DieConstant, resolveCount?: CountResolver): DieConstant {
  const dice = (def.dice || []).map(spec => {
    const raw = spec.count ?? 1;
    if (typeof raw === 'number') return spec;
    if (!resolveCount) {
      throw new EngineError(
        `счёт костей «${def.label || '?'}» — ссылка, а разрешить её здесь нечем`);
    }
    const count = resolveCount(raw, `счёт костей «${spec.label || def.label || '?'}»`);
    if (!Number.isInteger(count) || count < 0) {
      throw new EngineError(
        `счёт костей «${def.label || '?'}» должен быть целым не меньше нуля, а вышло ${count}`);
    }
    return { ...spec, count };
  });
  return { ...def, dice };
}

export function dieText(system: System, name: string): string {
  const die = dieConstant(system, name);
  const terms = die.dice ?? [];
  const first = terms[0];
  if (terms.length !== 1 || !first || typeof first.count === 'object') {
    throw new EngineError(
      `«${die.label || name}» — составная кость, её бросает проверка, а числом её не записать`);
  }
  return `${first.count ?? 1}d${first.sides}`;
}
