// Модификаторы. Конвейер: источник → условие → цель → правило стакинга.
//
// Две породы, и это принципиально:
//
//   kind: 'value' — правит ЗНАЧЕНИЕ. Кольчуга задаёт базу доспеха, кольцо даёт +1.
//                   Обычная арифметика, складывается по правилу стакинга.
//
//   kind: 'roll'  — правит БРОСОК. Преимущество — это не «+2», это два к20 и выбор
//                   лучшего. Не число, не складывается: два преимущества дают
//                   одно преимущество, а помеха гасит преимущество целиком.
//                   Сам модификатор механики не знает: он называет ЗАПИСЬ
//                   словаря «Правки броска» (`system.roll_edits`), а что она
//                   делает и чем гасится — сказано в записи.
//
// Смешивать их нельзя. Попытка выразить преимущество числом — самая частая
// ошибка в конструкторах систем: она работает для 5e примерно никогда,
// а для WFRP, Fate и Blades не работает вовсе.

import { compile } from '../formula/index.ts';
import { assertTarget } from './targets.ts';
import { roomEffects, wornEffects, activationOf } from './effects.ts';
import { EngineError } from './errors.ts';
import type { System, Sheet, Compendium, Modifier, RollEdit } from '../model/types.ts';
import type { Pass } from './calc.ts';

/** Откуда приехал модификатор — предмет, эффект на листе или правило комнаты. */
export interface ModifierSource {
  type: 'room' | 'item' | 'effect';
  id: string;
  label?: string;
  modifiers: Modifier[];
}

/** Модификатор вместе с источником: источник нужен и для ошибок, и для журнала. */
export type SourcedModifier = Modifier & { source: ModifierSource };

/** Разложенные по мишеням модификаторы: движок не перебирает компендиум на каждое поле. */
export interface CollectedModifiers {
  value: Map<string, SourcedModifier[]>;
  roll: Map<string, SourcedModifier[]>;
}

export interface RollResolution {
  tag: string;
  /** Записи словаря «Правки броска», уцелевшие после гашения. */
  edits: RollEdit[];
  bonus: number;
  sources: unknown[];
}

// Значения проходят КАК ЕСТЬ: `override` обязан вернуть логическое логическим
// (кольчуга ставит armor_heavy = true), и приводить его к числу нельзя.
// Приведения ниже — только типовые, на рантайм они не влияют.
const STACKING: Record<string, (values: unknown[]) => unknown> = {
  sum: values => values.reduce((a, b) => (a as number) + (b as number), 0),
  max: values => values.reduce((a, b) => ((b as number) > (a as number) ? b : a)),
  override: values => values[values.length - 1],
};

// Собирает модификаторы всех источников: надетых предметов и активных эффектов.
// Раскладывает по мишеням, чтобы движок не перебирал весь компендиум на каждое поле.
export function collectModifiers(
  system: System, sheet: Sheet, compendium: Compendium,
): CollectedModifiers {
  const buckets: CollectedModifiers = { value: new Map(), roll: new Map() };
  if (!compendium) return buckets;

  for (const source of sourcesOf(system, sheet, compendium)) {
    for (const mod of source.modifiers) {
      // Мишень обязана быть объявлена в системе. Свободный текст здесь запрещён:
      // именно из-за него в черновике бонусы никуда не резолвились.
      assertTarget(system, mod.target, source.label);
      const bucket = mod.kind === 'roll' ? buckets.roll : buckets.value;
      let list = bucket.get(mod.target);
      if (!list) { list = []; bucket.set(mod.target, list); }
      list.push({ ...mod, source });
    }
  }
  return buckets;
}

// Три способа подключить пассивный эффект — три источника. Способ подключения
// внутри эффекта не записан: он один и тот же эффект в правилах комнаты
// и на одном чарнике, разница только здесь.
function sourcesOf(system: System, sheet: Sheet, compendium: Compendium): ModifierSource[] {
  const sources: ModifierSource[] = [];

  // Правила комнаты: пассивные эффекты, включённые на ВСЕХ чарников мира.
  // Надевать и навешивать ничего не нужно.
  for (const { id, effect } of roomEffects(system)) {
    if (activationOf(effect) !== 'passive') continue;
    sources.push({ type: 'room', id, label: effect.label || id, modifiers: effect.modifiers || [] });
  }

  // Предмет носит свои бонусы сам: кольчуга задаёт базу доспеха, и это
  // свойство вещи, а не отдельный именованный эффект.
  for (const id of sheet.equipped || []) {
    const item = (compendium.items || []).find(i => i.id === id);
    if (!item) throw new EngineError(`чарник «${sheet.id}» носит предмет «${id}», которого нет в компендиуме`);
    sources.push({ type: 'item', id: item.id, label: item.label, modifiers: item.modifiers || [] });
  }

  // Висящие на листе. Триггерные тоже висят, но модификаторов не несут:
  // их нагрузка — конвейер шагов, и он срабатывает по событию, а не сейчас.
  for (const { id, effect } of wornEffects(system, sheet)) {
    if (activationOf(effect) !== 'passive') continue;
    sources.push({ type: 'effect', id, label: effect.label || id, modifiers: effect.modifiers || [] });
  }

  return sources;
}

