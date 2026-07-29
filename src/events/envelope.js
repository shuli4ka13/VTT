// Событийный конверт.
//
// Отправитель собирает КОНВЕРТ НАМЕРЕНИЯ и отправляет. Он не считает ничего
// за получателя: в конверт кладутся только собственные числа отправителя
// (свой бросок, свой урон, своя сложность) и ТЕГИ того, что получателю
// предстоит посчитать самому.
//
// Получатель распаковывает, считает по своей системе своими формулами,
// применяет к себе и возвращает НОВЫЙ чарник. Исходный не мутируется.
//
// Именно поэтому два разных получателя на один и тот же конверт дают разный
// исход — и именно поэтому системы у отправителя и получателя в принципе
// могут быть разными.

import { calc, newPass } from '../engine/calc.js';
import { resolveRoll } from '../engine/modifiers.js';
import { rollNotation, rollCheck } from '../engine/dice.js';
import { EngineError } from '../engine/errors.js';
import { compile } from '../formula/index.js';

export function send(actionId, { system, sheet, compendium, die }) {
  // Действие — запись компендиума, а не закон системы. Законом остаётся форма
  // конверта: разбирать «атаку» и «спасбросок» умеет этот модуль, и только он.
  const action = (compendium.actions || []).find(a => a.id === actionId);
  if (!action) throw new EngineError(`в компендиуме нет действия «${actionId}»`);

  const pass = newPass(system, sheet, { compendium });
  const spec = action.envelope;

  if (spec.kind === 'attack') {
    // Бонус броска складывается из двух источников: поля, которое назвало
    // действие, и числовых модификаторов, висящих на самом броске.
    const rollMods = resolveRoll(system, sheet, spec.roll.target, pass);
    const roll = rollCheck({
      sides: spec.roll.die,
      bonus: evalExpr(spec.roll.bonus, pass) + rollMods.bonus,
      mode: rollMods.mode,
    }, die);

    return {
      kind: 'attack',
      from: sheet.id,
      action: action.id,
      label: action.label,
      attack: roll,
      versus: spec.versus,
      onHit: {
        damage: damageOf(spec.onHit.damage, system, sheet, pass, die),
        applyTo: spec.onHit.applyTo,
        effect: spec.onHit.effect || null,
      },
    };
  }

  if (spec.kind === 'save') {
    return {
      kind: 'save',
      from: sheet.id,
      action: action.id,
      label: action.label,
      saveTag: spec.saveTag,
      dc: evalExpr(spec.dc, pass),
      onFail: outcomeOf(spec.onFail, system, sheet, pass, die),
      onSuccess: outcomeOf(spec.onSuccess, system, sheet, pass, die),
    };
  }

  throw new EngineError(`неизвестный род конверта «${spec.kind}»`);
}

export function receive(envelope, { system, sheet, compendium, die }) {
  const pass = newPass(system, sheet, { compendium });

  if (envelope.kind === 'attack') {
    // Класс брони считает ПОЛУЧАТЕЛЬ. Отправитель прислал только тег.
    const value = numeric(calc(system, sheet, envelope.versus, pass), envelope.versus,
      'с ним нечего сравнивать бросок');
    const hit = envelope.attack.total >= value;
    const applied = hit ? apply(sheet, envelope.onHit, system) : { sheet, changes: [], effects: [] };

    return {
      sheet: applied.sheet,
      report: {
        kind: 'attack',
        from: envelope.from,
        label: envelope.label,
        attack: envelope.attack,
        versus: { tag: envelope.versus, value },
        hit,
        changes: applied.changes,
        effects: applied.effects,
      },
    };
  }

  if (envelope.kind === 'save') {
    // Спасбросок считает и бросает ПОЛУЧАТЕЛЬ, своими формулами
    // и со своими модификаторами броска — включая числовые прибавки.
    const rollMods = resolveRoll(system, sheet, 'save_roll', pass);
    const save = rollCheck({
      sides: 20,
      bonus: calc(system, sheet, envelope.saveTag, pass) + rollMods.bonus,
      mode: rollMods.mode,
    }, die);

    const success = save.total >= envelope.dc;
    const outcome = success ? envelope.onSuccess : envelope.onFail;
    const applied = apply(sheet, outcome, system);

    return {
      sheet: applied.sheet,
      report: {
        kind: 'save',
        from: envelope.from,
        label: envelope.label,
        save,
        dc: envelope.dc,
        success,
        changes: applied.changes,
        effects: applied.effects,
      },
    };
  }

  throw new EngineError(`неизвестный род конверта «${envelope.kind}»`);
}

// ── внутреннее ──────────────────────────────────────────────────────────────

// Применение исхода к чарнику получателя. Возвращает НОВЫЙ чарник:
// чарник — данные, а не изменяемое состояние.
function apply(sheet, outcome, system) {
  if (!outcome) return { sheet, changes: [], effects: [] };

  const changes = [];
  const values = { ...sheet.values };

  if (outcome.damage && outcome.applyTo) {
    assertWritable(system, outcome.applyTo);
    const from = numeric(values[outcome.applyTo], outcome.applyTo, 'из него нечего вычитать');
    const to = Math.max(0, from - outcome.damage.total);
    values[outcome.applyTo] = to;
    changes.push({ tag: outcome.applyTo, from, to });
  }

  const effects = [];
  const list = [...sheet.effects];
  if (outcome.effect && !list.some(e => e.effectId === outcome.effect)) {
    list.push({ effectId: outcome.effect });
    effects.push(outcome.effect);
  }

  if (!changes.length && !effects.length) return { sheet, changes: [], effects: [] };
  return { sheet: { ...sheet, values, effects: list }, changes, effects };
}

function outcomeOf(spec, system, sheet, pass, die) {
  if (!spec) return null;
  return {
    damage: spec.damage ? damageOf(spec.damage, system, sheet, pass, die) : null,
    applyTo: spec.applyTo || null,
    effect: spec.effect || null,
  };
}

function damageOf(spec, system, sheet, pass, die) {
  const rolled = rollNotation(spec.dice, die);
  const bonus = spec.bonus ? evalExpr(spec.bonus, pass) : 0;
  return { notation: spec.dice, rolls: rolled.rolls, bonus, total: rolled.total + bonus };
}

// Выражения действий считаются тем же языком формул, что и поля системы:
// «Бонус атаки + 2», «8 + Бонус мастерства + Модификатор Харизмы».
function evalExpr(expr, pass) {
  return compile(String(expr)).evaluate(pass.resolve);
}
// Сторожа против бессмыслицы в конверте. Редактор их и так не предложит, но
// данные могли прийти откуда угодно — из файла, из чужой комнаты, из будущего
// импорта. Молчаливое «мимо» вместо ошибки скрыло бы поломку.
function numeric(value, tag, why) {
  if (typeof value !== 'number') {
    throw new EngineError(`поле «${tag}» даёт не число (${typeof value}) — ${why}`);
  }
  return value;
}

function assertWritable(system, tag) {
  const target = (system.fields || []).find(f => f.tag === tag);
  if (!target) throw new EngineError(`система не объявляет поля «${tag}»`);
  if (target.value.kind !== 'stored') {
    throw new EngineError(
      `в поле «${tag}» нельзя писать: его считает движок по формуле, а не событие`);
  }
}

