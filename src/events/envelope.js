// Событийный конверт.
//
// Отправитель собирает КОНВЕРТ НАМЕРЕНИЯ и отправляет. Он не считает ничего
// за получателя: правило его системы упаковывается фазой pack — свои броски
// и свои выражения уезжают числами, всё целевое (теги, выражения цели,
// результаты шагов) остаётся в данных нетронутым.
//
// Получатель распаковывает, досчитывает своими формулами по своей системе
// (фаза resolve) и применяет к себе. Возвращается НОВЫЙ чарник — исходный
// не мутируется.
//
// Самого правила этот модуль не знает: цепочку шагов крутит ядро
// (src/engine/rule.js), типы шагов живут за реестром. Здесь только граница
// между действием, эффектом-вызовом и правилом:
//
//   действие (компендиум)  →  эффект-вызов (компендиум)  →  правило (система)
//   «Удар мечом», оружие      только параметры               шаги, одно
//                                                            определение на всех

import { newPass } from '../engine/calc.js';
import { packRule, resolveRule } from '../engine/rule.js';
import { EngineError } from '../engine/errors.js';

export function send(actionId, { system, sheet, compendium, die }) {
  const action = (compendium.actions || []).find(a => a.id === actionId);
  if (!action) throw new EngineError(`в компендиуме нет действия «${actionId}»`);

  const effect = (compendium.effects || []).find(e => e.id === action.effect);
  if (!effect) {
    throw new EngineError(
      `действие «${action.label}» ссылается на эффект «${action.effect}», которого нет в компендиуме`);
  }

  // Правило достаётся из СИСТЕМЫ отправителя в момент отправки: правка
  // правила меняет поведение всех эффектов сразу, эффекту нечего кэшировать.
  const rule = (system.rules || {})[effect.rule];
  if (!rule) {
    throw new EngineError(
      `эффект «${effect.label}» зовёт правило «${effect.rule}», которого система не объявляет`);
  }

  const pass = newPass(system, sheet, { compendium });
  const steps = packRule(rule, {
    system, sheet, pass, die,
    params: effect.params || {},
    item: weaponPropsOf(action, system, compendium),
    owner: `эффект «${effect.label}»`,
  });

  return {
    kind: 'rule',
    rule: effect.rule,
    from: sheet.id,
    action: action.id,
    label: action.label,
    steps,
  };
}

export function receive(envelope, { system, sheet, compendium, die }) {
  const pass = newPass(system, sheet, { compendium });
  const out = resolveRule(envelope.steps || [], {
    system, sheet, pass, die,
    owner: `конверт «${envelope.label}»`,
  });

  return {
    sheet: out.sheet,
    report: {
      kind: envelope.kind,
      rule: envelope.rule,
      from: envelope.from,
      label: envelope.label,
      trace: out.trace,
      stopped: out.stopped,
      changes: out.changes,
      effects: out.effects,
    },
  };
}

// Оружие действия — запись компендиума, из которой правило читает ТОЛЬКО
// свойства, объявленные системой (system.records.weapon.props). Компендиум
// определяется изначальной механикой: не объявлено — свойства как будто нет.
// Сами ключи (damage_dice, damage_flat) — словарь движка, как формы ссылок;
// состав и человеческие лейблы объявляет система.
function weaponPropsOf(action, system, compendium) {
  if (!action.weapon) return null;
  const item = (compendium.items || []).find(i => i.id === action.weapon);
  if (!item) {
    throw new EngineError(`в компендиуме нет оружия «${action.weapon}» — действию «${action.label}» нечем бить`);
  }
  const declared = ((system.records || {}).weapon || {}).props || [];
  const props = {};
  for (const p of declared) {
    if (item.props && item.props[p.key] !== undefined) props[p.key] = item.props[p.key];
  }
  return props;
}
