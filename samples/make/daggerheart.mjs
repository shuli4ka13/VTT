import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const TRAITS = [
  ['agility', 'Проворство'], ['strength', 'Сила'], ['finesse', 'Искусность'],
  ['instinct', 'Чутьё'], ['presence', 'Присутствие'], ['knowledge', 'Знание'],
];

const DUALITY = { constant: 'duality' };

const stored = (tag, label, group, def, extra = {}) => {
  const { control, desk, roll, ...bounds } = extra;
  return {
    tag, label, group, ...(roll ? { roll } : {}), ...(desk ? { desk } : {}),
    value: { kind: 'stored', type: 'number', default: def, ...bounds }, ...(control ? { control } : {}),
  };
};
const formula = (tag, label, group, expr) => ({ tag, label, group, value: { kind: 'formula', expr } });

function fields() {
  const out = [];
  for (const [tag, label] of TRAITS) {
    out.push(stored(tag, label, 'Черты', 0, { min: -3, max: 6, roll: { label: `Бросок: ${label}`, die: DUALITY, tags: ['действие', label.toLowerCase()] } }));
  }
  out.push(stored('level', 'Уровень', 'Прогрессия', 1, { min: 1, max: 10 }));
  out.push(formula('tier', 'Ступень', 'Прогрессия', '@level >= 8 ? 4 : (@level >= 5 ? 3 : (@level >= 2 ? 2 : 1))'));
  out.push(stored('proficiency', 'Мастерство', 'Прогрессия', 1, { min: 1, max: 6 }));

  out.push(stored('evasion', 'Уклонение', 'Защита', 10, { min: 0 }));
  out.push(stored('armor_score', 'Броня', 'Защита', 0, { min: 0 }));
  out.push(stored('armor_marked', 'Бронеслоты отмечены', 'Защита', 0, { min: 0, control: 'pips' }));
  out.push(stored('major_base', 'Порог серьёзного урона: основа', 'Защита', 0, { min: 0 }));
  out.push(stored('severe_base', 'Порог тяжёлого урона: основа', 'Защита', 0, { min: 0 }));
  out.push(formula('major', 'Порог серьёзного урона', 'Защита', '@major_base + @level'));
  out.push(formula('severe', 'Порог тяжёлого урона', 'Защита', '@severe_base + @level'));

  out.push(stored('hp_max', 'Хиты: клеток', 'Здоровье', 6, { min: 1 }));
  out.push(stored('hp', 'Хиты отмечены', 'Здоровье', 0, { min: 0, control: 'pips' }));
  out.push(stored('stress_max', 'Стресс: клеток', 'Здоровье', 6, { min: 1 }));
  out.push(stored('stress', 'Стресс отмечен', 'Здоровье', 0, { min: 0, control: 'pips' }));
  out.push(formula('down', 'Последний хит отмечен', 'Здоровье', '@hp >= @hp_max'));

  out.push(stored('hope', 'Надежда', 'Надежда', 2, { min: 0, max: 6, control: 'pips' }));

  out.push(stored('difficulty', 'Сложность', 'Противник', 12, { min: 1 }));
  out.push(stored('attack_mod', 'Модификатор атаки', 'Противник', 0));

  out.push(stored('fear', 'Страх ведущего', 'Стол', 0, { min: 0, max: 12, desk: true }));
  return out;
}

const tables = () => ({
  rolls: {
    label: 'Броски', key: 'word',
    columns: [{ key: 'успех', label: 'Успех', kind: 'text' }, { key: 'провал', label: 'Провал', kind: 'text' }],
    rows: [
      { value: 'действие', cells: { успех: 'успех', провал: 'неудача' } },
      { value: 'атака', cells: { успех: 'попадание', провал: 'промах' } },
    ],
  },
  traits: {
    label: 'Черты', key: 'word',
    columns: [{ key: 'value', label: 'Значение', kind: 'expr' }],
    rows: TRAITS.map(([tag, label]) => ({ value: label.toLowerCase(), cells: { value: `@${tag}` } })),
  },
});

const constants = () => ({
  duality: {
    label: 'Кости двойственности', kind: 'die',
    dice: [{ count: 1, sides: 12, name: 'надежда' }, { count: 1, sides: 12, name: 'страх' }],
  },
  adversary_die: { label: 'к20 противника', kind: 'die', dice: [{ count: 1, sides: 20 }] },
});

const rollEdits = () => ({
  advantage: { label: 'Преимущество: +1к6', ops: [{ op: 'bonusDie', sides: 6 }], canceledBy: 'disadvantage' },
  disadvantage: { label: 'Помеха: −1к6', ops: [{ op: 'bonusDie', sides: 6, minus: true }], canceledBy: 'advantage' },
});

