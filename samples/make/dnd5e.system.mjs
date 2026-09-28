export const ABILITIES = [
  ['str', 'Сила'], ['dex', 'Ловкость'], ['con', 'Телосложение'],
  ['int', 'Интеллект'], ['wis', 'Мудрость'], ['cha', 'Харизма'],
];

export const SKILLS = [
  ['athletics', 'Атлетика', 'str'],
  ['acrobatics', 'Акробатика', 'dex'], ['sleight_of_hand', 'Ловкость рук', 'dex'], ['stealth', 'Скрытность', 'dex'],
  ['arcana', 'Магия', 'int'], ['history', 'История', 'int'], ['investigation', 'Анализ', 'int'],
  ['nature', 'Природа', 'int'], ['religion', 'Религия', 'int'],
  ['animal_handling', 'Уход за животными', 'wis'], ['insight', 'Проницательность', 'wis'],
  ['medicine', 'Медицина', 'wis'], ['perception', 'Внимательность', 'wis'], ['survival', 'Выживание', 'wis'],
  ['deception', 'Обман', 'cha'], ['intimidation', 'Запугивание', 'cha'],
  ['performance', 'Выступление', 'cha'], ['persuasion', 'Убеждение', 'cha'],
];

export const skillWord = label => label.toLowerCase().replace(/\s+/g, '_');

const SKILL_GROUP = {
  str: 'Навыки от силы', dex: 'Навыки от ловкости', int: 'Навыки от интеллекта',
  wis: 'Навыки от мудрости', cha: 'Навыки от харизмы',
};

export const RESOURCES = [
  ['rages', 'Ярость', 'long'],
  ['ki', 'Очки ци', 'short'],
  ['bardic', 'Бардовское вдохновение', 'long'],
  ['channel', 'Божественный канал', 'short'],
  ['second_wind', 'Второе дыхание', 'short'],
  ['action_surge', 'Всплеск действий', 'short'],
  ['lay_on_hands', 'Наложение рук: запас', 'long'],
  ['sorcery', 'Очки чародейства', 'long'],
  ['superiority', 'Кости превосходства', 'short'],
  ['luck', 'Очки удачи', 'long'],
  ['relentless', 'Непоколебимая стойкость', 'long'],
];

export const DAMAGE_TAGS = [
  'рубящий', 'колющий', 'дробящий', 'огонь', 'холод', 'молния', 'гром', 'кислота', 'яд',
  'некротический', 'излучение', 'психический', 'силовой',
];

const words = (label, key, rows) => ({ label, key, rows });

const NATURE = {
  рубящий: 'физический', колющий: 'физический', дробящий: 'физический',
  огонь: 'стихийный', холод: 'стихийный', молния: 'стихийный', гром: 'стихийный', кислота: 'стихийный',
  яд: 'прочий', некротический: 'прочий', излучение: 'прочий', психический: 'прочий', силовой: 'прочий',
};

export const WEAPON_PROPERTIES = [
  'лёгкое', 'фехтовальное', 'метательное', 'двуручное', 'тяжёлое',
  'досягаемость', 'универсальное', 'перезарядка', 'боеприпасы',
];

