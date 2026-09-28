import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ATTRIBUTES = [
  ['body', 'Тело'], ['agility', 'Ловкость'], ['reaction', 'Реакция'], ['strength', 'Сила'],
  ['willpower', 'Сила воли'], ['logic', 'Логика'], ['intuition', 'Интуиция'], ['charisma', 'Харизма'],
];

const SKILLS = [
  ['Бой', [
    ['archery', 'Стрельба из лука', 'agility', true], ['automatics', 'Автоматическое оружие', 'agility', true],
    ['blades', 'Клинки', 'agility', true], ['clubs', 'Дубинки', 'agility', true],
    ['exotic_melee', 'Экзотическое оружие ближнего боя', 'agility', false], ['exotic_ranged', 'Экзотическое стрелковое оружие', 'agility', false],
    ['heavy_weapons', 'Тяжёлое оружие', 'agility', true], ['longarms', 'Длинноствольное оружие', 'agility', true],
    ['pistols', 'Пистолеты', 'agility', true], ['throwing', 'Метательное оружие', 'agility', true],
    ['unarmed', 'Рукопашный бой', 'agility', true],
  ]],
  ['Тело', [
    ['disguise', 'Маскировка', 'intuition', true], ['diving', 'Ныряние', 'body', true], ['escape_artist', 'Выпутывание', 'agility', true],
    ['free_fall', 'Свободное падение', 'body', true], ['gymnastics', 'Гимнастика', 'agility', true], ['palming', 'Ловкость рук', 'agility', false],
    ['perception', 'Восприятие', 'intuition', true], ['running', 'Бег', 'strength', true], ['sneaking', 'Скрытность', 'agility', true],
    ['survival', 'Выживание', 'willpower', true], ['swimming', 'Плавание', 'strength', true], ['tracking', 'Выслеживание', 'intuition', true],
  ]],
  ['Общение', [
    ['con', 'Обман', 'charisma', true], ['etiquette', 'Этикет', 'charisma', true], ['impersonation', 'Перевоплощение', 'charisma', true],
    ['instruction', 'Обучение', 'charisma', true], ['intimidation', 'Запугивание', 'charisma', true], ['leadership', 'Лидерство', 'charisma', true],
    ['negotiation', 'Переговоры', 'charisma', true], ['performance', 'Выступление', 'charisma', true],
  ]],
  ['Техника', [
    ['aeronautics_mechanic', 'Механика: авиация', 'logic', false], ['automotive_mechanic', 'Механика: автомобили', 'logic', false],
    ['industrial_mechanic', 'Механика: промышленная', 'logic', false], ['nautical_mechanic', 'Механика: суда', 'logic', false],
    ['animal_handling', 'Обращение с животными', 'charisma', true], ['armorer', 'Оружейное дело', 'logic', true], ['artisan', 'Ремесло', 'intuition', false],
    ['biotechnology', 'Биотехнологии', 'logic', false], ['cybertechnology', 'Кибертехнологии', 'logic', false], ['first_aid', 'Первая помощь', 'logic', true],
    ['medicine', 'Медицина', 'logic', false], ['chemistry', 'Химия', 'logic', false], ['computer', 'Компьютер', 'logic', true],
    ['hardware', 'Железо', 'logic', false], ['software', 'Программы', 'logic', false], ['cybercombat', 'Кибербой', 'logic', true],
    ['electronic_warfare', 'Радиоэлектронная борьба', 'logic', false], ['hacking', 'Хакинг', 'logic', true], ['demolitions', 'Взрывное дело', 'logic', true],
    ['forgery', 'Подделка', 'logic', true], ['locksmith', 'Взлом замков', 'agility', false], ['navigation', 'Навигация', 'intuition', true],
  ]],
  ['Транспорт', [
    ['gunnery', 'Бортовое оружие', 'agility', true], ['pilot_aerospace', 'Пилотирование: аэрокосмос', 'reaction', false],
    ['pilot_aircraft', 'Пилотирование: воздух', 'reaction', false], ['pilot_ground', 'Пилотирование: наземный', 'reaction', true],
    ['pilot_walker', 'Пилотирование: шагоходы', 'reaction', false], ['pilot_watercraft', 'Пилотирование: вода', 'reaction', true],
  ]],
  ['Магия', [
    ['spellcasting', 'Колдовство', 'magic', false], ['counterspelling', 'Контрзаклинания', 'magic', false],
    ['ritual_spellcasting', 'Ритуалы', 'magic', false], ['summoning', 'Призыв', 'magic', false], ['banishing', 'Изгнание', 'magic', false],
    ['binding', 'Связывание', 'magic', false], ['alchemy', 'Алхимия', 'magic', false], ['assensing', 'Ясновидение', 'intuition', false],
    ['astral_combat', 'Астральный бой', 'willpower', false], ['arcana', 'Арканы', 'logic', false],
  ]],
];

