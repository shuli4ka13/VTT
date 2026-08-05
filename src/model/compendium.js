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
    rk: 'gear',
    label: 'Кольчуга',
    slot: 'body',
    description: 'Тяжёлый доспех. Ловкость к классу брони не прибавляется.',
    modifiers: [
      { kind: 'value', target: 'ac_base', op: 'set', value: 16, stacking: 'override', condition: null },
      { kind: 'value', target: 'armor_heavy', op: 'set', value: true, stacking: 'override', condition: null },
    ],
  },
  {
    // Оружие — та же запись компендиума, что и доспех, но с типизированными
    // свойствами. КАКИЕ свойства бывают — объявляет система (system.records),
    // запись только заполняет их. Кость урона живёт здесь, а не в действии.
    //
    // АКТИВНОСТИ — действия, которые предмет даёт владельцу, пока надет
    // (как в Foundry: у меча есть своя атака). Активность — только ссылка
    // на эффект-вызов; шагов в ней нет и положить их некуда.
    id: 'longsword-item',
    rk: 'weapon',
    label: 'Длинный меч',
    slot: 'hand',
    description: 'Клинок в четыре ладони.',
    props: { damage_dice: '1d8' },
    activities: [{ label: 'Атака', effect: 'sword-strike' }],
    modifiers: [],
  },
];

// Эффекты двух назначений, и оба — записи без единого шага внутри:
//
//   длящиеся  — висят на чарнике и несут модификаторы (отравление, каменная
//               кожа); их читает движок при каждом пересчёте;
//   вызовы    — зовут ПРАВИЛО системы по имени и приносят только параметры
//               (kind: 'rule'). Шаги живут в system.rules, здесь их нет и
//               быть не может: правка правила обязана менять все эффекты сразу.
export const effects = [
  {
    id: 'poisoned',
    rk: 'effect',
    label: 'Отравлен',
    icon: '☠',
    duration: { kind: 'scene' },
    description: 'Помеха на броски атаки.',
    modifiers: [
      // Помеха — не «−2 к броску». Это другая порода: два кубика, берём худший.
      { kind: 'roll', target: 'attack_roll', effect: 'disadvantage', method: 'rerollBest', condition: null },
    ],
  },
  {
    id: 'stoneskin',
    rk: 'effect',
    label: 'Каменная кожа',
    icon: '🪨',
    duration: { kind: 'scene' },
    description: 'Сопротивление урону: входящее в хиты половинится.',
    modifiers: [
      // Мишень «входящее» — то, что летит В поле извне. Шаг «применить»
      // прогоняет через неё величину, когда правило сказало «с учётом
      // модификаторов цели»; лечение и износ идут мимо.
      { kind: 'value', target: 'incoming:hp_current', op: 'mul', value: 0.5, stacking: 'sum', condition: null },
    ],
  },

  {
    id: 'sword-strike',
    rk: 'call',
    kind: 'rule',
    label: 'Удар оружием',
    description: 'Вызов правила «Удар»: проверка атаки против КД, урон костью оружия.',
    rule: 'strike',
    params: { bonus: '#attack_bonus', versus: 'ac', damage_bonus: '#str_mod', apply_to: 'hp_current' },
  },
  {
    id: 'poison-touch',
    rk: 'call',
    kind: 'rule',
    label: 'Ядовитое касание',
    description: 'Вызов правила «Спасбросок»: цель спасается Ловкостью, при провале — урон и отравление.',
    rule: 'save',
    params: { save: '#dex_save', dc: '#spell_dc', dice: '2d6', apply_to: 'hp_current', status: 'poisoned' },
  },
  {
    id: 'healing-touch',
    rk: 'call',
    kind: 'rule',
    label: 'Лечащее касание',
    description: 'Вызов правила «Лечение»: кость плюс Харизма, не выше максимума хитов.',
    rule: 'heal',
    params: { dice: '1d4', bonus: '#cha_mod', apply_to: 'hp_current', cap: 'hp_max' },
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
// Записи-действия — для того, что предметом не является: заклинания и приёмы.
// Атаки оружия здесь НЕ живут: их дают активности самих предметов.
export const actions = [
  {
    id: 'poison-spray',
    rk: 'spell',
    kind: 'spell',
    label: 'Ядовитые брызги',
    description: 'Заговор. Цель делает спасбросок Телосложения — здесь для примера Ловкости.',
    effect: 'poison-touch',
  },
  {
    id: 'healing-word',
    rk: 'spell',
    kind: 'spell',
    label: 'Слово лечения',
    description: 'Заговор. Восполняет хиты, но не выше максимума.',
    effect: 'healing-touch',
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