export const lists = () => ({
  weapon_properties: words('Свойства оружия', 'word', WEAPON_PROPERTIES.map(p => ({ value: p }))),
  damage_nature: words('Природа урона', 'word', [
    { value: 'физический' },
    { value: 'стихийный' },
    { value: 'прочий' },
  ]),
  damage_source: words('Источник урона', 'word', [
    { value: 'немагический' },
    { value: 'магический' },
  ]),
  damage_types: {
    label: 'Типы урона', key: 'word',
    columns: [{ key: 'nature', label: 'Природа', kind: 'choice', from: 'damage_nature' }],
    rows: DAMAGE_TAGS.map(tag => ({ value: tag, cells: { nature: NATURE[tag] } })),
  },
  wield: {
    label: 'Способ атаки', key: 'word',
    columns: [
      { key: 'attack', label: 'Бонус атаки', kind: 'expr' },
      { key: 'damage', label: 'Прибавка к урону', kind: 'expr' },
    ],
    rows: [
      { value: WIELD.melee,
        cells: { attack: '@str_mod + @prof_bonus', damage: '@str_mod' } },
      { value: WIELD.finesse,
        cells: { attack: 'max(@str_mod, @dex_mod) + @prof_bonus', damage: 'max(@str_mod, @dex_mod)' } },
      { value: WIELD.ranged,
        cells: { attack: '@dex_mod + @prof_bonus', damage: '@dex_mod' } },
    ],
  },
  rolls: {
    label: 'Броски', key: 'word',
    columns: [
      { key: 'успех', label: 'Успех', kind: 'text' },
      { key: 'провал', label: 'Провал', kind: 'text' },
    ],
    rows: [
      { value: 'атака', cells: { успех: 'попадание', провал: 'промах' } },
      { value: 'спасбросок', cells: { успех: 'спасся', провал: 'не спасся' } },
      { value: 'проверка', cells: { успех: 'успех', провал: 'провал' } },
      { value: 'инициатива' },
    ],
  },
  skills: {
    label: 'Навыки', key: 'word',
    columns: [{ key: 'ability', label: 'Характеристика', kind: 'choice', from: 'abilities' }],
    rows: SKILLS.map(([, label, a]) => ({ value: skillWord(label), cells: { ability: ABILITY_WORD[a] } })),
  },
  abilities: {
    label: 'Характеристики', key: 'word',
    columns: [{ key: 'mod', label: 'Модификатор', kind: 'expr' }],
    rows: ABILITIES.map(([tag]) => ({ value: ABILITY_WORD[tag], cells: { mod: `@${tag}_mod` } })),
  },
  saves: {
    label: 'Спасброски', key: 'word',
    columns: [{ key: 'save', label: 'Спасбросок', kind: 'expr' }],
    rows: ABILITIES.map(([tag]) => ({ value: ABILITY_WORD[tag], cells: { save: `@${tag}_save` } })),
  },
  classes: {
    label: 'Классы', key: 'word',
    columns: [
      { key: 'hit_die', label: 'Кость хитов', kind: 'dice' },
      { key: 'saves', label: 'Спасброски', kind: 'choice', from: 'abilities', many: true },
      { key: 'spell_ability', label: 'Заклинательная характеристика', kind: 'choice', from: 'abilities' },
    ],
    rows: CLASSES.map(([value, die, saves, spell]) => ({
      value,
      cells: { hit_die: `1к${die}`, saves, ...(spell ? { spell_ability: spell } : {}) },
    })),
  },
  sizes: {
    label: 'Размеры', key: 'word',
    columns: [{ key: 'hit_die', label: 'Кость хитов существа', kind: 'dice' }],
    rows: SIZES.map(([value, die]) => ({ value, cells: { hit_die: `1к${die}` } })),
  },
  races: {
    label: 'Расы и виды существ', key: 'word',
    columns: [
      { key: 'size', label: 'Размер', kind: 'choice', from: 'sizes' },
      { key: 'speed', label: 'Скорость, футов', kind: 'number' },
    ],
    rows: RACES.map(([value, size, speed]) => ({ value, cells: { size, speed } })),
  },
  taken: {
    label: 'Стойкость к урону', key: 'word',
    columns: [{ key: 'mult', label: 'Множитель', kind: 'number' }],
    rows: [['иммунитет', 0], ['сопротивление', 0.5], ['как есть', 1], ['уязвимость', 2]]
      .map(([value, mult]) => ({ value, cells: { mult } })),
  },
});

export const TURN_FIELDS = [
  ['turn_action', 'Действие'], ['turn_bonus', 'Бонусное действие'], ['turn_reaction', 'Реакция'], ['turn_once', 'Раз за ход'],
];

export const WIELD = {
  melee: 'ближний бой — Сила', finesse: 'фехтовальное — Сила или Ловкость', ranged: 'дальний бой — Ловкость',
};

export const ABILITY_WORD = {
  str: 'сила', dex: 'ловкость', con: 'телосложение', int: 'интеллект', wis: 'мудрость', cha: 'харизма',
};

const CLASSES = [
  ['варвар', 12, ['сила', 'телосложение']],
  ['бард', 8, ['ловкость', 'харизма'], 'харизма'],
  ['жрец', 8, ['мудрость', 'харизма'], 'мудрость'],
  ['друид', 8, ['интеллект', 'мудрость'], 'мудрость'],
  ['воин', 10, ['сила', 'телосложение']],
  ['монах', 8, ['сила', 'ловкость']],
  ['паладин', 10, ['мудрость', 'харизма'], 'харизма'],
  ['следопыт', 10, ['сила', 'ловкость'], 'мудрость'],
  ['плут', 8, ['ловкость', 'интеллект']],
  ['чародей', 6, ['телосложение', 'харизма'], 'харизма'],
  ['колдун', 8, ['мудрость', 'харизма'], 'харизма'],
  ['волшебник', 6, ['интеллект', 'мудрость'], 'интеллект'],
];

