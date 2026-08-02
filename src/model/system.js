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

  // Правила разрешения — слоты, а не код. Пока слот один: откуда берётся
  // величина урона атаки. 'roll' — свой бросок урона (D&D 5e),
  // 'margin' — превышение проверки попадания (Shadowrun, Fate, WFRP).
  // Смена значения переключает модель урона всей системы без строчки в движке.
  rules: {
    attack: {
      damage: { source: 'roll' },
    },
  },

  // Схема записей компендиума: какие свойства бывают у оружия ЭТОЙ системы.
  // Ключи (damage_dice, damage_flat) — словарь движка, как род конверта;
  // состав и человеческие лейблы — дело системы. Запись компендиума заполняет
  // объявленное; необъявленное свойство движок не прочитает вовсе.
  records: {
    weapon: {
      label: 'Оружие',
      props: [
        { key: 'damage_dice', label: 'Кость урона', kind: 'dice' },
        { key: 'damage_flat', label: 'Урон оружия (число)', kind: 'number' },
      ],
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
