import { RESOURCES, TAKEN, DAMAGE_TAGS, WIELD, TURN_FIELDS, ABILITY_WORD } from './dnd5e.system.mjs';

const DIE = { constant: 'lead_die' };

const P = {
  slot: {
    key: 'slot', label: 'Каким кругом', kind: 'number',
    ask: { by: 'actor', min: 1, max: 9, hint: 'Круг ячейки, которую тратишь. Не ниже круга заклинания.' },
  },
  level: { key: 'spell_level', label: 'Круг заклинания', kind: 'number' },
  saveBy: { key: 'save_by', label: 'Чем спасаются', kind: 'choice', from: 'abilities' },
  die: { key: 'damage_die', label: 'Кость урона', kind: 'dice' },
  count: { key: 'dice_count', label: 'Сколько костей', kind: 'number' },
  up: { key: 'dice_up', label: 'Костей за каждый круг выше', kind: 'number' },
  type: { key: 'damage_type', label: 'Тип урона', kind: 'choice', from: 'damage_types' },
  source: { key: 'damage_source', label: 'Источник урона', kind: 'choice', from: 'damage_source' },
  status: { key: 'status', label: 'Состояние', kind: 'effect' },
};

const LEVELED = '@dice_count + (@slot - @spell_level) * @dice_up';

const hit = bonus => ({
  id: 'hit', type: 'threshold', roll: { die: DIE, bonus, tags: ['атака'] }, versus: { tag: 'ac' },
});
const save = continueOn => ({
  id: 'save', type: 'threshold', side: 'target',
  roll: { die: DIE, bonus: { expr: '@получатель.save_by.save' }, tags: ['спасбросок', { param: 'save_by' }] },
  versus: { expr: '@spell_dc' }, successWhen: 'atLeast', continueOn,
});
const CRIT = '@hit.natural >= @crit_from ? 2 : 1';
const crit = { ref: 'hit.natural', atLeast: { tag: 'crit_from' } };
const SOURCES = ['магический', 'немагический'];
const damageArg = tag => {
  if (typeof tag !== 'string') return [tag.param === 'damage_source' ? 'damage_source' : 'damage_type', tag];
  if (SOURCES.includes(tag)) return ['damage_source', { const: tag }];
  if (DAMAGE_TAGS.includes(tag)) return ['damage_type', { const: tag }];
  throw new Error(`метка «${tag}» не из «Типов урона» и не из «Источника урона»`);
};
const damage = (amount, tags) => ({
  type: 'emit', event: 'damage', args: { amount, ...Object.fromEntries(tags.map(damageArg)) },
});
const spendSlot = circle => ({ type: 'emit', event: 'spell_slot', args: { circle }, strict: true });
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
  spendSlot({ param: 'slot' }),
];
const payFirstSlot = [spendSlot({ const: 1 })];
const payResource = (key, note, amount = { const: 1 }) => [
  { type: 'compare', value: { tag: `${key}_left` }, versus: amount, breakIf: 'less', note },
  change(`${key}_left`, 'subtract', amount),
];

const IN_BATTLE = { expr: '@стол.battle >= 1' };
const NEEDS_ACTION = { expr: 'все(@стол.battle >= 1, @turn_attacks < 1)' };
const payTurn = (tag, note) => [
  { type: 'compare', value: { tag }, versus: { const: 1 }, breakIf: 'less', note, when: IN_BATTLE },
  change(tag, 'subtract', { const: 1 }, { when: IN_BATTLE }),
];
const COSTS = {
  action: ['cost_action', 'Стоимость: действие', payTurn('turn_action', 'действие на этом ходу уже потрачено')],
  bonus: ['cost_bonus', 'Стоимость: бонусное действие', payTurn('turn_bonus', 'бонусное действие на этом ходу уже потрачено')],
  reaction: ['cost_reaction', 'Стоимость: реакция', payTurn('turn_reaction', 'реакция уже потрачена')],
  once: ['cost_once', 'Стоимость: раз за ход', payTurn('turn_once', 'это бывает раз за ход')],
  attack: ['cost_attack', 'Стоимость: атака', [
    { type: 'compare', value: { tag: 'turn_action' }, versus: { const: 1 }, breakIf: 'less', note: 'действие на этом ходу уже потрачено', when: NEEDS_ACTION },
    change('turn_action', 'subtract', { const: 1 }, { when: NEEDS_ACTION }),
    change('turn_attacks', 'set', { expr: '@attacks_per_action' }, { when: NEEDS_ACTION }),
    change('turn_attacks', 'subtract', { const: 1 }, { when: IN_BATTLE }),
  ]],
};
const COST = Object.fromEntries(Object.entries(COSTS).map(([kind, [id]]) => [kind, [{ type: 'emit', event: id, strict: true }]]));