const SIZES = [['крошечный', 4], ['маленький', 6], ['средний', 8], ['большой', 10], ['огромный', 12], ['громадный', 20]];

const RACES = [
  ['дварф', 'средний', 25], ['эльф', 'средний', 30], ['полурослик', 'маленький', 25],
  ['человек', 'средний', 30], ['драконорождённый', 'средний', 30], ['гном', 'маленький', 25],
  ['полуэльф', 'средний', 30], ['полуорк', 'средний', 30], ['тифлинг', 'средний', 30],
  ['гоблин', 'маленький', 30], ['орк', 'средний', 30], ['огр', 'большой', 40],
];

export const TAKEN = DAMAGE_TAGS
  .map((tag, at) => [`taken_${at}`, tag]);

const LEAD_DIE = { constant: 'lead_die' };

const stored = (tag, label, group, type, def, extra = {}) => {
  const { control, roll, options, optionsFrom, ...bounds } = extra;
  return {
    tag, label, group,
    ...(roll ? { roll: { ...roll, die: LEAD_DIE } } : {}),
    value: { kind: 'stored', type, default: def, ...bounds },
    ...(control ? { control } : {}),
    ...(options ? { options } : {}),
    ...(optionsFrom ? { optionsFrom } : {}),
  };
};
const formula = (tag, label, group, expr, roll) => ({
  tag, label, group, ...(roll ? { roll: { ...roll, die: LEAD_DIE } } : {}), value: { kind: 'formula', expr },
});
const lookup = (tag, label, group, table, arg, column) =>
  ({ tag, label, group, value: { kind: 'table', table, arg, ...(column ? { column } : {}) } });

