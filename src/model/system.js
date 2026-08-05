// Система — это ДАННЫЕ. Ни одной функции в этом файле нет и быть не должно.
// Срез D&D 5e: шесть характеристик → модификаторы → бонус мастерства таблицей →
// один навык → класс брони с условием → одна атака и одно действие по спасброску.
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
  name: 'D&D 5e — срез',

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

  // Правила разрешения — словарь именованных конвейеров шагов. Одно
  // ОПРЕДЕЛЕНИЕ на систему: эффект компендиума зовёт правило по имени
  // и приносит параметры, копий шагов в эффектах нет и быть не может.
  // Правка шага здесь меняет поведение всех эффектов сразу.
  //
  // Правило не знает слова «урон»: удар, спасбросок, лечение — разные
  // заполнения одних и тех же слотов. Типы шагов — src/engine/steps/.
  rules: {
    strike: {
      label: 'Атака',
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
          dice: { item: 'damage_dice' }, bonus: { param: 'damage_bonus' } },
        { type: 'apply', target: { param: 'apply_to' }, direction: 'subtract',
          value: { ref: 'dmg' }, floor: { const: 0 }, targetModifiers: true },
      ],
    },

    save: {
      label: 'Спасбросок',
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
        { type: 'status', effect: { param: 'status' } },
      ],
    },

    // Лечение — НЕ урон с минусом: направление «плюс», потолок — максимум
    // хитов, сопротивления не участвуют. Другое заполнение тех же слотов.
    heal: {
      label: 'Лечение',
      params: [
        { key: 'dice', label: 'Кости лечения', kind: 'dice' },
        { key: 'bonus', label: 'Бонус', kind: 'expr' },
        { key: 'apply_to', label: 'Что восполняется', kind: 'tag' },
        { key: 'cap', label: 'Потолок', kind: 'tag' },
      ],
      steps: [
        { id: 'amt', type: 'amount', source: 'roll',
          dice: { param: 'dice' }, bonus: { param: 'bonus' } },
        { type: 'apply', target: { param: 'apply_to' }, direction: 'add',
          value: { ref: 'amt' }, ceiling: { param: 'cap' }, targetModifiers: false },
      ],
    },
  },

  // Словарь РОДОВ записей компендиума. Палитра «что можно добавить», слова
  // и подсказки на экранах компендиума и игрока выводятся ОТСЮДА — как словарь
  // мишеней выводится из тегов. У киберпанка рода другие: там нет «Заклинания».
  //
  // `kind` — базис хранения, короткий словарь движка (item / effect / call /
  // action), как род конверта. Всё человеческое — лейбл, подсказка, значок —
  // дело системы. `props` — типизированные свойства записей этого рода;
  // необъявленное свойство движок не прочитает вовсе.
  records: {
    weapon: {
      kind: 'item', label: 'Оружие', icon: '⚔',
      hint: 'Кость урона и активности: действия, которые предмет даёт, пока надет.',
      props: [
        { key: 'damage_dice', label: 'Кость урона', kind: 'dice' },
        { key: 'damage_flat', label: 'Урон оружия (число)', kind: 'number' },
      ],
    },
    gear: {
      kind: 'item', label: 'Снаряжение', icon: '⬡',
      hint: 'Носимая вещь с бонусами к полям листа.',
    },
    effect: {
      kind: 'effect', label: 'Эффект', icon: '✦',
      hint: 'Длящееся состояние: модификаторы действуют, пока висит.',
    },
    call: {
      kind: 'call', label: 'Вызов правила', icon: '⚙',
      hint: 'Механика системы с заполненными параметрами.',
    },
    action: {
      kind: 'action', label: 'Действие', icon: '✊',
      hint: 'Приём без предмета: сам выбирает вызов правила.',
    },
    spell: {
      kind: 'action', label: 'Заклинание', icon: '🔮',
      hint: 'Волшебство: действие, ярлык мира 5e.',
    },
  },

  // Правила самой системы: действуют на всех её чарников, без предметов и эффектов.
  // Это авто-правила из черновика — «ярлык + условие + эффект + метод». Разница
  // в том, что условие здесь действительно вычисляется.
  modifiers: [
    {
      id: 'rule_heavy_armor', label: 'Тяжёлый доспех мешает ловким проверкам',
      kind: 'roll', target: 'skill_roll',
      effect: 'disadvantage', method: 'rerollBest', condition: '#armor_heavy',
    },
    {
      id: 'rule_mastery', label: 'Мастерство даёт фору',
      kind: 'roll', target: 'skill_roll',
      effect: 'advantage', method: 'rerollBest', condition: '#prof_bonus >= 4',
    },
  ],

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
