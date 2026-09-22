import { RESOURCES, TAKEN } from './dnd5e.system.mjs';

const DIE = { constant: 'lead_die' };

const P = {
  slot: {
    key: 'slot', label: 'Каким кругом', kind: 'number',
    ask: { by: 'actor', kind: 'number', min: 1, max: 9, hint: 'Круг ячейки, которую тратишь. Не ниже круга заклинания.' },
  },
  level: { key: 'spell_level', label: 'Круг заклинания', kind: 'number' },
  saveBy: { key: 'save_by', label: 'Бонус спасброска', kind: 'expr', of: 'target' },
  die: { key: 'damage_die', label: 'Кость урона', kind: 'dice' },
  count: { key: 'dice_count', label: 'Сколько костей', kind: 'number' },
  up: { key: 'dice_up', label: 'Костей за каждый круг выше', kind: 'number' },
  type: { key: 'damage_type', label: 'Тип урона', kind: 'choice', from: 'damage_types' },
  status: { key: 'status', label: 'Состояние', kind: 'effect' },
  repeat: { key: 'repeat', label: 'Повторный спасбросок', kind: 'effect' },
};

const LEVELED = '@dice_count + (@slot - @spell_level) * @dice_up';

const hit = bonus => ({
  id: 'hit', type: 'threshold', roll: { die: DIE, bonus, check: 'attack_roll' }, versus: { tag: 'ac' },
});
const save = continueOn => ({
  id: 'save', type: 'threshold', side: 'target',
  roll: { die: DIE, bonus: { param: 'save_by' }, check: 'save_roll' },
  versus: { expr: '@spell_dc' }, successWhen: 'atLeast', continueOn,
});
const CRIT = '@hit.natural >= @crit_from ? 2 : 1';
const crit = { ref: 'hit.natural', atLeast: { tag: 'crit_from' } };
const damage = (amount, tags) => ({ type: 'emit', event: 'damage', amount, tags });
const hang = (effect, extra = {}) => ({ type: 'status', mode: 'apply', effect, ...extra });
const drop = effect => ({ type: 'status', mode: 'remove', effect: { const: effect } });
const change = (tag, direction, value, extra = {}) => ({
  type: 'apply', target: { tag }, direction, value, targetModifiers: false, ...extra,
});

const paySlot = [
  {
    type: 'compare', value: { param: 'slot' }, versus: { param: 'spell_level' }, breakIf: 'less',
    note: 'круг ячейки ниже круга заклинания',
  },
  { type: 'emit', event: 'spell_slot', amount: { param: 'slot' }, strict: true },
];
const payFirstSlot = [{ type: 'emit', event: 'spell_slot', amount: { const: 1 }, strict: true }];
const payResource = (key, note, amount = { const: 1 }) => [
  { type: 'compare', value: { tag: `${key}_left` }, versus: amount, breakIf: 'less', note },
  change(`${key}_left`, 'subtract', amount),
];

const manual = (label, category, description, cost, rest) => ({
  label, group: category, description, activation: 'manual', ...(cost ? { cost } : {}), params: [], steps: [], ...rest,
});
const passive = (label, description, modifiers, duration = { kind: 'temporary' }, extra = {}) => ({
  label, group: 'Состояния', description, activation: 'passive', duration, stacking: 'refresh', modifiers, ...extra,
});
const roll = (target, edit, condition = null) => ({ kind: 'roll', target, edit, condition });
const value = (target, op, amount, extra = {}) => ({
  kind: 'value', target, op, value: amount, stacking: op === 'set' ? 'override' : 'sum', condition: null, ...extra,
});
const resist = (tags, notTags) => ({
  ...value('event:damage', 'mul', 0.5, { ...(tags ? { tags } : {}), ...(notTags ? { notTags } : {}) }), stacking: 'max',
});
const resistNature = (nature, notTags) => ({
  ...value('event:damage', 'mul', 0.5, {
    where: { table: 'damage_types', column: 'nature', is: nature }, ...(notTags ? { notTags } : {}),
  }),
  stacking: 'max',
});

const autoFailBody = [roll('check:str_save', 'auto_fail'), roll('check:dex_save', 'auto_fail')];
const UNTIL_MY_TURN = { kind: 'turns', max: 1, ends: 'turn-start' };

