import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { modifiersOf } from './convert/modifiers.ts';
import { argsOf } from './convert/args.ts';
import { fieldRollsOf } from './convert/field-rolls.ts';
import { namesOf } from './convert/names.ts';
import { spendOf } from './convert/spend.ts';

const TRAITS = [
  ['agility', 'Проворство', 'Agility'], ['strength', 'Сила', 'Strength'], ['finesse', 'Искусность', 'Finesse'],
  ['instinct', 'Чутьё', 'Instinct'], ['presence', 'Присутствие', 'Presence'], ['knowledge', 'Знание', 'Knowledge'],
];
const TRAIT = Object.fromEntries(TRAITS.map(([, label, en]) => [en, label.toLowerCase()]));

const DUALITY = { constant: 'duality' };

const CLASSES = [
  ['Бард (Bard)', 10, 5, 'Grace и Codex', 'Make a Scene: временно отвлечь цель в ближней дистанции — её Сложность −2.', 'Rally: раз за сессию вы и каждый союзник получаете кость сплочения к6 (к8 с 5-го уровня) — на бросок действия, реакции, урона или снять столько Стресса.'],
  ['Друид (Druid)', 10, 6, 'Sage и Arcana', 'Evolution: принять облик зверя без отметки Стресса и поднять одну черту на +1.', 'Beastform: отметить Стресс и принять облик зверя; Wildtouch.'],
  ['Страж (Guardian)', 9, 7, 'Valor и Blade', 'Frontline Tank: освободить 2 бронеслота.', 'Unstoppable: раз за долгий отдых — кость неудержимости к4 (к6 с 5-го уровня).'],
  ['Следопыт (Ranger)', 12, 6, 'Bone и Sage', 'Hold Them Off: удачная атака оружием — тот же бросок против ещё двух противников.', 'Ranger’s Focus: за Надежду атака; при успехе цель — ваш фокус.'],
  ['Плут (Rogue)', 12, 6, 'Midnight и Grace', 'Rogue’s Dodge: +2 к уклонению, пока по вам не попадут атакой (или до отдыха).', 'Cloaked; Sneak Attack: +ступень × к6 урона, если вы скрыты или союзник вплотную к цели.'],
  ['Серафим (Seraph)', 9, 7, 'Splendor и Valor', 'Life Support: освободить клетку хитов союзника в ближней дистанции.', 'Prayer Dice: в начале сессии к4 по числу черты заклинаний — уменьшить урон, прибавить к броску или получить Надежду.'],
  ['Чародей (Sorcerer)', 10, 6, 'Arcana и Midnight', 'Volatile Magic: перебросить любые кости урона атаки магическим уроном.', 'Arcane Sense; Minor Illusion; Channel Raw Power.'],
  ['Воин (Warrior)', 11, 6, 'Blade и Bone', 'No Mercy: +1 к броскам атаки до следующего отдыха.', 'Attack of Opportunity; Combat Training: не учитывать обременение, + уровень к физическому урону.'],
  ['Волшебник (Wizard)', 11, 5, 'Codex и Splendor', 'Not This Time: заставить противника в дальней дистанции перебросить атаку или урон.', 'Prestidigitation; Strange Patterns: выбранное число на кости двойственности — Надежда или минус Стресс.'],
];

const ANCESTRIES = [
  ['Кланк (Clank)', 'Purposeful Design: +1 навсегда к одному опыту', 'Efficient: на коротком отдыхе можно выбрать дело долгого', 0, 0, 0, 0],
  ['Дракона (Drakona)', 'Scales: при тяжёлом уроне отметить Стресс и отметить на одну клетку хитов меньше', 'Elemental Breath: атака Чутьём, очень близко, к8 маг. по мастерству', 0, 0, 0, 0],
  ['Дворф (Dwarf)', 'Thick Skin: при лёгком уроне отметить 2 Стресса вместо клетки хитов', 'Increased Fortitude: за 3 Надежды вдвое уменьшить физический урон', 0, 0, 0, 0],
  ['Эльф (Elf)', 'Quick Reactions: отметить Стресс — преимущество на реакцию', 'Celestial Trance: ещё одно дело на отдыхе', 0, 0, 0, 0],
  ['Фея (Faerie)', 'Luckbender: раз за сессию за 3 Надежды перебросить кости двойственности', 'Wings: полёт; отметить Стресс — +2 уклонения против атаки', 0, 0, 0, 0],
  ['Фавн (Faun)', 'Caprine Leap: прыжок в пределах ближней дистанции', 'Kick: отметить Стресс — +2к6 урона и отбросить', 0, 0, 0, 0],
  ['Фирболг (Firbolg)', 'Charge: рывок и 1к12 физ. всем вплотную за Стресс', 'Unshakable: при отметке Стресса к6, на 6 не отмечать', 0, 0, 0, 0],
  ['Фунгрил (Fungril)', 'Fungril Network: связь на любом расстоянии', 'Death Connection: память из недавнего тела за Стресс', 0, 0, 0, 0],
  ['Галапа (Galapa)', 'Shell: + мастерство к порогам урона', 'Retract: отметить Стресс — сопротивление физическому урону', 0, 0, 0, 1],
  ['Великан (Giant)', 'Endurance: +1 клетка хитов при создании', 'Reach: ближний бой считается «очень близко»', 0, 1, 0, 0],
  ['Гоблин (Goblin)', 'Surefooted: помеха на броски Проворства не действует', 'Danger Sense: раз за отдых заставить противника перебросить атаку', 0, 0, 0, 0],
  ['Полурослик (Halfling)', 'Luckbringer: в начале сессии вся партия получает Надежду', 'Internal Compass: перебросить 1 на кости Надежды', 0, 0, 0, 0],
  ['Человек (Human)', 'High Stamina: +1 клетка Стресса при создании', 'Adaptability: провал с опытом — отметить Стресс и перебросить', 1, 0, 0, 0],
  ['Инфернис (Infernis)', 'Fearless: бросок со Страхом — отметить 2 Стресса, чтобы он стал с Надеждой', 'Dread Visage: преимущество, чтобы запугать', 0, 0, 0, 0],
  ['Катари (Katari)', 'Feline Instincts: на Проворство за 2 Надежды перебросить кость Надежды', 'Retracting Claws: цель вплотную становится уязвимой', 0, 0, 0, 0],
  ['Орк (Orc)', 'Sturdy: на последней клетке хитов атаки по вам с помехой', 'Tusks: попадание вплотную — за Надежду +1к6 урона', 0, 0, 0, 0],
  ['Риббет (Ribbet)', 'Amphibious: дышит и двигается под водой', 'Long Tongue: отметить Стресс — атака языком, к12 физ.', 0, 0, 0, 0],
  ['Симиа (Simiah)', 'Natural Climber: преимущество, чтобы лазать и держать равновесие', 'Nimble: +1 к уклонению при создании', 0, 0, 1, 0],
];