// Применяется движком сразу после того, как посчитано базовое значение поля.
// Порядок: сначала `set` (задают значение заново), потом `add`, потом `mul`.
export function applyValueModifiers(base: unknown, tag: string, pass: Pass): unknown {
  if (!pass.modifiers) return base;
  const mods = pass.modifiers.value.get(tag);
  if (!mods || mods.length === 0) return base;

  const active = mods.filter(m => conditionHolds(m, pass));
  if (active.length === 0) return base;

  let value = base;

  const sets = active.filter(m => m.op === 'set');
  if (sets.length) {
    const rule = String(sets[sets.length - 1]!.stacking || 'override');
    value = reduce(rule, sets.map(m => valueOf(m, pass)), tag);
  }

  const adds = active.filter(m => m.op === 'add');
  if (adds.length) value = (value as number) + totalOf(adds, pass, tag);

  const muls = active.filter(m => m.op === 'mul');
  if (muls.length) value = (value as number) * totalOf(muls, pass, tag, 1);

  const unknown = active.find(m => !['set', 'add', 'mul'].includes(String(m.op)));
  if (unknown) throw new EngineError(`неизвестная операция модификатора «${unknown.op}» на мишени «${tag}»`);

  return value;
}

// Разбор броска: какая порода модификаторов на нём висит и что из этого следует.
// Возвращает не число, а режим — движок броска сам решит, как его отыграть.
export function resolveRoll(
  system: System, sheet: Sheet, rollTag: string, pass: Pass,
): RollResolution {
  assertTarget(system, rollTag);

  const mods = (pass.modifiers ? pass.modifiers.roll.get(rollTag) || [] : [])
    .filter(m => conditionHolds(m, pass));

  // Ключи записей словаря, названные модификаторами. Не сумма и не счёт:
  // две одинаковых правки дают одну — это закон движка (нестакаемость).
  const named = [...new Set(mods.map(m => m.edit).filter(Boolean))] as string[];
  const dictionary = system.roll_edits || {};
  for (const key of named) {
    if (!dictionary[key]) {
      throw new EngineError(
        `модификатор ссылается на правку броска «${key}», которой нет в словаре системы`);
    }
  }

  // Гашение — ДАННЫЕ, а не закон движка: «Помеха гасится Преимуществом»
  // объявлено в самой записи. Взаимно объявленная пара гасит друг друга
  // целиком, сколько бы источников ни было с каждой стороны (правило 5e);
  // мир, где они складываются, просто не заполняет это поле.
  const surviving = named.filter(key => {
    const canceledBy = dictionary[key]!.canceledBy;
    return !canceledBy || !named.includes(canceledBy);
  });

  // Числовая прибавка к броску — третье, отдельное от правок. «+5 ко всем
  // проверкам» это не преимущество и не правка характеристики: складывается
  // обычной арифметикой и на состав костей не влияет.
  const adds = mods.filter(m => m.op === 'add');
  const bonus = adds.length ? totalOf(adds, pass, rollTag) : 0;

  return {
    tag: rollTag,
    edits: surviving.map(key => ({ ...dictionary[key]!, label: dictionary[key]!.label || key })),
    bonus,
    sources: mods.map(m => ({ ...m.source, edit: m.edit })),
  };
}

function conditionHolds(mod: SourcedModifier, pass: Pass): boolean {
  if (!mod.condition) return true;
  const result = compile(mod.condition).evaluate(pass.resolve);
  if (typeof result !== 'boolean') {
    throw new EngineError(
      `условие «${mod.condition}» источника «${mod.source.label}» должно давать логическое значение`);
  }
  return result;
}

function valueOf(mod: SourcedModifier, pass: Pass): unknown {
  const raw = (mod as { value?: unknown }).value;
  if (raw && typeof raw === 'object' && 'expr' in raw) {
    return compile((raw as { expr: string }).expr).evaluate(pass.resolve);
  }
  return raw;
}

function totalOf(mods: SourcedModifier[], pass: Pass, tag: string, seed = 0): number {
  const byRule = new Map<string, unknown[]>();
  for (const mod of mods) {
    const rule = String(mod.stacking || 'sum');
    let list = byRule.get(rule);
    if (!list) { list = []; byRule.set(rule, list); }
    list.push(valueOf(mod, pass));
  }
  let total = seed;
  for (const [rule, values] of byRule) {
    const part = reduce(rule, values, tag) as number;
    total = seed === 0 ? total + part : total * part;
  }
  return total;
}

function reduce(rule: string, values: unknown[], tag: string): unknown {
  const fn = STACKING[rule];
  if (!fn) {
    throw new EngineError(
      `неизвестное правило стакинга «${rule}» на мишени «${tag}»; доступны: ${Object.keys(STACKING).join(', ')}`);
  }
  return fn(values);
}
