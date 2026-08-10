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
//
// Смешивать их нельзя. Попытка выразить преимущество числом — самая частая
// ошибка в конструкторах систем: она работает для 5e примерно никогда,
// а для WFRP, Fate и Blades не работает вовсе.

import { compile } from '../formula/index.ts';
import { assertTarget } from './targets.ts';
import { roomEffects, wornEffects, activationOf } from './effects.ts';
import { EngineError } from './errors.ts';

const STACKING = {
  sum: values => values.reduce((a, b) => a + b, 0),
  max: values => values.reduce((a, b) => (b > a ? b : a)),
  override: values => values[values.length - 1],
};

// Собирает модификаторы всех источников: надетых предметов и активных эффектов.
// Раскладывает по мишеням, чтобы движок не перебирал весь компендиум на каждое поле.
export function collectModifiers(system, sheet, compendium) {
  const buckets = { value: new Map(), roll: new Map() };
  if (!compendium) return buckets;

  for (const source of sourcesOf(system, sheet, compendium)) {
    for (const mod of source.modifiers) {
      // Мишень обязана быть объявлена в системе. Свободный текст здесь запрещён:
      // именно из-за него в черновике бонусы никуда не резолвились.
      assertTarget(system, mod.target, source.label);
      const bucket = mod.kind === 'roll' ? buckets.roll : buckets.value;
      if (!bucket.has(mod.target)) bucket.set(mod.target, []);
      bucket.get(mod.target).push({ ...mod, source });
    }
  }
  return buckets;
}

// Три способа подключить пассивный эффект — три источника. Способ подключения
// внутри эффекта не записан: он один и тот же эффект в правилах комнаты
// и на одном чарнике, разница только здесь.
function sourcesOf(system, sheet, compendium) {
  const sources = [];

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
export function applyValueModifiers(base, tag, pass) {
  if (!pass.modifiers) return base;
  const mods = pass.modifiers.value.get(tag);
  if (!mods || mods.length === 0) return base;

  const active = mods.filter(m => conditionHolds(m, pass));
  if (active.length === 0) return base;

  let value = base;

  const sets = active.filter(m => m.op === 'set');
  if (sets.length) {
    const rule = sets[sets.length - 1].stacking || 'override';
    value = reduce(rule, sets.map(m => valueOf(m, pass)), tag);
  }

  const adds = active.filter(m => m.op === 'add');
  if (adds.length) value = value + totalOf(adds, pass, tag);

  const muls = active.filter(m => m.op === 'mul');
  if (muls.length) value = value * totalOf(muls, pass, tag, 1);

  const unknown = active.find(m => !['set', 'add', 'mul'].includes(m.op));
  if (unknown) throw new EngineError(`неизвестная операция модификатора «${unknown.op}» на мишени «${tag}»`);

  return value;
}

// Разбор броска: какая порода модификаторов на нём висит и что из этого следует.
// Возвращает не число, а режим — движок броска сам решит, как его отыграть.
export function resolveRoll(system, sheet, rollTag, pass) {
  assertTarget(system, rollTag);

  const mods = (pass.modifiers ? pass.modifiers.roll.get(rollTag) || [] : [])
    .filter(m => conditionHolds(m, pass));

  const hasAdvantage = mods.some(m => m.effect === 'advantage');
  const hasDisadvantage = mods.some(m => m.effect === 'disadvantage');

  // Не сумма и не счёт. Помеха гасит преимущество целиком, сколько бы
  // источников ни было с каждой стороны.
  let mode = 'normal';
  if (hasAdvantage && !hasDisadvantage) mode = 'advantage';
  else if (hasDisadvantage && !hasAdvantage) mode = 'disadvantage';

  // Числовая прибавка к броску — третье, отдельное от режима. «+5 ко всем
  // проверкам» это не преимущество и не правка характеристики: складывается
  // обычной арифметикой и на выбор кости не влияет.
  const adds = mods.filter(m => m.op === 'add' || m.op === 'mul');
  const bonus = adds.length ? totalOf(adds.filter(m => m.op === 'add'), pass, rollTag) : 0;

  return {
    tag: rollTag,
    mode,
    bonus,
    // Механику отыгрыша задаёт система, а не движок: переброс с выбором лучшего,
    // добавление кости, сдвиг степени успеха — всё это разные способы.
    methods: [...new Set(mods.map(m => m.method).filter(Boolean))],
    sources: mods.map(m => ({ ...m.source, effect: m.effect, method: m.method })),
  };
}

function conditionHolds(mod, pass) {
  if (!mod.condition) return true;
  const result = compile(mod.condition).evaluate(pass.resolve);
  if (typeof result !== 'boolean') {
    throw new EngineError(
      `условие «${mod.condition}» источника «${mod.source.label}» должно давать логическое значение`);
  }
  return result;
}

function valueOf(mod, pass) {
  if (mod.value && typeof mod.value === 'object' && 'expr' in mod.value) {
    return compile(mod.value.expr).evaluate(pass.resolve);
  }
  return mod.value;
}

function totalOf(mods, pass, tag, seed = 0) {
  const byRule = new Map();
  for (const mod of mods) {
    const rule = mod.stacking || 'sum';
    if (!byRule.has(rule)) byRule.set(rule, []);
    byRule.get(rule).push(valueOf(mod, pass));
  }
  let total = seed;
  for (const [rule, values] of byRule) {
    total = seed === 0 ? total + reduce(rule, values, tag) : total * reduce(rule, values, tag);
  }
  return total;
}

function reduce(rule, values, tag) {
  const fn = STACKING[rule];
  if (!fn) {
    throw new EngineError(
      `неизвестное правило стакинга «${rule}» на мишени «${tag}»; доступны: ${Object.keys(STACKING).join(', ')}`);
  }
  return fn(values);
}