function costs() {
  return Object.fromEntries(Object.values(COSTS).map(([id, label, steps]) => [id, {
    label, group: 'Стоимость', activation: 'manual',
    description: 'Списывается только в бою. Не хватило — действие не состоялось.',
    params: [], steps,
  }]));
}
const paid = (cost, self = []) => [...(COST[cost] ?? []), ...self];

const manual = (label, category, description, cost, rest = {}) => {
  const self = paid(cost, rest.self);
  return {
    label, group: category, description, activation: 'manual', params: [], steps: [], ...rest,
    ...(self.length ? { self } : {}),
  };
};
const passive = (label, description, modifiers, duration = { kind: 'permanent' }, extra = {}) => ({
  label, group: 'Состояния', description, activation: 'passive', duration, stacking: 'refresh', modifiers, ...extra,
});
const roll = (tags, edit, condition = null) => ({
  kind: 'roll', target: 'roll:any', ...(tags.length ? { tags } : {}), edit, condition,
});
const against = (tags, edit) => ({ kind: 'roll', target: 'incoming:roll:any', tags, edit, condition: null });
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

const REMEMBERED = 'или(@worn.carry, 0) > 0';
const repeatSave = (ability, self) => ({
  on: 'moment:turn-end', if: { expr: REMEMBERED },
  steps: [
    {
      id: 'save', type: 'threshold', roll: { die: DIE, bonus: { expr: `@${ability}_save` }, tags: ['спасбросок', ABILITY_WORD[ability]] },
      versus: { ref: 'worn.carry' }, successWhen: 'atLeast', continueOn: 'success',
    },
    drop(self),
  ],
});

const autoFailBody = [roll(['спасбросок', 'сила'], 'auto_fail'), roll(['спасбросок', 'ловкость'], 'auto_fail')];
const UNTIL_MY_TURN = { kind: 'turns', max: 1, ends: 'turn-start' };

