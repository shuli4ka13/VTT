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
//
// {prop} звавший эффект НАПРЯМУЮ — не только через привязку рода. Своя
// активность записи компендиума (`record.activities`) и однобиндинговый
// ярлык (`record.effect`/`record.args`) зовут эффект точно тем же образом,
// и после переноса {prop} в шаге на {param} им обеим нужен тот же аргумент
// {prop}, иначе значение молча теряется (optional → null) или упаковка
// падает. Система одна на мир, а таких вызывающих — сколько угодно, поэтому
// перенос сделан в два прохода: `unifySystem` считает переименования один
// раз, `unifyWorld` прикладывает их и к системе, и к компендиуму.

import type { System, Compendium, CompendiumRecord } from './types.ts';

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

/** Переименования одного эффекта: propKey записи → paramKey потребности. */
type EffectRenames = Map<string, string>;
/** Переименования всего мира, по эффекту — что писать в args любого вызова. */
type Renames = Map<string, EffectRenames>;

/**
 * Системный проход: переносит прямые {prop} в шагах на {param} и заводит
 * потребности эффектов. Возвращает и новую систему, и сами переименования —
 * `unifyRecordRefs` берёт только систему, `unifyWorld` использует и то,
 * и другое для второго прохода по компендиуму.
 */
function unifySystem(system: System): { system: System; renames: Renames } {
  const source = system as unknown as Loose;
  if (!hasDirect(source)) return { system, renames: new Map() };

  // Данные мира — чистый JSON, и клонируются как JSON: без structuredClone
  // модуль остаётся годным для любой среды, где движок запускают.
  const next: Loose = JSON.parse(JSON.stringify(source));
  const allRenames: Renames = new Map();

  /** Чем свойство объявлено у родов: оттуда потребность берёт имя и вид. */
  const propDecl = (key: string): Loose | null => {
    for (const kind of Object.values(next.records ?? {}) as Loose[]) {
      const found = (kind.props ?? []).find((p: Loose) => p.key === key);
      if (found) return found;
    }
    return null;
  };

  for (const [effectId, effect] of Object.entries(next.effects ?? {}) as [string, Loose][]) {
    const renames: EffectRenames = new Map();

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
    allRenames.set(effectId, renames);

    // Кто звал этот эффект — тот и закрывает его потребности своим свойством.
    // Это привязки РОДА (system.records[*].bindings); свои привязки записи
    // компендиума живут отдельно и достаются вторым проходом, unifyCompendium.
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

  return { system: next as unknown as System, renames: allRenames };
}

/**
 * Перевод системы на одну связь. Чистая: вход не мутирует, системе без
 * прямых ссылок возвращает её саму (это и признак «мигрировать нечего»).
 *
 * Видит только систему — если {prop} звал эффект из СОБСТВЕННОЙ активности
 * записи компендиума, а не из привязки рода, эта функция такой вызов не
 * закроет: он живёт не в системе. Для целого мира — `unifyWorld`.
 */
export function unifyRecordRefs(system: System): System {
  return unifySystem(system).system;
}

/** Одна привязка (activities-запись либо record.effect/record.args) закрывает
 * потребности эффекта тем же приёмом, что и привязка рода: если аргумента
 * ещё нет, он получает {prop: propKey}. Возвращает null, если менять нечего —
 * так вызывающий отличает «трогать не надо» от «пришлось скопировать». */
function fillArgs(effectId: string, args: Loose | undefined, renames: Renames): Loose | null {
  const effectRenames = renames.get(effectId);
  if (!effectRenames) return null;
  const next: Loose = { ...(args ?? {}) };
  let changed = false;
  for (const [propKey, paramKey] of effectRenames) {
    if (next[paramKey] === undefined) { next[paramKey] = { prop: propKey }; changed = true; }
  }
  return changed ? next : null;
}

/**
 * Компендиумный проход: те же переименования, но для вызовов эффекта мимо
 * привязки рода — своя активность записи (`record.activities`) и ярлык
 * `record.effect`/`record.args` (см. `bindingsOf`, events/envelope.ts).
 * Своя активность перебивает привязку рода, поэтому обе формы, а не одна.
 */
function unifyCompendium(compendium: Compendium, renames: Renames): Compendium {
  if (!renames.size) return compendium;

  let touched = false;

  const convertRecord = (record: CompendiumRecord): CompendiumRecord => {
    const r = record as Loose;

    if (r.activities && (r.activities as Loose[]).length) {
      let recordChanged = false;
      const activities = (r.activities as Loose[]).map(binding => {
        const args = fillArgs(String(binding.effect), binding.args, renames);
        if (args === null) return binding;
        recordChanged = true;
        return { ...binding, args };
      });
      if (!recordChanged) return record;
      touched = true;
      return { ...record, activities } as CompendiumRecord;
    }

    if (r.effect) {
      const args = fillArgs(String(r.effect), r.args, renames);
      if (args === null) return record;
      touched = true;
      return { ...record, args } as CompendiumRecord;
    }

    return record;
  };

  const items = (compendium.items ?? []).map(convertRecord);
  const actions = (compendium.actions ?? []).map(convertRecord);

  return touched ? { ...compendium, items, actions } : compendium;
}

/**
 * Перевод ЦЕЛОГО мира: система плюс компендиум одним вызовом. Конвертер
 * обязан видеть весь мир — {prop} разрешается и из привязки рода, и из
 * собственной активности записи компендиума, и переносить только систему
 * (как делал `unifyRecordRefs`) значит терять второе молча.
 */
export function unifyWorld(
  world: { system: System; compendium: Compendium },
): { system: System; compendium: Compendium } {
  const { system, renames } = unifySystem(world.system);
  const compendium = unifyCompendium(world.compendium, renames);
  return { system, compendium };
}
