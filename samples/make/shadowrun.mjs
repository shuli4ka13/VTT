import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ATTRIBUTES = [
  ['body', 'Тело'], ['agility', 'Ловкость'], ['reaction', 'Реакция'], ['strength', 'Сила'],
  ['willpower', 'Сила воли'], ['logic', 'Логика'], ['intuition', 'Интуиция'], ['charisma', 'Харизма'],
];

const SKILLS = [
  ['pistols', 'Пистолеты', 'agility'], ['automatics', 'Автоматы', 'agility'], ['longarms', 'Длинноствольное', 'agility'],
  ['blades', 'Клинки', 'agility'], ['unarmed', 'Рукопашный бой', 'agility'], ['sneaking', 'Скрытность', 'agility'],
  ['gymnastics', 'Гимнастика', 'agility'], ['running', 'Бег', 'strength'], ['perception', 'Восприятие', 'intuition'],
  ['con', 'Обман', 'charisma'], ['etiquette', 'Этикет', 'charisma'], ['negotiation', 'Переговоры', 'charisma'],
  ['computer', 'Компьютер', 'logic'], ['hacking', 'Хакинг', 'logic'], ['first_aid', 'Первая помощь', 'logic'],
];

const LIMIT_OF = { agility: 'physical_limit', strength: 'physical_limit', reaction: 'physical_limit', body: 'physical_limit', intuition: 'mental_limit', logic: 'mental_limit', willpower: 'mental_limit', charisma: 'social_limit' };

const POOL_DIE = { constant: 'pool' };

const stored = (tag, label, group, def, extra = {}) => ({ tag, label, group, value: { kind: 'stored', type: 'number', default: def, ...extra } });
const formula = (tag, label, group, expr, roll) => ({ tag, label, group, ...(roll ? { roll } : {}), value: { kind: 'formula', expr } });
const pool = label => ({ label, die: POOL_DIE, pool: true, tags: ['проверка'] });

function fields() {
  const out = [];
  for (const [tag, label] of ATTRIBUTES) out.push(stored(tag, label, 'Атрибуты', 3, { min: 1, max: 9 }));
  out.push(stored('edge', 'Грань', 'Особые', 2, { min: 1, max: 7 }));
  out.push(stored('edge_left', 'Грань: осталось', 'Особые', 2, { min: 0 }));
  out.push(stored('essence', 'Сущность', 'Особые', 6, { min: 0, max: 6 }));
  out.push(stored('magic', 'Магия', 'Особые', 0, { min: 0 }));

  out.push(formula('physical_limit', 'Физический предел', 'Пределы', 'ceil((@strength * 2 + @body + @reaction) / 3)'));
  out.push(formula('mental_limit', 'Ментальный предел', 'Пределы', 'ceil((@logic * 2 + @intuition + @willpower) / 3)'));
  out.push(formula('social_limit', 'Социальный предел', 'Пределы', 'ceil((@charisma * 2 + @willpower + @essence) / 3)'));

  for (const [tag, label] of SKILLS) out.push(stored(tag, label, 'Навыки', 0, { min: 0, max: 12 }));
  for (const [tag, label, attribute] of SKILLS) {
    out.push(formula(`${tag}_pool`, `${label}: пул`, 'Пулы',
      `max(0, (@${tag} > 0 ? @${tag} + @${attribute} : @${attribute} - 1) + @wound_mod)`,
      pool(`Проверка: ${label}`)));
  }
  out.push(formula('composure', 'Самообладание', 'Пулы', 'max(0, @charisma + @willpower + @wound_mod)', pool('Самообладание')));
  out.push(formula('judge_intentions', 'Чтение намерений', 'Пулы', 'max(0, @charisma + @intuition + @wound_mod)', pool('Чтение намерений')));
  out.push(formula('memory', 'Память', 'Пулы', 'max(0, @logic + @willpower + @wound_mod)', pool('Память')));
  out.push(formula('lift_carry', 'Поднять и нести', 'Пулы', 'max(0, @body + @strength + @wound_mod)', pool('Поднять и нести')));

  out.push(stored('armor', 'Броня', 'Защита', 0, { min: 0 }));
  out.push(formula('defense_pool', 'Защита: пул', 'Защита', 'max(0, @reaction + @intuition + @wound_mod)', pool('Защита')));
  out.push(formula('soak_pool', 'Сопротивление урону: пул', 'Защита', '@body + @armor'));

  out.push(formula('physical_max', 'Физический трек: клеток', 'Состояние', '8 + ceil(@body / 2)'));
  out.push(stored('physical', 'Физический урон', 'Состояние', 0, { min: 0 }));
  out.push(formula('stun_max', 'Оглушающий трек: клеток', 'Состояние', '8 + ceil(@willpower / 2)'));
  out.push(stored('stun', 'Оглушающий урон', 'Состояние', 0, { min: 0 }));
  out.push(formula('wound_mod', 'Штраф за раны', 'Состояние', '0 - floor(@physical / 3) - floor(@stun / 3)'));
  out.push(formula('knocked_out', 'Оглушающий трек полон', 'Состояние', '@stun >= @stun_max'));
  out.push(formula('bleeding_out', 'Физический трек полон', 'Состояние', '@physical >= @physical_max'));
  out.push(formula('conscious', 'В сознании', 'Состояние', 'все(@stun < @stun_max, @physical < @physical_max)'));

  out.push(formula('initiative', 'Инициатива', 'Инициатива', '@reaction + @intuition + @wound_mod'));
  return out;
}