const METATYPES = [
  ['человек', 'Human', '1–6 всё; Грань 2–7', 0, 0, ''],
  ['эльф', 'Elf', 'Ловкость 2–7, Харизма 3–8', 0, 0, 'Зрение при слабом свете'],
  ['дворф', 'Dwarf', 'Тело 3–8, Реакция 1–5, Сила 3–8, Сила воли 2–7', 0, 0, 'Термографическое зрение; +2 кости против патогенов и токсинов'],
  ['орк', 'Ork', 'Тело 4–9, Сила 3–8, Харизма 1–5, Логика 1–5', 0, 0, 'Зрение при слабом свете'],
  ['тролль', 'Troll', 'Тело 5–10, Ловкость 1–5, Сила 5–10, Харизма 1–4, Интуиция 1–5, Логика 1–5', 1, 1, 'Термографическое зрение; досягаемость +1; кожная броня +1'],
];

const POOL_DIE = { constant: 'pool' };

const stored = (tag, label, group, def, extra = {}) => {
  const { control, ...bounds } = extra;
  return { tag, label, group, value: { kind: 'stored', type: 'number', default: def, ...bounds }, ...(control ? { control } : {}) };
};
const formula = (tag, label, group, expr, roll) => ({ tag, label, group, ...(roll ? { roll } : {}), value: { kind: 'formula', expr } });
const pool = label => ({ label, die: POOL_DIE, pool: true, tags: ['проверка'] });
const ofMeta = column => `(@metatype != "" ? таблица("metatypes", @metatype, "${column}") : 0)`;