function attacks() {
  return {
    strike: manual('Атака', 'Атака',
      'Бросок атаки против класса брони, урон костью. На крите кости урона удваиваются. Бонус атаки и прибавку к урону приносит тот, кто зовёт: оружие считает их по листу, существо вписывает числами. Посчитанное уходит в общий эффект «Урон».',
      'attack', {
        params: [
          { key: 'attack_with', label: 'Бонус атаки', kind: 'number' },
          { key: 'damage_with', label: 'Прибавка к урону', kind: 'number' },
          { key: 'damage_dice', label: 'Кость урона', kind: 'dice' },
          P.type,
          P.source,
        ],
        steps: [
          hit({ param: 'attack_with' }),
          { id: 'dmg', type: 'amount', source: 'roll', dice: { param: 'damage_dice' }, bonus: { param: 'damage_with' }, count: { expr: CRIT } },
          damage({ ref: 'dmg' }, [{ param: 'damage_type' }, { param: 'damage_source' }]),
        ],
      }),
    flame_blade: {
      label: 'Пламя клинка', group: 'Умения класса',
      description: 'Пока клинок горит, каждый удар им добавляет 2к6 огнём — отдельной частью, со своей меткой.',
      activation: 'passive', duration: { kind: 'permanent' },
      on: [{
        on: 'strike', role: 'sender', to: 'other',
        steps: [
          { id: 'жар', type: 'amount', source: 'item', fixed: { expr: "кинуть('2к6')" } },
          damage({ ref: 'жар' }, ['огонь', 'магический']),
        ],
      }],
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
        self: [spendSlot({ param: 'slot' })],
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
        value: { expr: `@${tag}.mult` }, stacking: 'sum', condition: null, tags: [damage],
      })),
    },
    spell: {
      label: 'Заклинание',
      group: 'Заклинания',
      description: 'Основа всех заклинаний: спрашивает круг ячейки и тратит её. Сама по себе не применяется.',
      params: infoParams,
      self: paid('action', paySlot),
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
      'Тратит ячейку. Провал спасброска вешает состояние; оно запоминает твою сложность, и повторный спасбросок в конце хода делает само. Без концентрации.', 'action', {
        extends: 'spell',
        params: [P.saveBy, P.status],
        steps: [
          save('fail'),
          hang({ param: 'status' }, { carry: { expr: '@spell_dc' } }),
        ],
      }),
    spell_condition_held: manual('Заклинание: спасбросок или состояние, с концентрацией', 'Заклинания',
      'То же, но держится твоей концентрацией: сорвалась или взялся за другое — состояние спало со всех целей.', 'action', {
        extends: 'spell',
        bond: 'concentration',
        params: [P.saveBy, P.status],
        steps: [
          save('fail'),
          hang({ param: 'status' }, { carry: { expr: '@spell_dc' } }),
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
      'Ещё одно действие в этом ходу.', 'free', {
        self: [...payResource('action_surge', 'всплеск действий уже потрачен'), change('turn_action', 'add', { const: 1 }, { when: IN_BATTLE })],
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
          ask: { by: 'actor', min: 1, max: 100, hint: 'Не больше, чем осталось в запасе.' },
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
            id: 'save', type: 'threshold', side: 'target', roll: { die: DIE, bonus: { expr: '@wis_save', of: 'target' }, tags: ['спасбросок', 'мудрость'] },
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
        { id: 'sneak', type: 'threshold', roll: { die: DIE, bonus: { expr: '@stealth' }, tags: ['проверка', 'ловкость', 'скрытность'] },
          versus: { tag: 'passive_perception' }, successWhen: 'atLeast', continueOn: 'success' },
        { type: 'status', mode: 'apply', effect: { const: 'hidden' }, side: 'source' },
      ],
    }),
    hidden: passive('Прячется', 'Тебя не видят: атаки по цели, которая тебя не видит, идут с преимуществом.',
      [roll(['атака'], 'advantage')], { kind: 'turns', max: 1, ends: 'turn-start' }),
    help: manual('Помощь', 'Действия в бою', 'Союзник бросает следующую проверку или атаку с преимуществом.', 'action', {
      steps: [hang({ const: 'helped' })],
    }),
    helped: passive('Ему помогают', 'Следующая проверка или атака — с преимуществом.',
      [roll(['атака'], 'advantage'), roll(['проверка'], 'advantage')],
      { kind: 'turns', max: 1, ends: 'turn-start', whose: 'source' }),
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
  const reaction = (label, description, when, { free, steps = [], self: own, ...rest }) => {
    const self = free ? own ?? [] : paid('reaction', own);
    return {
      label, group: 'Реакции', description, activation: 'passive',
      duration: { kind: 'permanent' }, params: [], ...rest,
      on: [{ ...when, ask: true, ...(self.length ? { self } : {}), steps }],
    };
  };
  return {
    shield: reaction('Щит', 'По тебе попали — тратишь ячейку 1-го круга, +5 к классу брони до начала твоего хода. Атака пересчитывается.',
      { on: '*', phase: 'before', if: { ref: 'hit.success' } },
      { self: payFirstSlot, steps: [hang({ const: 'shield_up' })] }),
    hellish_rebuke: reaction('Адское возмездие', 'Тебя ранили — тратишь ячейку 1-го круга: обидчик спасается Ловкостью, провал — 2к10 огнём, успех — половина.',
      { on: 'event:damage', to: 'other' },
      {
        self: payFirstSlot,
        steps: [
          {
            id: 'save', type: 'threshold', side: 'target', roll: { die: DIE, bonus: { expr: '@dex_save', of: 'target' }, tags: ['спасбросок', 'ловкость'] },
            versus: { expr: '@spell_dc' }, successWhen: 'atLeast', continueOn: 'always',
          },
          { id: 'dmg', type: 'amount', source: 'roll', dice: { const: '2d10' }, scale: { times: 0.5, when: { ref: 'save.success' } } },
          damage({ ref: 'dmg' }, ['огонь', 'магический']),
        ],
      }),
    uncanny_dodge: reaction('Невероятное уклонение', 'По тебе попали — урон этой атаки вдвое меньше.',
      { on: '*', phase: 'before', if: { ref: 'hit.success' } },
      { steps: [hang({ const: 'uncanny_up' })] }),
    inspire: reaction('Вдохновение: перебросить с преимуществом', 'Увидел свой бросок — тратишь вдохновение, к выпавшему добавляется вторая кость, берётся лучшая.',
      { on: '*', role: 'sender', phase: 'before', claims: ['advantage'] },
      {
        free: true,
        self: [
          { type: 'compare', value: { tag: 'inspiration' }, versus: { const: 1 }, breakIf: 'less', note: 'вдохновения нет' },
          change('inspiration', 'subtract', { const: 1 }),
        ],
      }),
    lucky_point: reaction('Везунчик: очко удачи', 'Увидел свой бросок — тратишь очко удачи, кидаешь ещё одну кость и берёшь лучшую.',
      { on: '*', role: 'sender', phase: 'before', claims: ['advantage'] },
      { free: true, self: payResource('luck', 'очки удачи кончились') }),
    bardic_ready: reaction('Кость вдохновения наготове', 'Увидел свой бросок — прибавляешь кость вдохновения. Один раз.',
      { on: '*', role: 'sender', phase: 'before', claims: ['bardic'] },
      { free: true, duration: { kind: 'uses', max: 1 } }),
  };
}