const tables = () => ({
  rolls: {
    label: 'Броски', key: 'word',
    columns: [{ key: 'успех', label: 'Успех', kind: 'text' }, { key: 'провал', label: 'Провал', kind: 'text' }],
    rows: [
      { value: 'проверка', cells: { успех: 'есть успехи', провал: 'ни одного успеха' } },
      { value: 'атака', cells: { успех: 'попадание', провал: 'промах' } },
      { value: 'защита' },
      { value: 'сопротивление' },
      { value: 'инициатива' },
    ],
  },
  damage_kinds: {
    label: 'Вид урона', key: 'word',
    columns: [{ key: 'physical', label: 'Физический', kind: 'number' }],
    rows: [{ value: 'физический', cells: { physical: 1 } }, { value: 'оглушающий', cells: { physical: 0 } }],
  },
  weapon_skills: {
    label: 'Навык оружия', key: 'word',
    columns: [{ key: 'pool', label: 'Пул', kind: 'expr' }],
    rows: [
      ['пистолеты', 'pistols'], ['автоматы', 'automatics'], ['длинноствольное', 'longarms'],
      ['клинки', 'blades'], ['рукопашный бой', 'unarmed'],
    ].map(([value, tag]) => ({ value, cells: { pool: `@${tag}_pool` } })),
  },
});

const constants = () => ({
  pool: { label: 'пул к6', kind: 'die', dice: [{ count: 1, sides: 6 }], read: { kind: 'count', atLeast: 5 } },
  init_die: { label: 'к6 инициативы', kind: 'die', dice: [{ count: 1, sides: 6 }] },
});

const add = (tag, expr, when) => ({ type: 'apply', target: { tag }, direction: 'add', value: { expr }, targetModifiers: false, ...(when ? { when: { expr: when } } : {}) });

const NET = 'min(@атака.natural, @accuracy) - @атака.versusNatural';
const MODIFIED_DV = `@dv + ${NET}`;
const TAKEN = `max(0, ${MODIFIED_DV} - @сопротивление.natural)`;
const STAYS_PHYSICAL = `все(@physical_hit >= 1, ${MODIFIED_DV} > @получатель.armor + @ap)`;