const COMMUNITIES = [
  ['Знать (Highborne)', 'Privilege: преимущество среди знати, в торге и когда пускаете в ход репутацию'],
  ['Книжники (Loreborne)', 'Well-Read: преимущество на историю, культуру и политику'],
  ['Орден (Orderborne)', 'Dedicated: три заповеди; раз за отдых, следуя им, кость Надежды — к20'],
  ['Горцы (Ridgeborne)', 'Steady: преимущество на скалах и в суровой местности'],
  ['Мореходы (Seaborne)', 'Know the Tide: бросок со Страхом даёт жетон, жетон — +1 к броску действия'],
  ['Проныры (Slyborne)', 'Scoundrel: преимущество с преступниками, на ложь и укрытие'],
  ['Подземные (Underborne)', 'Low-Light Living: преимущество в полутьме — прятаться, искать, замечать'],
  ['Странники (Wanderborne)', 'Nomadic Pack: раз за сессию за Надежду достать полезную вещь'],
  ['Лесные (Wildborne)', 'Lightfoot: двигается бесшумно'],
];

const stored = (tag, label, group, def, extra = {}) => {
  const { control, lives, roll, ...bounds } = extra;
  return {
    tag, label, group, ...(roll ? { roll } : {}), ...(lives ? { lives } : {}),
    value: { kind: 'stored', type: 'number', default: def, ...bounds }, ...(control ? { control } : {}),
  };
};
const choice = (tag, label, group, from) => ({ tag, label, group, value: { kind: 'stored', type: 'choice', from, default: '' } });
const text = (tag, label, group) => ({ tag, label, group, value: { kind: 'stored', type: 'text', default: '' } });
const formula = (tag, label, group, expr) => ({ tag, label, group, value: { kind: 'formula', expr } });

const ofClass = (column, otherwise) => `если(@class != "", таблица("classes", @class, "${column}"), ${otherwise})`;
const ofAncestry = column => `если(@ancestry != "", таблица("ancestries", @ancestry, "${column}"), 0)`;

function fields() {
  const out = [];
  out.push(choice('class', 'Класс', 'Личное дело', 'classes'));
  out.push(choice('ancestry', 'Происхождение', 'Личное дело', 'ancestries'));
  out.push(choice('community', 'Община', 'Личное дело', 'communities'));
  out.push(text('exp1', 'Опыт 1 (+2)', 'Личное дело'));
  out.push(text('exp2', 'Опыт 2 (+2)', 'Личное дело'));
  for (const [tag, label] of TRAITS) {
    out.push(stored(tag, label, 'Черты', 0, { min: -3, max: 6, roll: { label: `Бросок: ${label}`, die: DUALITY, tags: ['действие', 'герой', label.toLowerCase()] } }));
  }
  out.push(stored('level', 'Уровень', 'Прогрессия', 1, { min: 0, max: 10 }));
  out.push(formula('tier', 'Ступень', 'Прогрессия', 'если(@level >= 8, 4, если(@level >= 5, 3, если(@level >= 2, 2, 1)))'));
  out.push(stored('proficiency', 'Мастерство', 'Прогрессия', 1, { min: 1, max: 6 }));

  out.push(stored('evasion_bonus', 'Уклонение: прибавка', 'Уклонение и броня', 0));
  out.push(formula('evasion', 'Уклонение', 'Уклонение и броня', `${ofClass('evasion', 10)} + ${ofAncestry('evasion_bonus')} + @evasion_bonus`));
  out.push(stored('armor_score', 'Броня', 'Уклонение и броня', 0, { min: 0, max: 12 }));
  out.push(stored('armor_marked', 'Бронеслоты отмечены', 'Уклонение и броня', 0, { min: 0, max: 12, control: 'pips' }));

  out.push(stored('major_base', 'Порог серьёзного: основа', 'Пороги урона', 0, { min: 0 }));
  out.push(stored('severe_base', 'Порог тяжёлого: основа', 'Пороги урона', 0, { min: 0 }));
  out.push(formula('major', 'Порог серьёзного урона', 'Пороги урона',
    `если(@major_base > 0, @major_base + @level + ${ofAncestry('threshold_proficiency')} * @proficiency, @level)`));
  out.push(formula('severe', 'Порог тяжёлого урона', 'Пороги урона',
    `если(@severe_base > 0, @severe_base + @level + ${ofAncestry('threshold_proficiency')} * @proficiency, 2 * @level)`));

  out.push(stored('hp_extra', 'Хиты: дополнительные клетки', 'Здоровье', 0, { min: 0 }));
  out.push(formula('hp_max', 'Хиты: клеток', 'Здоровье', `${ofClass('hp', 0)} + ${ofAncestry('hp_bonus')} + @hp_extra`));
  out.push(stored('hp', 'Хиты отмечены', 'Здоровье', 0, { min: 0, control: 'pips' }));
  out.push(stored('stress_extra', 'Стресс: дополнительные клетки', 'Здоровье', 0, { min: 0 }));
  out.push(formula('stress_max', 'Стресс: клеток', 'Здоровье', `6 + ${ofAncestry('stress_bonus')} + @stress_extra`));
  out.push(stored('stress', 'Стресс отмечен', 'Здоровье', 0, { min: 0, control: 'pips' }));
  out.push(formula('down', 'Последний хит отмечен', 'Здоровье', 'все(@hp_max > 0, @hp >= @hp_max)'));
  out.push(formula('stress_full', 'Весь Стресс отмечен', 'Здоровье', 'все(@stress_max > 0, @stress >= @stress_max)'));
  out.push(formula('stress_free', 'Есть свободный Стресс', 'Здоровье', '@stress < @stress_max'));

  out.push(stored('hope', 'Надежда', 'Надежда', 2, { min: 0, max: 6, control: 'pips' }));
  out.push(stored('scars', 'Шрамы (вычеркнутые клетки Надежды)', 'Надежда', 0, { min: 0, max: 6 }));

  out.push(stored('difficulty', 'Сложность', 'Противник', 11, { min: 1 }));
  out.push(stored('adversary_hp', 'Хиты противника', 'Противник', 3, { min: 1 }));
  out.push(stored('adversary_stress', 'Стресс противника', 'Противник', 2, { min: 0 }));
  out.push(stored('attack_mod', 'Модификатор атаки', 'Противник', 1));

  out.push(stored('fear', 'Страх ведущего', 'Стол', 0, { min: 0, max: 12, lives: 'desk' }));
  return out;
}

