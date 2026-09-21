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

const stored = (tag, label, group, type, def, extra = {}) => {
  const { control, roll, ...bounds } = extra;
  return {
    tag, label, group,
    ...(roll ? { roll } : {}),
    value: { kind: 'stored', type, default: def, ...bounds },
    ...(control ? { control } : {}),
  };
};
const formula = (tag, label, group, expr, roll) => ({
  tag, label, group, ...(roll ? { roll } : {}), value: { kind: 'formula', expr },
});
const lookup = (tag, label, group, table, arg) => ({ tag, label, group, value: { kind: 'table', table, arg } });

export function fields() {
  const out = [];
  for (const [tag, label] of [['race', 'Раса'], ['class_name', 'Класс'], ['subclass', 'Подкласс'],
    ['background', 'Предыстория'], ['alignment', 'Мировоззрение']]) {
    out.push(stored(tag, label, 'Личное дело', 'text', ''));
  }

  for (const [a, label] of ABILITIES) out.push(stored(a, label, 'Характеристики', 'number', 10, { min: 1, max: 30 }));
  for (const [a, label] of ABILITIES) {
    out.push(formula(`${a}_mod`, `Модификатор: ${label}`, 'Модификаторы', `floor((#${a} - 10) / 2)`,
      { label: `Проверка: ${label}`, check: 'skill_roll' }));
  }

  out.push(stored('level', 'Уровень', 'Прогрессия', 'number', 1, { min: 1, max: 20, control: 'stepper' }));
  out.push(lookup('prof_bonus', 'Бонус мастерства', 'Прогрессия', 'proficiency', '#level'));
  out.push(stored('inspiration', 'Вдохновение', 'Прогрессия', 'number', 0, { min: 0, max: 1, control: 'pips' }));
  out.push(stored('xp', 'Опыт', 'Прогрессия', 'number', 0, { min: 0 }));

  for (const [a, label] of ABILITIES) {
    out.push(stored(`${a}_save_prof`, `Владение: спасбросок ${label}`, 'Спасброски', 'number', 0, { min: 0, max: 1, control: 'ring' }));
    out.push(formula(`${a}_save`, `Спасбросок: ${label}`, 'Спасброски', `#${a}_mod + #${a}_save_prof * #prof_bonus`,
      { label: `Спасбросок: ${label}`, check: 'save_roll' }));
  }

  for (const [tag, label, a] of SKILLS) {
    out.push(stored(`${tag}_prof`, `Владение: ${label}`, SKILL_GROUP[a], 'number', 0, { min: 0, max: 2, control: 'ring' }));
    out.push(formula(tag, label, SKILL_GROUP[a], `#${a}_mod + #${tag}_prof * #prof_bonus`,
      { label: `Проверка: ${label}`, check: 'skill_roll' }));
  }

  out.push(formula('initiative', 'Инициатива', 'Чувства и движение', '#dex_mod', { label: 'Инициатива', check: 'skill_roll' }));
  out.push(formula('passive_perception', 'Пассивная внимательность', 'Чувства и движение', '10 + #perception'));
  out.push(stored('speed', 'Скорость, футов', 'Чувства и движение', 'number', 30, { min: 0 }));
  out.push(stored('darkvision', 'Тёмное зрение, футов', 'Чувства и движение', 'number', 0, { min: 0 }));
  out.push(stored('languages', 'Языки', 'Чувства и движение', 'text', 'Общий'));

  out.push(stored('ac_base', 'База доспеха', 'Защита', 'number', 10, { min: 0 }));
  out.push(stored('armor_heavy', 'Доспех тяжёлый', 'Защита', 'boolean', false, { control: 'toggle' }));
  out.push(formula('ac_dex', 'Ловкость в классе брони', 'Защита', '#dex_mod'));
  out.push(formula('ac', 'Класс брони', 'Защита', '#ac_base + (#armor_heavy ? 0 : #ac_dex)'));

  out.push(stored('hp_max', 'Максимум хитов', 'Здоровье', 'number', 8, { min: 1 }));
  out.push(stored('hp_current', 'Хиты', 'Здоровье', 'number', 8, { min: 0, max: '#hp_max', control: 'bar' }));
  out.push(stored('hp_temp', 'Временные хиты', 'Здоровье', 'number', 0, { min: 0, control: 'stepper' }));
  out.push(stored('hit_die', 'Кость хитов', 'Здоровье', 'text', '1к8', { control: 'die' }));
  out.push(stored('hit_dice_left', 'Костей хитов осталось', 'Здоровье', 'number', 1, { min: 0, max: '#level', control: 'stepper' }));
  out.push(stored('death_ok', 'Спасброски от смерти: успехи', 'Здоровье', 'number', 0, { min: 0, max: 3, control: 'pips' }));
  out.push(stored('death_fail', 'Спасброски от смерти: провалы', 'Здоровье', 'number', 0, { min: 0, max: 3, control: 'pips' }));
  out.push(stored('exhaustion', 'Истощение', 'Здоровье', 'number', 0, { min: 0, max: 6, control: 'stepper' }));
  out.push(formula('down', 'Без сил', 'Здоровье', '#hp_current <= 0'));
  out.push(formula('up', 'На ногах', 'Здоровье', '#hp_current > 0'));
  out.push(formula('is_dead', 'Три провала', 'Здоровье', '#death_fail >= 3'));
  out.push(formula('is_stable', 'Три успеха', 'Здоровье', '#death_ok >= 3'));

  out.push(formula('melee_attack', 'Атака ближним оружием', 'Атака', '#str_mod + #prof_bonus'));
  out.push(formula('ranged_attack', 'Атака дальнобойным оружием', 'Атака', '#dex_mod + #prof_bonus'));
  out.push(formula('finesse_attack', 'Атака фехтовальным оружием', 'Атака', 'max(#str_mod, #dex_mod) + #prof_bonus'));
  out.push(formula('melee_damage', 'Прибавка к урону: ближний бой', 'Атака', '#str_mod'));
  out.push(formula('ranged_damage', 'Прибавка к урону: дальний бой', 'Атака', '#dex_mod'));
  out.push(formula('finesse_damage', 'Прибавка к урону: фехтовальное', 'Атака', 'max(#str_mod, #dex_mod)'));
  out.push(stored('attacks_per_action', 'Атак за действие', 'Атака', 'number', 1, { min: 1, max: 4, control: 'stepper' }));
  out.push(stored('crit_from', 'Крит на костях от', 'Атака', 'number', 20, { min: 18, max: 20 }));
  out.push(formula('sneak_dice', 'Костей скрытой атаки', 'Атака', 'ceil(#level / 2)'));

  out.push(stored('casts_int', 'Колдует от Интеллекта', 'Магия', 'boolean', false, { control: 'toggle' }));
  out.push(stored('casts_wis', 'Колдует от Мудрости', 'Магия', 'boolean', false, { control: 'toggle' }));
  out.push(formula('spell_mod', 'Заклинательный модификатор', 'Магия', '#casts_int ? #int_mod : (#casts_wis ? #wis_mod : #cha_mod)'));
  out.push(formula('spell_dc', 'Сложность заклинаний', 'Магия', '8 + #prof_bonus + #spell_mod'));
  out.push(formula('spell_attack', 'Атака заклинанием', 'Магия', '#prof_bonus + #spell_mod'));
  out.push(stored('caster_level', 'Уровень заклинателя', 'Магия', 'number', 0, { min: 0, max: 20, control: 'stepper' }));
  out.push(lookup('cantrip_dice', 'Костей заговора', 'Магия', 'cantrip_dice', '#level'));

  for (let n = 1; n <= 9; n++) {
    out.push(lookup(`slots_${n}_max`, `Всего ячеек ${n}-го круга`, 'Ячейки заклинаний', `slots_${n}`, '#caster_level'));
    out.push(stored(`slots_${n}`, `Ячейки ${n}-го круга`, 'Ячейки заклинаний', 'number', 0,
      { min: 0, max: `#slots_${n}_max`, control: 'pips' }));
  }

  for (const [key, label] of RESOURCES) {
    out.push(stored(`${key}_max`, `${label}: всего`, 'Ресурсы класса', 'number', 0, { min: 0 }));
    out.push(stored(`${key}_left`, `${label}: осталось`, 'Ресурсы класса', 'number', 0,
      { min: 0, max: `#${key}_max`, control: 'stepper' }));
  }
  out.push(lookup('rage_damage', 'Урон ярости', 'Ресурсы класса', 'rage_damage', '#level'));
  out.push(stored('superiority_die', 'Кость превосходства', 'Ресурсы класса', 'text', '1к8', { control: 'die' }));

  for (const [tag, label] of [['gp', 'Золотые'], ['sp', 'Серебряные'], ['cp', 'Медные']]) {
    out.push(stored(tag, label, 'Богатство', 'number', 0, { min: 0 }));
  }
  return out;
}