function attacks() {
  return {
    strike: manual('Атака оружием', 'Атака',
      'Бросок атаки против класса брони, урон костью оружия. На крите кости урона удваиваются. Посчитанное уходит в общий эффект «Урон».',
      'attack', {
        params: [
          { key: 'attack_with', label: 'Бонус атаки', kind: 'expr' },
          { key: 'damage_with', label: 'Прибавка к урону', kind: 'expr' },
          { key: 'damage_dice', label: 'Кость урона', kind: 'dice' },
          P.type,
        ],
        steps: [
          hit({ param: 'attack_with' }),
          { id: 'dmg', type: 'amount', source: 'roll', dice: { param: 'damage_dice' }, bonus: { param: 'damage_with' }, count: { expr: CRIT } },
          damage({ ref: 'dmg' }, [{ param: 'damage_type' }]),
        ],
      }),
    monster_attack: manual('Атака существа', 'Атака',
      'Для статблоков: бонус атаки и прибавка к урону вписаны числами прямо в запись.', 'action', {
        params: [
          { key: 'to_hit', label: 'Бонус атаки', kind: 'number' },
          { key: 'damage_dice', label: 'Кость урона', kind: 'dice' },
          { key: 'damage_bonus', label: 'Прибавка к урону', kind: 'number' },
          P.type,
        ],
        steps: [
          hit({ param: 'to_hit' }),
          { id: 'dmg', type: 'amount', source: 'roll', dice: { param: 'damage_dice' }, bonus: { param: 'damage_bonus' }, count: { expr: '@hit.natural >= 20 ? 2 : 1' } },
          damage({ ref: 'dmg' }, [{ param: 'damage_type' }]),
        ],
      }),
    flame_blade: {
      label: 'Пламя клинка', group: 'Умения класса',
      description: 'Пока клинок горит, каждый удар им добавляет 2к6 огнём — отдельной частью, со своей меткой.',
      activation: 'triggered', duration: { kind: 'permanent' },
      trigger: { on: 'strike', direction: 'out', to: 'target' },
      steps: [
        { id: 'жар', type: 'amount', source: 'item', fixed: { expr: "кинуть('2к6')" } },
        damage({ ref: 'жар' }, ['огонь']),
      ],
    },
    sneak_attack: manual('Скрытая атака', 'Умения класса',
      'Раз за ход, после попадания с преимуществом или рядом с союзником: дополнительные кости урона — половина уровня, округляя вверх.',
      'once', {
        params: [P.type],
        steps: [
          { id: 'dmg', type: 'amount', source: 'roll', dice: { const: '1d6' }, count: { tag: 'sneak_dice' } },
          damage({ ref: 'dmg' }, [{ param: 'damage_type' }]),
        ],
      }),
    divine_smite: manual('Божественная кара', 'Умения класса',
      'После попадания оружием: тратишь ячейку, 2к8 излучением и ещё 1к8 за каждый круг выше первого, не больше 5к8.',
      'free', {
        params: [P.slot],
        self: [{ type: 'emit', event: 'spell_slot', amount: { param: 'slot' }, strict: true }],
        steps: [
          { id: 'dmg', type: 'amount', source: 'roll', dice: { const: '1d8' }, count: { expr: 'min(5, 1 + @slot)' } },
          damage({ ref: 'dmg' }, ['излучение', 'магический']),
        ],
      }),
  };
}