const change = (tag, direction, expr, when) => ({
  type: 'apply', target: { tag }, direction, value: { expr }, targetModifiers: false, ...(when ? { when: { expr: when } } : {}),
});

const HOPE = '@бросок.parts.надежда > @бросок.parts.страх';
const FEAR = '@бросок.parts.страх > @бросок.parts.надежда';
const CRIT = '@бросок.parts.надежда == @бросок.parts.страх';
const HIT = `любое(@бросок.success, ${CRIT})`;

const MARKS = '@event.amount >= @severe ? 3 : (@event.amount >= @major ? 2 : (@event.amount >= 1 ? 1 : 0))';
const ARMOR_TAKES = `все(@armor_marked < @armor_score, (${MARKS}) >= 1)`;

function effects() {
  return {
    action_roll: {
      label: 'Бросок действия', group: 'Действия', activation: 'manual',
      description: 'Кости двойственности + черта против сложности, которую называет ведущий. Крит — одинаковые значения на костях: успех при любом итоге.',
      params: [
        { key: 'trait', label: 'Черта', kind: 'choice', from: 'traits', ask: { by: 'actor' } },
        { key: 'сложность', label: 'Сложность', kind: 'number', ask: { by: 'gm', min: 1, max: 30 } },
      ],
      steps: [{
        id: 'бросок', type: 'threshold',
        roll: { die: DUALITY, bonus: { expr: 'таблица("traits", @trait, "value")' }, tags: ['действие', { param: 'trait' }] },
        versus: { expr: '@сложность' }, continueOn: 'always',
      }],
    },
    hero_attack: {
      label: 'Атака героя', group: 'Атака', activation: 'manual',
      description: 'Кости двойственности + черта оружия против сложности противника. Попал — кости урона по числу мастерства плюс прибавка оружия; на крите сверху максимум костей урона.',
      params: [
        { key: 'trait', label: 'Черта оружия', kind: 'choice', from: 'traits' },
        { key: 'damage_die', label: 'Кость урона', kind: 'dice' },
        { key: 'die_size', label: 'Граней на кости урона', kind: 'number' },
        { key: 'damage_bonus', label: 'Прибавка к урону', kind: 'number' },
      ],
      steps: [
        {
          id: 'бросок', type: 'threshold',
          roll: { die: DUALITY, bonus: { expr: 'таблица("traits", @trait, "value")' }, tags: ['атака'] },
          versus: { expr: '@получатель.difficulty' }, continueOn: 'always',
        },
        { type: 'compare', value: { expr: `${HIT} ? 1 : 0` }, versus: { expr: '1' }, breakIf: 'less', note: 'промах' },
        {
          id: 'урон', type: 'amount', source: 'item',
          fixed: { expr: `кинуть(@damage_die, @отправитель.proficiency) + @damage_bonus + (${CRIT} ? @отправитель.proficiency * @die_size : 0)` },
        },
        { type: 'emit', event: 'damage', args: { amount: { expr: '@урон' } } },
      ],
    },
    adversary_attack: {
      label: 'Атака противника', group: 'Атака', activation: 'manual',
      description: 'к20 + модификатор атаки против уклонения героя. Попал — урон, вписанный в приём.',
      params: [
        { key: 'damage_dice', label: 'Кость урона', kind: 'dice' },
        { key: 'damage_bonus', label: 'Прибавка к урону', kind: 'number' },
      ],
      steps: [
        {
          id: 'удар', type: 'threshold',
          roll: { die: { constant: 'adversary_die' }, bonus: { expr: '@attack_mod' }, tags: ['атака'] },
          versus: { expr: '@получатель.evasion' },
        },
        { id: 'урон', type: 'amount', source: 'item', fixed: { expr: 'кинуть(@damage_dice) + @damage_bonus' } },
        { type: 'emit', event: 'damage', args: { amount: { expr: '@урон' } } },
      ],
    },
    damage: {
      label: 'Урон', group: 'Вызываемые',
      description: 'Урон сравнивается с порогами: ниже серьёзного — одна клетка хитов, от серьёзного — две, от тяжёлого — три. Если есть свободный бронеслот, он отмечается и снимает одну клетку; по книге это выбор игрока, в образце — всегда.',
      params: [{ key: 'amount', label: 'Сколько урона', kind: 'number', role: 'amount' }],
      steps: [
        change('hp', 'add', `max(0, (${MARKS}) - (${ARMOR_TAKES} ? 1 : 0))`),
        change('armor_marked', 'add', '1', ARMOR_TAKES),
      ],
    },
    duality: {
      label: 'Двойственность', group: 'Правила', activation: 'passive', duration: { kind: 'permanent' },
      description: 'После броска двойственности: больше выпало на Надежде — герой получает Надежду; на Страхе — ведущий получает Страх; одинаково — крит: Надежда и минус один Стресс.',
      on: ['action_roll', 'hero_attack'].flatMap(on => [
        { on, role: 'sender', if: { expr: HOPE }, steps: [change('hope', 'add', '1')] },
        { on, role: 'sender', if: { expr: FEAR }, steps: [change('fear', 'add', '1')] },
        { on, role: 'sender', if: { expr: CRIT }, steps: [change('hope', 'add', '1'), change('stress', 'subtract', '1', '@stress >= 1')] },
      ]),
    },
    death_move: {
      label: 'Смертельный ход', group: 'Состояния', activation: 'passive', duration: { kind: 'permanent' },
      description: 'Отмечен последний хит: игрок выбирает смертельный ход — «Сгореть во славе», «Избежать смерти» или «Рискнуть всем». Решает стол.',
      modifiers: [],
    },
    last_hp: {
      label: 'Последний хит', group: 'Правила', activation: 'passive', duration: { kind: 'permanent' }, params: [],
      description: 'Отмечен последний хит — «Смертельный ход».',
      on: [{ on: 'field:down', steps: [{ type: 'status', mode: 'apply', effect: { const: 'death_move' } }] }],
    },
    long_rest: {
      label: 'Долгий отдых', group: 'Отдых', activation: 'manual',
      description: 'Все хиты, весь Стресс и все бронеслоты свободны. Остальное из списка дел на отдыхе решает стол.',
      steps: [change('hp', 'set', '0'), change('stress', 'set', '0'), change('armor_marked', 'set', '0')],
    },
    tend_wounds: {
      label: 'Перевязать раны', group: 'Отдых', activation: 'manual',
      description: 'Дело короткого отдыха: освободить 1к4 + ступень клеток хитов.',
      steps: [change('hp', 'subtract', 'min(@hp, кинуть("1к4") + @tier)')],
    },
  };
}