export const groups = () => ({
  'Личное дело': {},
  'Характеристики': { default: { kind: 'stored', type: 'number', default: 10 } },
  'Модификаторы': {},
  'Прогрессия': {},
  'Спасброски': {},
  'Навыки': {},
  ...Object.fromEntries(Object.values(SKILL_GROUP).map(name => [name, { parent: 'Навыки' }])),
  'Чувства и движение': {},
  'Защита': {},
  'Здоровье': {},
  'Атака': {},
  'Магия': {},
  'Ячейки заклинаний': { parent: 'Магия' },
  'Ресурсы класса': {},
  'Богатство': {},
});

const range = (from, to, value) => ({ from, to, value });

const FULL_CASTER = [
  [2], [3], [4, 2], [4, 3], [4, 3, 2], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 2], [4, 3, 3, 3, 1], [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 1, 1, 1, 1], [4, 3, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 3, 2, 2, 1, 1],
];

export function tables() {
  const out = {
    proficiency: {
      label: 'Бонус мастерства по уровню',
      ranges: [range(1, 4, 2), range(5, 8, 3), range(9, 12, 4), range(13, 16, 5), range(17, 20, 6)],
    },
    cantrip_dice: {
      label: 'Костей заговора по уровню',
      ranges: [range(1, 4, 1), range(5, 10, 2), range(11, 16, 3), range(17, 20, 4)],
    },
    rage_damage: {
      label: 'Урон ярости по уровню',
      ranges: [range(1, 8, 2), range(9, 15, 3), range(16, 20, 4)],
    },
  };
  for (let n = 1; n <= 9; n++) {
    out[`slots_${n}`] = {
      label: `Ячейки ${n}-го круга по уровню заклинателя`,
      ranges: [range(0, 0, 0), ...FULL_CASTER.map((row, at) => range(at + 1, at + 1, row[n - 1] ?? 0))],
    };
  }
  return out;
}