function spells() {
  const infoParams = [P.level, P.slot];
  return {
    taken_rule: {
      label: 'Что доходит до меня',
      group: 'Правила комнаты',
      description: 'Один раз на все типы урона: сколько доходит — сказано на листе. Иммунитет, сопротивление, уязвимость выставляются там же.',
      activation: 'passive',
      duration: { kind: 'permanent' },
      modifiers: TAKEN.map(([tag, damage]) => ({
        kind: 'value', target: 'event:damage', op: 'mul',
        value: { expr: `@${tag}` }, stacking: 'sum', condition: null, tags: [damage],
      })),
    },
    spell: {
      label: 'Заклинание',
      group: 'Заклинания',
      description: 'Основа всех заклинаний: спрашивает круг ячейки и тратит её. Сама по себе не применяется.',
      cost: 'action',
      params: infoParams,
      self: paySlot,
    },
    cantrip_attack: manual('Заговор: бросок атаки', 'Заклинания',
      'Атака заклинанием против класса брони. Костей столько, сколько даёт уровень персонажа: одна, с 5-го две, с 11-го три, с 17-го четыре.',
      'action', {
        params: [P.die, P.type],
        steps: [
          hit({ expr: '@spell_attack' }),
          { id: 'dmg', type: 'amount', source: 'roll', dice: { param: 'damage_die' }, count: { expr: `(@cantrip_dice) * (${CRIT})` } },
          damage({ ref: 'dmg' }, [{ param: 'damage_type' }, 'магический']),
        ],
      }),
    cantrip_save: manual('Заговор: спасбросок', 'Заклинания',
      'Цель спасается против твоей сложности заклинаний. Провал — урон и, если задано, состояние; успех — ничего.', 'action', {
        params: [P.saveBy, P.die, P.type, { ...P.status, label: 'Состояние при провале' }],
        steps: [
          save('fail'),
          { id: 'dmg', type: 'amount', source: 'roll', dice: { param: 'damage_die' }, count: { tag: 'cantrip_dice' } },
          damage({ ref: 'dmg' }, [{ param: 'damage_type' }, 'магический']),
          hang({ param: 'status', optional: true }),
        ],
      }),
    cantrip_note: manual('Заговор: без броска', 'Заклинания',
      'Заговор, который стол не считает: свет, волшебная рука, фокусы. В журнал ложится строка — остальное решает ведущий.', 'action', {}),
    spell_attack: manual('Заклинание: бросок атаки', 'Заклинания',
      'Тратит ячейку. Атака заклинанием против класса брони; ячейка выше круга заклинания добавляет кости.', 'action', {
        extends: 'spell',
        params: [P.die, P.count, P.up, P.type, { ...P.status, label: 'Состояние при попадании' }],
        steps: [
          hit({ expr: '@spell_attack' }),
          { id: 'dmg', type: 'amount', source: 'roll', dice: { param: 'damage_die' }, count: { expr: `(${LEVELED}) * (${CRIT})` } },
          damage({ ref: 'dmg' }, [{ param: 'damage_type' }, 'магический']),
          hang({ param: 'status', optional: true }),
        ],
      }),
    spell_save_half: manual('Заклинание: спасбросок, при успехе половина', 'Заклинания',
      'Тратит ячейку один раз на всех. Кости бросаются один раз, спасбросок у каждой цели свой; успех — половина урона.', 'action', {
        extends: 'spell',
        params: [P.saveBy, P.die, P.count, P.up, P.type],
        steps: [
          save('always'),
          {
            id: 'dmg', type: 'amount', source: 'roll', dice: { param: 'damage_die' }, count: { expr: LEVELED },
            scale: { times: 0.5, when: { ref: 'save.success' } },
          },
          damage({ ref: 'dmg' }, [{ param: 'damage_type' }, 'магический']),
        ],
      }),
    spell_save_none: manual('Заклинание: спасбросок, при успехе ничего', 'Заклинания',
      'Тратит ячейку. Провал спасброска — урон и, если задано, состояние; успех — ничего.', 'action', {
        extends: 'spell',
        params: [P.saveBy, P.die, P.count, P.up, P.type, { ...P.status, label: 'Состояние при провале' }],
        steps: [
          save('fail'),
          { id: 'dmg', type: 'amount', source: 'roll', dice: { param: 'damage_die' }, count: { expr: LEVELED } },
          damage({ ref: 'dmg' }, [{ param: 'damage_type' }, 'магический']),
          hang({ param: 'status', optional: true }),
        ],
      }),
    spell_auto: manual('Заклинание: урон без броска', 'Заклинания',
      'Тратит ячейку. Попадает всегда: волшебная стрела. К каждой кости идёт прибавка, ячейка выше круга добавляет кости.', 'action', {
        extends: 'spell',
        params: [P.die, P.count, P.up, { key: 'per_die', label: 'Прибавка к каждой кости', kind: 'number' }, P.type],
        steps: [
          {
            id: 'dmg', type: 'amount', source: 'roll', dice: { param: 'damage_die' }, count: { expr: LEVELED },
            bonus: { expr: `(${LEVELED}) * @per_die` },
          },
          damage({ ref: 'dmg' }, [{ param: 'damage_type' }, 'магический']),
        ],
      }),
    spell_condition: manual('Заклинание: спасбросок или состояние', 'Заклинания',
      'Тратит ячейку. Провал спасброска вешает состояние, оно запоминает твою сложность для повторных спасбросков. Без концентрации.', 'action', {
        extends: 'spell',
        params: [P.saveBy, P.status, { ...P.repeat }],
        steps: [
          save('fail'),
          hang({ param: 'status' }, { carry: { expr: '@spell_dc' } }),
          hang({ param: 'repeat', optional: true }, { carry: { expr: '@spell_dc' } }),
        ],
      }),
    spell_condition_held: manual('Заклинание: спасбросок или состояние, с концентрацией', 'Заклинания',
      'То же, но держится твоей концентрацией: сорвалась или взялся за другое — состояние спало со всех целей.', 'action', {
        extends: 'spell',
        bond: 'concentration',
        params: [P.saveBy, P.status, { ...P.repeat }],
        steps: [
          save('fail'),
          hang({ param: 'status' }, { carry: { expr: '@spell_dc' } }),
          hang({ param: 'repeat', optional: true }, { carry: { expr: '@spell_dc' } }),
        ],
      }),
    spell_buff: manual('Заклинание: усиление', 'Заклинания',
      'Тратит ячейку и вешает на цели эффект. Без концентрации: висит, пока не истечёт срок самого эффекта.', 'action', {
        extends: 'spell',
        params: [P.status],
        steps: [hang({ param: 'status' })],
      }),
    spell_buff_held: manual('Заклинание: усиление с концентрацией', 'Заклинания',
      'Тратит ячейку и вешает на цели эффект, пока держишь концентрацию. Целей может быть несколько — ячейка одна.', 'action', {
        extends: 'spell',
        bond: 'concentration',
        params: [P.status],
        steps: [hang({ param: 'status' })],
      }),
    spell_heal: manual('Заклинание: лечение', 'Заклинания',
      'Тратит ячейку. Кости лечения плюс заклинательный модификатор; ячейка выше круга добавляет кости. Снимает состояние, если задано.', 'action', {
        extends: 'spell',
        params: [{ key: 'heal_die', label: 'Кость лечения', kind: 'dice' }, P.count, P.up, { key: 'cure', label: 'Что снимает', kind: 'effect' }],
        steps: [
          { id: 'amt', type: 'amount', source: 'roll', dice: { param: 'heal_die' }, count: { expr: LEVELED }, bonus: { expr: '@spell_mod' } },
          change('hp_current', 'add', { ref: 'amt' }),
          { type: 'status', mode: 'remove', effect: { param: 'cure', optional: true } },
        ],
      }),
    spell_cleanse: manual('Заклинание: снять состояние', 'Заклинания',
      'Тратит ячейку и снимает с цели одно состояние: малое восстановление, снятие проклятия.', 'action', {
        extends: 'spell',
        params: [{ key: 'cure', label: 'Что снимает', kind: 'effect' }],
        steps: [{ type: 'status', mode: 'remove', effect: { param: 'cure' } }],
      }),
    spell_note: manual('Заклинание: без броска', 'Заклинания',
      'Тратит ячейку и пишет строку в журнал. Для заклинаний, которые стол не считает: обнаружение магии, туманный шаг, полёт.', 'action', {
        extends: 'spell',
      }),
    potion_heal: manual('Выпить зелье лечения', 'Лечение',
      'Кости зелья плюс прибавка. Цель — тот, кто пьёт.', 'action', {
        params: [{ key: 'heal_die', label: 'Кости лечения', kind: 'dice' }, { key: 'heal_bonus', label: 'Прибавка', kind: 'number' }],
        steps: [
          { id: 'amt', type: 'amount', source: 'roll', dice: { param: 'heal_die' }, bonus: { param: 'heal_bonus' } },
          change('hp_current', 'add', { ref: 'amt' }),
        ],
      }),
  };
}