const tables = () => ({
  rolls: {
    label: 'Броски', key: 'word',
    columns: [{ key: 'успех', label: 'Успех', kind: 'text' }, { key: 'провал', label: 'Провал', kind: 'text' }],
    rows: [
      { value: 'действие', cells: { успех: 'успех', провал: 'неудача' } },
      { value: 'атака', cells: { успех: 'попадание', провал: 'промах' } },
      { value: 'герой' },
      { value: 'противник' },
      { value: 'смерть' },
    ],
  },
  traits: {
    label: 'Черты', key: 'word',
    columns: [{ key: 'value', label: 'Значение', kind: 'expr' }],
    rows: TRAITS.map(([tag, label]) => ({ value: label.toLowerCase(), cells: { value: `@${tag}` } })),
  },
  classes: {
    label: 'Классы', key: 'word',
    columns: [
      { key: 'evasion', label: 'Уклонение', kind: 'number' }, { key: 'hp', label: 'Хиты', kind: 'number' },
      { key: 'domains', label: 'Домены', kind: 'text' }, { key: 'hope_feature', label: 'Способность Надежды (3 Надежды)', kind: 'text' },
      { key: 'features', label: 'Особенности класса', kind: 'text' },
    ],
    rows: CLASSES.map(([value, evasion, hp, domains, hope, features]) => ({ value, cells: { evasion, hp, domains, hope_feature: hope, features } })),
  },
  ancestries: {
    label: 'Происхождения', key: 'word',
    columns: [
      { key: 'first', label: 'Первая особенность', kind: 'text' }, { key: 'second', label: 'Вторая особенность', kind: 'text' },
      { key: 'stress_bonus', label: 'Стресс +', kind: 'number' }, { key: 'hp_bonus', label: 'Хиты +', kind: 'number' },
      { key: 'evasion_bonus', label: 'Уклонение +', kind: 'number' }, { key: 'threshold_proficiency', label: 'Мастерство к порогам', kind: 'number' },
    ],
    rows: ANCESTRIES.map(([value, first, second, stress, hp, evasion, thresholds]) => ({
      value, cells: { first, second, stress_bonus: stress, hp_bonus: hp, evasion_bonus: evasion, threshold_proficiency: thresholds },
    })),
  },
  communities: {
    label: 'Общины', key: 'word',
    columns: [{ key: 'feature', label: 'Особенность', kind: 'text' }],
    rows: COMMUNITIES.map(([value, feature]) => ({ value, cells: { feature } })),
  },
  damage_kinds: { label: 'Вид урона', key: 'word', rows: [{ value: 'физический' }, { value: 'магический' }] },
  ranges: { label: 'Дистанции', key: 'word', rows: ['вплотную', 'очень близко', 'близко', 'далеко', 'очень далеко'].map(value => ({ value })) },
});

const constants = () => ({
  duality: {
    label: 'Кости двойственности', kind: 'die',
    dice: [{ count: 1, sides: 12, name: 'надежда' }, { count: 1, sides: 12, name: 'страх' }],
  },
  adversary_die: { label: 'к20 противника', kind: 'die', dice: [{ count: 1, sides: 20 }] },
  hope_die: { label: 'Кость Надежды', kind: 'die', dice: [{ count: 1, sides: 12 }] },
});

const rollEdits = () => ({
  advantage: { label: 'Преимущество: +к6', ops: [{ op: 'bonusDie', sides: 6 }], canceledBy: 'disadvantage' },
  disadvantage: { label: 'Помеха: −к6', ops: [{ op: 'bonusDie', sides: 6, minus: true }], canceledBy: 'advantage' },
  gm_advantage: { label: 'Преимущество противника: вторая к20, лучшая', ops: [{ op: 'addDie' }, { op: 'keepBest', n: 1 }], canceledBy: 'gm_disadvantage' },
  gm_disadvantage: { label: 'Помеха противника: вторая к20, худшая', ops: [{ op: 'addDie' }, { op: 'keepWorst', n: 1 }], canceledBy: 'gm_advantage' },
});

const change = (tag, direction, expr, when) => ({
  type: 'apply', target: { tag }, direction, value: { expr }, targetModifiers: false, ...(when ? { when: { expr: when } } : {}),
});
const hang = id => ({ type: 'status', mode: 'apply', effect: { const: id } });
const drop = id => ({ type: 'status', mode: 'remove', effect: { const: id } });
const payHope = n => [
  { type: 'compare', value: { expr: '@hope' }, versus: { expr: String(n) }, breakIf: 'less', note: `нужно ${n} Надежды` },
  change('hope', 'subtract', String(n)),
];

const HOPE = '@бросок.parts.надежда > @бросок.parts.страх';
const FEAR = '@бросок.parts.страх > @бросок.parts.надежда';
const CRIT = '@бросок.parts.надежда == @бросок.parts.страх';
const HIT = `любое(@бросок.success, ${CRIT})`;
const MARKS = 'если(@event.amount >= @severe, 3, если(@event.amount >= @major, 2, если(@event.amount >= 1, 1, 0)))';

const incoming = (tags, edit) => ({ kind: 'roll', target: 'incoming:roll:any', tags, edit, condition: null });
const mod = (target, value) => ({ kind: 'value', target, op: 'add', value, stacking: 'sum', condition: null });
const state = (label, description, modifiers = [], extra = {}) => ({
  label, group: 'Состояния', activation: 'passive', duration: { kind: 'permanent' }, description, modifiers, ...extra,
});
const rule = (label, description, on, steps) => ({
  label, group: 'Правила', activation: 'passive', duration: { kind: 'permanent' }, params: [], description, on: [{ on, steps }],
});
const move = (label, group, description, steps, extra = {}) => ({ label, group, activation: 'manual', description, steps, ...extra });
const dropOnRest = id => [{ on: 'moment:short-rest', steps: [drop(id)] }, { on: 'moment:long-rest', steps: [drop(id)] }];

