// Компендиум — библиотека записей. Тоже чистые данные.
// Каждый модификатор ссылается на `target` — тег, объявленный в системе.
// Ничего, кроме объявленных тегов, здесь встретиться не может: проверка
// в src/engine/targets.js падает на неизвестной мишени.
//
// Две породы модификаторов, и это принципиально:
//   kind: 'value' — правит ЗНАЧЕНИЕ, обычная арифметика, складывается по правилу стакинга
//   kind: 'roll'  — правит БРОСОК, не число, не складывается, помеха гасит преимущество

export const items = [
  {
    id: 'chain-mail',
    label: 'Кольчуга',
    slot: 'body',
    description: 'Тяжёлый доспех. Ловкость к классу брони не прибавляется.',
    modifiers: [
      { kind: 'value', target: 'ac_base', op: 'set', value: 16, stacking: 'override', condition: null },
      { kind: 'value', target: 'armor_heavy', op: 'set', value: true, stacking: 'override', condition: null },
    ],
  },
];

export const effects = [
  {
    id: 'poisoned',
    label: 'Отравлен',
    icon: '☠',
    duration: { kind: 'scene' },
    description: 'Помеха на броски атаки.',
    modifiers: [
      // Помеха — не «−2 к броску». Это другая порода: два кубика, берём худший.
      { kind: 'roll', target: 'attack_roll', effect: 'disadvantage', method: 'rerollBest', condition: null },
    ],
  },
];

export const compendium = { items, effects };

export const findItem = id => items.find(i => i.id === id) || null;
export const findEffect = id => effects.find(e => e.id === id) || null;