function features() {
  return {
    second_wind: manual('Второе дыхание', 'Умения класса',
      'Бонусным действием восполняешь 1к10 + уровень хитов. Раз до короткого отдыха.', 'bonus', {
        self: [
          ...payResource('second_wind', 'второе дыхание уже потрачено'),
          { id: 'amt', type: 'amount', source: 'roll', dice: { const: '1d10' }, bonus: { expr: '@level' } },
          change('hp_current', 'add', { ref: 'amt' }),
        ],
      }),
    action_surge: manual('Всплеск действий', 'Умения класса',
      'Ещё одно действие в этом ходу. Стол списывает использование; второе действие ведущий разрешает сам.', 'free', {
        self: payResource('action_surge', 'всплеск действий уже потрачен'),
      }),
    rage: manual('Ярость', 'Умения класса',
      'Бонусным действием впадаешь в ярость на минуту: урон рукопашным оружием выше, сопротивление рубящему, колющему и дробящему, преимущество на проверки и спасброски Силы.',
      'bonus', {
        self: [...payResource('rages', 'ярости на сегодня кончились'), hang({ const: 'raging' })],
      }),
    reckless_attack: manual('Безрассудная атака', 'Умения класса',
      'До начала твоего следующего хода: твои атаки с преимуществом, но и по тебе бьют с преимуществом.', 'free', {
        self: [hang({ const: 'reckless' })],
      }),
    bardic_inspiration: manual('Бардовское вдохновение', 'Умения класса',
      'Бонусным действием даёшь союзнику кость: увидев свой бросок, он может прибавить её один раз.', 'bonus', {
        self: payResource('bardic', 'вдохновение на сегодня кончилось'),
        steps: [hang({ const: 'bardic_ready' })],
      }),
    lay_on_hands: manual('Наложение рук', 'Умения класса',
      'Лечишь из запаса ровно столько хитов, сколько назовёшь. Запас — пять на уровень, до долгого отдыха.', 'action', {
        params: [{
          key: 'amount', label: 'Сколько хитов', kind: 'number',
          ask: { by: 'actor', kind: 'number', min: 1, max: 100, hint: 'Не больше, чем осталось в запасе.' },
        }],
        self: payResource('lay_on_hands', 'в запасе наложения рук столько нет', { param: 'amount' }),
        steps: [change('hp_current', 'add', { param: 'amount' })],
      }),
    turn_undead: manual('Изгнание нежити', 'Умения класса',
      'Божественный канал: нежить спасается Мудростью против твоей сложности, иначе бежит в страхе.', 'action', {
        params: [],
        self: payResource('channel', 'божественный канал уже потрачен'),
        steps: [
          {
            id: 'save', type: 'threshold', side: 'target', roll: { die: DIE, bonus: { expr: '@wis_save', of: 'target' }, check: 'save_roll' },
            versus: { expr: '@spell_dc' }, successWhen: 'atLeast', continueOn: 'fail',
          },
          hang({ const: 'frightened' }),
        ],
      }),
    dodge: manual('Уклонение', 'Действия в бою',
      'До начала твоего следующего хода по тебе бьют с помехой, а спасброски Ловкости идут с преимуществом.', 'action', {
        self: [hang({ const: 'dodging' })],
      }),
    dash: manual('Рывок', 'Действия в бою', 'Скорость до конца хода удваивается.', 'action', {
      steps: [hang({ const: 'dashing' })],
    }),
    dashing: passive('В рывке', 'Скорость удвоена до конца хода.', [value('speed', 'mul', 2)],
      { kind: 'turns', max: 1, ends: 'turn-end' }),
    disengage: manual('Отход', 'Действия в бою', 'Твоё передвижение до конца хода не провоцирует атак.', 'action', {}),
    hide: manual('Засада', 'Действия в бою', 'Скрытность против пассивной внимательности цели. Вышло — прячешься.', 'action', {
      steps: [
        { id: 'sneak', type: 'threshold', roll: { die: DIE, bonus: { expr: '@stealth' }, check: 'skill_roll' },
          versus: { tag: 'passive_perception' }, successWhen: 'atLeast', continueOn: 'success' },
        { type: 'status', mode: 'apply', effect: { const: 'hidden' }, side: 'source' },
      ],
    }),
    hidden: passive('Прячется', 'Тебя не видят: атаки по цели, которая тебя не видит, идут с преимуществом.',
      [roll('attack_roll', 'advantage')], { kind: 'turns', max: 1, ends: 'turn-start' }),
    help: manual('Помощь', 'Действия в бою', 'Союзник бросает следующую проверку или атаку с преимуществом.', 'action', {
      steps: [hang({ const: 'helped' })],
    }),
    helped: passive('Ему помогают', 'Следующая проверка или атака — с преимуществом.',
      [roll('attack_roll', 'advantage'), roll('skill_roll', 'advantage')],
      { kind: 'turns', max: 1, ends: 'turn-start' }),
    spend_hit_die: manual('Потратить кость хитов', 'Отдых и смерть',
      'На коротком отдыхе: бросаешь кость хитов, прибавляешь Телосложение, восполняешь столько хитов.', 'free', {
        self: [
          { type: 'compare', value: { tag: 'hit_dice_left' }, versus: { const: 1 }, breakIf: 'less', note: 'костей хитов не осталось' },
          change('hit_dice_left', 'subtract', { const: 1 }),
          { id: 'amt', type: 'amount', source: 'roll', dice: { expr: '@hit_die' }, bonus: { expr: '@con_mod' } },
          change('hp_current', 'add', { ref: 'amt' }),
        ],
      }),
  };
}

