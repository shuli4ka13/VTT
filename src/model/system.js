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

    { tag: 'athletics_prof', label: 'Владение: Атлетика', group: 'Навыки', value: { kind: 'stored', type: 'number', default: 0 } },
    { tag: 'athletics', label: 'Атлетика', group: 'Навыки', prof: 'athletics_prof', roll: { label: 'Проверка: Атлетика' }, value: { kind: 'formula', expr: '#str_mod + #athletics_prof * #prof_bonus' } },
    { tag: 'acrobatics_prof', label: 'Владение: Акробатика', group: 'Навыки', value: { kind: 'stored', type: 'number', default: 0 } },
    { tag: 'acrobatics', label: 'Акробатика', group: 'Навыки', prof: 'acrobatics_prof', roll: { label: 'Проверка: Акробатика' }, value: { kind: 'formula', expr: '#dex_mod + #acrobatics_prof * #prof_bonus' } },
    { tag: 'sleight_of_hand_prof', label: 'Владение: Ловкость рук', group: 'Навыки', value: { kind: 'stored', type: 'number', default: 0 } },
    { tag: 'sleight_of_hand', label: 'Ловкость рук', group: 'Навыки', prof: 'sleight_of_hand_prof', roll: { label: 'Проверка: Ловкость рук' }, value: { kind: 'formula', expr: '#dex_mod + #sleight_of_hand_prof * #prof_bonus' } },
    { tag: 'stealth_prof', label: 'Владение: Скрытность', group: 'Навыки', value: { kind: 'stored', type: 'number', default: 0 } },
    { tag: 'stealth', label: 'Скрытность', group: 'Навыки', prof: 'stealth_prof', roll: { label: 'Проверка: Скрытность' }, value: { kind: 'formula', expr: '#dex_mod + #stealth_prof * #prof_bonus' } },
    { tag: 'arcana_prof', label: 'Владение: Магия', group: 'Навыки', value: { kind: 'stored', type: 'number', default: 0 } },
    { tag: 'arcana', label: 'Магия', group: 'Навыки', prof: 'arcana_prof', roll: { label: 'Проверка: Магия' }, value: { kind: 'formula', expr: '#int_mod + #arcana_prof * #prof_bonus' } },
    { tag: 'history_prof', label: 'Владение: История', group: 'Навыки', value: { kind: 'stored', type: 'number', default: 0 } },
    { tag: 'history', label: 'История', group: 'Навыки', prof: 'history_prof', roll: { label: 'Проверка: История' }, value: { kind: 'formula', expr: '#int_mod + #history_prof * #prof_bonus' } },
    { tag: 'investigation_prof', label: 'Владение: Анализ', group: 'Навыки', value: { kind: 'stored', type: 'number', default: 0 } },
    { tag: 'investigation', label: 'Анализ', group: 'Навыки', prof: 'investigation_prof', roll: { label: 'Проверка: Анализ' }, value: { kind: 'formula', expr: '#int_mod + #investigation_prof * #prof_bonus' } },
    { tag: 'nature_prof', label: 'Владение: Природа', group: 'Навыки', value: { kind: 'stored', type: 'number', default: 0 } },
    { tag: 'nature', label: 'Природа', group: 'Навыки', prof: 'nature_prof', roll: { label: 'Проверка: Природа' }, value: { kind: 'formula', expr: '#int_mod + #nature_prof * #prof_bonus' } },
    { tag: 'religion_prof', label: 'Владение: Религия', group: 'Навыки', value: { kind: 'stored', type: 'number', default: 0 } },
    { tag: 'religion', label: 'Религия', group: 'Навыки', prof: 'religion_prof', roll: { label: 'Проверка: Религия' }, value: { kind: 'formula', expr: '#int_mod + #religion_prof * #prof_bonus' } },
    { tag: 'animal_handling_prof', label: 'Владение: Уход за животными', group: 'Навыки', value: { kind: 'stored', type: 'number', default: 0 } },
    { tag: 'animal_handling', label: 'Уход за животными', group: 'Навыки', prof: 'animal_handling_prof', roll: { label: 'Проверка: Уход за животными' }, value: { kind: 'formula', expr: '#wis_mod + #animal_handling_prof * #prof_bonus' } },
    { tag: 'insight_prof', label: 'Владение: Проницательность', group: 'Навыки', value: { kind: 'stored', type: 'number', default: 0 } },
    { tag: 'insight', label: 'Проницательность', group: 'Навыки', prof: 'insight_prof', roll: { label: 'Проверка: Проницательность' }, value: { kind: 'formula', expr: '#wis_mod + #insight_prof * #prof_bonus' } },
    { tag: 'medicine_prof', label: 'Владение: Медицина', group: 'Навыки', value: { kind: 'stored', type: 'number', default: 0 } },
    { tag: 'medicine', label: 'Медицина', group: 'Навыки', prof: 'medicine_prof', roll: { label: 'Проверка: Медицина' }, value: { kind: 'formula', expr: '#wis_mod + #medicine_prof * #prof_bonus' } },
    { tag: 'perception_prof', label: 'Владение: Внимательность', group: 'Навыки', value: { kind: 'stored', type: 'number', default: 0 } },
    { tag: 'perception', label: 'Внимательность', group: 'Навыки', prof: 'perception_prof', roll: { label: 'Проверка: Внимательность' }, value: { kind: 'formula', expr: '#wis_mod + #perception_prof * #prof_bonus' } },
    { tag: 'survival_prof', label: 'Владение: Выживание', group: 'Навыки', value: { kind: 'stored', type: 'number', default: 0 } },
    { tag: 'survival', label: 'Выживание', group: 'Навыки', prof: 'survival_prof', roll: { label: 'Проверка: Выживание' }, value: { kind: 'formula', expr: '#wis_mod + #survival_prof * #prof_bonus' } },
    { tag: 'deception_prof', label: 'Владение: Обман', group: 'Навыки', value: { kind: 'stored', type: 'number', default: 0 } },
    { tag: 'deception', label: 'Обман', group: 'Навыки', prof: 'deception_prof', roll: { label: 'Проверка: Обман' }, value: { kind: 'formula', expr: '#cha_mod + #deception_prof * #prof_bonus' } },
    { tag: 'intimidation_prof', label: 'Владение: Запугивание', group: 'Навыки', value: { kind: 'stored', type: 'number', default: 0 } },
    { tag: 'intimidation', label: 'Запугивание', group: 'Навыки', prof: 'intimidation_prof', roll: { label: 'Проверка: Запугивание' }, value: { kind: 'formula', expr: '#cha_mod + #intimidation_prof * #prof_bonus' } },
    { tag: 'performance_prof', label: 'Владение: Выступление', group: 'Навыки', value: { kind: 'stored', type: 'number', default: 0 } },
    { tag: 'performance', label: 'Выступление', group: 'Навыки', prof: 'performance_prof', roll: { label: 'Проверка: Выступление' }, value: { kind: 'formula', expr: '#cha_mod + #performance_prof * #prof_bonus' } },
    { tag: 'persuasion_prof', label: 'Владение: Убеждение', group: 'Навыки', value: { kind: 'stored', type: 'number', default: 0 } },
    { tag: 'persuasion', label: 'Убеждение', group: 'Навыки', prof: 'persuasion_prof', roll: { label: 'Проверка: Убеждение' }, value: { kind: 'formula', expr: '#cha_mod + #persuasion_prof * #prof_bonus' } },

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