export function fields() {
  const out = [];
  out.push(stored('race', 'Раса', 'Личное дело', 'text', '', { optionsFrom: 'races' }));
  out.push(stored('class_name', 'Класс', 'Личное дело', 'text', '', { optionsFrom: 'classes' }));
  for (const [tag, label] of [['subclass', 'Подкласс'],
    ['background', 'Предыстория'], ['alignment', 'Мировоззрение']]) {
    out.push(stored(tag, label, 'Личное дело', 'text', ''));
  }

  for (const [a, label] of ABILITIES) out.push(stored(a, label, 'Характеристики', 'number', 10, { min: 1, max: 30 }));
  for (const [a, label] of ABILITIES) {
    out.push(formula(`${a}_mod`, `Модификатор: ${label}`, 'Модификаторы', `floor((@${a} - 10) / 2)`,
      { label: `Проверка: ${label}`, tags: ['проверка', ABILITY_WORD[a]] }));
  }

  out.push(stored('level', 'Уровень', 'Прогрессия', 'number', 1, { min: 1, max: 20, control: 'stepper' }));
  out.push(lookup('prof_bonus', 'Бонус мастерства', 'Прогрессия', 'levels', '@level', 'prof'));
  out.push(stored('inspiration', 'Вдохновение', 'Прогрессия', 'number', 0, { min: 0, max: 1, control: 'pips' }));
  out.push(stored('xp', 'Опыт', 'Прогрессия', 'number', 0, { min: 0 }));

  for (const [a, label] of ABILITIES) {
    out.push(stored(`${a}_save_extra`, `Владение сверх класса: спасбросок ${label}`, 'Спасброски', 'number', 0, { min: 0, max: 1, control: 'ring' }));
    out.push(formula(`${a}_save_prof`, `Владение: спасбросок ${label}`, 'Спасброски',
      `max(@${a}_save_extra, есть(@class_name.saves, "${ABILITY_WORD[a]}") ? 1 : 0)`));
    out.push(formula(`${a}_save`, `Спасбросок: ${label}`, 'Спасброски', `@${a}_mod + @${a}_save_prof * @prof_bonus`,
      { label: `Спасбросок: ${label}`, tags: ['спасбросок', ABILITY_WORD[a]] }));
  }

  for (const [tag, label, a] of SKILLS) {
    out.push(stored(`${tag}_prof`, `Владение: ${label}`, SKILL_GROUP[a], 'number', 0, { min: 0, max: 2, control: 'ring' }));
    out.push(formula(tag, label, SKILL_GROUP[a], `@${a}_mod + @${tag}_prof * @prof_bonus`,
      { label: `Проверка: ${label}`, tags: ['проверка', ABILITY_WORD[a], skillWord(label)] }));
  }

  out.push(formula('initiative', 'Инициатива', 'Чувства и движение', '@dex_mod', { label: 'Инициатива', tags: INITIATIVE_TAGS }));
  out.push(formula('passive_perception', 'Пассивная внимательность', 'Чувства и движение', '10 + @perception'));
  out.push(formula('speed', 'Скорость, футов', 'Чувства и движение', 'или(@race.speed, 30)'));
  out.push(stored('darkvision', 'Тёмное зрение, футов', 'Чувства и движение', 'number', 0, { min: 0 }));
  out.push(stored('languages', 'Языки', 'Чувства и движение', 'text', 'Общий'));

  out.push(stored('ac_base', 'База доспеха', 'Защита', 'number', 10, { min: 0 }));
  out.push(stored('armor_heavy', 'Доспех тяжёлый', 'Защита', 'boolean', false, { control: 'toggle' }));
  out.push(formula('ac_dex', 'Ловкость в классе брони', 'Защита', '@dex_mod'));
  out.push(formula('ac', 'Класс брони', 'Защита', '@ac_base + (@armor_heavy ? 0 : @ac_dex)'));

  out.push(stored('hp_max', 'Максимум хитов', 'Здоровье', 'number', 8, { min: 1 }));
  out.push(stored('hp_current', 'Хиты', 'Здоровье', 'number', 8, { min: 0, max: '@hp_max', control: 'bar' }));
  out.push(stored('hp_temp', 'Временные хиты', 'Здоровье', 'number', 0, { min: 0, control: 'stepper' }));
  out.push(formula('hit_die', 'Кость хитов', 'Здоровье', 'или(@class_name.hit_die, @race.size.hit_die, "1к8")'));
  out.push(stored('hit_dice_left', 'Костей хитов осталось', 'Здоровье', 'number', 1, { min: 0, max: '@level', control: 'stepper' }));
  out.push(stored('death_ok', 'Спасброски от смерти: успехи', 'Здоровье', 'number', 0, { min: 0, max: 3, control: 'pips' }));
  out.push(stored('death_fail', 'Спасброски от смерти: провалы', 'Здоровье', 'number', 0, { min: 0, max: 3, control: 'pips' }));
  out.push(stored('exhaustion', 'Истощение', 'Здоровье', 'number', 0, { min: 0, max: 6, control: 'stepper' }));
  out.push(formula('down', 'Без сил', 'Здоровье', '@hp_current <= 0'));
  out.push(formula('up', 'На ногах', 'Здоровье', '@hp_current > 0'));
  out.push(formula('is_dead', 'Три провала', 'Здоровье', '@death_fail >= 3'));
  out.push(formula('is_stable', 'Три успеха', 'Здоровье', '@death_ok >= 3'));

  out.push(stored('attacks_per_action', 'Атак за действие', 'Атака', 'number', 1, { min: 1, max: 4, control: 'stepper' }));

  for (const [tag, label] of TURN_FIELDS) {
    out.push(stored(tag, label, 'В бою', 'number', 1, { min: 0, max: 1, control: 'pips' }));
  }
  out.push(stored('turn_attacks', 'Атак осталось', 'В бою', 'number', 0, { min: 0, max: 4, control: 'pips' }));
  out.push({ ...stored('battle', 'Идёт бой', 'В бою', 'number', 0, { min: 0, max: 1, control: 'toggle' }), desk: true });
  out.push(stored('crit_from', 'Крит на костях от', 'Атака', 'number', 20, { min: 18, max: 20 }));
  out.push(formula('sneak_dice', 'Костей скрытой атаки', 'Атака', 'ceil(@level / 2)'));

  out.push(formula('spell_mod', 'Заклинательный модификатор', 'Магия', 'или(@class_name.spell_ability.mod, @cha_mod)'));
  out.push(formula('spell_dc', 'Сложность заклинаний', 'Магия', '8 + @prof_bonus + @spell_mod'));
  out.push(formula('spell_attack', 'Атака заклинанием', 'Магия', '@prof_bonus + @spell_mod'));
  out.push(stored('caster_level', 'Уровень заклинателя', 'Магия', 'number', 0, { min: 0, max: 20, control: 'stepper' }));
  out.push(lookup('cantrip_dice', 'Костей заговора', 'Магия', 'levels', '@level', 'cantrips'));

  for (let n = 1; n <= 9; n++) {
    out.push(lookup(`slots_${n}_max`, `Всего ячеек ${n}-го круга`, 'Ячейки заклинаний', 'spell_slots', '@caster_level', `круг_${n}`));
    out.push(stored(`slots_${n}`, `Ячейки ${n}-го круга`, 'Ячейки заклинаний', 'number', 0,
      { min: 0, max: `@slots_${n}_max`, control: 'pips' }));
  }

  for (const [key, label] of RESOURCES) {
    out.push(stored(`${key}_max`, `${label}: всего`, 'Ресурсы класса', 'number', 0, { min: 0 }));
    out.push(stored(`${key}_left`, `${label}: осталось`, 'Ресурсы класса', 'number', 0,
      { min: 0, max: `@${key}_max`, control: 'stepper' }));
  }
  out.push(lookup('rage_damage', 'Урон ярости', 'Ресурсы класса', 'levels', '@level', 'rage'));
  out.push(stored('superiority_die', 'Кость превосходства', 'Ресурсы класса', 'text', '1к8', { control: 'die' }));

  for (const [tag, label] of [['gp', 'Золотые'], ['sp', 'Серебряные'], ['cp', 'Медные']]) {
    out.push(stored(tag, label, 'Богатство', 'number', 0, { min: 0 }));
  }

  for (const [tag, damage] of TAKEN) {
    out.push(stored(tag, `${damage[0].toUpperCase()}${damage.slice(1)}`, 'Стойкость к урону', 'text', 'как есть', {
      control: 'choice', optionsFrom: 'taken',
    }));
  }
  return out;
}


