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

// ── правки броска: зашитый режим → запись словаря автора ────────────────
//
// Было: модификатор нёс `effect: 'advantage'` и `method: 'rerollBest'` —
// движок знал слово «преимущество» лично, а гашение было законом кода.
// Стало: модификатор называет ЗАПИСЬ словаря (`system.roll_edits`), запись
// собрана из примитивов и сама говорит, чем гасится. Конвертер заводит две
// стартовые записи с привычными именами — дальше автор волен их переименовать,
// разделить или добавить третью.

const LEGACY_EDITS: Record<string, Loose> = {
  advantage: {
    label: 'Преимущество',
    ops: [{ op: 'addDie' }, { op: 'keepBest', n: 1 }],
    canceledBy: 'disadvantage',
  },
  disadvantage: {
    label: 'Помеха',
    ops: [{ op: 'addDie' }, { op: 'keepWorst', n: 1 }],
    canceledBy: 'advantage',
  },
};

/** Модификаторы одного носителя: старую форму — на ссылку в словарь. */
function convertRollMods(mods: Loose[] | undefined, used: Set<string>): Loose[] | null {
  if (!mods?.length) return null;
  let changed = false;
  const next = mods.map(mod => {
    if (mod.kind !== 'roll' || !mod.effect) return mod;
    const key = String(mod.effect);
    used.add(key);
    changed = true;
    // `method` уходит вместе с `effect`: чем правка отыгрывается, сказано
    // теперь в самой записи, а не в каждой ссылке на неё.
    const { effect: _effect, method: _method, ...rest } = mod;
    return { ...rest, edit: key };
  });
  return changed ? next : null;
}

const hasLegacyRoll = (carriers: Loose[]) =>
  carriers.some(c => ((c.modifiers ?? []) as Loose[]).some(m => m.kind === 'roll' && m.effect));

/**
 * Перевод правок броска на словарь — система и компендиум разом: бонусы
 * НОСИТ И ПРЕДМЕТ («меч даёт преимущество»), и переводить только систему
 * значило бы оставить мир на двух формах сразу.
 *
 * Чистая: миру без старой формы возвращает его же. Заводит только те записи,
 * на которые правда ссылаются, и не трогает уже существующие в словаре —
 * свои имена автора важнее наших.
 */
function convertRollEdits(
  system: System, compendium?: Compendium,
): { system: System; compendium?: Compendium } {
  const source = system as unknown as Loose;
  const items = ((compendium?.items ?? []) as unknown as Loose[]);
  if (!hasLegacyRoll(Object.values(source.effects ?? {}) as Loose[]) && !hasLegacyRoll(items)) {
    return { system, compendium };
  }

  const next: Loose = JSON.parse(JSON.stringify(source));
  const used = new Set<string>();

  for (const effect of Object.values(next.effects ?? {}) as Loose[]) {
    const converted = convertRollMods(effect.modifiers, used);
    if (converted) effect.modifiers = converted;
  }

  let nextCompendium = compendium;
  if (compendium && hasLegacyRoll(items)) {
    const copy: Loose = JSON.parse(JSON.stringify(compendium));
    for (const item of (copy.items ?? []) as Loose[]) {
      const converted = convertRollMods(item.modifiers, used);
      if (converted) item.modifiers = converted;
    }
    nextCompendium = copy as unknown as Compendium;
  }

  next.roll_edits ??= {};
  for (const key of used) {
    if (!next.roll_edits[key] && LEGACY_EDITS[key]) {
      next.roll_edits[key] = JSON.parse(JSON.stringify(LEGACY_EDITS[key]));
    }
  }
  // Пара гасит друг друга только если в мире есть обе: одинокое преимущество
  // ссылалось бы на несуществующую запись, а это ошибка приговора.
  for (const [key, edit] of Object.entries(next.roll_edits) as [string, Loose][]) {
    if (edit.canceledBy && !next.roll_edits[edit.canceledBy]) delete edit.canceledBy;
    if (!edit.label) edit.label = key;
  }

  // `advantage.methods` — прежний межсистемный справочник механик. Механика
  // переехала в записи словаря, справочник больше ни на что не влияет.
  delete next.advantage;

  return { system: next as unknown as System, compendium: nextCompendium };
}

/** Только система — для вызывающих, у кого компендиума под рукой нет. */
export function unifyRollEdits(system: System): System {
  return convertRollEdits(system).system;
}

