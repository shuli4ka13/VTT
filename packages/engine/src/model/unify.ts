// Одна связь с записью: прямая ссылка на свойство в слоте шага становится
// ПОТРЕБНОСТЬЮ эффекта, а закрывает её привязка рода своим свойством.
//
// Зачем: связей было две — слот мог сослаться на свойство записи напрямую
// ({prop}), а мог через объявленную потребность ({param}) плюс аргумент
// привязки. Два пути к одному месту нельзя ни объяснить человеку, ни
// показать на экране: эффект не знал, чего хочет от записи, а род не знал,
// чего от него ждёт эффект. После миграции путь один, и оба конца видимы.
//
//   было:  шаг { dice: { prop: 'damage_dice' } }               ← род ни при чём
//   стало: эффект.params [{ key: 'damage_dice', … }]           ← «беру из записи»
//          шаг { dice: { param: 'damage_dice' } }
//          привязка.args { damage_dice: { prop: 'damage_dice' } } ← «закрываю»
//
// Как и migrate.ts рядом — одноразовое преобразование ДАННЫХ, не слой
// совместимости: движок обе формы понимал и раньше, меняется то, что пишут
// экраны. Поэтому мир старого вида читается свободно, типом Loose.

import type { System } from './types.ts';

/** Мир прежнего вида читается свободно: его форма уже не производится. */
type Loose = Record<string, any>;

/** Ключ свойства записи, если ссылка — прямая. Иначе null. */
const directProp = (ref: unknown): string | null => {
  if (!ref || typeof ref !== 'object') return null;
  const r = ref as Loose;
  if ('prop' in r) return String(r.prop);
  // `item` — прежнее имя той же формы, оставлено рабочим.
  if ('item' in r) return String(r.item);
  return null;
};

/** Обход слотов вглубь: составные слоты (roll) прячут ссылки на этаж ниже. */
function walkSlots(node: Loose, visit: (holder: Loose, key: string) => void): void {
  if (!node || typeof node !== 'object') return;
  for (const key of Object.keys(node)) {
    const value = node[key];
    if (directProp(value) !== null) visit(node, key);
    else if (value && typeof value === 'object') walkSlots(value, visit);
  }
}

const hasDirect = (system: Loose): boolean => {
  let found = false;
  for (const effect of Object.values(system.effects ?? {}) as Loose[]) {
    for (const step of (effect.steps ?? []) as Loose[]) {
      walkSlots(step, () => { found = true; });
    }
  }
  return found;
};

/**
 * Перевод системы на одну связь. Чистая: вход не мутирует, системе без
 * прямых ссылок возвращает её саму (это и признак «мигрировать нечего»).
 */
export function unifyRecordRefs(system: System): System {
  const source = system as unknown as Loose;
  if (!hasDirect(source)) return system;

  // Данные мира — чистый JSON, и клонируются как JSON: без structuredClone
  // модуль остаётся годным для любой среды, где движок запускают.
  const next: Loose = JSON.parse(JSON.stringify(source));

  /** Чем свойство объявлено у родов: оттуда потребность берёт имя и вид. */
  const propDecl = (key: string): Loose | null => {
    for (const kind of Object.values(next.records ?? {}) as Loose[]) {
      const found = (kind.props ?? []).find((p: Loose) => p.key === key);
      if (found) return found;
    }
    return null;
  };

  for (const [effectId, effect] of Object.entries(next.effects ?? {}) as [string, Loose][]) {
    const renames = new Map<string, string>();

    for (const step of (effect.steps ?? []) as Loose[]) {
      walkSlots(step, (holder, key) => {
        const propKey = directProp(holder[key])!;
        let paramKey = renames.get(propKey);
        if (!paramKey) {
          // Список потребностей заводится при первом реальном переносе:
          // эффекту, которому переносить нечего, пустой список ни к чему.
          const params: Loose[] = (effect.params ??= []);
          paramKey = propKey;
          for (let n = 2; params.some(p => p.key === paramKey); n++) paramKey = `${propKey}_${n}`;
          const decl = propDecl(propKey);
          params.push({ key: paramKey, label: decl?.label ?? propKey, kind: decl?.kind ?? 'expr' });
          renames.set(propKey, paramKey);
        }
        const optional = (holder[key] as Loose).optional;
        holder[key] = optional ? { param: paramKey, optional } : { param: paramKey };
      });
    }

    if (!renames.size) continue;

    // Кто звал этот эффект — тот и закрывает его потребности своим свойством.
    for (const kind of Object.values(next.records ?? {}) as Loose[]) {
      for (const binding of (kind.bindings ?? []) as Loose[]) {
        if (binding.effect !== effectId) continue;
        binding.args ??= {};
        for (const [propKey, paramKey] of renames) {
          binding.args[paramKey] ??= { prop: propKey };
        }
      }
    }
  }

  return next as unknown as System;
}
