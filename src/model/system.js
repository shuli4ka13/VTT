// Система — это ДАННЫЕ. Ни одной функции в этом файле нет и быть не должно.
// Срез D&D 5e: шесть характеристик → модификаторы → бонус мастерства таблицей →
// один навык → класс брони с условием → атака, спасбросок, лечение и ответка.
//
// Система = поля + БИБЛИОТЕКА ЭФФЕКТОВ + список включённых на всех.
// Эффект — единица автоматизации; всё, что мир делает сам, лежит в `effects`.
//
// Три способа получить значение поля (`value.kind`):
//   stored  — лежит в чарнике; здесь только тип и значение по умолчанию
//   formula — строка на языке формул, ссылается на другие поля через #тег
//   table   — поиск по диапазонам в system.tables, аргумент — формула
//
// Список мишеней для эффектов и бонусов нигде отдельно не хранится: он выводится
// из объявленных здесь тегов (см. src/engine/targets.js).

export const system = {
  id: 'dnd5e-slice',
  // «Срез» из ТЗ — узнаваемый КОНЕЧНЫЙ поднабор правил, не вся 5e. Это
  // оговорка для разработчика, имени системы она не принадлежит: имя видят
  // игроки в списке миров.
  name: 'D&D 5e',

  tables: {
    proficiency: {
      label: 'Бонус мастерства по уровню',
      // Именно таблица по диапазонам, а не формула: в 5e это ступенька,
      // и выводить её из уровня арифметикой — подгонка под конкретную систему.
      ranges: [
        { from: 1, to: 4, value: 2 },
        { from: 5, to: 8, value: 3 },
        { from: 9, to: 12, value: 4 },
        { from: 13, to: 16, value: 5 },
        { from: 17, to: 20, value: 6 },
      ],
    },
  },

  // Какие механики преимущества включены в комнате. Список самих механик
  // с примерами из разных систем — в src/model/advantage-methods.js.
  advantage: { methods: { rerollBest: true } },

  // Константы системы — доступны правилам наравне с полями листа.
  // Первая — ведущая кость: что бросается для действий в этом мире.
  // Определение описывает и состав броска, и что возвращается; total есть
  // всегда (см. src/engine/lead-die.js). Смена sides здесь меняет ВСЕ броски,
  // не требуя правки ни одной формулы.
  constants: {
    lead_die: { label: 'Ведущая кость', kind: 'die', dice: [{ count: 1, sides: 20 }] },
  },

  // Экономика действий: словарь системы, как мишени бросков. Раундов в PoC
  // нет, поэтому это РАЗМЕТКА (бейджи и группировка кнопок), не запрет.
  // Лимиты повесятся на готовый словарь, когда появятся ходы.
  action_types: {
    action: { label: 'Действие', icon: '◆' },
    reaction: { label: 'Реакция', icon: '↩' },
    movement: { label: 'Передвижение', icon: '→' },
  },

  // ── БИБЛИОТЕКА ЭФФЕКТОВ ───────────────────────────────────────────────────
  // Одно определение на систему. Запись компендиума ссылается на эффект
  // по имени и приносит только аргументы — копий шагов в записях нет
  // и быть не может: правка эффекта обязана менять все записи сразу.
  //
  // Эффект не знает слова «урон»: удар, спасбросок, лечение — разные
  // заполнения одних и тех же слотов. Типы шагов — src/engine/steps/.
  effects: {
    strike: {
      label: 'Атака',
      icon: '⚔',
      category: 'Атака',
      activation: 'manual',
      cost: 'action',
      params: [
        { key: 'bonus', label: 'Бонус проверки', kind: 'expr' },
        { key: 'versus', label: 'Против чего', kind: 'tag' },
        { key: 'damage_bonus', label: 'Бонус урона', kind: 'expr' },
        { key: 'apply_to', label: 'Куда наносится', kind: 'tag' },
      ],
      steps: [
        { id: 'hit', type: 'threshold',
          roll: { die: { constant: 'lead_die' }, bonus: { param: 'bonus' }, check: 'attack_roll' },
          versus: { param: 'versus' } },
        { id: 'dmg', type: 'amount', source: 'roll',
          dice: { prop: 'damage_dice' }, bonus: { param: 'damage_bonus' } },
        { type: 'apply', target: { param: 'apply_to' }, direction: 'subtract',
          value: { ref: 'dmg' }, floor: { const: 0 }, targetModifiers: true },
      ],
    },

    save: {
      label: 'Спасбросок',
      icon: '☄',
      category: 'Атака',
      activation: 'manual',
      cost: 'action',
      params: [
        { key: 'save', label: 'Чем спасается цель', kind: 'expr', of: 'target' },
        { key: 'dc', label: 'Сложность', kind: 'expr' },
        { key: 'dice', label: 'Кости урона', kind: 'dice' },
        { key: 'apply_to', label: 'Куда наносится', kind: 'tag' },
        { key: 'status', label: 'Состояние при провале', kind: 'effect' },
      ],
      steps: [
        // Порог на стороне цели: бросает ПОЛУЧАТЕЛЬ своей ведущей костью
        // и своими модификаторами. Дальше — только если НЕ спасся.
        { id: 'save', type: 'threshold', side: 'target',
          roll: { die: { constant: 'lead_die' }, bonus: { param: 'save' }, check: 'save_roll' },
          versus: { param: 'dc' }, continueOn: 'fail' },
        { id: 'dmg', type: 'amount', source: 'roll', dice: { param: 'dice' } },
        { type: 'apply', target: { param: 'apply_to' }, direction: 'subtract',
          value: { ref: 'dmg' }, floor: { const: 0 }, targetModifiers: true },
        { type: 'status', mode: 'apply', effect: { param: 'status', optional: true } },
      ],
    },

    // Лечение — НЕ урон с минусом: направление «плюс», потолок — максимум
    // хитов, сопротивления не участвуют. Другое заполнение тех же слотов.
    heal: {
      label: 'Лечение',
      icon: '✚',
      category: 'Лечение',
      activation: 'manual',
      cost: 'action',
      params: [
        { key: 'dice', label: 'Кости лечения', kind: 'dice' },
        { key: 'bonus', label: 'Бонус', kind: 'expr' },
        { key: 'apply_to', label: 'Что восполняется', kind: 'tag' },
        { key: 'cap', label: 'Потолок', kind: 'tag' },
        { key: 'cure', label: 'Что снимает', kind: 'effect' },
      ],
      steps: [
        { id: 'amt', type: 'amount', source: 'roll',
          dice: { param: 'dice' }, bonus: { param: 'bonus' } },
        { type: 'apply', target: { param: 'apply_to' }, direction: 'add',
          value: { ref: 'amt' }, ceiling: { param: 'cap' }, targetModifiers: false },
        // Тот же шаг «состояние», другое направление: лечащее заклинание
        // снимает яд. Отдельного типа шага для этого не нужно.
        { type: 'status', mode: 'remove', effect: { param: 'cure', optional: true } },
      ],
    },

    // ── пассивные: висят и правят цифры ────────────────────────────────────

    poisoned: {
      label: 'Отравлен',
      icon: '☠',
      category: 'Состояния',
      activation: 'passive',
      duration: { kind: 'temporary' },
      stacking: 'refresh',
      description: 'Помеха на броски атаки.',
      modifiers: [
        // Помеха — не «−2 к броску». Это другая порода: два кубика, берём худший.
        { kind: 'roll', target: 'attack_roll', effect: 'disadvantage', method: 'rerollBest', condition: null },
      ],
    },

    stoneskin: {
      label: 'Каменная кожа',
      icon: '🪨',
      category: 'Состояния',
      activation: 'passive',
      duration: { kind: 'temporary' },
      description: 'Сопротивление урону: входящее в хиты половинится.',
      modifiers: [
        // Мишень «входящее» — то, что летит В поле извне. Шаг «применить»
        // прогоняет через неё величину, когда правило сказало «с учётом
        // модификаторов цели»; лечение и износ идут мимо.
        { kind: 'value', target: 'incoming:hp_current', op: 'mul', value: 0.5, stacking: 'sum', condition: null },
      ],
    },

    // Правила комнаты — те же пассивные эффекты, просто включённые на всех
    // (см. room_rules ниже). На карточке эффекта про охват ни слова:
    // эффект не знает, где он подключён.
    heavy_armor_rule: {
      label: 'Тяжёлый доспех мешает ловким проверкам',
      icon: '⚖',
      category: 'Правила комнаты',
      activation: 'passive',
      duration: { kind: 'permanent' },
      modifiers: [
        { kind: 'roll', target: 'skill_roll', effect: 'disadvantage', method: 'rerollBest', condition: '#armor_heavy' },
      ],
    },

    mastery_rule: {
      label: 'Мастерство даёт фору',
      icon: '⚖',
      category: 'Правила комнаты',
      activation: 'passive',
      duration: { kind: 'permanent' },
      modifiers: [
        { kind: 'roll', target: 'skill_roll', effect: 'advantage', method: 'rerollBest', condition: '#prof_bonus >= 4' },
      ],
    },

    // ── триггерный: срабатывает сам на чужое событие ────────────────────────

    thorns: {
      label: 'Шипы',
      icon: '⚡',
      category: 'Состояния',
      activation: 'triggered',
      duration: { kind: 'uses', max: 3 },
      description: 'Когда по владельцу попали атакой — бьёт нападавшего в ответ.',
      // Слушаем эффект «Атака», момент — после разрешения на владельце,
      // условие — по трассе события: попали ли. Условие структурное,
      // как слоты шагов: { ref } смотрит в результат шага события.
      trigger: { on: 'strike', when: 'resolved', condition: { ref: 'hit.success' } },
      params: [
        { key: 'dice', label: 'Кости ответного урона', kind: 'dice' },
        { key: 'apply_to', label: 'Куда наносится', kind: 'tag' },
      ],
      steps: [
        { id: 'back', type: 'amount', source: 'roll', dice: { param: 'dice' } },
        { type: 'apply', target: { param: 'apply_to' }, direction: 'subtract',
          value: { ref: 'back' }, floor: { const: 0 }, targetModifiers: true },
      ],
    },
  },

  // Правила комнаты: пассивные эффекты, включённые на ВСЕХ чарников мира.
  // Ссылки, а не копии — тот же эффект можно и повесить на одного.
  room_rules: ['heavy_armor_rule', 'mastery_rule'],

  // Словарь РОДОВ записей компендиума. Род — это ФОРМА ЗАПОЛНЕНИЯ: он
  // объявляет, какие циферки спросить у человека (`props`) и к каким
  // эффектам их привязать (`bindings`). Тогда наполнение сводится к вводу
  // заранее известных чисел, а действия у записи появляются сами.
  //
  // `kind` — базис хранения, короткий словарь движка (item / action).
  // Всё человеческое — лейбл, подсказка, значок, группа — дело системы.
  records: {
    weapon: {
      kind: 'item', label: 'Оружие', icon: '⚔', group: 'Снаряжение',
      hint: 'Кость урона — и атака появляется у владельца сама.',
      props: [
        { key: 'damage_dice', label: 'Кость урона', kind: 'dice' },
        { key: 'damage_flat', label: 'Урон оружия (число)', kind: 'number' },
      ],
      // Протягивание: род привязан к эффекту, запись только заполняет циферки.
      // Надел меч — получил «Атаку», снял — потерял.
      bindings: [
        { label: 'Атака', effect: 'strike',
          args: { bonus: '#attack_bonus', versus: 'ac', damage_bonus: '#str_mod', apply_to: 'hp_current' } },
      ],
    },
    gear: {
      kind: 'item', label: 'Снаряжение', icon: '⬡', group: 'Снаряжение',
      hint: 'Носимая вещь с бонусами к полям листа. Действий не даёт.',
    },
    action: {
      kind: 'action', label: 'Действие', icon: '✊', group: 'Приёмы',
      hint: 'Приём без предмета: сам выбирает эффект.',
    },
    'attack-spell': {
      kind: 'action', label: 'Атакующее заклинание', icon: '🔥', group: 'Заклинания',
      hint: 'Цель спасается; при провале — урон и, если задано, состояние.',
      props: [
        { key: 'damage_dice', label: 'Кость урона', kind: 'dice' },
        { key: 'status', label: 'Состояние при провале', kind: 'effect' },
      ],
      bindings: [
        { label: 'Сотворить', effect: 'save',
          args: {
            save: '#dex_save', dc: '#spell_dc', apply_to: 'hp_current',
            dice: { prop: 'damage_dice' }, status: { prop: 'status' },
          } },
      ],
    },
    'healing-spell': {
      kind: 'action', label: 'Лечащее заклинание', icon: '💚', group: 'Заклинания',
      hint: 'Восполняет хиты и, если задано, снимает состояние.',
      props: [
        { key: 'heal_dice', label: 'Кость лечения', kind: 'dice' },
        { key: 'cure', label: 'Что снимает', kind: 'effect' },
      ],
      bindings: [
        { label: 'Сотворить', effect: 'heal',
          args: {
            bonus: '#cha_mod', apply_to: 'hp_current', cap: 'hp_max',
            dice: { prop: 'heal_dice' }, cure: { prop: 'cure' },
          } },
      ],
    },
    lore: {
      kind: 'action', label: 'Заметка', icon: '📜', group: 'Заклинания',
      hint: 'Чистые данные: род без привязок ничего не автоматизирует.',
    },
  },

  // Мишени бросков — то, на что вешаются модификаторы породы «правящие бросок».
  rolls: [
    { tag: 'attack_roll', label: 'Бросок атаки' },
    { tag: 'save_roll', label: 'Спасбросок' },
    { tag: 'skill_roll', label: 'Проверка навыка' },
  ],

  fields: [
    // Текстовые поля: значение вводит игрок, формулы на них не ссылаются.
    // В черновике это был блок «Поля персонажа» — имя, раса, класс.
    { tag: 'race', label: 'Раса', group: 'Личное дело', value: { kind: 'stored', type: 'text', default: '' } },
    { tag: 'class_name', label: 'Класс', group: 'Личное дело', value: { kind: 'stored', type: 'text', default: '' } },
    { tag: 'alignment', label: 'Мировоззрение', group: 'Личное дело', value: { kind: 'stored', type: 'text', default: '' } },

    { tag: 'str', label: 'Сила', group: 'Характеристики', roll: { label: 'Проверка Силы' }, value: { kind: 'stored', type: 'number', default: 10 } },
    { tag: 'dex', label: 'Ловкость', group: 'Характеристики', roll: { label: 'Проверка Ловкости' }, value: { kind: 'stored', type: 'number', default: 10 } },
    { tag: 'con', label: 'Телосложение', group: 'Характеристики', roll: { label: 'Проверка Телосложения' }, value: { kind: 'stored', type: 'number', default: 10 } },
    { tag: 'int', label: 'Интеллект', group: 'Характеристики', roll: { label: 'Проверка Интеллекта' }, value: { kind: 'stored', type: 'number', default: 10 } },
    { tag: 'wis', label: 'Мудрость', group: 'Характеристики', roll: { label: 'Проверка Мудрости' }, value: { kind: 'stored', type: 'number', default: 10 } },
    { tag: 'cha', label: 'Харизма', group: 'Характеристики', roll: { label: 'Проверка Харизмы' }, value: { kind: 'stored', type: 'number', default: 10 } },

    { tag: 'str_mod', label: 'Модификатор Силы', group: 'Модификаторы', value: { kind: 'formula', expr: 'floor((#str - 10) / 2)' } },
    { tag: 'dex_mod', label: 'Модификатор Ловкости', group: 'Модификаторы', value: { kind: 'formula', expr: 'floor((#dex - 10) / 2)' } },
    { tag: 'con_mod', label: 'Модификатор Телосложения', group: 'Модификаторы', value: { kind: 'formula', expr: 'floor((#con - 10) / 2)' } },
    { tag: 'int_mod', label: 'Модификатор Интеллекта', group: 'Модификаторы', value: { kind: 'formula', expr: 'floor((#int - 10) / 2)' } },
    { tag: 'wis_mod', label: 'Модификатор Мудрости', group: 'Модификаторы', value: { kind: 'formula', expr: 'floor((#wis - 10) / 2)' } },
    { tag: 'cha_mod', label: 'Модификатор Харизмы', group: 'Модификаторы', value: { kind: 'formula', expr: 'floor((#cha - 10) / 2)' } },

    { tag: 'level', label: 'Уровень', group: 'Прогрессия', value: { kind: 'stored', type: 'number', default: 1 } },
    { tag: 'prof_bonus', label: 'Бонус мастерства', group: 'Прогрессия', value: { kind: 'table', table: 'proficiency', arg: '#level' } },

    { tag: 'athletics', label: 'Атлетика', group: 'Навыки', roll: { label: 'Проверка: Атлетика' }, value: { kind: 'formula', expr: '#str_mod' } },
    { tag: 'acrobatics', label: 'Акробатика', group: 'Навыки', roll: { label: 'Проверка: Акробатика' }, value: { kind: 'formula', expr: '#dex_mod' } },
    { tag: 'sleight_of_hand', label: 'Ловкость рук', group: 'Навыки', roll: { label: 'Проверка: Ловкость рук' }, value: { kind: 'formula', expr: '#dex_mod' } },
    { tag: 'stealth', label: 'Скрытность', group: 'Навыки', roll: { label: 'Проверка: Скрытность' }, value: { kind: 'formula', expr: '#dex_mod' } },
    { tag: 'arcana', label: 'Магия', group: 'Навыки', roll: { label: 'Проверка: Магия' }, value: { kind: 'formula', expr: '#int_mod' } },
    { tag: 'history', label: 'История', group: 'Навыки', roll: { label: 'Проверка: История' }, value: { kind: 'formula', expr: '#int_mod' } },
    { tag: 'investigation', label: 'Анализ', group: 'Навыки', roll: { label: 'Проверка: Анализ' }, value: { kind: 'formula', expr: '#int_mod' } },
    { tag: 'nature', label: 'Природа', group: 'Навыки', roll: { label: 'Проверка: Природа' }, value: { kind: 'formula', expr: '#int_mod' } },
    { tag: 'religion', label: 'Религия', group: 'Навыки', roll: { label: 'Проверка: Религия' }, value: { kind: 'formula', expr: '#int_mod' } },
    { tag: 'animal_handling', label: 'Уход за животными', group: 'Навыки', roll: { label: 'Проверка: Уход за животными' }, value: { kind: 'formula', expr: '#wis_mod' } },
    { tag: 'insight', label: 'Проницательность', group: 'Навыки', roll: { label: 'Проверка: Проницательность' }, value: { kind: 'formula', expr: '#wis_mod' } },
    { tag: 'medicine', label: 'Медицина', group: 'Навыки', roll: { label: 'Проверка: Медицина' }, value: { kind: 'formula', expr: '#wis_mod' } },
    { tag: 'perception', label: 'Внимательность', group: 'Навыки', roll: { label: 'Проверка: Внимательность' }, value: { kind: 'formula', expr: '#wis_mod' } },
    { tag: 'survival', label: 'Выживание', group: 'Навыки', roll: { label: 'Проверка: Выживание' }, value: { kind: 'formula', expr: '#wis_mod' } },
    { tag: 'deception', label: 'Обман', group: 'Навыки', roll: { label: 'Проверка: Обман' }, value: { kind: 'formula', expr: '#cha_mod' } },
    { tag: 'intimidation', label: 'Запугивание', group: 'Навыки', roll: { label: 'Проверка: Запугивание' }, value: { kind: 'formula', expr: '#cha_mod' } },
    { tag: 'performance', label: 'Выступление', group: 'Навыки', roll: { label: 'Проверка: Выступление' }, value: { kind: 'formula', expr: '#cha_mod' } },
    { tag: 'persuasion', label: 'Убеждение', group: 'Навыки', roll: { label: 'Проверка: Убеждение' }, value: { kind: 'formula', expr: '#cha_mod' } },

    { tag: 'ac_base', label: 'База доспеха', group: 'Защита', value: { kind: 'stored', type: 'number', default: 10 } },
    { tag: 'armor_heavy', label: 'Доспех тяжёлый', group: 'Защита', value: { kind: 'stored', type: 'boolean', default: false } },
    // Условное правило: в тяжёлом доспехе Ловкость не прибавляется.
    { tag: 'ac', label: 'Класс брони', group: 'Защита', value: { kind: 'formula', expr: '#ac_base + (#armor_heavy ? 0 : #dex_mod)' } },
    { tag: 'dex_save', label: 'Спасбросок Ловкости', group: 'Защита', roll: { label: 'Спасбросок Ловкости' }, value: { kind: 'formula', expr: '#dex_mod' } },

    { tag: 'hp_max', label: 'Максимум ХП', group: 'Здоровье', value: { kind: 'stored', type: 'number', default: 1 } },
    { tag: 'hp_current', label: 'Текущие ХП', group: 'Здоровье', value: { kind: 'stored', type: 'number', default: 1 } },

    { tag: 'attack_bonus', label: 'Бонус атаки', group: 'Атака', value: { kind: 'formula', expr: '#str_mod + #prof_bonus' } },
    { tag: 'spell_dc', label: 'Сложность заклинаний', group: 'Атака', value: { kind: 'formula', expr: '8 + #prof_bonus + #cha_mod' } },
  ],

};