export const groups = () => ({
  'Личное дело': {},
  'Механика': {},
  'Атака': { parent: 'Механика' },
  'Заклинания': { parent: 'Механика' },
  'Умения класса': { parent: 'Механика' },
  'Черты': { parent: 'Механика' },
  'Состояния': { parent: 'Механика' },
  'Реакции': { parent: 'Механика' },
  'Действия в бою': { parent: 'Механика' },
  'Отдых и смерть': { parent: 'Механика' },
  'Лечение': { parent: 'Механика' },
  'Правила комнаты': { parent: 'Механика' },
  'Вызываемые': { parent: 'Механика' },
  'Книга': {},
  'Снаряжение': { parent: 'Книга' },
  'Расходники': { parent: 'Книга' },
  'Умения и черты': { parent: 'Книга' },
  'Бестиарий': { parent: 'Книга' },
  'Характеристики': { default: { kind: 'stored', type: 'number', default: 10 } },
  'Модификаторы': {},
  'Прогрессия': {},
  'Спасброски': {},
  'Навыки': {},
  ...Object.fromEntries(Object.values(SKILL_GROUP).map(name => [name, { parent: 'Навыки' }])),
  'Чувства и движение': {},
  'В бою': {},
  'Защита': {},
  'Здоровье': {},
  'Атака': {},
  'Магия': {},
  'Ячейки заклинаний': { parent: 'Магия' },
  'Ресурсы класса': {},
  'Богатство': {},
  'Стойкость к урону': {},
});

const FULL_CASTER = [
  [2], [3], [4, 2], [4, 3], [4, 3, 2], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 2], [4, 3, 3, 3, 1], [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 1, 1, 1, 1], [4, 3, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 3, 2, 2, 1, 1],
];

const LEVELS = Array.from({ length: 20 }, (_, at) => at + 1);
const step = (level, bounds) => bounds.find(([upTo]) => level <= upTo)[1];
const CIRCLES = Array.from({ length: 9 }, (_, at) => at + 1);

