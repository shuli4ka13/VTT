// Система B приёмочного теста: срез киберпанка. Доказательство модели:
// от 5e она отличается ТОЛЬКО данными — другая ведущая кость, другие поля,
// другой удар. Движок один, и этот файл не импортирует из него ничего.
//
// Модель боя:
//   порог:     1d10 + навык  против  сложности (число из записи)
//   величина:  2d8  ИЛИ  фиксированный урон предмета — выбирает запись
//   сравнение: величина против брони цели; меньше — цепочка обрывается
//   применить: минус из хитов на разницу (величина − броня)
//   применить: минус 1 из прочности брони — удар изнашивает снаряжение
//
// Здесь же второй способ подключить эффект: у ножа СВОЯ активность
// с готовыми аргументами (штучная вещь), а не привязка рода, как у меча в 5e.

export const cyberpunk = {
  id: 'cp-slice',
  name: 'Киберпанк',

  constants: {
    lead_die: { label: 'Ведущая кость', kind: 'die', dice: [{ count: 1, sides: 10 }] },
  },

  action_types: {
    action: { label: 'Действие', icon: '◆' },
    reaction: { label: 'Реакция', icon: '↩' },
  },

  rolls: [
    { tag: 'attack_roll', label: 'Бросок атаки' },
  ],

  // Рода записей ЭТОЙ системы: заклинаний в мире хрома нет — и в палитре
  // компендиума их не будет. Рода выводятся из системы, а не из движка.
  records: {
    weapon: {
      kind: 'item', label: 'Оружие', icon: '⚔', group: 'Хром',
      hint: 'Хромированная сталь: урон числом или костью.',
      props: [
        { key: 'damage_dice', label: 'Кость урона', kind: 'dice' },
        { key: 'damage_flat', label: 'Урон (число)', kind: 'number' },
      ],
    },
    action: {
      kind: 'action', label: 'Действие', icon: '✊', group: 'Приёмы',
      hint: 'Приём без предмета.',
    },
  },

  effects: {
    strike: {
      label: 'Удар',
      icon: '⚔',
      category: 'Атака',
      activation: 'manual',
      cost: 'action',
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
        // Кости и фикс — взаимоисключающие слоты (optional): запись заполняет
        // тот, который выбрал её источник величины.
        { id: 'dmg', type: 'amount', source: { param: 'source' },
          dice: { param: 'dice', optional: true },
          fixed: { prop: 'damage_flat', optional: true } },
        { id: 'pen', type: 'compare',
          value: { ref: 'dmg' }, versus: { param: 'armor' }, breakIf: 'less' },
        { type: 'apply', target: { param: 'hp' }, direction: 'subtract',
          value: { ref: 'pen.margin' }, floor: { const: 0 }, targetModifiers: false },
        { type: 'apply', target: { param: 'armor' }, direction: 'subtract',
          value: { const: 1 }, floor: { const: 0 }, targetModifiers: false },
      ],
    },

    // Пассивный эффект второй системы: та же порода «правящий бросок»,
    // другая система, тот же движок.
    wired: {
      label: 'Вживлённые рефлексы',
      icon: '⚡',
      category: 'Состояния',
      activation: 'passive',
      duration: { kind: 'temporary' },
      description: 'Ускоритель нервов: преимущество на атаку, пока не сгорел.',
      modifiers: [
        { kind: 'roll', target: 'attack_roll', effect: 'advantage', method: 'rerollBest', condition: null },
      ],
    },
  },

  // Правил комнаты в этом мире нет — секция необязательна.
  room_rules: [],

  advantage: { methods: { rerollBest: true } },

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
      // Своя активность: аргументы прописаны у самой записи, а не взяты
      // из привязки рода. Так живут штучные вещи.
      activities: [{
        label: 'Удар',
        effect: 'strike',
        args: { bonus: '#combat', difficulty: 12, source: 'item', hp: 'hp', armor: 'armor' },
      }],
      modifiers: [],
    },
  ],
  // Запись-действие: пистолета-предмета в срезе нет, а стрелять надо.
  // Ссылается на тот же эффект с другими аргументами — величина своим броском.
  actions: [
    {
      id: 'gun',
      rk: 'action',
      label: 'Пистолет',
      effect: 'strike',
      args: { bonus: '#combat', difficulty: 12, source: 'roll', dice: '2d8', hp: 'hp', armor: 'armor' },
    },
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