export const constants = () => ({
  lead_die: { label: 'Ведущая кость', kind: 'die', dice: [{ count: 1, sides: 20 }] },
});

export const rolls = () => [
  { tag: 'attack_roll', label: 'Бросок атаки' },
  { tag: 'save_roll', label: 'Спасбросок' },
  { tag: 'skill_roll', label: 'Проверка характеристики или навыка' },
];

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

export const actionTypes = () => ({
  action: { label: 'Действие', icon: '◆', perTurn: 1 },
  attack: { label: 'Атака', icon: '⚔', perTurn: 1, perTurnField: 'attacks_per_action', within: 'action' },
  bonus: { label: 'Бонусное действие', icon: '◇', perTurn: 1 },
  reaction: { label: 'Реакция', icon: '↩', perTurn: 1 },
  once: { label: 'Раз за ход', icon: '①', perTurn: 1 },
  free: { label: 'Свободное', icon: '○' },
  movement: { label: 'Передвижение', icon: '→' },
});

export const DAMAGE_TAGS = [
  'рубящий', 'колющий', 'дробящий', 'огонь', 'холод', 'молния', 'гром', 'кислота', 'яд',
  'некротический', 'излучение', 'психический', 'силовой', 'магический',
];

export function events() {
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
      tags: DAMAGE_TAGS,
      receive: [
        {
          type: 'apply', target: { tag: 'death_fail' }, direction: 'add', value: { const: 1 }, targetModifiers: false,
          when: { expr: '#hp_current <= 0', of: 'target' },
        },
        { id: 'по_временным', type: 'apply', target: { tag: 'hp_temp' }, direction: 'subtract', value: { ref: 'event.amount' }, targetModifiers: false },
        { id: 'по_хитам', type: 'apply', target: { tag: 'hp_current' }, direction: 'subtract', value: { ref: 'по_временным.overkill' }, targetModifiers: false },
        { type: 'status', mode: 'apply', effect: { const: 'dead' }, when: { ref: 'по_хитам.overkill', atLeast: { tag: 'hp_max' } } },
      ],
    },
    spell_slot: {
      label: 'Ячейка заклинания',
      tags: [],
      receive: slotSteps,
    },
  };
}