function fields() {
  const out = [];
  out.push({ tag: 'metatype', label: 'Метатип', group: 'Личное дело', value: { kind: 'stored', type: 'choice', from: 'metatypes', default: 'человек' } });
  for (const [tag, label] of ATTRIBUTES) out.push(stored(tag, label, 'Атрибуты', 3, { min: 1, max: 10 }));
  out.push(stored('edge', 'Грань', 'Особые', 2, { min: 1, max: 7 }));
  out.push(stored('edge_left', 'Грань: осталось', 'Особые', 2, { min: 0, control: 'pips' }));
  out.push(stored('essence', 'Сущность', 'Особые', 6, { min: 0, max: 6 }));
  out.push(stored('magic', 'Магия', 'Особые', 0, { min: 0, max: 6 }));

  out.push(formula('physical_limit', 'Физический предел', 'Пределы', 'ceil((@strength * 2 + @body + @reaction) / 3)'));
  out.push(formula('mental_limit', 'Ментальный предел', 'Пределы', 'ceil((@logic * 2 + @intuition + @willpower) / 3)'));
  out.push(formula('social_limit', 'Социальный предел', 'Пределы', 'ceil((@charisma * 2 + @willpower + round(@essence)) / 3)'));

  for (const [group, skills] of SKILLS) {
    for (const [tag, label] of skills) out.push(stored(tag, label, `Навыки: ${group.toLowerCase()}`, 0, { min: 0, max: 13 }));
  }
  for (const [group, skills] of SKILLS) {
    for (const [tag, label, attribute, fallback] of skills) {
      const untrained = fallback ? `@${attribute} - 1` : '0';
      out.push(formula(`${tag}_pool`, `${label}: пул`, `Пулы: ${group.toLowerCase()}`,
        `max(0, (@${tag} > 0 ? @${tag} + @${attribute} : ${untrained}) + @wound_mod)`,
        pool(`Проверка: ${label}`)));
    }
  }
  out.push(formula('composure', 'Самообладание', 'Пулы: атрибуты', 'max(0, @charisma + @willpower + @wound_mod)', pool('Самообладание')));
  out.push(formula('judge_intentions', 'Чтение намерений', 'Пулы: атрибуты', 'max(0, @charisma + @intuition + @wound_mod)', pool('Чтение намерений')));
  out.push(formula('memory', 'Память', 'Пулы: атрибуты', 'max(0, @logic + @willpower + @wound_mod)', pool('Память')));
  out.push(formula('lift_carry', 'Поднять и нести', 'Пулы: атрибуты', 'max(0, @body + @strength + @wound_mod)', pool('Поднять и нести')));

  out.push(stored('armor_worn', 'Броня: надетое', 'Защита', 0, { min: 0 }));
  out.push(stored('armor_extra', 'Броня: аксессуары (+)', 'Защита', 0, { min: 0 }));
  out.push(formula('armor', 'Броня', 'Защита', `@armor_worn + min(@armor_extra, @strength) + ${ofMeta('dermal')}`));
  out.push(formula('defense_pool', 'Защита: пул', 'Защита', 'max(0, @reaction + @intuition + @wound_mod)', pool('Защита')));
  out.push(formula('soak_pool', 'Сопротивление урону: пул', 'Защита', '@body + @armor'));
  out.push(formula('reach', 'Досягаемость (природная)', 'Защита', ofMeta('reach')));

  out.push(formula('physical_max', 'Физический трек: клеток', 'Состояние', '8 + ceil(@body / 2)'));
  out.push(stored('physical', 'Физический урон', 'Состояние', 0, { min: 0 }));
  out.push(formula('stun_max', 'Оглушающий трек: клеток', 'Состояние', '8 + ceil(@willpower / 2)'));
  out.push(stored('stun', 'Оглушающий урон', 'Состояние', 0, { min: 0 }));
  out.push(formula('stun_overflow', 'Перелив оглушающего в физический', 'Состояние', 'floor(max(0, @stun - @stun_max) / 2)'));
  out.push(formula('physical_total', 'Физический урон с переливом', 'Состояние', '@physical + @stun_overflow'));
  out.push(formula('wound_mod', 'Штраф за раны', 'Состояние',
    '0 - floor(min(@physical_total, @physical_max) / 3) - floor(min(@stun, @stun_max) / 3)'));
  out.push(formula('knocked_out', 'Оглушающий трек полон', 'Состояние', '@stun >= @stun_max'));
  out.push(formula('bleeding_out', 'Физический трек полон', 'Состояние', '@physical_total >= @physical_max'));
  out.push(formula('is_dead', 'Перелив сверх Тела', 'Состояние', '@physical_total > @physical_max + @body'));
  out.push(formula('conscious', 'В сознании', 'Состояние', 'все(@stun < @stun_max, @physical_total < @physical_max)'));

  out.push(formula('initiative', 'Инициатива', 'Инициатива', '@reaction + @intuition + @wound_mod'));
  return out;
}

const skillWord = label => label.toLowerCase();

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
  metatypes: {
    label: 'Метатипы', key: 'word',
    columns: [
      { key: 'en', label: 'В книге', kind: 'text' }, { key: 'ranges', label: 'Атрибуты (мин.–макс.)', kind: 'text' },
      { key: 'dermal', label: 'Кожная броня', kind: 'number' }, { key: 'reach', label: 'Досягаемость', kind: 'number' },
      { key: 'traits', label: 'Расовые черты', kind: 'text' },
    ],
    rows: METATYPES.map(([value, en, ranges, dermal, reach, traits]) => ({ value, cells: { en, ranges, dermal, reach, traits } })),
  },
  damage_kinds: {
    label: 'Вид урона', key: 'word',
    columns: [{ key: 'physical', label: 'Физический', kind: 'number' }],
    rows: [{ value: 'физический', cells: { physical: 1 } }, { value: 'оглушающий', cells: { physical: 0 } }],
  },
  weapon_skills: {
    label: 'Навык оружия', key: 'word',
    columns: [{ key: 'pool', label: 'Пул', kind: 'expr' }],
    rows: SKILLS[0][1].map(([tag, label]) => ({ value: skillWord(label), cells: { pool: `@${tag}_pool` } })),
  },
});