function conditions() {
  const incomingAdvantage = against(['атака'], 'advantage');
  const incomingDisadvantage = against(['атака'], 'disadvantage');
  return {
    blinded: passive('Ослеплён', 'Твои атаки с помехой, по тебе — с преимуществом. Наложенное заклинанием: в конце хода — спасбросок Телосложения против запомненной сложности.',
      [roll(['атака'], 'disadvantage'), incomingAdvantage], undefined, { on: [repeatSave('con', 'blinded')] }),
    charmed: passive('Очарован', 'Не можешь вредить очаровавшему; у него преимущество на общение с тобой. Считает ведущий.', []),
    deafened: passive('Оглушён', 'Не слышишь. Проверки на слух проваливаются — считает ведущий.', []),
    frightened: passive('Испуган', 'Помеха на атаки и проверки, пока источник страха на виду. Наложенное заклинанием: в конце хода — спасбросок Мудрости против запомненной сложности.',
      [roll(['атака'], 'disadvantage'), roll(['проверка'], 'disadvantage')], undefined, { on: [repeatSave('wis', 'frightened')] }),
    grappled: passive('Схвачен', 'Скорость ноль.', [value('speed', 'set', 0)]),
    incapacitated: passive('Недееспособен', 'Ни действий, ни реакций, концентрация прерывается. Действия запрещает ведущий.', [],
      undefined, { attach: [drop('concentration')] }),
    invisible: passive('Невидим', 'Твои атаки с преимуществом, по тебе — с помехой.',
      [roll(['атака'], 'advantage'), incomingDisadvantage]),
    paralyzed: passive('Парализован', 'Недееспособен, скорость ноль, спасброски Силы и Ловкости провалены, по тебе бьют с преимуществом. Наложенное заклинанием: в конце хода — спасбросок Мудрости против запомненной сложности.',
      [incomingAdvantage, ...autoFailBody, value('speed', 'set', 0)], undefined, { grants: ['incapacitated'], on: [repeatSave('wis', 'paralyzed')] }),
    petrified: passive('Окаменел', 'Как паралич, плюс сопротивление любому урону.',
      [incomingAdvantage, ...autoFailBody, value('speed', 'set', 0), resist()], undefined, { grants: ['incapacitated'] }),
    poisoned: passive('Отравлен', 'Помеха на атаки и проверки характеристик.',
      [roll(['атака'], 'disadvantage'), roll(['проверка'], 'disadvantage')]),
    prone: passive('Лежит', 'Твои атаки с помехой, по тебе вблизи бьют с преимуществом. Встать — половина скорости.',
      [incomingAdvantage, roll(['атака'], 'disadvantage')]),
    restrained: passive('Опутан', 'Скорость ноль, твои атаки и спасброски Ловкости с помехой, по тебе — с преимуществом. Наложенное заклинанием: в конце хода — спасбросок Силы против запомненной сложности.',
      [value('speed', 'set', 0), roll(['атака'], 'disadvantage'), incomingAdvantage, roll(['спасбросок', 'ловкость'], 'disadvantage')], undefined, { on: [repeatSave('str', 'restrained')] }),
    stunned: passive('Ошеломлён', 'Недееспособен, спасброски Силы и Ловкости провалены, по тебе бьют с преимуществом.',
      [incomingAdvantage, ...autoFailBody], undefined, { grants: ['incapacitated'] }),
    unconscious: passive('Без сознания', 'Недееспособен и лежит, роняет всё, что держал. Очнулся — остаётся лежать.',
      [incomingAdvantage, ...autoFailBody, value('speed', 'set', 0)], undefined, { grants: ['incapacitated'], attach: [hang({ const: 'prone' })] }),
    stable: passive('Стабилен', 'Ноль хитов, но спасброски от смерти больше не нужны.',
      [value('death_ok', 'set', 3)], { kind: 'permanent' }),
    dead: passive('Мёртв', 'Три провала или урон, перекрывший максимум хитов.', [value('speed', 'set', 0)], { kind: 'permanent' }),

    dodging: passive('Уклоняется', 'По тебе бьют с помехой, спасброски Ловкости с преимуществом.',
      [incomingDisadvantage, roll(['спасбросок', 'ловкость'], 'advantage')], UNTIL_MY_TURN),
    reckless: passive('Безрассуден', 'Твои атаки с преимуществом, по тебе — тоже.',
      [roll(['атака'], 'advantage'), incomingAdvantage], UNTIL_MY_TURN),
    raging: passive('В ярости', 'Урон рукопашным оружием выше, сопротивление рубящему, колющему и дробящему, преимущество на Силу.',
      [
        value(`cell:wield.${WIELD.melee}.damage`, 'add', { expr: '@rage_damage' }),
        resistNature('физический'),
        roll(['сила'], 'advantage'),
      ], { kind: 'rounds', max: 10 }),
    shield_up: passive('Под щитом', '+5 к классу брони.', [value('ac', 'add', 5)], UNTIL_MY_TURN),
    uncanny_up: passive('Невероятное уклонение', 'Урон этой атаки вдвое меньше; после удара спадает само.', [value('event:damage', 'mul', 0.5)],
      undefined, { on: [{ on: 'event:damage', steps: [drop('uncanny_up')] }] }),
    blessed: passive('Благословлён', '+1к4 к броскам атаки и спасброскам. Кость сверх: преимущество её не отбрасывает.',
      [roll(['атака'], 'bless'), roll(['спасбросок'], 'bless')], { kind: 'permanent' }),
    baned: passive('Под порчей', '−1к4 к броскам атаки и спасброскам.',
      [roll(['атака'], 'bane'), roll(['спасбросок'], 'bane')], { kind: 'permanent' }),
    guided: passive('Указание', '+1к4 к одной проверке характеристики.', [roll(['проверка'], 'guidance')], { kind: 'permanent' }),
    resisted: passive('Сопротивление', '+1к4 к одному спасброску.', [roll(['спасбросок'], 'guidance')], { kind: 'permanent' }),
    hasted: passive('Ускорен', '+2 к классу брони, скорость вдвое, преимущество на спасброски Ловкости. Лишнее действие разрешает ведущий.',
      [value('ac', 'add', 2), value('speed', 'mul', 2), roll(['спасбросок', 'ловкость'], 'advantage')], { kind: 'permanent' }),
    slowed: passive('Замедлен', '−2 к классу брони и спасброскам Ловкости, скорость вдвое меньше. Наложенное заклинанием: в конце хода — спасбросок Мудрости против запомненной сложности.',
      [value('ac', 'add', -2), value('speed', 'mul', 0.5), { kind: 'roll', target: 'roll:any', tags: ['спасбросок', 'ловкость'], op: 'add', value: -2, condition: null }],
      { kind: 'permanent' }, { on: [repeatSave('wis', 'slowed')] }),
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
    style_dueling: trait('Боевой стиль: дуэлянт', '+2 к урону одноручным оружием.', [value(`cell:wield.${WIELD.melee}.damage`, 'add', 2), value(`cell:wield.${WIELD.finesse}.damage`, 'add', 2)]),
    style_archery: trait('Боевой стиль: стрельба', '+2 к атаке дальнобойным оружием.', [value(`cell:wield.${WIELD.ranged}.attack`, 'add', 2)]),
    unarmored_barbarian: trait('Защита без доспехов: варвар', 'Без доспеха база 10 + Телосложение.',
      [{ ...value('ac_base', 'set', { expr: '10 + @con_mod' }), stacking: 'max' }]),
    unarmored_monk: trait('Защита без доспехов: монах', 'Без доспеха и щита база 10 + Мудрость.',
      [{ ...value('ac_base', 'set', { expr: '10 + @wis_mod' }), stacking: 'max' }]),
    danger_sense: trait('Чувство опасности', 'Преимущество на спасброски Ловкости.', [roll(['спасбросок', 'ловкость'], 'advantage')]),
    feral_instinct: trait('Дикий инстинкт', 'Преимущество на инициативу.', [roll(['инициатива'], 'advantage')]),
    reliable_talent: trait('Надёжный талант', 'На проверках навыков кость считается не меньше десяти.', [roll(['проверка'], 'reliable')]),
    halfling_lucky: trait('Везучий', 'Единица на к20 перебрасывается, новый результат обязателен.', [roll([], 'lucky')]),
    darkvision_60: trait('Тёмное зрение', 'Видишь в темноте на 60 футов.', [value('darkvision', 'set', 60)]),
    dwarven_resilience: trait('Дварфская стойкость', 'Сопротивление урону ядом.', [resist(['яд'])]),
    infernal_legacy: trait('Дьявольское наследие', 'Сопротивление урону огнём.', [resist(['огонь'])]),
    feat_alert: trait('Черта: бдительный', '+5 к инициативе.', [value('initiative', 'add', 5)]),
    feat_tough: trait('Черта: крепкий', 'Максимум хитов выше на два за уровень.', [value('hp_max', 'add', { expr: '2 * @level' })]),
    feat_mobile: trait('Черта: подвижный', 'Скорость выше на 10 футов.', [value('speed', 'add', 10)]),
    feat_observant: trait('Черта: наблюдательный', '+5 к пассивной внимательности.', [value('passive_perception', 'add', 5)]),
    feat_war_caster: trait('Черта: боевой заклинатель', 'Преимущество на спасброски Телосложения — ими держат концентрацию.', [roll(['спасбросок', 'телосложение'], 'advantage')]),
    ring_protection: trait('Кольцо защиты', '+1 к классу брони и всем спасброскам.',
      [value('ac', 'add', 1), { kind: 'roll', target: 'roll:any', tags: ['спасбросок'], op: 'add', value: 1, condition: null }]),
  };
}