const records = () => ({
  hero: { kind: 'sheet', label: 'Герой', icon: '🗡', group: 'Листы', hint: 'Лист игрока.', grants: ['duality', 'last_hp'] },
  adversary: {
    kind: 'sheet', label: 'Противник', icon: '👹', group: 'Листы', hint: 'Сложность, пороги, хиты и Стресс, модификатор атаки.',
    blocks: ['Защита', 'Здоровье', 'Противник'],
  },
  weapon: {
    kind: 'item', label: 'Оружие', icon: '⚔', group: 'Снаряжение', hint: 'Черта, кость урона и прибавка.',
    props: [
      { key: 'trait', label: 'Черта', kind: 'choice', from: 'traits' },
      { key: 'damage_die', label: 'Кость урона', kind: 'dice' },
      { key: 'die_size', label: 'Граней на кости', kind: 'number' },
      { key: 'damage_bonus', label: 'Прибавка к урону', kind: 'number' },
    ],
    bindings: [{
      label: 'Атака', effect: 'hero_attack',
      args: { trait: { prop: 'trait' }, damage_die: { prop: 'damage_die' }, die_size: { prop: 'die_size' }, damage_bonus: { prop: 'damage_bonus' } },
    }],
  },
  armor: {
    kind: 'item', label: 'Доспех', icon: '🛡', group: 'Снаряжение', hint: 'Основа порогов и число бронеслотов.',
    props: [
      { key: 'major', label: 'Основа порога серьёзного', kind: 'number' },
      { key: 'severe', label: 'Основа порога тяжёлого', kind: 'number' },
      { key: 'score', label: 'Броня', kind: 'number' },
    ],
  },
  adversary_move: {
    kind: 'action', label: 'Приём противника', icon: '👹', group: 'Приёмы', hint: 'Урон вписан в приём.',
    props: [{ key: 'damage_dice', label: 'Кость урона', kind: 'dice' }, { key: 'damage_bonus', label: 'Прибавка', kind: 'number' }],
    bindings: [{ label: 'Атака', effect: 'adversary_attack', args: { damage_dice: { prop: 'damage_dice' }, damage_bonus: { prop: 'damage_bonus' } } }],
  },
  action: {
    kind: 'action', label: 'Действие', icon: '🎲', group: 'Приёмы', hint: 'Бросок действия и отдых.',
    props: [],
    bindings: [],
  },
});

