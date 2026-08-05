// Система B приёмочного теста: срез киберпанка. Доказательство модели:
// от 5e она отличается ТОЛЬКО данными — другая ведущая кость, другие поля,
// другое правило удара. Движок один, и этот файл не импортирует из него ничего.
//
// Модель боя:
//   порог:     1d10 + навык  против  сложности (число из эффекта)
//   величина:  2d8  ИЛИ  фиксированный урон предмета — выбирает эффект
//   сравнение: величина против брони цели; меньше — цепочка обрывается
//   применить: минус из хитов на разницу (величина − броня)
//   применить: минус 1 из прочности брони — удар изнашивает снаряжение

export const cyberpunk = {
  id: 'cp-slice',
  name: 'Киберпанк — срез',

  constants: {
    lead_die: { label: 'Ведущая кость', kind: 'die', dice: [{ count: 1, sides: 10 }] },
  },

  rolls: [
    { tag: 'attack_roll', label: 'Бросок атаки' },
  ],

  // Рода записей ЭТОЙ системы: заклинаний в мире хрома нет — и в палитре
  // компендиума их не будет. Рода выводятся из системы, а не из движка.
  records: {
    weapon: {
      kind: 'item', label: 'Оружие', icon: '⚔',
      hint: 'Хромированная сталь: урон числом или костью.',
      props: [
        { key: 'damage_dice', label: 'Кость урона', kind: 'dice' },
        { key: 'damage_flat', label: 'Урон (число)', kind: 'number' },
      ],
    },
    effect: {
      kind: 'effect', label: 'Эффект', icon: '✦',
      hint: 'Состояние: модификаторы, пока висит.',
    },
    call: {
      kind: 'call', label: 'Вызов правила', icon: '⚙',
      hint: 'Механика системы с заполненными параметрами.',
    },
    action: {
      kind: 'action', label: 'Действие', icon: '✊',
      hint: 'Приём без предмета.',
    },
  },

  rules: {
    strike: {
      label: 'Удар',
      params: [
        { key: 'bonus', label: 'Модификатор проверки', kind: 'expr' },
        { key: 'difficulty', label: 'Сложность', kind: 'number' },
        { key: 'source', label: 'Откуда величина', kind: 'choice' },
        { key: 'dice', label: 'Кости урона', kind: 'dice' },
        { key: 'hp', label: 'Куда наносится', kind: 'tag' },
        { key: 'armor', label: 'Броня цели', kind: 'tag' },
      ],
      steps: [
        { id: 'hit', type: 'threshold',
          roll: { die: { constant: 'lead_die' }, bonus: { param: 'bonus' }, check: 'attack_roll' },
          versus: { param: 'difficulty' } },
        // Кости и фикс — взаимоисключающие слоты (optional): эффект заполняет
        // тот, который выбрал его источник величины.
        { id: 'dmg', type: 'amount', source: { param: 'source' },
          dice: { param: 'dice', optional: true },
          fixed: { item: 'damage_flat', optional: true } },
        { id: 'pen', type: 'compare',
          value: { ref: 'dmg' }, versus: { param: 'armor' }, breakIf: 'less' },
        { type: 'apply', target: { param: 'hp' }, direction: 'subtract',
          value: { ref: 'pen.margin' }, floor: { const: 0 }, targetModifiers: false },
        { type: 'apply', target: { param: 'armor' }, direction: 'subtract',
          value: { const: 1 }, floor: { const: 0 }, targetModifiers: false },
      ],
    },
  },

  fields: [
    { tag: 'handle', label: 'Псевдоним', group: 'Личное дело', value: { kind: 'stored', type: 'text', default: '' } },
    { tag: 'combat', label: 'Навык боя', group: 'Навыки', value: { kind: 'stored', type: 'number', default: 4 } },
    { tag: 'hp', label: 'Хиты', group: 'Здоровье', value: { kind: 'stored', type: 'number', default: 20 } },
    { tag: 'armor', label: 'Прочность брони', group: 'Защита', value: { kind: 'stored', type: 'number', default: 0 } },
  ],
};

export const cpCompendium = {
  items: [
    {
      id: 'mono-knife',
      rk: 'weapon',
      label: 'Мономолекулярный нож',
      description: 'Урон — константа записи, костей нет.',
      props: { damage_flat: 8 },
      activities: [{ label: 'Удар', effect: 'blade-hit' }],
      modifiers: [],
    },
  ],
  effects: [
    {
      id: 'blade-hit',
      rk: 'call',
      label: 'Удар клинком',
      description: 'Вызов правила «Удар»: величина — фикс предмета.',
      rule: 'strike',
      params: { bonus: '#combat', difficulty: 12, source: 'item', hp: 'hp', armor: 'armor' },
    },
    {
      id: 'gun-hit',
      rk: 'call',
      label: 'Выстрел',
      description: 'Вызов того же правила: величина — свой бросок 2d8.',
      rule: 'strike',
      params: { bonus: '#combat', difficulty: 12, source: 'roll', dice: '2d8', hp: 'hp', armor: 'armor' },
    },
  ],
  // Запись-действие осталась только у выстрела: пистолета-предмета в срезе нет.
  // Удар ножом — активность самого ножа.
  actions: [
    { id: 'gun', rk: 'action', label: 'Пистолет', effect: 'gun-hit' },
  ],
};

export const silver = {
  id: 'silver',
  systemId: 'cp-slice',
  kind: 'pc',
  name: 'Сильвер',
  values: { handle: 'Сильвер', combat: 6, hp: 20, armor: 2 },
  equipped: ['mono-knife'],
  effects: [],
  actions: ['gun'],
};

export const raze = {
  id: 'raze',
  systemId: 'cp-slice',
  kind: 'npc',
  name: 'Рейз',
  values: { handle: 'Рейз', combat: 4, hp: 18, armor: 4 },
  equipped: ['mono-knife'],
  effects: [],
  actions: [],
};