function lifecycle() {
  const auto = (label, description, when, steps, rest = {}) => ({
    label, group: 'Отдых и смерть', description, activation: 'passive', duration: { kind: 'permanent' },
    params: [], on: [{ ...when, steps }], ...rest,
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


  return {
    concentration: auto('Концентрация',
      'Висит на том, кто держит заклинание. Получил урон — спасбросок Телосложения против 10 или половины урона; провал срывает всё, что держал.',
      { on: 'event:damage' },
      [
        {
          id: 'save', type: 'threshold', roll: { die: DIE, bonus: { expr: '@con_save' }, tags: ['спасбросок', 'телосложение'] },
          versus: { expr: 'max(10, floor(@event_amount / 2))' }, successWhen: 'atLeast', continueOn: 'fail',
        },
        drop('concentration'),
      ], { group: 'Заклинания', duration: { kind: 'permanent' } }),
    dying: auto('При смерти',
      'На нуле хитов: в начале своего хода к20. Десять и выше — успех, иначе провал; единица — два провала, двадцатка — один хит и на ноги.',
      { on: 'moment:turn-start', if: { expr: '@hp_current <= 0' } },
      [
        { id: 'спас', type: 'threshold', roll: { die: DIE, tags: ['спасбросок'] }, versus: { const: 10 }, successWhen: 'atLeast', continueOn: 'always' },
        change('death_ok', 'add', { const: 1 }, { when: { ref: 'спас.success' } }),
        change('death_fail', 'add', { const: 1 }, { when: { ref: 'спас.success', not: true } }),
        change('death_fail', 'add', { const: 1 }, { when: { ref: 'спас.natural', atMost: 1 } }),
        change('hp_current', 'set', { const: 1 }, { when: { ref: 'спас.natural', atLeast: 20 } }),
      ], { group: 'Состояния', duration: { kind: 'permanent' } }),
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
  };
}

function roomRules() {
  const when = (level, modifier) => ({ ...modifier, condition: `@exhaustion >= ${level}` });
  const refresh = [
    ...TURN_FIELDS.map(([tag]) => change(tag, 'set', { const: 1 })),
    change('turn_attacks', 'set', { const: 0 }),
  ];
  const onMoment = (label, description, moment, steps) => ({
    label, group: 'Правила комнаты', description, activation: 'passive', duration: { kind: 'permanent' },
    params: [], on: [{ on: `moment:${moment}`, steps }],
  });
  return {
    battle_start: onMoment('Начало боя', 'Бой пошёл: стоимость действий считается, у всех полный запас.', 'combat-start',
      [change('battle', 'set', { const: 1 }), ...refresh]),
    battle_end: onMoment('Конец боя', 'Вне боя действия не считаются.', 'combat-end', [change('battle', 'set', { const: 0 })]),
    turn_refresh: onMoment('Начало хода', 'Действие, бонусное, реакция и «раз за ход» — снова по одному.', 'turn-start', refresh),
    exhaustion_rule: {
      label: 'Истощение', group: 'Правила комнаты', activation: 'passive', duration: { kind: 'permanent' },
      description: 'Шесть ступеней: помеха на проверки, скорость вдвое меньше, помеха на атаки и спасброски, максимум хитов вдвое меньше, скорость ноль. Шестая — смерть, её объявляет ведущий.',
      modifiers: [
        when(1, roll(['проверка'], 'disadvantage')),
        when(2, value('speed', 'mul', 0.5)),
        when(3, roll(['атака'], 'disadvantage')),
        when(3, roll(['спасбросок'], 'disadvantage')),
        when(4, value('hp_max', 'mul', 0.5)),
        when(5, value('speed', 'set', 0)),
      ],
    },
  };
}

export function effects() {
  return {
    ...attacks(), ...spells(), ...features(), ...reactions(), ...conditions(), ...traits(), ...lifecycle(), ...roomRules(), ...costs(),
  };
}

export const ROOM_RULES = [
  'battle_start', 'battle_end', 'turn_refresh', 'taken_rule', 'exhaustion_rule', 'long_rest', 'short_rest',
];

export const DEATH_RULES = ['fall', 'wake', 'death_now', 'stabilize'];