/** Мир целиком — этим заканчивает миграцию с версии 1 (model/migrate.ts). */
export function unifyRollEditsWorld<T extends { system: System; compendium: Compendium }>(
  world: T,
): T {
  const next = convertRollEdits(world.system, world.compendium);
  return { ...world, system: next.system, compendium: next.compendium ?? world.compendium };
}

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
  return unifyRollEdits(unifySystem(system).system);
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
 * Границы значения переезжают с шага «применить» на САМО поле.
 *
 * Старый формат писал floor/ceiling на каждом эффекте — и в образцах D&D
 * «не ниже нуля» повторялся трижды на трёх эффектах, трогающих одни ХП.
 * Это природа поля, а не эффекта: hp_current ⩾ 0 и ⩽ hp_max, кто бы его
 * ни менял. Движок с тех пор зажимает по границам поля (steps/apply.ts),
 * а шаговых floor/ceiling не читает.
 *
 * Куда писать границу, говорит мишень шага: тег — прямо в поле; параметр —
 * во все поля, которыми этот параметр заполняют привязки родов, свои
 * активности записей и ярлыки действий. Конфликт (у поля уже другая
 * граница) не перетирается: первая объявленная остаётся.
 */
export function unifyBounds(
  world: { system: System; compendium?: Compendium },
): { system: System; compendium?: Compendium } {
  const system = world.system as unknown as Loose;
  const effects = (system.effects ?? {}) as Record<string, Loose>;

  /** Чем заполняют параметр `key` эффекта `effectId` — собрать теги по миру. */
  const tagsOfParam = (effectId: string, key: string): string[] => {
    const out = new Set<string>();
    const take = (binding: Loose | undefined) => {
      if (!binding || String(binding.effect) !== effectId) return;
      const arg = (binding.args as Loose | undefined)?.[key];
      if (typeof arg === 'string' && arg) out.add(arg);
    };
    for (const record of Object.values((system.records ?? {}) as Record<string, Loose>)) {
      for (const b of (record.bindings as Loose[] | undefined) ?? []) take(b);
    }
    for (const list of [world.compendium?.items, world.compendium?.actions]) {
      for (const record of (list ?? []) as Loose[]) {
        take(record);
        for (const b of (record.activities as Loose[] | undefined) ?? []) take(b);
      }
    }
    return [...out];
  };

  const boundValue = (ref: unknown): number | string | null => {
    if (!ref || typeof ref !== 'object') return null;
    const r = ref as Loose;
    if ('const' in r && typeof r.const === 'number') return r.const;
    if ('tag' in r) return `#${String(r.tag)}`;
    if ('expr' in r) return String(r.expr);
    return null;
  };

  // Первый проход: собрать границы по тегам и запомнить, какие шаги
  // удалось перевести (только их и чистим — непереводимое честнее оставить
  // мёртвыми данными, чем потерять молча).
  const bounds = new Map<string, { min?: number | string; max?: number | string }>();
  const translated = new Set<Loose>();

  for (const [effectId, effect] of Object.entries(effects)) {
    for (const step of (effect.steps as Loose[] | undefined) ?? []) {
      if (step.type !== 'apply' || (step.floor === undefined && step.ceiling === undefined)) continue;
      const target = step.target as Loose | undefined;
      const tags = target && 'tag' in target ? [String(target.tag)]
        : target && 'param' in target ? tagsOfParam(effectId, String(target.param))
          : [];
      if (!tags.length) continue;
      const min = boundValue(step.floor);
      const max = boundValue(step.ceiling);
      if ((step.floor !== undefined && min === null) || (step.ceiling !== undefined && max === null)) continue;
      for (const tag of tags) {
        const entry = bounds.get(tag) ?? {};
        if (min !== null) entry.min = entry.min ?? min;
        if (max !== null) entry.max = entry.max ?? max;
        bounds.set(tag, entry);
      }
      translated.add(step);
    }
  }

  if (!translated.size && !bounds.size) return world;

  // Второй проход: пересобрать без мутации входа — шаги без floor/ceiling,
  // поля с границами. Уже объявленная на поле граница не перетирается.
  const nextEffects = Object.fromEntries(Object.entries(effects).map(([id, effect]) => {
    const steps = ((effect.steps as Loose[] | undefined) ?? []).map(step => {
      if (!translated.has(step)) return step;
      const { floor: _floor, ceiling: _ceiling, ...rest } = step;
      return rest;
    });
    return [id, { ...effect, steps }];
  }));

  const fields = ((system.fields ?? []) as Loose[]).map(field => {
    const entry = bounds.get(String(field.tag));
    const value = field.value as Loose | undefined;
    if (!entry || !value || value.kind !== 'stored') return field;
    return {
      ...field,
      value: {
        ...value,
        ...(entry.min !== undefined && value.min === undefined ? { min: entry.min } : {}),
        ...(entry.max !== undefined && value.max === undefined ? { max: entry.max } : {}),
      },
    };
  });

  return {
    ...world,
    system: { ...(system as object), fields, effects: nextEffects } as unknown as System,
  };
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
  const withRefs = unifyCompendium(world.compendium, renames);
  const edited = convertRollEdits(system, withRefs);
  const bounded = unifyBounds({ system: edited.system, compendium: edited.compendium ?? withRefs });
  return { system: bounded.system, compendium: bounded.compendium ?? withRefs };
}