const constants = () => ({
  pool: { label: 'пул к6', kind: 'die', dice: [{ count: 1, sides: 6 }], read: { kind: 'count', atLeast: 5 } },
  init_die: { label: 'к6 инициативы', kind: 'die', dice: [{ count: 1, sides: 6 }] },
});

const rollEdits = () => ({
  second_chance: { label: 'Второй шанс: перебросить всё без успеха', ops: [{ op: 'reroll', n: 4 }] },
});

const add = (tag, expr, when) => ({ type: 'apply', target: { tag }, direction: 'add', value: { expr }, targetModifiers: false, ...(when ? { when: { expr: when } } : {}) });
const hang = id => ({ type: 'status', mode: 'apply', effect: { const: id } });
const drop = id => ({ type: 'status', mode: 'remove', effect: { const: id } });

const PUSHED = 'или(@push, 0) >= 1';
const HITS = `(${PUSHED} ? @атака.natural : min(@атака.natural, @accuracy))`;
const NET = `${HITS} - @атака.versusNatural`;
const MODIFIED_DV = `@dv + ${NET}`;
const TAKEN = `max(0, ${MODIFIED_DV} - @сопротивление.natural)`;
const STAYS_PHYSICAL = `все(@physical_hit >= 1, ${MODIFIED_DV} >= @получатель.armor + @ap)`;

