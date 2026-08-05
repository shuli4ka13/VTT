// Словарь мишеней.
//
// Список того, на что могут ссылаться эффекты и бонусы предметов, НИГДЕ
// отдельно не хранится — он выводится из объявленных в системе тегов.
// В этом вся разница с Foundry, где список зашит кодом системы: там добавить
// своё поле без программиста нельзя, здесь достаточно объявить его в данных.

import { UnknownTagError } from './errors.js';

// Мишень броска, выведенная из поля. Двоеточие в теге не случайно: в теги поля
// оно попасть не может (лексер его не пускает), поэтому столкновения имён нет.
export const rollTagOf = tag => `check:${tag}`;

// Мишень «входящее»: то, что летит В поле извне — урон, лечение, износ.
// На неё вешаются сопротивления и уязвимости; шаг «применить» прогоняет
// через неё величину, когда правило сказало «с учётом модификаторов цели».
export const incomingTagOf = tag => `incoming:${tag}`;

export function targets(system) {
  return [
    ...system.fields.map(f => ({ tag: f.tag, label: f.label, group: f.group, kind: 'value' })),

    // Броски, объявленные системой отдельно: атака, спасбросок и прочее общее.
    ...(system.rolls || []).map(r => ({ tag: r.tag, label: r.label, group: 'Броски', kind: 'roll' })),

    // И броски, выведенные из полей, помеченных «по нему бросают».
    //
    // Объявлять их по одному пришлось бы десятками: в 5e бросают по шести
    // характеристикам и восемнадцати навыкам. Черновик это предвидел —
    // «чтобы не прописывать кубы для каждого навыка» (reference/index.html:1988).
    // Правило то же, что для словаря мишеней: выводится, а не хранится.
    ...system.fields.filter(f => f.roll).map(f => ({
      tag: rollTagOf(f.tag),
      label: f.roll.label || `Проверка: ${f.label}`,
      group: f.group,
      kind: 'roll',
      from: f.tag,
    })),

    // «Входящее» выводится только для хранимых полей: в вычисляемое поле
    // никто не пишет, значит и входящего у него нет.
    ...system.fields.filter(f => f.value.kind === 'stored').map(f => ({
      tag: incomingTagOf(f.tag),
      label: `Входящее: ${f.label}`,
      group: f.group,
      kind: 'incoming',
      from: f.tag,
    })),
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