function reactions() {
  const reaction = (label, description, trigger, rest) => ({
    label, group: 'Реакции', description, activation: 'reaction', cost: 'reaction',
    duration: { kind: 'permanent' }, trigger, params: [], steps: [], ...rest,
  });
  return {
    shield: reaction('Щит', 'По тебе попали — тратишь ячейку 1-го круга, +5 к классу брони до начала твоего хода. Атака пересчитывается.',
      { on: '*', window: 'target', condition: { ref: 'hit.success' } },
      { self: payFirstSlot, steps: [hang({ const: 'shield_up' })] }),
    hellish_rebuke: reaction('Адское возмездие', 'Тебя ранили — тратишь ячейку 1-го круга: обидчик спасается Ловкостью, провал — 2к10 огнём, успех — половина.',
      { on: 'event:damage', window: 'after' },
      {
        self: payFirstSlot,
        steps: [
          {
            id: 'save', type: 'threshold', side: 'target', roll: { die: DIE, bonus: { expr: '@dex_save', of: 'target' }, check: 'save_roll' },
            versus: { expr: '@spell_dc' }, successWhen: 'atLeast', continueOn: 'always',
          },
          { id: 'dmg', type: 'amount', source: 'roll', dice: { const: '2d10' }, scale: { times: 0.5, when: { ref: 'save.success' } } },
          damage({ ref: 'dmg' }, ['огонь', 'магический']),
        ],
      }),
    uncanny_dodge: reaction('Невероятное уклонение', 'По тебе попали — урон этой атаки вдвое меньше.',
      { on: '*', window: 'target', condition: { ref: 'hit.success' } },
      { steps: [hang({ const: 'uncanny_up' }), hang({ const: 'uncanny_off' })] }),
    inspire: reaction('Вдохновение: перебросить с преимуществом', 'Увидел свой бросок — тратишь вдохновение, к выпавшему добавляется вторая кость, берётся лучшая.',
      { on: '*', window: 'sender', claims: ['advantage'] },
      {
        cost: undefined,
        self: [
          { type: 'compare', value: { tag: 'inspiration' }, versus: { const: 1 }, breakIf: 'less', note: 'вдохновения нет' },
          change('inspiration', 'subtract', { const: 1 }),
        ],
      }),
    lucky_point: reaction('Везунчик: очко удачи', 'Увидел свой бросок — тратишь очко удачи, кидаешь ещё одну кость и берёшь лучшую.',
      { on: '*', window: 'sender', claims: ['advantage'] },
      { cost: undefined, self: payResource('luck', 'очки удачи кончились') }),
    bardic_ready: reaction('Кость вдохновения наготове', 'Увидел свой бросок — прибавляешь кость вдохновения. Один раз.',
      { on: '*', window: 'sender', claims: ['bardic'] },
      { cost: undefined, duration: { kind: 'uses', max: 1 } }),
  };
}