function effects() {
  return {
    action_roll: {
      label: 'Бросок действия', group: 'Действия', activation: 'manual',
      description: 'Кости двойственности + черта (+2 за опыт, если потратить Надежду) против сложности, которую называет ведущий. Дубль — крит: успех при любом итоге.',
      params: [
        { key: 'trait', label: 'Черта', kind: 'choice', from: 'traits', ask: { by: 'actor' } },
        { key: 'опыт', label: 'Опыт: 0 или +2 за Надежду', kind: 'number', ask: { by: 'actor', min: 0, max: 2 } },
        { key: 'сложность', label: 'Сложность', kind: 'number', ask: { by: 'gm', min: 1, max: 30 } },
      ],
      self: [
        { type: 'compare', value: { expr: '@hope' }, versus: { expr: '1' }, breakIf: 'less', note: 'на опыт нужна Надежда', when: { expr: '@опыт > 0' } },
        change('hope', 'subtract', '1', '@опыт > 0'),
      ],
      steps: [{
        id: 'бросок', type: 'threshold',
        roll: { die: DUALITY, bonus: { expr: 'таблица("traits", @trait, "value") + @опыт' }, tags: ['действие', 'герой', { param: 'trait' }] },
        versus: { expr: '@сложность' }, continueOn: 'always',
      }],
    },
    hero_attack: {
      label: 'Атака героя', group: 'Атака', activation: 'manual',
      description: 'Кости двойственности + черта оружия против сложности противника. Попал — кости урона по числу мастерства плюс прибавка; на крите сверху максимум костей урона.',
      params: [
        { key: 'trait', label: 'Черта оружия', kind: 'choice', from: 'traits' },
        { key: 'attack_bonus', label: 'Прибавка к атаке', kind: 'number' },
        { key: 'damage_die', label: 'Кость урона', kind: 'dice' },
        { key: 'die_size', label: 'Граней на кости урона', kind: 'number' },
        { key: 'damage_bonus', label: 'Прибавка к урону', kind: 'number' },
        { key: 'extra_die', label: 'Ещё кость урона, худшая отбрасывается (1 — да)', kind: 'number' },
      ],
      steps: [
        {
          id: 'бросок', type: 'threshold',
          roll: { die: DUALITY, bonus: { expr: 'таблица("traits", @trait, "value") + @attack_bonus' }, tags: ['атака', 'герой'] },
          versus: { expr: '@получатель.difficulty' }, continueOn: 'always',
        },
        { type: 'compare', value: { expr: `если(${HIT}, 1, 0)` }, versus: { expr: '1' }, breakIf: 'less', note: 'промах' },
        {
          id: 'урон', type: 'amount', source: 'item',
          fixed: { expr: `кинуть(@damage_die, @отправитель.proficiency + @extra_die, @отправитель.proficiency) + @damage_bonus + если(${CRIT}, @отправитель.proficiency * @die_size, 0)` },
        },
        { type: 'emit', event: 'damage', args: { amount: { expr: '@урон' } } },
      ],
    },
    adversary_attack: {
      label: 'Атака противника', group: 'Атака', activation: 'manual',
      description: 'к20 + модификатор атаки против уклонения героя. Попал — урон приёма.',
      params: [
        { key: 'damage_dice', label: 'Кость урона', kind: 'dice' },
        { key: 'damage_bonus', label: 'Прибавка к урону', kind: 'number' },
      ],
      steps: [
        {
          id: 'удар', type: 'threshold',
          roll: { die: { constant: 'adversary_die' }, bonus: { expr: '@attack_mod' }, tags: ['атака', 'противник'] },
          versus: { expr: '@получатель.evasion' },
        },
        { id: 'урон', type: 'amount', source: 'item', fixed: { expr: 'кинуть(@damage_dice) + @damage_bonus' } },
        { type: 'emit', event: 'damage', args: { amount: { expr: '@урон' } } },
      ],
    },
    damage: {
      label: 'Урон', group: 'Вызываемые',
      description: 'Урон против порогов: ниже серьёзного — одна клетка хитов, от серьёзного — две, от тяжёлого — три. Бронеслот игрок отмечает сам действием «Отметить бронеслот».',
      params: [{ key: 'amount', label: 'Сколько урона', kind: 'number', role: 'amount' }],
      steps: [change('hp', 'add', MARKS)],
    },
    mark_armor: move('Отметить бронеслот', 'Действия',
      'После урона: отметить бронеслот и отметить на одну клетку хитов меньше. При броне 0 нельзя.',
      [
        { type: 'compare', value: { expr: '@armor_score - @armor_marked' }, versus: { expr: '1' }, breakIf: 'less', note: 'свободных бронеслотов нет' },
        { type: 'compare', value: { expr: '@hp' }, versus: { expr: '1' }, breakIf: 'less', note: 'снимать нечего' },
        change('armor_marked', 'add', '1'),
        change('hp', 'subtract', '1'),
      ]),
    duality: {
      label: 'Двойственность', group: 'Правила', activation: 'passive', duration: { kind: 'permanent' },
      description: 'После броска двойственности: больше выпало на Надежде — Надежда герою; на Страхе — Страх ведущему; дубль — крит: Надежда и минус один Стресс.',
      on: ['action_roll', 'hero_attack'].flatMap(on => [
        { on, role: 'sender', if: { expr: HOPE }, steps: [change('hope', 'add', '1')] },
        { on, role: 'sender', if: { expr: FEAR }, steps: [change('fear', 'add', '1')] },
        { on, role: 'sender', if: { expr: CRIT }, steps: [change('hope', 'add', '1'), change('stress', 'subtract', '1', '@stress >= 1')] },
      ]),
    },
    vulnerable: state('Уязвим', 'Все броски против уязвимого — с преимуществом.', [
      incoming(['герой'], 'advantage'), incoming(['противник'], 'gm_advantage'),
    ]),
    hidden: state('Скрыт', 'Все броски против скрытого — с помехой. Спадает, когда вас увидели или вы атаковали.', [
      incoming(['герой'], 'disadvantage'), incoming(['противник'], 'gm_disadvantage'),
    ]),
    restrained: state('Опутан', 'Не может двигаться, но действует с места.'),
    stress_limit: rule('Последний Стресс', 'Отмечен последний Стресс — «Уязвим», пока не снят хотя бы один.', 'field:stress_full', [hang('vulnerable')]),
    stress_relief: rule('Стресс снят', 'Есть свободный Стресс — «Уязвим» от Стресса снят.', 'field:stress_free', [drop('vulnerable')]),
    death_move: state('Смертельный ход', 'Отмечен последний хит: выберите смертельный ход — «Сгореть во славе», «Избежать смерти» или «Рискнуть всем».'),
    last_hp: rule('Последний хит', 'Отмечен последний хит — «Смертельный ход».', 'field:down', [hang('death_move')]),
    blaze_of_glory: move('Сгореть во славе', 'Смертельные ходы',
      'Последнее действие автоматически критически удаётся (с одобрения ведущего), затем герой уходит за завесу смерти.',
      [drop('death_move'), hang('dead')]),
    avoid_death: move('Избежать смерти', 'Смертельные ходы',
      'Герой без сознания до лечения клетки хитов или долгого отдыха. Кость Надежды не больше уровня — шрам: вычеркнуть клетку Надежды.',
      [
        drop('death_move'), hang('unconscious'),
        {
          id: 'шрам', type: 'threshold', roll: { die: { constant: 'hope_die' }, tags: ['смерть'] },
          versus: { expr: '@level' }, successWhen: 'notOver', continueOn: 'always',
        },
        change('scars', 'add', '1', '@шрам.success'),
      ]),
    risk_it_all: move('Рискнуть всем', 'Смертельные ходы',
      'Кости двойственности: больше на Надежде — на ногах и снять хиты по значению кости Надежды; на Страхе — смерть; дубль — снять все хиты и весь Стресс.',
      [
        {
          id: 'бросок', type: 'threshold', roll: { die: DUALITY, tags: ['смерть'] },
          versus: { expr: '0' }, continueOn: 'always',
        },
        change('hp', 'subtract', 'меньшее из(@hp, @бросок.parts.надежда)', HOPE),
        change('hp', 'set', '0', CRIT),
        change('stress', 'set', '0', CRIT),
        drop('death_move'),
        { ...hang('dead'), when: { expr: FEAR } },
      ]),
    dead: state('Мёртв', 'Герой ушёл за завесу смерти.'),
    unconscious: state('Без сознания', 'Не двигается и не действует, по нему нельзя атаковать. Приходит в себя, когда союзник снимет клетку хитов или после долгого отдыха.'),
    tend_wounds: move('Перевязать раны', 'Отдых', 'Короткий отдых: снять 1к4 + ступень клеток хитов.', [change('hp', 'subtract', 'меньшее из(@hp, кинуть("1к4") + @tier)'), drop('unconscious')]),
    clear_stress: move('Снять Стресс', 'Отдых', 'Короткий отдых: снять 1к4 + ступень Стресса.', [change('stress', 'subtract', 'меньшее из(@stress, кинуть("1к4") + @tier)')]),
    repair_armor: move('Починить доспех', 'Отдых', 'Короткий отдых: освободить 1к4 + ступень бронеслотов.', [change('armor_marked', 'subtract', 'меньшее из(@armor_marked, кинуть("1к4") + @tier)')]),
    prepare: move('Подготовиться', 'Отдых', 'Короткий или долгий отдых: получить Надежду; вместе с партией — по 2.', [change('hope', 'add', 'если(@вместе >= 1, 2, 1)')],
      { params: [{ key: 'вместе', label: 'С партией: 1 — да, 0 — нет', kind: 'number', ask: { by: 'actor', min: 0, max: 1 } }] }),
    tend_all: move('Залечить все раны', 'Отдых', 'Долгий отдых: снять все хиты.', [change('hp', 'set', '0'), drop('unconscious')]),
    clear_all_stress: move('Снять весь Стресс', 'Отдых', 'Долгий отдых: снять весь Стресс.', [change('stress', 'set', '0')]),
    repair_all: move('Починить весь доспех', 'Отдых', 'Долгий отдых: освободить все бронеслоты.', [change('armor_marked', 'set', '0')]),
    gm_short_rest: move('Страх: короткий отдых', 'Ведущий', 'Партия на коротком отдыхе — ведущий получает 1к4 Страха.', [change('fear', 'add', 'кинуть("1к4")')]),
    gm_long_rest: move('Страх: долгий отдых', 'Ведущий', 'Партия на долгом отдыхе — ведущий получает 1к4 + число героев Страха.', [change('fear', 'add', 'кинуть("1к4") + @героев')],
      { params: [{ key: 'героев', label: 'Героев в партии', kind: 'number', ask: { by: 'gm', min: 1, max: 8 } }] }),
    frontline_tank: move('Frontline Tank', 'Способности Надежды', 'Страж: за 3 Надежды освободить 2 бронеслота.',
      [change('armor_marked', 'subtract', 'меньшее из(@armor_marked, 2)')], { self: payHope(3) }),
    life_support: move('Life Support', 'Способности Надежды', 'Серафим: за 3 Надежды снять клетку хитов у союзника в ближней дистанции.',
      [change('hp', 'subtract', 'меньшее из(@hp, 1)'), drop('unconscious')], { self: payHope(3) }),
    no_mercy: move('No Mercy', 'Способности Надежды', 'Воин: за 3 Надежды +1 к броскам атаки до следующего отдыха.',
      [hang('merciless')], { self: payHope(3) }),
    merciless: state('Без пощады', '+1 к броскам атаки до следующего отдыха.',
      [{ kind: 'roll', target: 'roll:any', tags: ['атака'], op: 'add', value: 1, condition: null }], { on: dropOnRest('merciless') }),
    rogues_dodge: move('Rogue’s Dodge', 'Способности Надежды', 'Плут: за 3 Надежды +2 к уклонению, пока по вам не попадут атакой или до отдыха.',
      [hang('dodging')], { self: payHope(3) }),
    dodging: state('Увёртливость', '+2 к уклонению, пока по вам не попадут.', [mod('evasion', 2)],
      { on: [{ on: 'event:damage', steps: [drop('dodging')] }, ...dropOnRest('dodging')] }),
    make_a_scene: move('Make a Scene', 'Способности Надежды', 'Бард: за 3 Надежды отвлечь цель в ближней дистанции — её Сложность −2.',
      [hang('distracted')], { self: payHope(3) }),
    distracted: state('Отвлечён', 'Сложность −2, пока ведущий не снимет.', [mod('difficulty', -2)]),
  };
}