function effects() {
  const attack = (label, description) => ({
    label, group: 'Атака', activation: 'manual', description,
    params: [
      { key: 'attack_pool', label: 'Пул атаки', kind: 'number' },
      { key: 'accuracy', label: 'Точность (предел)', kind: 'number' },
      { key: 'dv', label: 'Урон оружия', kind: 'number' },
      { key: 'ap', label: 'Пробитие брони', kind: 'number' },
      { key: 'physical_hit', label: 'Урон физический (1) или оглушающий (0)', kind: 'number' },
    ],
    steps: [
      {
        id: 'атака', type: 'threshold', roll: { die: POOL_DIE, count: { expr: '@attack_pool' }, tags: ['атака'] },
        versus: { roll: { die: POOL_DIE, count: { expr: '@получатель.defense_pool' }, tags: ['защита'] } }, successWhen: 'over', continueOn: 'always',
      },
      { type: 'compare', value: { expr: NET }, versus: { expr: '1' }, breakIf: 'less', note: 'промах: успехов атаки с учётом точности не больше, чем у защиты' },
      {
        id: 'сопротивление', type: 'threshold', side: 'target',
        roll: { die: POOL_DIE, count: { expr: 'max(0, @получатель.body + max(0, @получатель.armor + @ap))' }, tags: ['сопротивление'] },
        versus: { expr: '0' }, continueOn: 'always',
      },
      add('physical', TAKEN, STAYS_PHYSICAL),
      add('stun', TAKEN, `не(${STAYS_PHYSICAL})`),
    ],
  });

  const onField = (label, description, tag, steps) => ({
    label, group: 'Правила комнаты', description, activation: 'passive', duration: { kind: 'permanent' }, params: [],
    on: [{ on: `field:${tag}`, steps }],
  });

  return {
    ranged_attack: attack('Выстрел',
      'Ловкость + навык оружия против Реакции + Интуиции цели. Успехов атаки засчитывается не больше точности оружия. Чистые успехи прибавляются к урону; цель сопротивляется Телом + Бронёй с учётом пробития. Урон, не превысивший броню, становится оглушающим.'),
    melee_attack: attack('Удар',
      'Ловкость + навык ближнего боя против Реакции + Интуиции цели. Урон оружия ближнего боя идёт от Силы. Дальше — как у выстрела.'),
    unconscious: {
      label: 'Без сознания', group: 'Состояния', activation: 'passive', duration: { kind: 'permanent' },
      description: 'Оглушающий трек полон: персонаж без сознания, пока не восстановит хотя бы одну клетку.', modifiers: [],
    },
    bleeding: {
      label: 'При смерти', group: 'Состояния', activation: 'passive', duration: { kind: 'permanent' },
      description: 'Физический трек полон: персонаж без сознания и умирает, если урон перейдёт сверх Тела. Следит ведущий.', modifiers: [],
    },
    knock_out: onField('Потеря сознания', 'Оглушающий трек заполнился — «Без сознания».', 'knocked_out',
      [{ type: 'status', mode: 'apply', effect: { const: 'unconscious' } }]),
    bleed_out: onField('Тяжёлое ранение', 'Физический трек заполнился — «При смерти».', 'bleeding_out',
      [{ type: 'status', mode: 'apply', effect: { const: 'bleeding' } }]),
    come_to: onField('Приходит в себя', 'Оба трека снова не полны — состояния сняты.', 'conscious',
      [{ type: 'status', mode: 'remove', effect: { const: 'unconscious' } }, { type: 'status', mode: 'remove', effect: { const: 'bleeding' } }]),
  };
}