export function tables() {
  return {
    levels: {
      label: 'Уровень персонажа', key: 'number',
      columns: [
        { key: 'prof', label: 'Бонус мастерства', kind: 'number' },
        { key: 'cantrips', label: 'Костей заговора', kind: 'number' },
        { key: 'rage', label: 'Урон ярости', kind: 'number' },
      ],
      rows: LEVELS.map(level => ({
        value: level,
        cells: {
          prof: step(level, [[4, 2], [8, 3], [12, 4], [16, 5], [20, 6]]),
          cantrips: step(level, [[4, 1], [10, 2], [16, 3], [20, 4]]),
          rage: step(level, [[8, 2], [15, 3], [20, 4]]),
        },
      })),
    },
    spell_slots: {
      label: 'Ячейки заклинаний', key: 'number',
      columns: CIRCLES.map(n => ({ key: `круг_${n}`, label: `${n}-й круг`, kind: 'number' })),
      rows: [0, ...LEVELS].map(level => ({
        value: level,
        cells: Object.fromEntries(CIRCLES.map(n => [`круг_${n}`, level ? (FULL_CASTER[level - 1][n - 1] ?? 0) : 0])),
      })),
    },
  };
}

export const constants = () => ({
  lead_die: { label: 'Ведущая кость', kind: 'die', dice: [{ count: 1, sides: 20 }] },
});

export const INITIATIVE_TAGS = ['проверка', 'ловкость', 'инициатива'];

export const rollEdits = () => ({
  advantage: { label: 'Преимущество', ops: [{ op: 'addDie' }, { op: 'keepBest', n: 1 }], canceledBy: 'disadvantage' },
  disadvantage: { label: 'Помеха', ops: [{ op: 'addDie' }, { op: 'keepWorst', n: 1 }], canceledBy: 'advantage' },
  bless: { label: 'Благословение: +1к4', ops: [{ op: 'bonusDie', sides: 4 }] },
  bane: { label: 'Порча: −1к4', ops: [{ op: 'bonusDie', sides: 4, minus: true }] },
  guidance: { label: 'Указание: +1к4', ops: [{ op: 'bonusDie', sides: 4 }] },
  bardic: { label: 'Бардовское вдохновение: +1к6', ops: [{ op: 'bonusDie', sides: 6 }] },
  precision: { label: 'Точная атака: +1к8', ops: [{ op: 'bonusDie', sides: 8 }] },
  lucky: { label: 'Везучий: перебросить единицу', ops: [{ op: 'reroll', n: 1 }] },
  reliable: { label: 'Надёжный талант: не меньше 10', ops: [{ op: 'floorDie', least: 10 }] },
  auto_fail: { label: 'Автоматический провал', ops: [{ op: 'shiftVersus', by: 99 }] },
});




export function calledEffects() {
  const slotSteps = [];
  for (let n = 1; n <= 9; n++) {
    const when = { ref: 'event.amount', is: n };
    slotSteps.push({
      id: `есть_${n}`, type: 'compare', value: { tag: `slots_${n}` }, versus: { const: 1 }, breakIf: 'less',
      note: `нет ячейки ${n}-го круга`, when,
    });
    slotSteps.push({ type: 'apply', target: { tag: `slots_${n}` }, direction: 'subtract', value: { const: 1 }, targetModifiers: false, when });
  }
  return {
    damage: {
      label: 'Урон',
      group: 'Вызываемые',
      params: [
        { key: 'amount', label: 'Сколько урона', kind: 'number', role: 'amount' },
        { key: 'damage_type', label: 'Тип урона', kind: 'choice', from: 'damage_types' },
        { key: 'damage_source', label: 'Источник урона', kind: 'choice', from: 'damage_source', optional: true },
      ],
      steps: [
        {
          type: 'apply', target: { tag: 'death_fail' }, direction: 'add', value: { const: 1 }, targetModifiers: false,
          when: { expr: '@hp_current <= 0', of: 'target' },
        },
        { id: 'по_временным', type: 'apply', target: { tag: 'hp_temp' }, direction: 'subtract', value: { ref: 'event.amount' }, targetModifiers: false },
        { id: 'по_хитам', type: 'apply', target: { tag: 'hp_current' }, direction: 'subtract', value: { ref: 'по_временным.overkill' }, targetModifiers: false },
        { type: 'status', mode: 'apply', effect: { const: 'dead' }, when: { ref: 'по_хитам.overkill', atLeast: { tag: 'hp_max' } } },
      ],
    },
    spell_slot: {
      label: 'Ячейка заклинания',
      group: 'Вызываемые',
      params: [{ key: 'circle', label: 'Круг ячейки', kind: 'number', role: 'amount' }],
      steps: slotSteps,
    },
  };
}