const setTo = (target, expr) => ({ kind: 'value', target, op: 'set', value: { expr }, stacking: 'override', condition: null });

const records = () => ({
  hero: { kind: 'sheet', label: 'Герой', icon: '🗡', group: 'Листы', hint: 'Лист игрока.', grants: ['duality', 'last_hp', 'stress_limit', 'stress_relief'] },
  adversary: {
    kind: 'sheet', label: 'Противник', icon: '👹', group: 'Листы', hint: 'Сложность, пороги, хиты и Стресс, модификатор атаки — числами из блока противника, без класса и уровня.',
    blocks: ['Пороги урона', 'Здоровье', 'Противник'],
    modifiers: [
      setTo('hp_max', '@adversary_hp'),
      setTo('stress_max', '@adversary_stress'),
      setTo('major', '@major_base'),
      setTo('severe', '@severe_base'),
    ],
  },
  weapon: {
    kind: 'item', label: 'Оружие', icon: '⚔', group: 'Снаряжение', hint: 'Черта, дистанция, кость урона и прибавка.',
    props: [
      { key: 'trait', label: 'Черта', kind: 'choice', from: 'traits' },
      { key: 'range', label: 'Дистанция', kind: 'choice', from: 'ranges' },
      { key: 'damage_die', label: 'Кость урона', kind: 'dice' },
      { key: 'die_size', label: 'Граней на кости', kind: 'number' },
      { key: 'damage_bonus', label: 'Прибавка к урону', kind: 'number' },
      { key: 'attack_bonus', label: 'Прибавка к атаке', kind: 'number' },
      { key: 'extra_die', label: 'Ещё кость урона, худшая отбрасывается (1 — да)', kind: 'number' },
      { key: 'damage_kind', label: 'Вид урона', kind: 'choice', from: 'damage_kinds' },
    ],
    bindings: [{
      label: 'Атака', effect: 'hero_attack',
      args: { trait: { prop: 'trait' }, attack_bonus: { prop: 'attack_bonus' }, damage_die: { prop: 'damage_die' }, die_size: { prop: 'die_size' }, damage_bonus: { prop: 'damage_bonus' }, extra_die: { prop: 'extra_die' } },
    }],
  },
  armor: {
    kind: 'item', label: 'Доспех', icon: '🛡', group: 'Снаряжение', hint: 'Основа порогов и броня.',
    props: [
      { key: 'major', label: 'Основа порога серьёзного', kind: 'number' },
      { key: 'severe', label: 'Основа порога тяжёлого', kind: 'number' },
      { key: 'score', label: 'Броня', kind: 'number' },
    ],
  },
  adversary_move: {
    kind: 'action', label: 'Приём противника', icon: '👹', group: 'Приёмы', hint: 'Урон вписан в приём, особенности — в описании.',
    props: [{ key: 'damage_dice', label: 'Кость урона', kind: 'dice' }, { key: 'damage_bonus', label: 'Прибавка', kind: 'number' }],
    bindings: [{ label: 'Атака', effect: 'adversary_attack', args: { damage_dice: { prop: 'damage_dice' }, damage_bonus: { prop: 'damage_bonus' } } }],
  },
  action: { kind: 'action', label: 'Действие', icon: '🎲', group: 'Приёмы', hint: 'Бросок, отдых, смертельные ходы, способности.', props: [], bindings: [] },
});

const weapon = (id, label, en, trait, range, sides, bonus, burden, kind = 'физический', feature = '', extra = {}) => ({
  id, rk: 'weapon', label,
  description: `${en}. ${TRAIT[trait][0].toUpperCase()}${TRAIT[trait].slice(1)}, ${range}, к${sides}${bonus ? ` + ${bonus}` : ''} ${kind === 'физический' ? 'физ.' : 'маг.'}, ${burden}.${feature ? ` ${feature}` : ''}`,
  props: { trait: TRAIT[trait], range, damage_die: `1d${sides}`, die_size: sides, damage_bonus: bonus, attack_bonus: extra.attack ?? 0, extra_die: extra.extraDie ?? 0, damage_kind: kind },
  ...(extra.modifiers ? { modifiers: extra.modifiers } : {}),
});
const armor = (id, label, en, major, severe, score, feature = '', modifiers = []) => ({
  id, rk: 'armor', label, description: `${en}. Пороги ${major}/${severe} + уровень, броня ${score}.${feature ? ` ${feature}` : ''}`,
  props: { major, severe, score },
  modifiers: [mod('major_base', major), mod('severe_base', severe), mod('armor_score', score), ...modifiers],
});
const adversaryMove = (id, label, dice, bonus, description) => ({
  id, rk: 'adversary_move', label, description, props: { damage_dice: dice, damage_bonus: bonus },
});
const action = (id, label, effect) => ({ id, rk: 'action', label, bindings: [{ label, effect, args: {} }] });