const records = () => ({
  runner: { kind: 'sheet', label: 'Раннер', icon: '🕶', group: 'Листы', hint: 'Лист игрока: все блоки.' },
  opponent: {
    kind: 'sheet', label: 'Противник', icon: '👤', group: 'Листы', hint: 'Лист противника: атрибуты, навыки, защита, состояние.',
    blocks: ['Атрибуты', 'Навыки', 'Пулы', 'Защита', 'Состояние', 'Инициатива', 'Пределы'],
  },
  firearm: {
    kind: 'item', label: 'Огнестрельное оружие', icon: '🔫', group: 'Снаряжение', hint: 'Точность, урон, пробитие и навык.',
    props: [
      { key: 'accuracy', label: 'Точность', kind: 'number' },
      { key: 'dv', label: 'Урон', kind: 'number' },
      { key: 'ap', label: 'Пробитие', kind: 'number' },
      { key: 'damage_kind', label: 'Вид урона', kind: 'choice', from: 'damage_kinds' },
      { key: 'skill', label: 'Навык', kind: 'choice', from: 'weapon_skills' },
    ],
    bindings: [{
      label: 'Выстрел', effect: 'ranged_attack',
      args: {
        attack_pool: { expr: 'таблица("weapon_skills", @skill, "pool")' },
        accuracy: { prop: 'accuracy' }, dv: { prop: 'dv' }, ap: { prop: 'ap' },
        physical_hit: { expr: 'таблица("damage_kinds", @damage_kind, "physical")' },
      },
    }],
  },
  melee: {
    kind: 'item', label: 'Оружие ближнего боя', icon: '🗡', group: 'Снаряжение', hint: 'Урон — Сила плюс прибавка оружия, если оружие бьёт силой.',
    props: [
      { key: 'accuracy', label: 'Точность', kind: 'number' },
      { key: 'strength_based', label: 'Урон от Силы (1 — да, 0 — нет)', kind: 'number' },
      { key: 'dv_bonus', label: 'Урон: прибавка', kind: 'number' },
      { key: 'ap', label: 'Пробитие', kind: 'number' },
      { key: 'damage_kind', label: 'Вид урона', kind: 'choice', from: 'damage_kinds' },
      { key: 'skill', label: 'Навык', kind: 'choice', from: 'weapon_skills' },
    ],
    bindings: [{
      label: 'Удар', effect: 'melee_attack',
      args: {
        attack_pool: { expr: 'таблица("weapon_skills", @skill, "pool")' },
        accuracy: { prop: 'accuracy' }, dv: { expr: '(@strength_based >= 1 ? @strength : 0) + @dv_bonus' }, ap: { prop: 'ap' },
        physical_hit: { expr: 'таблица("damage_kinds", @damage_kind, "physical")' },
      },
    }],
  },
  armor: {
    kind: 'item', label: 'Броня', icon: '🧥', group: 'Снаряжение', hint: 'Значение брони прибавляется к защите листа.',
    props: [{ key: 'rating', label: 'Броня', kind: 'number' }],
  },
});

const gun = (id, label, description, accuracy, dv, ap, skill, kind = 'физический') =>
  ({ id, rk: 'firearm', label, description, props: { accuracy, dv, ap, damage_kind: kind, skill } });
const blade = (id, label, description, accuracy, bonus, ap, { kind = 'физический', skill = 'клинки', strength = 1 } = {}) =>
  ({ id, rk: 'melee', label, description, props: { accuracy, strength_based: strength, dv_bonus: bonus, ap, damage_kind: kind, skill } });
const armor = (id, label, rating) => ({
  id, rk: 'armor', label, description: `Броня ${rating}.`, props: { rating },
  modifiers: [{ kind: 'value', target: 'armor', op: 'add', value: rating, stacking: 'max', condition: null }],
});

const compendium = () => ({
  records: [
    gun('ares_predator_v', 'Ares Predator V', 'Тяжёлый пистолет: точность 5, урон 8 физ., пробитие −1.', 5, 8, -1, 'пистолеты'),
    gun('colt_america_l36', 'Colt America L36', 'Лёгкий пистолет: точность 7, урон 7 физ.', 7, 7, 0, 'пистолеты'),
    gun('ak_97', 'AK-97', 'Штурмовая винтовка: точность 5, урон 10 физ., пробитие −2.', 5, 10, -2, 'автоматы'),
    gun('defiance_t250', 'Defiance T-250', 'Дробовик: точность 4, урон 10 физ., пробитие −1.', 4, 10, -1, 'длинноствольное'),
    blade('katana', 'Катана', 'Точность 7, урон Сила + 3 физ., пробитие −3.', 7, 3, -3),
    blade('combat_knife', 'Боевой нож', 'Точность 6, урон Сила + 2 физ., пробитие −3.', 6, 2, -3),
    blade('stun_baton', 'Шоковая дубинка', 'Точность 4, урон 9 огл., пробитие −5; урон не от Силы.', 4, 9, -5, { kind: 'оглушающий', strength: 0 }),
    blade('fists', 'Кулаки', 'Урон Сила огл.; точность по книге — физический предел, здесь вписана числом.', 5, 0, 0, { kind: 'оглушающий', skill: 'рукопашный бой' }),
    armor('armor_jacket', 'Бронекуртка', 12),
    armor('armor_vest', 'Бронежилет', 9),
    armor('lined_coat', 'Бронированный плащ', 9),
  ],
});