function conditions() {
  const incomingAdvantage = roll('incoming:attack_roll', 'advantage');
  const incomingDisadvantage = roll('incoming:attack_roll', 'disadvantage');
  return {
    blinded: passive('Ослеплён', 'Твои атаки с помехой, по тебе — с преимуществом.',
      [roll('attack_roll', 'disadvantage'), incomingAdvantage]),
    charmed: passive('Очарован', 'Не можешь вредить очаровавшему; у него преимущество на общение с тобой. Считает ведущий.', []),
    deafened: passive('Оглушён', 'Не слышишь. Проверки на слух проваливаются — считает ведущий.', []),
    frightened: passive('Испуган', 'Помеха на атаки и проверки, пока источник страха на виду.',
      [roll('attack_roll', 'disadvantage'), roll('skill_roll', 'disadvantage')]),
    grappled: passive('Схвачен', 'Скорость ноль.', [value('speed', 'set', 0)]),
    incapacitated: passive('Недееспособен', 'Ни действий, ни реакций. Следит ведущий.', []),
    invisible: passive('Невидим', 'Твои атаки с преимуществом, по тебе — с помехой.',
      [roll('attack_roll', 'advantage'), incomingDisadvantage]),
    paralyzed: passive('Парализован', 'Недееспособен, скорость ноль, спасброски Силы и Ловкости провалены, по тебе бьют с преимуществом.',
      [incomingAdvantage, ...autoFailBody, value('speed', 'set', 0)]),
    petrified: passive('Окаменел', 'Как паралич, плюс сопротивление любому урону.',
      [incomingAdvantage, ...autoFailBody, value('speed', 'set', 0), resist()]),
    poisoned: passive('Отравлен', 'Помеха на атаки и проверки характеристик.',
      [roll('attack_roll', 'disadvantage'), roll('skill_roll', 'disadvantage')]),
    prone: passive('Лежит', 'Твои атаки с помехой, по тебе вблизи бьют с преимуществом. Встать — половина скорости.',
      [incomingAdvantage, roll('attack_roll', 'disadvantage')]),
    restrained: passive('Опутан', 'Скорость ноль, твои атаки и спасброски Ловкости с помехой, по тебе — с преимуществом.',
      [value('speed', 'set', 0), roll('attack_roll', 'disadvantage'), incomingAdvantage, roll('check:dex_save', 'disadvantage')]),
    stunned: passive('Ошеломлён', 'Недееспособен, спасброски Силы и Ловкости провалены, по тебе бьют с преимуществом.',
      [incomingAdvantage, ...autoFailBody]),
    unconscious: passive('Без сознания', 'Лежит без чувств: как паралич, и роняет всё, что держал.',
      [incomingAdvantage, ...autoFailBody, value('speed', 'set', 0)]),
    stable: passive('Стабилен', 'Ноль хитов, но спасброски от смерти больше не нужны.',
      [value('death_ok', 'set', 3)], { kind: 'permanent' }),
    dead: passive('Мёртв', 'Три провала или урон, перекрывший максимум хитов.', [value('speed', 'set', 0)], { kind: 'permanent' }),

    dodging: passive('Уклоняется', 'По тебе бьют с помехой, спасброски Ловкости с преимуществом.',
      [incomingDisadvantage, roll('check:dex_save', 'advantage')], UNTIL_MY_TURN),
    reckless: passive('Безрассуден', 'Твои атаки с преимуществом, по тебе — тоже.',
      [roll('attack_roll', 'advantage'), incomingAdvantage], UNTIL_MY_TURN),
    raging: passive('В ярости', 'Урон рукопашным оружием выше, сопротивление рубящему, колющему и дробящему, преимущество на Силу.',
      [
        value('cell:wield.melee.damage', 'add', { expr: '@rage_damage' }),
        resistNature('физический'),
        roll('check:athletics', 'advantage'), roll('check:str_save', 'advantage'), roll('check:str_mod', 'advantage'),
      ], { kind: 'rounds', max: 10 }),
    shield_up: passive('Под щитом', '+5 к классу брони.', [value('ac', 'add', 5)], UNTIL_MY_TURN),
    uncanny_up: passive('Невероятное уклонение', 'Урон этой атаки вдвое меньше.', [value('event:damage', 'mul', 0.5)]),
    blessed: passive('Благословлён', '+1к4 к броскам атаки и спасброскам. Кость сверх: преимущество её не отбрасывает.',
      [roll('attack_roll', 'bless'), roll('save_roll', 'bless')], { kind: 'permanent' }),
    baned: passive('Под порчей', '−1к4 к броскам атаки и спасброскам.',
      [roll('attack_roll', 'bane'), roll('save_roll', 'bane')], { kind: 'permanent' }),
    guided: passive('Указание', '+1к4 к одной проверке характеристики.', [roll('skill_roll', 'guidance')], { kind: 'permanent' }),
    resisted: passive('Сопротивление', '+1к4 к одному спасброску.', [roll('save_roll', 'guidance')], { kind: 'permanent' }),
    hasted: passive('Ускорен', '+2 к классу брони, скорость вдвое, преимущество на спасброски Ловкости. Лишнее действие разрешает ведущий.',
      [value('ac', 'add', 2), value('speed', 'mul', 2), roll('check:dex_save', 'advantage')], { kind: 'permanent' }),
    slowed: passive('Замедлен', '−2 к классу брони и спасброскам Ловкости, скорость вдвое меньше.',
      [value('ac', 'add', -2), value('speed', 'mul', 0.5), { kind: 'roll', target: 'check:dex_save', op: 'add', value: -2, condition: null }],
      { kind: 'permanent' }),
    lit: passive('Подсвечен', 'Атаки по тебе идут с преимуществом, невидимость не помогает.', [incomingAdvantage], { kind: 'permanent' }),
    blurred: passive('Размыт', 'Атаки по тебе идут с помехой.', [incomingDisadvantage], { kind: 'permanent' }),
    mage_armored: passive('Доспех мага', 'База доспеха 13, если не носишь настоящего.',
      [{ ...value('ac_base', 'set', 13), stacking: 'max' }], { kind: 'scene' }),
    aided: passive('Подмога', 'Максимум хитов выше на 5.', [value('hp_max', 'add', 5)], { kind: 'scene' }),
    fire_resistance: passive('Сопротивление огню', 'Урон огнём вдвое меньше.',
      [resist(['огонь'])], { kind: 'permanent' }),
    poison_resistance: passive('Сопротивление яду', 'Урон ядом вдвое меньше.',
      [resist(['яд'])], { kind: 'permanent' }),
    stoneskin: passive('Каменная кожа', 'Немагический рубящий, колющий и дробящий урон вдвое меньше.',
      [resistNature('физический', ['магический'])], { kind: 'permanent' }),
    fire_vulnerable: passive('Уязвимость к огню', 'Урон огнём вдвое больше.',
      [value('event:damage', 'mul', 2, { tags: ['огонь'] })], { kind: 'permanent' }),
    poison_immune: passive('Иммунитет к яду', 'Урон ядом не проходит вовсе.',
      [value('event:damage', 'mul', 0, { tags: ['яд'] })], { kind: 'permanent' }),
  };
}