const TWO = 'двуручное';
const ONE = 'одноручное';

const compendium = () => ({
  records: [
    weapon('broadsword', 'Палаш', 'Broadsword', 'Agility', 'вплотную', 8, 0, ONE, 'физический', 'Надёжный: +1 к броскам атаки.', { attack: 1 }),
    weapon('longsword', 'Длинный меч', 'Longsword', 'Agility', 'вплотную', 8, 3, TWO),
    weapon('battleaxe', 'Боевой топор', 'Battleaxe', 'Strength', 'вплотную', 10, 3, TWO),
    weapon('greatsword', 'Двуручный меч', 'Greatsword', 'Strength', 'вплотную', 10, 3, TWO, 'физический', 'Массивный: −1 к уклонению; при попадании ещё кость урона, худшая отбрасывается.', { modifiers: [mod('evasion', -1)], extraDie: 1 }),
    weapon('mace', 'Булава', 'Mace', 'Strength', 'вплотную', 8, 1, ONE),
    weapon('warhammer', 'Боевой молот', 'Warhammer', 'Strength', 'вплотную', 12, 3, TWO, 'физический', 'Тяжёлый: −1 к уклонению.', { modifiers: [mod('evasion', -1)] }),
    weapon('dagger', 'Кинжал', 'Dagger', 'Finesse', 'вплотную', 8, 1, ONE),
    weapon('quarterstaff', 'Боевой посох', 'Quarterstaff', 'Instinct', 'вплотную', 10, 3, TWO),
    weapon('cutlass', 'Абордажная сабля', 'Cutlass', 'Presence', 'вплотную', 8, 1, ONE),
    weapon('rapier', 'Рапира', 'Rapier', 'Presence', 'вплотную', 8, 0, ONE, 'физический', 'Быстрая: отметить Стресс, чтобы атаковать ещё одну цель в дистанции.'),
    weapon('halberd', 'Алебарда', 'Halberd', 'Strength', 'очень близко', 10, 2, TWO, 'физический', 'Громоздкая: −1 к Искусности.', { modifiers: [mod('finesse', -1)] }),
    weapon('spear', 'Копьё', 'Spear', 'Finesse', 'очень близко', 10, 2, TWO, 'физический', 'Громоздкое: −1 к Искусности.', { modifiers: [mod('finesse', -1)] }),
    weapon('shortbow', 'Короткий лук', 'Shortbow', 'Agility', 'далеко', 6, 3, TWO),
    weapon('crossbow', 'Арбалет', 'Crossbow', 'Finesse', 'далеко', 6, 1, ONE),
    weapon('longbow', 'Длинный лук', 'Longbow', 'Agility', 'очень далеко', 8, 3, TWO, 'физический', 'Громоздкий: −1 к Искусности.', { modifiers: [mod('finesse', -1)] }),
    weapon('arcane_gauntlets', 'Чародейские перчатки', 'Arcane Gauntlets', 'Strength', 'вплотную', 10, 3, TWO, 'магический'),
    weapon('hallowed_axe', 'Освящённый топор', 'Hallowed Axe', 'Strength', 'вплотную', 8, 1, ONE, 'магический'),
    weapon('glowing_rings', 'Сияющие кольца', 'Glowing Rings', 'Agility', 'очень близко', 10, 1, TWO, 'магический'),
    weapon('hand_runes', 'Руны на ладонях', 'Hand Runes', 'Instinct', 'очень близко', 10, 0, ONE, 'магический'),
    weapon('returning_blade', 'Возвращающийся клинок', 'Returning Blade', 'Finesse', 'близко', 8, 0, ONE, 'магический', 'Возвращается в руку после броска.'),
    weapon('shortstaff', 'Короткий посох', 'Shortstaff', 'Instinct', 'близко', 8, 1, ONE, 'магический'),
    weapon('dualstaff', 'Двойной посох', 'Dualstaff', 'Instinct', 'далеко', 6, 3, TWO, 'магический'),
    weapon('scepter', 'Скипетр', 'Scepter', 'Presence', 'далеко', 6, 0, TWO, 'магический', 'Разносторонний: можно и как Присутствие, вплотную, к8.'),
    weapon('wand', 'Жезл', 'Wand', 'Knowledge', 'далеко', 6, 1, ONE, 'магический'),
    weapon('greatstaff', 'Великий посох', 'Greatstaff', 'Knowledge', 'очень далеко', 6, 0, TWO, 'магический', 'Мощный: при попадании ещё кость урона, худшая отбрасывается.', { extraDie: 1 }),
    weapon('shortsword', 'Короткий меч', 'Shortsword (вторичное)', 'Agility', 'вплотную', 8, 0, ONE, 'физический', 'Парное: +2 к урону основного оружия вплотную.'),
    weapon('round_shield', 'Круглый щит', 'Round Shield (вторичное)', 'Strength', 'вплотную', 4, 0, ONE, 'физический', 'Защитный: +1 к броне.', { modifiers: [mod('armor_score', 1)] }),
    weapon('tower_shield', 'Ростовой щит', 'Tower Shield (вторичное)', 'Strength', 'вплотную', 6, 0, ONE, 'физический', 'Заслон: +2 к броне, −1 к уклонению.', { modifiers: [mod('armor_score', 2), mod('evasion', -1)] }),
    weapon('small_dagger', 'Малый кинжал', 'Small Dagger (вторичное)', 'Finesse', 'вплотную', 8, 0, ONE, 'физический', 'Парное: +2 к урону основного оружия вплотную.'),
    weapon('whip', 'Кнут', 'Whip (вторичное)', 'Presence', 'очень близко', 6, 0, ONE, 'физический', 'Хлёсткий: отметить Стресс — всех вплотную отбросить на близкую дистанцию.'),
    weapon('grappler', 'Крюк', 'Grappler (вторичное)', 'Finesse', 'близко', 6, 0, ONE, 'физический', 'Цепкий: при попадании подтянуть цель вплотную.'),
    weapon('hand_crossbow', 'Ручной арбалет', 'Hand Crossbow (вторичное)', 'Finesse', 'далеко', 6, 1, ONE),
    armor('gambeson', 'Стёганка', 'Gambeson Armor', 5, 11, 3, 'Гибкая: +1 к уклонению.', [mod('evasion', 1)]),
    armor('leather', 'Кожаный доспех', 'Leather Armor', 6, 13, 3),
    armor('chainmail', 'Кольчуга', 'Chainmail Armor', 7, 15, 4, 'Тяжёлая: −1 к уклонению.', [mod('evasion', -1)]),
    armor('full_plate', 'Латы', 'Full Plate Armor', 8, 17, 4, 'Очень тяжёлые: −2 к уклонению, −1 к Проворству.', [mod('evasion', -2), mod('agility', -1)]),
    adversaryMove('acid_burrower_claws', 'Когти (Кислотный землерой)', '1d12', 2, 'Очень близко. Relentless (3); Earth Eruption; Spit Acid; Acid Bath.'),
    adversaryMove('bear_claws', 'Когти (Медведь)', '1d8', 3, 'Вплотную. Overwhelming Force; Bite (3к4 + 10 и опутан); Momentum.'),
    adversaryMove('cave_ogre_club', 'Дубина (Пещерный огр)', '1d10', 2, 'Очень близко. Ramp Up; Bone Breaker; Hail of Boulders; Rampaging Fury.'),
    adversaryMove('construct_slam', 'Удар кулаком (Конструкт)', '1d20', 0, 'Вплотную. Relentless (2); Weak Structure; Trample; Overload; Death Quake.'),
    adversaryMove('courtier_daggers', 'Кинжалы (Придворный)', '1d4', 2, 'Вплотную. Mockery; Scapegoat.'),
    adversaryMove('mosquito_proboscis', 'Хоботок (Гигантские комары)', '1d8', 3, 'Вплотную. Орда (5 за клетку): урон 1к4 + 1, когда в орде половина хитов; Flying; Bloodsucker.'),
    adversaryMove('deeproot_vines', 'Лозы (Защитник Глубоких корней)', '1d8', 3, 'Близко. Ground Slam; Grab and Drag.'),
    adversaryMove('rat_claws', 'Когти (Гигантская крыса)', '1d1', 0, 'Вплотную, урон 1. Миньон (3); Group Attack.'),
    adversaryMove('wolf_claws', 'Когти (Лютый волк)', '1d6', 2, 'Вплотную. Pack Tactics (1к6 + 5 и Страх); Hobbling Strike.'),
    adversaryMove('scorpion_pincers', 'Клешни (Гигантский скорпион)', '1d12', 2, 'Вплотную. Double Strike; Venomous Stinger; Momentum.'),
    adversaryMove('glass_fangs', 'Стеклянные клыки (Стеклянный змей)', '1d8', 2, 'Очень близко. Armor-Shredding Shards; Spinning Serpent; Spitter.'),
    adversaryMove('harrier_javelin', 'Дротик (Застрельщик)', '1d6', 2, 'Близко. Maintain Distance; Fall Back.'),
    adversaryMove('guard_longsword', 'Длинный меч (Стражник с клинком)', '1d6', 1, 'Вплотную. Shield Wall; Detain.'),
    adversaryMove('head_guard_mace', 'Булава (Начальник стражи)', '1d10', 4, 'Вплотную. Rally Guards; On My Signal; Momentum.'),
    adversaryMove('archer_longbow', 'Длинный лук (Стражник-лучник)', '1d8', 3, 'Далеко. Hobbling Shot.'),
    adversaryMove('bandit_daggers', 'Кинжалы (Разбойник Зазубренного ножа)', '1d8', 1, 'Вплотную. Climber; From Above (1к10 + 1).'),
    adversaryMove('hexer_staff', 'Посох (Ворожей Зазубренного ножа)', '1d6', 2, 'Далеко, маг. Curse; Chaotic Flux.'),
    adversaryMove('lieutenant_javelin', 'Дротик (Лейтенант Зазубренного ножа)', '1d8', 3, 'Близко. Tactician; More Where That Came From; Coup de Grace; Momentum.'),
    adversaryMove('kneebreaker_club', 'Дубина (Костолом Зазубренного ножа)', '1d4', 6, 'Вплотную. I’ve Got ’Em; Hold Them Down.'),
    adversaryMove('shadow_daggers', 'Кинжалы (Тень Зазубренного ножа)', '1d4', 4, 'Вплотную. Backstab (1к6 + 6); Cloaked.'),
    adversaryMove('lackey_daggers', 'Кинжалы (Шестёрка Зазубренного ножа)', '1d1', 1, 'Вплотную, урон 2. Миньон (3); Group Attack.'),
    adversaryMove('sniper_shortbow', 'Короткий лук (Снайпер Зазубренного ножа)', '1d10', 2, 'Далеко. Unseen Strike (1к10 + 4 из укрытия).'),
    adversaryMove('merchant_club', 'Дубина (Торговец)', '1d4', 1, 'Вплотную. Preferential Treatment; The Runaround.'),
    action('act', 'Бросок действия', 'action_roll'),
    action('armor_slot', 'Отметить бронеслот', 'mark_armor'),
    action('short_tend', 'Перевязать раны', 'tend_wounds'),
    action('short_stress', 'Снять Стресс', 'clear_stress'),
    action('short_armor', 'Починить доспех', 'repair_armor'),
    action('prepare', 'Подготовиться', 'prepare'),
    action('long_tend', 'Залечить все раны', 'tend_all'),
    action('long_stress', 'Снять весь Стресс', 'clear_all_stress'),
    action('long_armor', 'Починить весь доспех', 'repair_all'),
    action('death_blaze', 'Сгореть во славе', 'blaze_of_glory'),
    action('death_avoid', 'Избежать смерти', 'avoid_death'),
    action('death_risk', 'Рискнуть всем', 'risk_it_all'),
    action('hope_frontline', 'Frontline Tank', 'frontline_tank'),
    action('hope_life', 'Life Support', 'life_support'),
    action('hope_mercy', 'No Mercy', 'no_mercy'),
    action('hope_dodge', 'Rogue’s Dodge', 'rogues_dodge'),
    action('hope_scene', 'Make a Scene', 'make_a_scene'),
    action('gm_short', 'Страх: короткий отдых', 'gm_short_rest'),
    action('gm_long', 'Страх: долгий отдых', 'gm_long_rest'),
  ],
});

