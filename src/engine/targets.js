// Словарь мишеней.
//
// Список того, на что могут ссылаться эффекты и бонусы предметов, НИГДЕ
// отдельно не хранится — он выводится из объявленных в системе тегов.
// В этом вся разница с Foundry, где список зашит кодом системы: там добавить
// своё поле без программиста нельзя, здесь достаточно объявить его в данных.

import { UnknownTagError } from './errors.js';

export function targets(system) {
  return [
    ...system.fields.map(f => ({ tag: f.tag, label: f.label, group: f.group, kind: 'value' })),
    ...(system.rolls || []).map(r => ({ tag: r.tag, label: r.label, group: 'Броски', kind: 'roll' })),
  ];
}

export function findTarget(system, tag) {
  return targets(system).find(t => t.tag === tag) || null;
}

export function assertTarget(system, tag, fromLabel) {
  const target = findTarget(system, tag);
  if (!target) throw new UnknownTagError(tag, fromLabel);
  return target;
}

// Лейбл по тегу. Интерфейс показывает формулы лейблами и не должен знать,
// как устроено поле внутри.
export function labelOf(system, tag) {
  const target = findTarget(system, tag);
  return target ? target.label : tag;
}