function traits() {
  const trait = (label, description, modifiers) => passive(label, description, modifiers, { kind: 'permanent' }, { group: 'Черты' });
  return {
    extra_attack: trait('Дополнительная атака', 'Действием «Атака» бьёшь дважды.', [value('attacks_per_action', 'add', 1)]),
    improved_critical: trait('Улучшенный критический удар', 'Крит на 19 и 20.', [value('crit_from', 'set', 19)]),
    style_defense: trait('Боевой стиль: оборона', '+1 к классу брони в доспехе.', [value('ac', 'add', 1)]),
    style_dueling: trait('Боевой стиль: дуэлянт', '+2 к урону одноручным оружием.', [value('cell:wield.melee.damage', 'add', 2), value('cell:wield.finesse.damage', 'add', 2)]),
    style_archery: trait('Боевой стиль: стрельба', '+2 к атаке дальнобойным оружием.', [value('cell:wield.ranged.attack', 'add', 2)]),
    unarmored_barbarian: trait('Защита без доспехов: варвар', 'Без доспеха база 10 + Телосложение.',
      [{ ...value('ac_base', 'set', { expr: '10 + @con_mod' }), stacking: 'max' }]),
    unarmored_monk: trait('Защита без доспехов: монах', 'Без доспеха и щита база 10 + Мудрость.',
      [{ ...value('ac_base', 'set', { expr: '10 + @wis_mod' }), stacking: 'max' }]),
    danger_sense: trait('Чувство опасности', 'Преимущество на спасброски Ловкости.', [roll('check:dex_save', 'advantage')]),
    feral_instinct: trait('Дикий инстинкт', 'Преимущество на инициативу.', [roll('check:initiative', 'advantage')]),
    reliable_talent: trait('Надёжный талант', 'На проверках навыков кость считается не меньше десяти.', [roll('skill_roll', 'reliable')]),
    halfling_lucky: trait('Везучий', 'Единица на к20 перебрасывается, новый результат обязателен.', [roll('roll:any', 'lucky')]),
    darkvision_60: trait('Тёмное зрение', 'Видишь в темноте на 60 футов.', [value('darkvision', 'set', 60)]),
    dwarven_resilience: trait('Дварфская стойкость', 'Сопротивление урону ядом.', [resist(['яд'])]),
    infernal_legacy: trait('Дьявольское наследие', 'Сопротивление урону огнём.', [resist(['огонь'])]),
    feat_alert: trait('Черта: бдительный', '+5 к инициативе.', [value('initiative', 'add', 5)]),
    feat_tough: trait('Черта: крепкий', 'Максимум хитов выше на два за уровень.', [value('hp_max', 'add', { expr: '2 * @level' })]),
    feat_mobile: trait('Черта: подвижный', 'Скорость выше на 10 футов.', [value('speed', 'add', 10)]),
    feat_observant: trait('Черта: наблюдательный', '+5 к пассивной внимательности.', [value('passive_perception', 'add', 5)]),
    feat_war_caster: trait('Черта: боевой заклинатель', 'Преимущество на спасброски Телосложения — ими держат концентрацию.', [roll('check:con_save', 'advantage')]),
    ring_protection: trait('Кольцо защиты', '+1 к классу брони и всем спасброскам.',
      [value('ac', 'add', 1), { kind: 'roll', target: 'save_roll', op: 'add', value: 1, condition: null }]),
  };
}