const weapon = (id, label, description, trait, sides, bonus) => ({
  id, rk: 'weapon', label, description, props: { trait, damage_die: `1d${sides}`, die_size: sides, damage_bonus: bonus },
});
const armor = (id, label, major, severe, score) => ({
  id, rk: 'armor', label, description: `Пороги ${major}/${severe} + уровень, броня ${score}.`, props: { major, severe, score },
  modifiers: [
    { kind: 'value', target: 'major_base', op: 'add', value: major, stacking: 'max', condition: null },
    { kind: 'value', target: 'severe_base', op: 'add', value: severe, stacking: 'max', condition: null },
    { kind: 'value', target: 'armor_score', op: 'add', value: score, stacking: 'max', condition: null },
  ],
});
const move = (id, label, dice, bonus) => ({ id, rk: 'adversary_move', label, description: `Урон ${dice.replace('d', 'к')} + ${bonus}.`, props: { damage_dice: dice, damage_bonus: bonus } });
const action = (id, label, effect) => ({ id, rk: 'action', label, bindings: [{ label, effect, args: {} }] });

const compendium = () => ({
  records: [
    weapon('broadsword', 'Палаш', 'Проворство, ближний бой, к8.', 'проворство', 8, 0),
    weapon('longsword', 'Длинный меч', 'Проворство, ближний бой, к8 + 3, двуручный.', 'проворство', 8, 3),
    weapon('dagger', 'Кинжал', 'Искусность, ближний бой, к8 + 1.', 'искусность', 8, 1),
    weapon('shortbow', 'Короткий лук', 'Проворство, далеко, к6 + 3, двуручный.', 'проворство', 6, 3),
    armor('gambeson', 'Стёганка', 5, 11, 3),
    armor('leather', 'Кожаный доспех', 6, 13, 3),
    armor('chainmail', 'Кольчуга', 7, 15, 4),
    move('bandit_knife', 'Нож разбойника', '1d8', 1),
    move('brute_club', 'Дубина громилы', '1d10', 3),
    action('act', 'Бросок действия', 'action_roll'),
    action('rest_long', 'Долгий отдых', 'long_rest'),
    action('rest_tend', 'Перевязать раны', 'tend_wounds'),
  ],
});

const sheet = (id, name, of, values, has) => ({ id, systemId: 'daggerheart', of, name, values, has: has.map(o => ({ of: o })), effects: [] });
const HERO_ACTIONS = ['act', 'rest_long', 'rest_tend'];

const sheets = () => [
  sheet('bran', 'Бран', 'hero', {
    agility: 2, strength: 1, finesse: 0, instinct: 1, presence: 0, knowledge: -1,
    level: 1, proficiency: 1, evasion: 11, hp_max: 6, stress_max: 6, hope: 2,
  }, ['longsword', 'chainmail', ...HERO_ACTIONS]),
  sheet('ilse', 'Ильзе', 'hero', {
    agility: 1, strength: -1, finesse: 2, instinct: 1, presence: 0, knowledge: 0,
    level: 1, proficiency: 1, evasion: 12, hp_max: 6, stress_max: 6, hope: 2,
  }, ['dagger', 'shortbow', 'leather', ...HERO_ACTIONS]),
  sheet('bandit', 'Разбойник', 'adversary', {
    difficulty: 12, attack_mod: 1, major_base: 7, severe_base: 13, hp_max: 4, stress_max: 3, evasion: 12,
  }, ['bandit_knife']),
  sheet('brute', 'Громила', 'adversary', {
    difficulty: 11, attack_mod: 2, major_base: 9, severe_base: 16, hp_max: 6, stress_max: 3, evasion: 10,
  }, ['brute_club']),
  { id: 'стол', systemId: 'daggerheart', name: 'Стол', values: { fear: 0 }, has: [], effects: [] },
];

const mannequin = (id, name) => ({ id, systemId: 'daggerheart', name, values: { agility: 1, strength: 1, finesse: 1, instinct: 1, presence: 1, knowledge: 1, evasion: 10, hp_max: 6, difficulty: 12 }, has: [], effects: [] });

const world = {
  title: 'Daggerheart',
  system: {
    id: 'daggerheart',
    name: 'Daggerheart',
    groups: Object.fromEntries(['Черты', 'Прогрессия', 'Защита', 'Здоровье', 'Надежда', 'Противник', 'Стол', 'Действия', 'Атака', 'Вызываемые', 'Правила', 'Состояния', 'Отдых', 'Листы', 'Снаряжение', 'Приёмы'].map(name => [name, {}])),
    fields: fields(),
    constants: constants(),
    tables: tables(),
    roll_edits: rollEdits(),
    effects: effects(),
    records: records(),
    mannequins: [mannequin('манекен-а', 'Манекен А'), mannequin('манекен-б', 'Манекен Б')],
  },
  compendium: compendium(),
  sheets: sheets(),
};

const out = fileURLToPath(new URL('../daggerheart.world.json', import.meta.url));
writeFileSync(out, `${JSON.stringify(world, null, 2)}\n`);
console.log(`Daggerheart: полей ${world.system.fields.length}, эффектов ${Object.keys(world.system.effects).length}, записей ${world.compendium.records.length}, листов ${world.sheets.length}`);