const sheet = (id, name, of, values, has) => ({ id, systemId: 'daggerheart', of, name, values, has: has.map(o => ({ of: o })), effects: [] });
const HERO_ACTIONS = ['act', 'armor_slot', 'short_tend', 'short_stress', 'short_armor', 'prepare', 'long_tend', 'long_stress', 'long_armor', 'death_blaze', 'death_avoid', 'death_risk'];

const adversary = (id, name, difficulty, major, severe, hp, stress, attack, moveId) => sheet(id, name, 'adversary', {
  difficulty, major_base: major, severe_base: severe, adversary_hp: hp, adversary_stress: stress, attack_mod: attack,
}, [moveId]);

const ADVERSARY_BOOK = [
  ['Кислотный землерой (Acid Burrower)', 'Solo', 14, 8, 15, 8, 3, 3, 'acid_burrower_claws'],
  ['Медведь (Bear)', 'Bruiser', 14, 9, 17, 7, 2, 1, 'bear_claws'],
  ['Пещерный огр (Cave Ogre)', 'Solo', 13, 8, 15, 8, 3, 1, 'cave_ogre_club'],
  ['Конструкт (Construct)', 'Solo', 13, 7, 15, 9, 4, 4, 'construct_slam'],
  ['Придворный (Courtier)', 'Social', 12, 4, 8, 3, 4, -4, 'courtier_daggers'],
  ['Гигантские комары (Giant Mosquitoes)', 'Horde', 10, 5, 9, 6, 3, -2, 'mosquito_proboscis'],
  ['Защитник Глубоких корней (Deeproot Defender)', 'Bruiser', 10, 8, 14, 7, 3, 2, 'deeproot_vines'],
  ['Гигантская крыса (Giant Rat)', 'Minion', 10, 0, 0, 1, 1, -4, 'rat_claws'],
  ['Лютый волк (Dire Wolf)', 'Skulk', 12, 5, 9, 4, 3, 2, 'wolf_claws'],
  ['Гигантский скорпион (Giant Scorpion)', 'Bruiser', 13, 7, 13, 6, 3, 1, 'scorpion_pincers'],
  ['Стеклянный змей (Glass Snake)', 'Standard', 14, 6, 10, 5, 3, 2, 'glass_fangs'],
  ['Застрельщик (Harrier)', 'Standard', 12, 5, 9, 3, 3, 1, 'harrier_javelin'],
  ['Стражник с клинком (Bladed Guard)', 'Standard', 12, 5, 9, 5, 2, 1, 'guard_longsword'],
  ['Начальник стражи (Head Guard)', 'Leader', 15, 7, 13, 7, 3, 4, 'head_guard_mace'],
  ['Стражник-лучник (Archer Guard)', 'Ranged', 10, 4, 8, 3, 2, 1, 'archer_longbow'],
  ['Разбойник Зазубренного ножа (Jagged Knife Bandit)', 'Standard', 12, 8, 14, 5, 3, 1, 'bandit_daggers'],
  ['Ворожей Зазубренного ножа (Jagged Knife Hexer)', 'Support', 13, 5, 9, 4, 4, 2, 'hexer_staff'],
  ['Лейтенант Зазубренного ножа (Jagged Knife Lieutenant)', 'Leader', 13, 7, 14, 6, 3, 2, 'lieutenant_javelin'],
  ['Костолом Зазубренного ножа (Jagged Knife Kneebreaker)', 'Bruiser', 12, 7, 14, 7, 4, -3, 'kneebreaker_club'],
  ['Тень Зазубренного ножа (Jagged Knife Shadow)', 'Skulk', 12, 4, 8, 3, 3, 1, 'shadow_daggers'],
  ['Шестёрка Зазубренного ножа (Jagged Knife Lackey)', 'Minion', 9, 0, 0, 1, 1, -2, 'lackey_daggers'],
  ['Снайпер Зазубренного ножа (Jagged Knife Sniper)', 'Ranged', 13, 4, 7, 3, 2, -1, 'sniper_shortbow'],
  ['Торговец (Merchant)', 'Social', 12, 4, 8, 3, 3, -4, 'merchant_club'],
];