function lifecycle() {
  const auto = (label, description, trigger, steps, rest = {}) => ({
    label, group: 'Отдых и смерть', description, activation: 'triggered', duration: { kind: 'permanent' },
    trigger, params: [], steps, ...rest,
  });
  const reset = (tag, expr) => change(tag, 'set', { expr, of: 'target' });
  const longRest = [
    reset('hp_current', '@hp_max'),
    change('hp_temp', 'set', { const: 0 }),
    change('exhaustion', 'subtract', { const: 1 }),
    change('hit_dice_left', 'add', { expr: 'max(1, floor(@level / 2))', of: 'target' }),
    change('death_ok', 'set', { const: 0 }),
    change('death_fail', 'set', { const: 0 }),
  ];
  for (let n = 1; n <= 9; n++) longRest.push(reset(`slots_${n}`, `@slots_${n}_max`));
  for (const [key, , rest] of RESOURCES) if (rest === 'long') longRest.push(reset(`${key}_left`, `@${key}_max`));
  const shortRest = RESOURCES.filter(([, , rest]) => rest === 'short').map(([key]) => reset(`${key}_left`, `@${key}_max`));

  const repeatSave = (label, ability, ends) => auto(label,
    'В конце своего хода цель повторяет спасбросок против запомненной сложности; успех снимает состояние.',
    { on: 'moment:turn-end' },
    [
      {
        id: 'save', type: 'threshold', roll: { die: DIE, bonus: { expr: `@${ability}_save` }, check: 'save_roll' },
        versus: { ref: 'worn.carry' }, successWhen: 'atLeast', continueOn: 'success',
      },
      ...ends.map(drop),
    ], { group: 'Состояния', duration: { kind: 'temporary' } });

  return {
    concentration: auto('Концентрация',
      'Висит на том, кто держит заклинание. Получил урон — спасбросок Телосложения против 10 или половины урона; провал срывает всё, что держал.',
      { on: 'event:damage', to: 'self' },
      [
        {
          id: 'save', type: 'threshold', roll: { die: DIE, bonus: { expr: '@con_save' }, check: 'save_roll' },
          versus: { expr: 'max(10, floor(@event_amount / 2))' }, successWhen: 'atLeast', continueOn: 'fail',
        },
        drop('concentration'),
      ], { group: 'Заклинания', duration: { kind: 'temporary' } }),
    uncanny_off: auto('Невероятное уклонение: конец', 'Снимает уполовинивание сразу после удара.',
      { on: 'event:damage', to: 'self' }, [drop('uncanny_up'), drop('uncanny_off')],
      { group: 'Реакции', duration: { kind: 'temporary' } }),
    dying: auto('При смерти',
      'На нуле хитов: в начале своего хода к20. Десять и выше — успех, иначе провал; единица — два провала, двадцатка — один хит и на ноги.',
      { on: 'moment:turn-start', condition: { expr: '@hp_current <= 0' } },
      [
        { id: 'спас', type: 'threshold', roll: { die: DIE, check: 'save_roll' }, versus: { const: 10 }, successWhen: 'atLeast', continueOn: 'always' },
        change('death_ok', 'add', { const: 1 }, { when: { ref: 'спас.success' } }),
        change('death_fail', 'add', { const: 1 }, { when: { ref: 'спас.success', not: true } }),
        change('death_fail', 'add', { const: 1 }, { when: { ref: 'спас.natural', atMost: 1 } }),
        change('hp_current', 'set', { const: 1 }, { when: { ref: 'спас.natural', atLeast: 20 } }),
      ], { group: 'Состояния', duration: { kind: 'temporary' } }),
    fall: auto('Падение', 'Хиты опустились до нуля — «Без сознания» и «При смерти».',
      { on: 'field:down' }, [hang({ const: 'unconscious' }), hang({ const: 'dying' })]),
    wake: auto('Подъём', 'Хиты снова выше нуля — встаёт, спасброски от смерти сброшены.',
      { on: 'field:up' },
      [drop('unconscious'), drop('dying'), drop('stable'), change('death_ok', 'set', { const: 0 }), change('death_fail', 'set', { const: 0 })]),
    death_now: auto('Смерть', 'Три провала спасбросков от смерти.', { on: 'field:is_dead' }, [drop('dying'), hang({ const: 'dead' })]),
    stabilize: auto('Стабилизация', 'Три успеха спасбросков от смерти.', { on: 'field:is_stable' }, [drop('dying'), hang({ const: 'stable' })]),
    relentless: auto('Непоколебимая стойкость', 'Раз до долгого отдыха: упал до нуля — остаёшься с одним хитом.',
      { on: 'field:down' },
      [
        { type: 'compare', value: { tag: 'relentless_left' }, versus: { const: 1 }, breakIf: 'less' },
        change('hp_current', 'set', { const: 1 }),
        change('relentless_left', 'subtract', { const: 1 }),
      ], { group: 'Черты' }),
    long_rest: auto('Долгий отдых', 'Хиты и ячейки полные, половина костей хитов, минус уровень истощения, ресурсы долгого отдыха.',
      { on: 'moment:long-rest' }, longRest),
    short_rest: auto('Короткий отдых', 'Возвращает ресурсы короткого отдыха. Кости хитов тратятся отдельной кнопкой.',
      { on: 'moment:short-rest' }, shortRest),
    repeat_wis_paralyzed: repeatSave('Повторный спасбросок: паралич', 'wis', ['paralyzed', 'repeat_wis_paralyzed']),
    repeat_wis_frightened: repeatSave('Повторный спасбросок: страх', 'wis', ['frightened', 'repeat_wis_frightened']),
    repeat_wis_slowed: repeatSave('Повторный спасбросок: замедление', 'wis', ['slowed', 'repeat_wis_slowed']),
    repeat_con_blinded: repeatSave('Повторный спасбросок: слепота', 'con', ['blinded', 'repeat_con_blinded']),
    repeat_str_restrained: repeatSave('Повторный спасбросок: путы', 'str', ['restrained', 'repeat_str_restrained']),
  };
}

function roomRules() {
  const when = (level, modifier) => ({ ...modifier, condition: `@exhaustion >= ${level}` });
  return {
    exhaustion_rule: {
      label: 'Истощение', group: 'Правила комнаты', activation: 'passive', duration: { kind: 'permanent' },
      description: 'Шесть ступеней: помеха на проверки, скорость вдвое меньше, помеха на атаки и спасброски, максимум хитов вдвое меньше, скорость ноль. Шестая — смерть, её объявляет ведущий.',
      modifiers: [
        when(1, roll('skill_roll', 'disadvantage')),
        when(2, value('speed', 'mul', 0.5)),
        when(3, roll('attack_roll', 'disadvantage')),
        when(3, roll('save_roll', 'disadvantage')),
        when(4, value('hp_max', 'mul', 0.5)),
        when(5, value('speed', 'set', 0)),
      ],
    },
  };
}

export function effects() {
  return {
    ...attacks(), ...spells(), ...features(), ...reactions(), ...conditions(), ...traits(), ...lifecycle(), ...roomRules(),
  };
}

export const ROOM_RULES = [
  'taken_rule', 'exhaustion_rule', 'fall', 'wake', 'death_now', 'stabilize', 'long_rest', 'short_rest',
];