function effects() {
  const attack = (label, description) => ({
    label, group: 'Атака', activation: 'manual', description,
    params: [
      { key: 'attack_pool', label: 'Пул атаки', kind: 'number' },
      { key: 'accuracy', label: 'Точность (предел)', kind: 'number' },
      { key: 'dv', label: 'Урон оружия', kind: 'number' },
      { key: 'ap', label: 'Пробитие брони', kind: 'number' },
      { key: 'physical_hit', label: 'Урон физический (1) или оглушающий (0)', kind: 'number' },
      { key: 'push', label: 'Выжать предел за Грань: 1 — да', kind: 'number', optional: true, ask: { by: 'actor', min: 0, max: 1 } },
    ],
    self: [
      { type: 'compare', value: { expr: '@edge_left' }, versus: { expr: '1' }, breakIf: 'less', note: 'Грани не осталось', when: { expr: PUSHED } },
      add('edge_left', '-1', PUSHED),
    ],
    steps: [
      {
        id: 'атака', type: 'threshold',
        roll: { die: POOL_DIE, count: { expr: `@attack_pool + (${PUSHED} ? @отправитель.edge : 0)` }, tags: ['атака'] },
        versus: { roll: { die: POOL_DIE, count: { expr: '@получатель.defense_pool' }, tags: ['защита'] } }, successWhen: 'over', continueOn: 'always',
      },
      { type: 'compare', value: { expr: NET }, versus: { expr: '1' }, breakIf: 'less', note: 'промах: успехов атаки с учётом точности не больше, чем у защиты (ничья — касание без урона)' },
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
  const state = (label, description) => ({ label, group: 'Состояния', activation: 'passive', duration: { kind: 'permanent' }, description, modifiers: [] });
  const note = (label, description, when) => ({
    label, group: 'Правила комнаты', activation: 'passive', duration: { kind: 'permanent' }, params: [], description,
    on: [{ on: 'ranged_attack', role: 'sender', if: { expr: when }, steps: [] }, { on: 'melee_attack', role: 'sender', if: { expr: when }, steps: [] }],
  });

  return {
    ranged_attack: attack('Выстрел',
      'Ловкость + навык оружия против Реакции + Интуиции цели. Успехов засчитывается не больше точности оружия (Грань снимает предел и добавляет кости). Чистые успехи прибавляются к урону; ничья — касание без урона. Цель сопротивляется «Тело + Броня с пробитием»; урон меньше брони становится оглушающим.'),
    melee_attack: attack('Удар',
      'Ловкость + навык ближнего боя против Реакции + Интуиции цели. Урон оружия от Силы. Досягаемость в образце не учитывается. Дальше — как у выстрела.'),
    second_chance: {
      label: 'Грань: второй шанс', group: 'Грань', activation: 'passive', duration: { kind: 'permanent' },
      description: 'Увидел свой бросок — за очко Грани перебрасываешь все кости без успеха. Сбой не отменяет.',
      params: [],
      on: [{
        on: '*', role: 'sender', phase: 'before', ask: true, claims: ['second_chance'],
        self: [
          { type: 'compare', value: { expr: '@edge_left' }, versus: { expr: '1' }, breakIf: 'less', note: 'Грани не осталось' },
          add('edge_left', '-1'),
        ],
        steps: [],
      }],
    },
    glitch: note('Сбой', 'Больше половины костей атаки легли единицами — сбой: ведущий добавляет осложнение.',
      'все(@атака.atMin * 2 > @атака.rolled, @атака.natural >= 1)'),
    critical_glitch: note('Критический сбой', 'Сбой без единого успеха — критический сбой: беда.',
      'все(@атака.atMin * 2 > @атака.rolled, @атака.natural == 0)'),
    unconscious: state('Без сознания', 'Оглушающий трек полон: персонаж без сознания.'),
    bleeding: state('При смерти', 'Физический трек полон: без сознания; каждые (Тело) минут без помощи — ещё клетка урона.'),
    dead: state('Мёртв', 'Физический урон перелился сверх трека больше, чем на Тело.'),
    knock_out: onField('Потеря сознания', 'Оглушающий трек заполнился — «Без сознания».', 'knocked_out', [hang('unconscious')]),
    bleed_out: onField('Тяжёлое ранение', 'Физический трек заполнился — «При смерти».', 'bleeding_out', [hang('bleeding')]),
    die: onField('Смерть', 'Перелив физического урона больше Тела — «Мёртв».', 'is_dead', [drop('bleeding'), hang('dead')]),
    come_to: onField('Приходит в себя', 'Оба трека снова не полны — состояния сняты.', 'conscious', [drop('unconscious'), drop('bleeding')]),
    rest_edge: {
      label: 'Восстановить Грань', group: 'Грань', activation: 'manual',
      description: 'После 8 часов сна — очко Грани обратно, не больше рейтинга.',
      steps: [add('edge_left', '@edge_left < @edge ? 1 : 0')],
    },
  };
}

const records = () => ({
  runner: { kind: 'sheet', label: 'Раннер', icon: '🕶', group: 'Листы', hint: 'Лист игрока: все блоки.' },
  opponent: {
    kind: 'sheet', label: 'Противник', icon: '👤', group: 'Листы', hint: 'Лист противника: атрибуты, навыки боя, защита, состояние.',
    blocks: ['Атрибуты', 'Навыки: бой', 'Пулы: бой', 'Защита', 'Состояние', 'Инициатива', 'Пределы'],
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
    kind: 'item', label: 'Оружие ближнего боя', icon: '🗡', group: 'Снаряжение', hint: 'Урон — Сила плюс прибавка, если оружие бьёт силой.',
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
    kind: 'item', label: 'Броня', icon: '🧥', group: 'Снаряжение', hint: 'Из надетого работает самое сильное; аксессуары с «+» прибавляются, но не больше Силы.',
    props: [{ key: 'rating', label: 'Броня', kind: 'number' }, { key: 'accessory', label: 'Аксессуар «+» (1 — да)', kind: 'number' }],
  },
  edge_action: {
    kind: 'action', label: 'Грань', icon: '✦', group: 'Приёмы', hint: 'Траты и восстановление Грани.', props: [], bindings: [],
  },
});

const P = 'физический';
const S = 'оглушающий';
const gun = (id, label, category, accuracy, dv, ap, skill, extra, kind = P) => ({
  id, rk: 'firearm', label,
  description: `${category}. Точность ${accuracy}, урон ${dv}${kind === P ? 'P' : 'S'}, пробитие ${ap || '—'}. ${extra}`.trim(),
  props: { accuracy, dv, ap, damage_kind: kind, skill },
});
const blade = (id, label, accuracy, bonus, ap, extra, { kind = P, skill = 'клинки', strength = 1 } = {}) => ({
  id, rk: 'melee', label,
  description: `Точность ${accuracy}, урон ${strength ? `(Сила${bonus ? ` + ${bonus}` : ''})` : bonus}${kind === P ? 'P' : 'S'}, пробитие ${ap || '—'}. ${extra ?? ''}`.trim(),
  props: { accuracy, strength_based: strength, dv_bonus: bonus, ap, damage_kind: kind, skill },
});
const armor = (id, label, rating, extra = '', accessory = false) => ({
  id, rk: 'armor', label, description: `Броня ${accessory ? '+' : ''}${rating}. ${extra}`.trim(), props: { rating, accessory: accessory ? 1 : 0 },
  modifiers: [accessory
    ? { kind: 'value', target: 'armor_extra', op: 'add', value: rating, stacking: 'sum', condition: null }
    : { kind: 'value', target: 'armor_worn', op: 'add', value: rating, stacking: 'max', condition: null }],
});
const action = (id, label, effect) => ({ id, rk: 'edge_action', label, bindings: [{ label, effect, args: {} }] });

const compendium = () => ({
  records: [
    gun('ares_light_fire_70', 'Ares Light Fire 70', 'Лёгкий пистолет', 7, 6, 0, 'пистолеты', 'SA, 16(c).'),
    gun('colt_america_l36', 'Colt America L36', 'Лёгкий пистолет', 7, 7, 0, 'пистолеты', 'SA, 11(c).'),
    gun('fichetti_security_600', 'Fichetti Security 600', 'Лёгкий пистолет', 6, 7, 0, 'пистолеты', 'SA, 30(c), складной приклад, ЛЦУ.'),
    gun('ares_predator_v', 'Ares Predator V', 'Тяжёлый пистолет', 5, 8, -1, 'пистолеты', 'SA, 15(c), смартган.'),
    gun('browning_ultra_power', 'Browning Ultra-Power', 'Тяжёлый пистолет', 5, 8, -1, 'пистолеты', 'SA, 10(c), ЛЦУ.'),
    gun('remington_roomsweeper', 'Remington Roomsweeper', 'Тяжёлый пистолет', 4, 7, -1, 'пистолеты', 'SA, 8(m).'),
    gun('ruger_super_warhawk', 'Ruger Super Warhawk', 'Тяжёлый пистолет', 5, 9, -2, 'пистолеты', 'SS, 6(cy).'),
    gun('ceska_black_scorpion', 'Ceska Black Scorpion', 'Пистолет-пулемёт', 5, 6, 0, 'автоматическое оружие', 'SA/BF, 35(c).'),
    gun('steyr_tmp', 'Steyr TMP', 'Пистолет-пулемёт', 4, 7, 0, 'автоматическое оружие', 'SA/BF/FA, 30(c).'),
    gun('hk_227', 'HK-227', 'Пистолет-пулемёт', 5, 7, 0, 'автоматическое оружие', 'SA/BF/FA, 28(c), смартган, глушитель.'),
    gun('ingram_smartgun_x', 'Ingram Smartgun X', 'Пистолет-пулемёт', 4, 8, 0, 'автоматическое оружие', 'BF/FA, 32(c), смартган, газоотвод 2.'),
    gun('ak_97', 'AK-97', 'Штурмовая винтовка', 5, 10, -2, 'автоматическое оружие', 'SA/BF/FA, 38(c).'),
    gun('ares_alpha', 'Ares Alpha', 'Штурмовая винтовка', 5, 11, -2, 'автоматическое оружие', 'SA/BF/FA, отдача 2, 42(c), смартган.'),
    gun('fn_har', 'FN HAR', 'Штурмовая винтовка', 5, 10, -2, 'автоматическое оружие', 'SA/BF/FA, 35(c), ЛЦУ, газоотвод 2.'),
    gun('defiance_t250', 'Defiance T-250', 'Дробовик', 4, 10, -1, 'длинноствольное оружие', 'SS/SA, 5(m).'),
    gun('enfield_as7', 'Enfield AS-7', 'Дробовик', 4, 13, -1, 'длинноствольное оружие', 'SA/BF, 10(c), ЛЦУ.'),
    gun('ares_desert_strike', 'Ares Desert Strike', 'Снайперская винтовка', 7, 13, -4, 'длинноствольное оружие', 'SA, 14(c).'),
    gun('remington_950', 'Remington 950', 'Снайперская винтовка', 7, 12, -4, 'длинноствольное оружие', 'SS, 5(m).'),
    gun('ruger_101', 'Ruger 101', 'Снайперская винтовка', 6, 11, -3, 'длинноствольное оружие', 'SA, 8(m).'),
    gun('yamaha_pulsar', 'Yamaha Pulsar', 'Тазер', 5, 7, -5, 'пистолеты', 'SA, 4(m), электрический.', S),
    gun('defiance_ex_shocker', 'Defiance EX Shocker', 'Тазер', 4, 9, -5, 'пистолеты', 'SS, 4(m), электрический.', S),
    blade('katana', 'Катана', 7, 3, -3, 'Досягаемость 1.'),
    blade('sword', 'Меч', 6, 3, -2, 'Досягаемость 1.'),
    blade('combat_axe', 'Боевой топор', 4, 5, -4, 'Досягаемость 2.'),
    blade('combat_knife', 'Боевой нож', 6, 2, -3),
    blade('knife', 'Нож', 5, 1, -1),
    blade('survival_knife', 'Нож выживания', 5, 2, -1),
    blade('club', 'Дубинка', 4, 3, 0, 'Досягаемость 1. Вид урона по данным Chummer — физический; сверьте с книгой.', { skill: 'дубинки' }),
    blade('staff', 'Посох', 6, 3, 0, 'Досягаемость 2.', { skill: 'дубинки' }),
    blade('telescoping_staff', 'Телескопический посох', 4, 2, 0, 'Досягаемость 2.', { skill: 'дубинки' }),
    blade('stun_baton', 'Шоковая дубинка', 4, 9, -5, 'Досягаемость 1, электрическая, урон не от Силы.', { kind: S, skill: 'дубинки', strength: 0 }),
    blade('fists', 'Безоружная атака', 5, 0, 0, 'Урон (Сила)S; точность по книге — физический предел, здесь вписана числом.', { kind: S, skill: 'рукопашный бой' }),
    blade('shock_gloves', 'Шоковые перчатки', 5, 8, -5, 'Электрические; точность по книге — физический предел.', { kind: S, skill: 'рукопашный бой', strength: 0 }),
    armor('clothing', 'Одежда', 0),
    armor('armor_clothing', 'Бронированная одежда', 6),
    armor('actioneer', 'Деловой костюм Actioneer', 8),
    armor('armor_vest', 'Бронежилет', 9),
    armor('lined_coat', 'Бронированный плащ', 9),
    armor('urban_explorer', 'Комбинезон Urban Explorer', 9),
    armor('chameleon_suit', 'Костюм-хамелеон', 9),
    armor('armor_jacket', 'Бронекуртка', 12),
    armor('full_body_armor', 'Полный бронекостюм', 15),
    armor('helmet', 'Шлем', 2, '', true),
    armor('ballistic_shield', 'Баллистический щит', 6, '', true),
    action('edge_rest', 'Восстановить Грань', 'rest_edge'),
  ],
});

const sheet = (id, name, of, values, has) => ({ id, systemId: 'shadowrun5', of, name, values, has: has.map(o => ({ of: o })), effects: [] });

const sheets = () => [
  sheet('razor', 'Бритва', 'runner', {
    metatype: 'орк', body: 5, agility: 6, reaction: 5, strength: 4, willpower: 3, logic: 2, intuition: 4, charisma: 2,
    edge: 3, edge_left: 3, essence: 2.5, pistols: 6, blades: 5, unarmed: 3, perception: 3, sneaking: 3, gymnastics: 2,
  }, ['ares_predator_v', 'katana', 'armor_jacket', 'edge_rest']),
  sheet('silk', 'Шёлк', 'runner', {
    metatype: 'эльф', body: 3, agility: 3, reaction: 3, strength: 2, willpower: 4, logic: 3, intuition: 4, charisma: 6,
    edge: 4, edge_left: 4, con: 6, etiquette: 5, negotiation: 5, pistols: 3, perception: 4,
  }, ['colt_america_l36', 'lined_coat', 'edge_rest']),
  sheet('hammer', 'Молот', 'runner', {
    metatype: 'тролль', body: 9, agility: 4, reaction: 4, strength: 8, willpower: 4, logic: 2, intuition: 3, charisma: 2,
    edge: 2, edge_left: 2, clubs: 5, unarmed: 5, automatics: 3, intimidation: 4,
  }, ['staff', 'ak_97', 'armor_vest', 'helmet', 'edge_rest']),
  sheet('ganger', 'Бандит (пример)', 'opponent', {
    body: 4, agility: 4, reaction: 3, strength: 4, willpower: 3, logic: 2, intuition: 3, charisma: 2,
    pistols: 3, blades: 3, unarmed: 3,
  }, ['colt_america_l36', 'combat_knife', 'armor_vest']),
  sheet('guard', 'Охранник корпорации (пример)', 'opponent', {
    body: 4, agility: 4, reaction: 4, strength: 3, willpower: 3, logic: 3, intuition: 4, charisma: 3,
    automatics: 4, unarmed: 3, perception: 3,
  }, ['ak_97', 'stun_baton', 'armor_jacket']),
];

const mannequin = (id, name) => ({ id, systemId: 'shadowrun5', name, values: { body: 4, agility: 4, reaction: 4, strength: 4, willpower: 4, logic: 4, intuition: 4, charisma: 4, pistols: 4 }, has: [], effects: [] });

const skillGroups = SKILLS.flatMap(([group]) => [[`Навыки: ${group.toLowerCase()}`, { parent: 'Навыки' }], [`Пулы: ${group.toLowerCase()}`, { parent: 'Пулы' }]]);

const world = {
  title: 'Shadowrun 5',
  system: {
    id: 'shadowrun5',
    name: 'Shadowrun 5',
    groups: {
      ...Object.fromEntries(['Личное дело', 'Атрибуты', 'Особые', 'Пределы', 'Навыки', 'Пулы', 'Защита', 'Состояние', 'Инициатива',
        'Атака', 'Грань', 'Состояния', 'Правила комнаты', 'Листы', 'Снаряжение', 'Приёмы'].map(name => [name, {}])),
      ...Object.fromEntries(skillGroups),
      'Пулы: атрибуты': { parent: 'Пулы' },
    },
    fields: fields(),
    constants: constants(),
    tables: tables(),
    roll_edits: rollEdits(),
    initiative: { die: { constant: 'init_die' }, bonus: { expr: '@initiative' }, tags: ['инициатива'] },
    effects: effects(),
    records: records(),
    grants: ['knock_out', 'bleed_out', 'die', 'come_to', 'second_chance', 'glitch', 'critical_glitch'],
    mannequins: [mannequin('манекен-а', 'Манекен А'), mannequin('манекен-б', 'Манекен Б')],
  },
  compendium: compendium(),
  sheets: sheets(),
};

const out = fileURLToPath(new URL('../shadowrun.world.json', import.meta.url));
writeFileSync(out, `${JSON.stringify(world, null, 2)}\n`);
console.log(`Shadowrun: полей ${world.system.fields.length}, эффектов ${Object.keys(world.system.effects).length}, записей ${world.compendium.records.length}, листов ${world.sheets.length}`);