const bookAdversary = id => {
  const row = ADVERSARY_BOOK.find(r => r[8] === id);
  const [label, , difficulty, major, severe, hp, stress, attack, moveId] = row;
  return [label.replace(/ \(.*\)$/, ''), difficulty, major, severe, hp, stress, attack, moveId];
};

const sheets = () => [
  sheet('bran', 'Бран', 'hero', {
    class: 'Воин (Warrior)', ancestry: 'Человек (Human)', community: 'Горцы (Ridgeborne)', exp1: 'Наёмник', exp2: 'Выносливый',
    agility: 2, strength: 1, finesse: 0, instinct: 1, presence: 0, knowledge: -1, level: 1, proficiency: 1, hope: 2,
  }, ['longsword', 'chainmail', ...HERO_ACTIONS, 'hope_mercy']),
  sheet('ilse', 'Ильзе', 'hero', {
    class: 'Плут (Rogue)', ancestry: 'Симиа (Simiah)', community: 'Проныры (Slyborne)', exp1: 'Вор', exp2: 'Акробатка',
    agility: 1, strength: -1, finesse: 2, instinct: 1, presence: 0, knowledge: 0, level: 1, proficiency: 1, hope: 2,
  }, ['dagger', 'small_dagger', 'leather', ...HERO_ACTIONS, 'hope_dodge']),
  sheet('toma', 'Тома', 'hero', {
    class: 'Серафим (Seraph)', ancestry: 'Галапа (Galapa)', community: 'Орден (Orderborne)', exp1: 'Храмовница', exp2: 'Лекарка',
    agility: 0, strength: 2, finesse: -1, instinct: 1, presence: 1, knowledge: 0, level: 1, proficiency: 1, hope: 2,
  }, ['hallowed_axe', 'round_shield', 'chainmail', ...HERO_ACTIONS, 'hope_life']),
  adversary('bandit', ...bookAdversary('bandit_daggers')),
  adversary('lackey', ...bookAdversary('lackey_daggers')),
  adversary('sniper', ...bookAdversary('sniper_shortbow')),
  adversary('kneebreaker', ...bookAdversary('kneebreaker_club')),
  adversary('bear', ...bookAdversary('bear_claws')),
  adversary('dire_wolf', ...bookAdversary('wolf_claws')),
  adversary('cave_ogre', ...bookAdversary('cave_ogre_club')),
  adversary('bladed_guard', ...bookAdversary('guard_longsword')),
  { id: 'стол', systemId: 'daggerheart', name: 'Стол', values: { fear: 0 }, has: [], effects: [] },
];

const mannequin = (id, name) => ({ id, systemId: 'daggerheart', name, values: { class: 'Воин (Warrior)', agility: 1, strength: 1, finesse: 1, instinct: 1, presence: 1, knowledge: 1, difficulty: 12, hope: 6 }, has: [], effects: [] });

const world = {
  title: 'Daggerheart',
  system: {
    id: 'daggerheart',
    name: 'Daggerheart',
    groups: Object.fromEntries(['Личное дело', 'Черты', 'Прогрессия', 'Уклонение и броня', 'Пороги урона', 'Здоровье', 'Надежда', 'Противник', 'Стол',
      'Действия', 'Атака', 'Вызываемые', 'Правила', 'Состояния', 'Смертельные ходы', 'Отдых', 'Способности Надежды', 'Ведущий', 'Листы', 'Снаряжение', 'Приёмы']
      .map(name => [name, {}])),
    fields: fields(),
    constants: constants(),
    tables: {
      ...tables(),
      adversaries: {
        label: 'Противники 1-й ступени', key: 'word',
        columns: [
          { key: 'type', label: 'Тип', kind: 'text' }, { key: 'difficulty', label: 'Сложность', kind: 'number' },
          { key: 'major', label: 'Порог серьёзного', kind: 'number' }, { key: 'severe', label: 'Порог тяжёлого', kind: 'number' },
          { key: 'hp', label: 'Хиты', kind: 'number' }, { key: 'stress', label: 'Стресс', kind: 'number' },
          { key: 'attack', label: 'Атака', kind: 'number' }, { key: 'move', label: 'Приём', kind: 'text' },
        ],
        rows: ADVERSARY_BOOK.map(([value, type, difficulty, major, severe, hp, stress, attack, moveId]) => ({
          value, cells: { type, difficulty, major, severe, hp, stress, attack, move: moveId },
        })),
      },
    },
    roll_edits: rollEdits(),
    effects: effects(),
    records: records(),
    mannequins: [mannequin('манекен-а', 'Манекен А'), mannequin('манекен-б', 'Манекен Б')],
  },
  compendium: compendium(),
  sheets: sheets(),
};

const out = fileURLToPath(new URL('../daggerheart.world.json', import.meta.url));
writeFileSync(out, `${JSON.stringify(spendOf(namesOf(fieldRollsOf(argsOf(modifiersOf(world))))), null, 2)}\n`);
console.log(`Daggerheart: полей ${world.system.fields.length}, эффектов ${Object.keys(world.system.effects).length}, записей ${world.compendium.records.length}, листов ${world.sheets.length}`);
