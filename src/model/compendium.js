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

// Действия — тоже записи компендиума, а не правила системы.
//
// «Удар длинным мечом» — это конкретная запись, как кольчуга, а не закон мира.
// Законом остаётся форма конверта (атака / спасбросок), которую разбирает движок.
// Отсюда и граница режимов: действие ссылается только на УЖЕ объявленные теги,
// нового тега не вводит — значит, создавать его волен игрок, а не только автор.
//
// Заклинание — не отдельный род записи, а действие с пометкой `kind`.
// В 5e применение заклинания порождает ровно конверт: атаку или спасбросок.
export const actions = [
  {
    id: 'longsword',
    kind: 'action',
    label: 'Удар длинным мечом',
    description: 'Рукопашная атака оружием.',
    envelope: {
      kind: 'attack',
      roll: { die: 20, bonus: '#attack_bonus', target: 'attack_roll' },
      versus: 'ac', // тег, который получатель посчитает СВОИМИ формулами
      onHit: { damage: { dice: '1d8', bonus: '#str_mod' }, applyTo: 'hp_current' },
    },
  },
  {
    id: 'poison-spray',
    kind: 'spell',
    label: 'Ядовитые брызги',
    description: 'Заговор. Цель делает спасбросок Телосложения — здесь для примера Ловкости.',
    envelope: {
      kind: 'save',
      saveTag: 'dex_save',
      dc: '#spell_dc',
      onFail: { damage: { dice: '2d6' }, applyTo: 'hp_current', effect: 'poisoned' },
      onSuccess: null,
    },
  },
];

export const compendium = { items, effects, actions };

export const findItem = id => items.find(i => i.id === id) || null;
export const findEffect = id => effects.find(e => e.id === id) || null;
export const findAction = id => actions.find(a => a.id === id) || null;

// Единый список для экрана компендиума: разделов там нет намеренно.
export const allRecords = book => [
  ...(book.items || []).map(r => ({ ...r, kind: 'item' })),
  ...(book.effects || []).map(r => ({ ...r, kind: 'effect' })),
  ...(book.actions || []),
];
