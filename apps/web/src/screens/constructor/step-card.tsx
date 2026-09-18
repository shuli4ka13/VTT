import type { System, Effect, Step } from '@vtt/schema';
import { compile } from '@vtt/engine/formula';
import { registry } from '@vtt/engine/engine/steps/index';
import { kindOf, declaredProps } from './slots.tsx';
import type { SlotKind, EarlierStep } from './slots.tsx';

export interface SlotSpec {
  key: string;
  label: string;
  main?: boolean;
  allow?: SlotKind[];
  required?: boolean;
  choice?: readonly (readonly [string, string])[];
  fallback?: string;
}

export const slotsOf = (type: string): SlotSpec[] | null => {
  const mod = registry.get(type);
  return mod ? ((mod.slots ?? []) as SlotSpec[]) : null;
};

const formulaDeps = (source: string): readonly string[] | null => {
  try { return compile(source).deps; } catch { return null; }
};

const read = (step: Step, path: string): unknown =>
  path.split('.').reduce<any>((node, key) => (node == null ? undefined : node[key]), step);

const write = (step: Step, path: string, value: unknown): void => {
  const keys = path.split('.');
  const last = keys.pop()!;
  let node = step as any;
  for (const key of keys) {
    node[key] ??= {};
    node = node[key];
  }
  if (value === null || value === undefined) delete node[last];
  else node[last] = value;
};

export interface Problem { text: string; missingField?: string }

export function problemOf(step: Step, system: System, effect: Effect, earlier: EarlierStep[]): Problem | null {
  const slots = slotsOf(step.type);
  if (!slots) return { text: `движок не знает типа шага «${step.type}»` };

  for (const slot of slots) {
    const value = read(step, slot.key);
    if (slot.required && (value === null || value === undefined)) {
      return { text: `не заполнено: ${slot.label.toLowerCase()}` };
    }
    if (value === null || value === undefined) continue;

    const kind = kindOf(value);
    const ref = value as Record<string, unknown>;

    if (kind.kind === 'prop') {
      const key = String(ref.prop ?? ref.item);
      if (!key) return { text: `${slot.label.toLowerCase()}: свойство не выбрано` };
      if (!declaredProps(system).has(key)) {
        return { text: `свойство «${key}» не объявлено ни одним родом записей — заведите его на вкладке «Записи»` };
      }
    }
    if (kind.kind === 'param') {
      const key = String(ref.param);
      if (!effect.params?.some(p => p.key === key)) {
        return { text: `потребность «${key}» эффектом не объявлена` };
      }
    }
    if (kind.kind === 'tag') {
      const tag = String(ref.tag);
      if (!tag) return { text: `${slot.label.toLowerCase()}: поле не выбрано` };
      if (!system.fields.some(f => f.tag === tag)) {
        return { text: `поля «${tag}» в системе нет — заведите его на вкладке «Лист»`, missingField: tag };
      }
    }
    if (kind.kind === 'expr') {
      const source = String(ref.expr ?? '').trim();
      const deps = source ? formulaDeps(source) : null;

      const missing = deps?.find(tag =>
        !system.fields.some(f => f.tag === tag) && !earlier.some(step => step.id === tag));
      if (missing) {
        return {
          text: `формула ссылается на поле «${missing}», которого в системе нет — заведите его на вкладке «Лист»`,
          missingField: missing,
        };
      }
    }
    if (kind.kind === 'constant') {
      const name = String(ref.constant);
      if (!system.constants?.[name]) return { text: `кости «${name}» в системе нет` };
    }
    if (kind.kind === 'ref') {
      const name = String(ref.ref).split('.')[0]!;
      if (!earlier.some(s => s.id === name)) {
        return { text: `шага «${name}» выше по цепочке нет — на его результат не сослаться` };
      }
    }
  }
  return null;
}
