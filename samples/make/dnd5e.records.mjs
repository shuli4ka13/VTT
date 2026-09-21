const prop = (key, label, kind, extra = {}) => ({ key, label, kind, ...extra });
const bind = (label, effect, args) => ({ label, effect, args });
const ref = key => ({ prop: key });
const maybe = key => ({ prop: key, optional: true });

const DAMAGE = prop('damage_type', 'Тип урона', 'text');
const DICE = prop('damage_dice', 'Кость урона', 'dice');
const LEVEL = prop('spell_level', 'Круг', 'number');
const SAVE_BY = prop('save_by', 'Чем спасаются', 'expr');
const STATUS = prop('status', 'Состояние', 'effect');
const COUNT = prop('dice_count', 'Сколько костей', 'number');
const UP = prop('dice_up', 'Костей за круг выше', 'number');
const SPELL_DIE = prop('damage_die', 'Кость урона', 'dice');

const spellArgs = extra => ({
  spell_level: ref('spell_level'), ...extra,
});

export function records() {
  return {
    weapon: {
      kind: 'item', label: 'Оружие', icon: '⚔', group: 'Снаряжение',
      hint: 'Меч, рапира, лук — всё сразу. Кость и тип урона свои, а чем бьют выбирается свойством.',
      props: [
        DICE, DAMAGE,
        prop('wield', 'Чем бьют', 'choice', { from: 'wield' }),
        prop('range', 'Дистанция', 'text', { optional: true }),
      ],
      bindings: [bind('Удар', 'strike', {
        damage_dice: ref('damage_dice'), damage_type: ref('damage_type'),
        attack_with: { table: 'wield_attack', by: { prop: 'wield' } },
        damage_with: { table: 'wield_damage', by: { prop: 'wield' } },
      })],
    },
    armor: {
      kind: 'item', label: 'Доспех', icon: '🛡', group: 'Снаряжение',
      hint: 'Задаёт базу класса брони. У тяжёлого Ловкость не прибавляется.',
      props: [prop('ac', 'База класса брони', 'number'), prop('heavy', 'Тяжёлый', 'text', { onSheet: false })],
    },
    shield: {
      kind: 'item', label: 'Щит', icon: '🔰', group: 'Снаряжение',
      hint: 'Прибавка к классу брони, пока надет.',
      props: [prop('bonus', 'Прибавка к классу брони', 'number')],
    },
    wondrous: {
      kind: 'item', label: 'Чудесная вещь', icon: '💍', group: 'Снаряжение',
      hint: 'Кольцо, плащ, амулет: даёт эффект или правит поля, пока надета.',
      props: [prop('attunement', 'Требует настройки', 'text')],
    },
    potion: {
      kind: 'item', label: 'Зелье', icon: '🧪', group: 'Расходники',
      hint: 'Выпил — восполнил хиты. Стол списывает хиты, склянку убирает игрок.',
      props: [prop('heal_die', 'Кости лечения', 'dice'), prop('heal_bonus', 'Прибавка', 'number')],
      bindings: [bind('Выпить', 'potion_heal', { heal_die: ref('heal_die'), heal_bonus: ref('heal_bonus') })],
    },
    gear: {
      kind: 'item', label: 'Снаряжение', icon: '⬡', group: 'Снаряжение',
      hint: 'Верёвка, факел, набор инструментов. Ничего не считает — лежит на листе.',
      props: [prop('weight', 'Вес, фунтов', 'number'), prop('cost', 'Цена, зм', 'number')],
    },

    cantrip_attack: {
      kind: 'action', label: 'Заговор с броском атаки', icon: '✨', group: 'Заклинания',
      hint: 'Огненный снаряд, укус холода: бросок атаки заклинанием, кости растут с уровнем.',
      props: [SPELL_DIE, DAMAGE],
      bindings: [bind('Сотворить', 'cantrip_attack', { damage_die: ref('damage_die'), damage_type: ref('damage_type') })],
    },
    cantrip_save: {
      kind: 'action', label: 'Заговор со спасброском', icon: '✨', group: 'Заклинания',
      hint: 'Брызги яда, священное пламя: цель спасается, провал — урон.',
      props: [SPELL_DIE, DAMAGE, SAVE_BY, STATUS],
      bindings: [bind('Сотворить', 'cantrip_save', {
        damage_die: ref('damage_die'), damage_type: ref('damage_type'),
        save_by: ref('save_by'), status: maybe('status'),
      })],
    },
    cantrip_note: {
      kind: 'action', label: 'Заговор без броска', icon: '✨', group: 'Заклинания',
      hint: 'Свет, волшебная рука, фокусы: стол пишет строку, остальное решает ведущий.',
      props: [],
      bindings: [bind('Сотворить', 'cantrip_note', {})],
    },
    spell_attack: {
      kind: 'action', label: 'Заклинание с броском атаки', icon: '🔮', group: 'Заклинания',
      hint: 'Огненный луч, палящий луч: бросок атаки заклинанием, ячейка выше круга добавляет кости.',
      props: [LEVEL, SPELL_DIE, COUNT, UP, DAMAGE, STATUS],
      bindings: [bind('Сотворить', 'spell_attack', spellArgs({
        damage_die: ref('damage_die'), dice_count: ref('dice_count'), dice_up: ref('dice_up'),
        damage_type: ref('damage_type'), status: maybe('status'),
      }))],
    },
    spell_save_half: {
      kind: 'action', label: 'Заклинание: спасбросок, половина при успехе', icon: '💥', group: 'Заклинания',
      hint: 'Огненный шар, молния: кости бросаются один раз на всех, спасбросок у каждого свой.',
      props: [LEVEL, SAVE_BY, SPELL_DIE, COUNT, UP, DAMAGE],
      bindings: [bind('Сотворить', 'spell_save_half', spellArgs({
        save_by: ref('save_by'), damage_die: ref('damage_die'),
        dice_count: ref('dice_count'), dice_up: ref('dice_up'), damage_type: ref('damage_type'),
      }))],
    },
    spell_save_none: {
      kind: 'action', label: 'Заклинание: спасбросок, при успехе ничего', icon: '☄', group: 'Заклинания',
      hint: 'Град, ядовитое облако: провал — урон и состояние, успех — ничего.',
      props: [LEVEL, SAVE_BY, SPELL_DIE, COUNT, UP, DAMAGE, STATUS],
      bindings: [bind('Сотворить', 'spell_save_none', spellArgs({
        save_by: ref('save_by'), damage_die: ref('damage_die'),
        dice_count: ref('dice_count'), dice_up: ref('dice_up'),
        damage_type: ref('damage_type'), status: maybe('status'),
      }))],
    },
    spell_auto: {
      kind: 'action', label: 'Заклинание без броска', icon: '🎯', group: 'Заклинания',
      hint: 'Волшебная стрела: попадает всегда, к каждой кости своя прибавка.',
      props: [LEVEL, SPELL_DIE, COUNT, UP, prop('per_die', 'Прибавка к каждой кости', 'number'), DAMAGE],
      bindings: [bind('Сотворить', 'spell_auto', spellArgs({
        damage_die: ref('damage_die'), dice_count: ref('dice_count'), dice_up: ref('dice_up'),
        per_die: ref('per_die'), damage_type: ref('damage_type'),
      }))],
    },
    spell_condition: {
      kind: 'action', label: 'Заклинание: состояние', icon: '🌀', group: 'Заклинания',
      hint: 'Удержание личности, страх: провал спасброска вешает состояние. Держится концентрацией, если выбрано.',
      props: [LEVEL, SAVE_BY, STATUS, prop('repeat', 'Повторный спасбросок', 'effect'),
        prop('holds', 'Держится концентрацией', 'text', { onSheet: false })],
      bindings: [
        bind('Сотворить', 'spell_condition_held', spellArgs({
          save_by: ref('save_by'), status: maybe('status'), repeat: maybe('repeat'),
        })),
      ],
    },
    spell_buff: {
      kind: 'action', label: 'Заклинание: усиление', icon: '🕊', group: 'Заклинания',
      hint: 'Благословение, ускорение, доспех мага: вешает эффект на цели.',
      props: [LEVEL, STATUS, prop('holds', 'Держится концентрацией', 'text', { onSheet: false })],
      bindings: [bind('Сотворить', 'spell_buff_held', spellArgs({ status: maybe('status') }))],
    },
    spell_buff_free: {
      kind: 'action', label: 'Заклинание: усиление без концентрации', icon: '🕊', group: 'Заклинания',
      hint: 'Доспех мага, ложная жизнь: висит само, концентрация не нужна.',
      props: [LEVEL, STATUS],
      bindings: [bind('Сотворить', 'spell_buff', spellArgs({ status: maybe('status') }))],
    },
    spell_heal: {
      kind: 'action', label: 'Заклинание: лечение', icon: '✚', group: 'Заклинания',
      hint: 'Лечение ран, слово лечения: кости плюс заклинательный модификатор.',
      props: [LEVEL, prop('heal_die', 'Кость лечения', 'dice'), COUNT, UP, prop('cure', 'Что снимает', 'effect')],
      bindings: [bind('Сотворить', 'spell_heal', spellArgs({
        heal_die: ref('heal_die'), dice_count: ref('dice_count'), dice_up: ref('dice_up'), cure: maybe('cure'),
      }))],
    },
    spell_cleanse: {
      kind: 'action', label: 'Заклинание: снять состояние', icon: '🩹', group: 'Заклинания',
      hint: 'Малое восстановление, снятие проклятия.',
      props: [LEVEL, prop('cure', 'Что снимает', 'effect')],
      bindings: [bind('Сотворить', 'spell_cleanse', spellArgs({ cure: maybe('cure') }))],
    },
    spell_note: {
      kind: 'action', label: 'Заклинание без расчёта', icon: '📜', group: 'Заклинания',
      hint: 'Туманный шаг, полёт, обнаружение магии: тратит ячейку и пишет строку в журнал.',
      props: [LEVEL],
      bindings: [bind('Сотворить', 'spell_note', spellArgs({}))],
    },

    feature: {
      kind: 'action', label: 'Умение класса', icon: '🏅', group: 'Умения и черты',
      hint: 'Второе дыхание, ярость, наложение рук: кнопка на листе, ресурс тратится сам.',
      props: [prop('source', 'Откуда', 'text')],
    },
    trait: {
      kind: 'action', label: 'Черта или особенность', icon: '✦', group: 'Умения и черты',
      hint: 'Дополнительная атака, тёмное зрение, боевой стиль: висит и правит цифры, кнопки не даёт.',
      props: [prop('source', 'Откуда', 'text')],
    },
    action_basic: {
      kind: 'action', label: 'Действие в бою', icon: '◆', group: 'Действия в бою',
      hint: 'Уклонение, рывок, отход, засада, помощь.',
      props: [],
    },
    monster_attack: {
      kind: 'action', label: 'Атака существа', icon: '🐺', group: 'Бестиарий',
      hint: 'Для НПС: бонус атаки и прибавка к урону вписаны числами.',
      props: [prop('to_hit', 'Бонус атаки', 'number'), DICE, prop('damage_bonus', 'Прибавка к урону', 'number'), DAMAGE],
      bindings: [bind('Атаковать', 'monster_attack', {
        to_hit: ref('to_hit'), damage_dice: ref('damage_dice'),
        damage_bonus: ref('damage_bonus'), damage_type: ref('damage_type'),
      })],
    },
  };
}