const sheet = (id, name, of, values, has) => ({ id, systemId: 'shadowrun5', of, name, values, has: has.map(o => ({ of: o })), effects: [] });

const sheets = () => [
  sheet('razor', 'Бритва', 'runner', {
    body: 5, agility: 6, reaction: 5, strength: 4, willpower: 3, logic: 2, intuition: 4, charisma: 2,
    edge: 3, edge_left: 3, essence: 2.5, pistols: 6, blades: 5, unarmed: 3, perception: 3, sneaking: 3,
  }, ['ares_predator_v', 'katana', 'armor_jacket']),
  sheet('silk', 'Шёлк', 'runner', {
    body: 3, agility: 3, reaction: 3, strength: 2, willpower: 4, logic: 3, intuition: 4, charisma: 6,
    edge: 4, edge_left: 4, con: 6, etiquette: 5, negotiation: 5, pistols: 3, perception: 4,
  }, ['colt_america_l36', 'lined_coat']),
  sheet('ganger', 'Бандит', 'opponent', {
    body: 4, agility: 4, reaction: 3, strength: 4, willpower: 3, logic: 2, intuition: 3, charisma: 2,
    pistols: 3, blades: 3, unarmed: 3,
  }, ['colt_america_l36', 'combat_knife', 'armor_vest']),
  sheet('guard', 'Охранник корпорации', 'opponent', {
    body: 4, agility: 4, reaction: 4, strength: 3, willpower: 3, logic: 3, intuition: 4, charisma: 3,
    automatics: 4, unarmed: 3, perception: 3,
  }, ['ak_97', 'stun_baton', 'armor_jacket']),
];

const mannequin = (id, name) => ({ id, systemId: 'shadowrun5', name, values: { body: 4, agility: 4, reaction: 4, strength: 4, willpower: 4, logic: 4, intuition: 4, charisma: 4, pistols: 4 }, has: [], effects: [] });

const world = {
  title: 'Shadowrun 5',
  system: {
    id: 'shadowrun5',
    name: 'Shadowrun 5',
    groups: Object.fromEntries(['Атрибуты', 'Особые', 'Пределы', 'Навыки', 'Пулы', 'Защита', 'Состояние', 'Инициатива', 'Атака', 'Состояния', 'Правила комнаты', 'Листы', 'Снаряжение'].map(name => [name, {}])),
    fields: fields(),
    constants: constants(),
    tables: tables(),
    roll_edits: {},
    initiative: { die: { constant: 'init_die' }, bonus: { expr: '@initiative' }, tags: ['инициатива'] },
    effects: effects(),
    records: records(),
    grants: ['knock_out', 'bleed_out', 'come_to'],
    mannequins: [mannequin('манекен-а', 'Манекен А'), mannequin('манекен-б', 'Манекен Б')],
  },
  compendium: compendium(),
  sheets: sheets(),
};

const out = fileURLToPath(new URL('../shadowrun.world.json', import.meta.url));
writeFileSync(out, `${JSON.stringify(world, null, 2)}\n`);
console.log(`Shadowrun: полей ${world.system.fields.length}, эффектов ${Object.keys(world.system.effects).length}, записей ${world.compendium.records.length}, листов ${world.sheets.length}`);
