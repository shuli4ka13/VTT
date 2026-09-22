const item = (id, rk, label, description, props, extra = {}) => ({ id, rk, label, description, props, ...extra });
const set = (target, amount, stacking = 'override') => ({ kind: 'value', target, op: 'set', value: amount, stacking, condition: null });
const add = (target, amount) => ({ kind: 'value', target, op: 'add', value: amount, stacking: 'sum', condition: null });

function weapons() {
  const melee = (id, label, dice, type, text) => item(id, 'weapon', label, text, { damage_dice: dice, damage_type: type, wield: 'melee' });
  const finesse = (id, label, dice, type, text) => item(id, 'weapon', label, text, { damage_dice: dice, damage_type: type, wield: 'finesse' });
  const ranged = (id, label, dice, type, range, text) => item(id, 'weapon', label, text, { damage_dice: dice, damage_type: type, wield: 'ranged', range });
  return [
    melee('club', 'Дубинка', '1d4', 'дробящий', 'Простое оружие, лёгкое.'),
    melee('greatclub', 'Палица', '1d8', 'дробящий', 'Простое оружие, двуручное.'),
    melee('handaxe', 'Ручной топор', '1d6', 'рубящий', 'Простое оружие, лёгкое, метательное.'),
    melee('spear', 'Копьё', '1d6', 'колющий', 'Простое оружие, универсальное: двумя руками 1к8.'),
    melee('mace', 'Булава', '1d6', 'дробящий', 'Простое оружие.'),
    melee('quarterstaff', 'Боевой посох', '1d6', 'дробящий', 'Простое оружие, универсальное: двумя руками 1к8.'),
    melee('longsword', 'Длинный меч', '1d8', 'рубящий', 'Воинское оружие, универсальное: двумя руками 1к10.'),
    melee('battleaxe', 'Боевой топор', '1d8', 'рубящий', 'Воинское оружие, универсальное.'),
    melee('warhammer', 'Боевой молот', '1d8', 'дробящий', 'Воинское оружие, универсальное.'),
    melee('greatsword', 'Двуручный меч', '2d6', 'рубящий', 'Воинское оружие, двуручное, тяжёлое.'),
    melee('greataxe', 'Секира', '1d12', 'рубящий', 'Воинское оружие, двуручное, тяжёлое.'),
    melee('maul', 'Молот', '2d6', 'дробящий', 'Воинское оружие, двуручное, тяжёлое.'),
    melee('halberd', 'Алебарда', '1d10', 'рубящий', 'Воинское оружие, досягаемость, тяжёлое.'),
    melee('glaive', 'Глефа', '1d10', 'рубящий', 'Воинское оружие, досягаемость, тяжёлое.'),
    finesse('dagger', 'Кинжал', '1d4', 'колющий', 'Простое оружие, фехтовальное, лёгкое, метательное.'),
    finesse('shortsword', 'Короткий меч', '1d6', 'колющий', 'Воинское оружие, фехтовальное, лёгкое.'),
    finesse('rapier', 'Рапира', '1d8', 'колющий', 'Воинское оружие, фехтовальное.'),
    finesse('scimitar', 'Скимитар', '1d6', 'рубящий', 'Воинское оружие, фехтовальное, лёгкое.'),
    finesse('whip', 'Кнут', '1d4', 'рубящий', 'Воинское оружие, фехтовальное, досягаемость.'),
    ranged('shortbow', 'Короткий лук', '1d6', 'колющий', '80/320', 'Простое оружие, двуручное.'),
    ranged('longbow', 'Длинный лук', '1d8', 'колющий', '150/600', 'Воинское оружие, двуручное, тяжёлое.'),
    ranged('light_crossbow', 'Лёгкий арбалет', '1d8', 'колющий', '80/320', 'Простое оружие, перезарядка.'),
    ranged('heavy_crossbow', 'Тяжёлый арбалет', '1d10', 'колющий', '100/400', 'Воинское оружие, тяжёлое, перезарядка.'),
    ranged('hand_crossbow', 'Ручной арбалет', '1d6', 'колющий', '30/120', 'Воинское оружие, лёгкое, перезарядка.'),
    ranged('sling', 'Праща', '1d4', 'дробящий', '30/120', 'Простое оружие.'),
    ranged('dart', 'Дротик', '1d4', 'колющий', '20/60', 'Простое оружие, фехтовальное, метательное.'),
    {
      ...melee('flame_tongue', 'Огненный язык', '1d8', 'рубящий', 'Длинный меч: пока горит, каждый удар добавляет 2к6 огнём.'),
      grants: ['flame_blade'],
    },
    { ...melee('magic_sword_1', 'Длинный меч +1', '1d8', 'рубящий', 'Оружие с бонусом к атаке и урону.'),
      modifiers: [add('cell:wield.*.attack', 1), add('cell:wield.*.damage', 1)] },
  ];
}

function armours() {
  const armour = (id, label, ac, heavy, text) => ({
    ...item(id, 'armor', label, text, { ac, heavy: heavy ? 'да' : 'нет' }),
    modifiers: heavy ? [set('ac_base', ac), set('armor_heavy', true)] : [set('ac_base', ac)],
  });
  return [
    armour('padded', 'Стёганый доспех', 11, false, 'Лёгкий доспех. Помеха на Скрытность.'),
    armour('leather', 'Кожаный доспех', 11, false, 'Лёгкий доспех.'),
    armour('studded_leather', 'Проклёпанная кожа', 12, false, 'Лёгкий доспех.'),
    armour('hide', 'Шкурный доспех', 12, false, 'Средний доспех.'),
    armour('chain_shirt', 'Кольчужная рубаха', 13, false, 'Средний доспех.'),
    armour('scale_mail', 'Чешуйчатый доспех', 14, false, 'Средний доспех. Помеха на Скрытность.'),
    armour('breastplate', 'Кираса', 14, false, 'Средний доспех.'),
    armour('half_plate', 'Полулаты', 15, false, 'Средний доспех. Помеха на Скрытность.'),
    armour('ring_mail', 'Колечный доспех', 14, true, 'Тяжёлый доспех. Ловкость не прибавляется.'),
    armour('chain_mail', 'Кольчуга', 16, true, 'Тяжёлый доспех. Нужна Сила 13, помеха на Скрытность.'),
    armour('splint', 'Наборный доспех', 17, true, 'Тяжёлый доспех. Нужна Сила 15, помеха на Скрытность.'),
    armour('plate', 'Латы', 18, true, 'Тяжёлый доспех. Нужна Сила 15, помеха на Скрытность.'),
    { ...item('shield_item', 'shield', 'Щит', 'Надет в одной руке: +2 к классу брони.', { bonus: 2 }),
      modifiers: [add('ac', 2)] },
  ];
}

function wondrous() {
  const thing = (id, label, text, modifiers, grants, attunement = 'да') => ({
    ...item(id, 'wondrous', label, text, { attunement }),
    ...(modifiers ? { modifiers } : {}),
    ...(grants ? { grants } : {}),
  });
  return [
    thing('ring_protection', 'Кольцо защиты', '+1 к классу брони и всем спасброскам.', null, ['ring_protection']),
    thing('cloak_protection', 'Плащ защиты', '+1 к классу брони и всем спасброскам.', [add('ac', 1)], null),
    thing('amulet_health', 'Амулет здоровья', 'Телосложение становится 19.', [set('con', 19)], null),
    thing('belt_giant', 'Пояс силы холмового великана', 'Сила становится 21.', [set('str', 21)], null),
    thing('boots_speed', 'Сапоги скорости', 'Скорость вдвое больше.', [{ kind: 'value', target: 'speed', op: 'mul', value: 2, stacking: 'sum', condition: null }], null),
    thing('ring_fire', 'Кольцо сопротивления огню', 'Сопротивление урону огнём.', null, ['fire_resistance']),
    thing('goggles_night', 'Очки ночи', 'Тёмное зрение на 60 футов.', [set('darkvision', 60, 'max')], null, 'нет'),
    thing('bracers_defense', 'Наручи защиты', '+2 к классу брони без доспеха и щита.', [add('ac', 2)], null),
  ];
}

function potions() {
  const potion = (id, label, die, bonus, text) => item(id, 'potion', label, text, { heal_die: die, heal_bonus: bonus });
  return [
    potion('potion_healing', 'Зелье лечения', '2d4', 2, 'Восполняет 2к4 + 2 хитов.'),
    potion('potion_greater', 'Большое зелье лечения', '4d4', 4, 'Восполняет 4к4 + 4 хитов.'),
    potion('potion_superior', 'Отличное зелье лечения', '8d4', 8, 'Восполняет 8к4 + 8 хитов.'),
    potion('potion_supreme', 'Превосходное зелье лечения', '10d4', 20, 'Восполняет 10к4 + 20 хитов.'),
  ];
}

function gear() {
  const thing = (id, label, weight, cost, text) => item(id, 'gear', label, text, { weight, cost });
  return [
    thing('rope', 'Верёвка, 50 футов', 10, 1, 'Пеньковая верёвка.'),
    thing('torch', 'Факел', 1, 0, 'Горит час, светит на 20 футов.'),
    thing('rations', 'Походный паёк, день', 2, 1, 'Еда на день.'),
    thing('thieves_tools', 'Воровские инструменты', 1, 25, 'Нужны для взлома замков и обезвреживания ловушек.'),
    thing('healers_kit', 'Набор целителя', 3, 5, 'Десять применений: стабилизирует умирающего без проверки.'),
    thing('holy_symbol', 'Священный символ', 1, 5, 'Фокусировка для жреца и паладина.'),
    thing('arcane_focus', 'Магическая фокусировка', 3, 10, 'Посох, жезл или хрустальный шар.'),
    thing('backpack', 'Рюкзак', 5, 2, 'Вмещает 30 фунтов.'),
  ];
}

const spellAction = (id, rk, label, description, props, grants) => ({
  id, rk, label, description, props, ...(grants ? { grants } : {}),
});

function cantrips() {
  return [
    spellAction('fire_bolt', 'cantrip_attack', 'Огненный снаряд', 'Заговор. Бросок атаки заклинанием, 1к10 огнём; кости растут с уровнем.',
      { damage_die: '1d10', damage_type: 'огонь' }),
    spellAction('ray_frost', 'cantrip_attack', 'Луч холода', 'Заговор. Бросок атаки, 1к8 холодом; цель замедляется на 10 футов.',
      { damage_die: '1d8', damage_type: 'холод' }),
    spellAction('eldritch_blast', 'cantrip_attack', 'Магlatin', 'Заговор колдуна. Бросок атаки, 1к10 силовым уроном.',
      { damage_die: '1d10', damage_type: 'силовой' }),
    spellAction('shocking_grasp', 'cantrip_attack', 'Электрический захват', 'Заговор. Бросок атаки с преимуществом по цели в металле, 1к8 молнией.',
      { damage_die: '1d8', damage_type: 'молния' }),
    spellAction('sacred_flame', 'cantrip_save', 'Священное пламя', 'Заговор. Цель спасается Ловкостью, провал — 1к8 излучением.',
      { damage_die: '1d8', damage_type: 'излучение', save_by: '@dex_save', status: '' }),
    spellAction('poison_spray', 'cantrip_save', 'Ядовитые брызги', 'Заговор. Цель спасается Телосложением, провал — 1к12 ядом.',
      { damage_die: '1d12', damage_type: 'яд', save_by: '@con_save', status: '' }),
    spellAction('toll_dead', 'cantrip_save', 'Похоронный звон', 'Заговор. Цель спасается Мудростью, провал — 1к8 некротическим; раненой цели 1к12.',
      { damage_die: '1d8', damage_type: 'некротический', save_by: '@wis_save', status: '' }),
    spellAction('light', 'cantrip_note', 'Свет', 'Заговор. Предмет светит на 20 футов.', {}),
    spellAction('mage_hand', 'cantrip_note', 'Волшебная рука', 'Заговор. Призрачная рука носит до 10 фунтов.', {}),
    spellAction('prestidigitation', 'cantrip_note', 'Фокусы', 'Заговор. Мелкие чудеса на минуту.', {}),
    spellAction('guidance_cantrip', 'spell_buff_free', 'Указание', 'Заговор. Цель прибавляет 1к4 к одной проверке характеристики.',
      { spell_level: 0, status: 'guided' }),
  ];
}

function spells() {
  return [
    spellAction('magic_missile', 'spell_auto', 'Волшебная стрела', 'Три стрелы по 1к4+1 силовым уроном, попадают всегда. Круг выше — ещё стрела.',
      { spell_level: 1, damage_die: '1d4', dice_count: 3, dice_up: 1, per_die: 1, damage_type: 'силовой' }),
    spellAction('burning_hands', 'spell_save_half', 'Огненные ладони', 'Конус огня: спасбросок Ловкости, 3к6, при успехе половина. Круг выше — ещё 1к6.',
      { spell_level: 1, save_by: '@dex_save', damage_die: '1d6', dice_count: 3, dice_up: 1, damage_type: 'огонь' }),
    spellAction('thunderwave', 'spell_save_half', 'Волна грома', 'Волна вокруг себя: спасбросок Телосложения, 2к8 громом, при успехе половина.',
      { spell_level: 1, save_by: '@con_save', damage_die: '1d8', dice_count: 2, dice_up: 1, damage_type: 'гром' }),
    spellAction('guiding_bolt', 'spell_attack', 'Направляющий снаряд', 'Бросок атаки заклинанием, 4к6 излучением; следующая атака по цели с преимуществом.',
      { spell_level: 1, damage_die: '1d6', dice_count: 4, dice_up: 1, damage_type: 'излучение', status: 'lit' }),
    spellAction('inflict_wounds', 'spell_attack', 'Нанесение ран', 'Касание: бросок атаки заклинанием, 3к10 некротическим уроном.',
      { spell_level: 1, damage_die: '1d10', dice_count: 3, dice_up: 1, damage_type: 'некротический', status: '' }),
    spellAction('chromatic_orb', 'spell_attack', 'Хроматическая сфера', 'Бросок атаки заклинанием, 3к8 выбранной стихией.',
      { spell_level: 1, damage_die: '1d8', dice_count: 3, dice_up: 1, damage_type: 'огонь', status: '' }),
    spellAction('scorching_ray', 'spell_attack', 'Палящий луч', 'Три луча, каждый 2к6 огнём. Здесь считается одним броском: 6к6.',
      { spell_level: 2, damage_die: '1d6', dice_count: 6, dice_up: 2, damage_type: 'огонь', status: '' }),
    spellAction('fireball', 'spell_save_half', 'Огненный шар', 'Шар в 20 футов: спасбросок Ловкости, 8к6 огнём, при успехе половина. Круг выше — ещё 1к6.',
      { spell_level: 3, save_by: '@dex_save', damage_die: '1d6', dice_count: 8, dice_up: 1, damage_type: 'огонь' }),
    spellAction('lightning_bolt', 'spell_save_half', 'Молния', 'Линия в 100 футов: спасбросок Ловкости, 8к6 молнией, при успехе половина.',
      { spell_level: 3, save_by: '@dex_save', damage_die: '1d6', dice_count: 8, dice_up: 1, damage_type: 'молния' }),
    spellAction('cone_cold', 'spell_save_half', 'Конус холода', 'Конус в 60 футов: спасбросок Телосложения, 8к8 холодом, при успехе половина.',
      { spell_level: 5, save_by: '@con_save', damage_die: '1d8', dice_count: 8, dice_up: 1, damage_type: 'холод' }),
    spellAction('disintegrate', 'spell_save_none', 'Распад', 'Спасбросок Ловкости: провал — 10к6+40 силовым уроном, успех — ничего.',
      { spell_level: 6, save_by: '@dex_save', damage_die: '1d6', dice_count: 10, dice_up: 3, damage_type: 'силовой', status: '' }),
    spellAction('hold_person', 'spell_condition', 'Удержание личности', 'Спасбросок Мудрости: провал — паралич. В конце своего хода цель пробует снова.',
      { spell_level: 2, save_by: '@wis_save', status: 'paralyzed', repeat: 'repeat_wis_paralyzed', holds: 'да' }),
    spellAction('fear_spell', 'spell_condition', 'Страх', 'Спасбросок Мудрости: провал — испуг и бегство. В конце хода цель пробует снова.',
      { spell_level: 3, save_by: '@wis_save', status: 'frightened', repeat: 'repeat_wis_frightened', holds: 'да' }),
    spellAction('slow_spell', 'spell_condition', 'Замедление', 'Спасбросок Мудрости: провал — замедление. В конце хода цель пробует снова.',
      { spell_level: 3, save_by: '@wis_save', status: 'slowed', repeat: 'repeat_wis_slowed', holds: 'да' }),
    spellAction('blindness', 'spell_condition', 'Слепота', 'Спасбросок Телосложения: провал — слепота на минуту.',
      { spell_level: 2, save_by: '@con_save', status: 'blinded', repeat: 'repeat_con_blinded', holds: 'нет' }),
    spellAction('entangle', 'spell_condition', 'Опутывание', 'Спасбросок Силы: провал — цель опутана.',
      { spell_level: 1, save_by: '@str_save', status: 'restrained', repeat: 'repeat_str_restrained', holds: 'да' }),
    spellAction('bless_spell', 'spell_buff', 'Благословение', 'До трёх целей прибавляют 1к4 к атакам и спасброскам, пока держишь концентрацию.',
      { spell_level: 1, status: 'blessed', holds: 'да' }),
    spellAction('bane_spell', 'spell_buff', 'Порча', 'До трёх целей вычитают 1к4 из атак и спасбросков, пока держишь концентрацию.',
      { spell_level: 1, status: 'baned', holds: 'да' }),
    spellAction('haste', 'spell_buff', 'Ускорение', '+2 к классу брони, двойная скорость, преимущество на Ловкость. Концентрация.',
      { spell_level: 3, status: 'hasted', holds: 'да' }),
    spellAction('blur', 'spell_buff', 'Размытый образ', 'Атаки по тебе идут с помехой, пока держишь концентрацию.',
      { spell_level: 2, status: 'blurred', holds: 'да' }),
    spellAction('stoneskin_spell', 'spell_buff', 'Каменная кожа', 'Сопротивление немагическому рубящему, колющему и дробящему урону. Концентрация.',
      { spell_level: 4, status: 'stoneskin', holds: 'да' }),
    spellAction('protection_poison', 'spell_buff_free', 'Защита от яда', 'Сопротивление урону ядом на час. Концентрация не нужна.',
      { spell_level: 2, status: 'poison_resistance' }),
    spellAction('mage_armor', 'spell_buff_free', 'Доспех мага', 'База класса брони 13, пока не носишь доспехов. Восемь часов.',
      { spell_level: 1, status: 'mage_armored' }),
    spellAction('aid', 'spell_buff_free', 'Подмога', 'Максимум хитов трёх целей выше на 5 на восемь часов.',
      { spell_level: 2, status: 'aided' }),
    spellAction('resistance_spell', 'spell_buff_free', 'Сопротивление', 'Цель прибавляет 1к4 к одному спасброску.',
      { spell_level: 0, status: 'resisted' }),
    spellAction('cure_wounds', 'spell_heal', 'Лечение ран', 'Касание: 1к8 + заклинательный модификатор хитов. Круг выше — ещё 1к8.',
      { spell_level: 1, heal_die: '1d8', dice_count: 1, dice_up: 1, cure: '' }),
    spellAction('healing_word', 'spell_heal', 'Слово лечения', 'Бонусным действием: 1к4 + модификатор хитов на расстоянии.',
      { spell_level: 1, heal_die: '1d4', dice_count: 1, dice_up: 1, cure: '' }),
    spellAction('mass_cure', 'spell_heal', 'Массовое лечение ран', 'До шести целей: 3к8 + модификатор хитов каждой.',
      { spell_level: 5, heal_die: '1d8', dice_count: 3, dice_up: 1, cure: '' }),
    spellAction('lesser_restoration', 'spell_cleanse', 'Малое восстановление', 'Снимает с цели одно состояние: отравление, слепоту, паралич.',
      { spell_level: 2, cure: 'poisoned' }),
    spellAction('greater_restoration', 'spell_cleanse', 'Высшее восстановление', 'Снимает паралич или окаменение.',
      { spell_level: 5, cure: 'paralyzed' }),
    spellAction('misty_step', 'spell_note', 'Туманный шаг', 'Бонусным действием переносишься на 30 футов.', { spell_level: 2 }),
    spellAction('fly', 'spell_note', 'Полёт', 'Цель получает скорость полёта 60 футов на десять минут. Концентрация.', { spell_level: 3 }),
    spellAction('detect_magic', 'spell_note', 'Обнаружение магии', 'Видишь магию в 30 футах. Концентрация.', { spell_level: 1 }),
    spellAction('counterspell', 'spell_note', 'Контрзаклинание', 'Реакцией прерываешь чужое заклинание. Ведущий решает исход.', { spell_level: 3 }),
  ];
}

function features() {
  const feature = (id, label, description, source, effect) => ({
    id, rk: 'feature', label, description, props: { source }, effect,
  });
  const trait = (id, label, description, source, grants) => ({
    id, rk: 'trait', label, description, props: { source }, grants,
  });
  return [
    feature('feature_second_wind', 'Второе дыхание', 'Бонусным действием восполняешь 1к10 + уровень хитов. Раз до короткого отдыха.', 'Воин, 1 уровень', 'second_wind'),
    feature('feature_action_surge', 'Всплеск действий', 'Ещё одно действие в этом ходу. Раз до короткого отдыха.', 'Воин, 2 уровень', 'action_surge'),
    feature('feature_rage', 'Ярость', 'Бонусным действием впадаешь в ярость: урон выше, сопротивление физическому.', 'Варвар, 1 уровень', 'rage'),
    feature('feature_reckless', 'Безрассудная атака', 'Бьёшь с преимуществом, но и по тебе бьют с преимуществом.', 'Варвар, 2 уровень', 'reckless_attack'),
    feature('feature_sneak', 'Скрытая атака', 'Раз за ход: дополнительные кости урона, половина уровня округляя вверх.', 'Плут, 1 уровень', 'sneak_attack'),
    feature('feature_lay_hands', 'Наложение рук', 'Лечишь из запаса, сколько назовёшь. Запас — пять на уровень.', 'Паладин, 1 уровень', 'lay_on_hands'),
    feature('feature_smite', 'Божественная кара', 'После попадания тратишь ячейку: 2к8 излучением и ещё 1к8 за круг выше.', 'Паладин, 2 уровень', 'divine_smite'),
    feature('feature_bardic', 'Бардовское вдохновение', 'Даёшь союзнику кость, которую он прибавит к своему броску.', 'Бард, 1 уровень', 'bardic_inspiration'),
    feature('feature_turn_undead', 'Изгнание нежити', 'Божественный канал: нежить спасается Мудростью или бежит.', 'Жрец, 2 уровень', 'turn_undead'),
    feature('feature_hit_die', 'Потратить кость хитов', 'На коротком отдыхе: кость хитов плюс Телосложение.', 'Правила отдыха', 'spend_hit_die'),

    trait('trait_extra_attack', 'Дополнительная атака', 'Действием «Атака» бьёшь дважды.', 'Воин, Варвар, Паладин, 5 уровень', ['extra_attack']),
    trait('trait_improved_crit', 'Улучшенный критический удар', 'Крит на 19 и 20.', 'Чемпион, 3 уровень', ['improved_critical']),
    trait('trait_style_defense', 'Боевой стиль: оборона', '+1 к классу брони в доспехе.', 'Боевой стиль', ['style_defense']),
    trait('trait_style_dueling', 'Боевой стиль: дуэлянт', '+2 к урону одноручным оружием.', 'Боевой стиль', ['style_dueling']),
    trait('trait_style_archery', 'Боевой стиль: стрельба', '+2 к атаке дальнобойным оружием.', 'Боевой стиль', ['style_archery']),
    trait('trait_unarmored_barb', 'Защита без доспехов: варвар', 'Без доспеха класс брони 10 + Ловкость + Телосложение.', 'Варвар, 1 уровень', ['unarmored_barbarian']),
    trait('trait_unarmored_monk', 'Защита без доспехов: монах', 'Без доспеха и щита класс брони 10 + Ловкость + Мудрость.', 'Монах, 1 уровень', ['unarmored_monk']),
    trait('trait_danger_sense', 'Чувство опасности', 'Преимущество на спасброски Ловкости.', 'Варвар, 2 уровень', ['danger_sense']),
    trait('trait_feral', 'Дикий инстинкт', 'Преимущество на инициативу.', 'Варвар, 7 уровень', ['feral_instinct']),
    trait('trait_relentless', 'Непоколебимая стойкость', 'Раз до долгого отдыха: упал до нуля — остался с одним хитом.', 'Варвар, 11 уровень', ['relentless']),
    trait('trait_reliable', 'Надёжный талант', 'На проверках навыков кость считается не меньше десяти.', 'Плут, 11 уровень', ['reliable_talent']),
    trait('trait_uncanny', 'Невероятное уклонение', 'Реакцией уполовиниваешь урон одной атаки.', 'Плут, 5 уровень', ['uncanny_dodge']),
    trait('trait_lucky_halfling', 'Везучий', 'Единица на к20 перебрасывается.', 'Полурослик', ['halfling_lucky']),
    trait('trait_darkvision', 'Тёмное зрение', 'Видишь в темноте на 60 футов.', 'Дварф, эльф, полуэльф, тифлинг', ['darkvision_60']),
    trait('trait_dwarf_resilience', 'Дварфская стойкость', 'Сопротивление урону ядом.', 'Дварф', ['dwarven_resilience']),
    trait('trait_infernal', 'Дьявольское наследие', 'Сопротивление урону огнём.', 'Тифлинг', ['infernal_legacy']),
    trait('feat_alert', 'Черта: бдительный', '+5 к инициативе.', 'Черта', ['feat_alert']),
    trait('feat_tough', 'Черта: крепкий', 'Максимум хитов выше на два за уровень.', 'Черта', ['feat_tough']),
    trait('feat_mobile', 'Черта: подвижный', 'Скорость выше на 10 футов.', 'Черта', ['feat_mobile']),
    trait('feat_observant', 'Черта: наблюдательный', '+5 к пассивной внимательности.', 'Черта', ['feat_observant']),
    trait('feat_war_caster', 'Черта: боевой заклинатель', 'Преимущество на спасброски Телосложения ради концентрации.', 'Черта', ['feat_war_caster']),
    trait('feat_lucky', 'Черта: везунчик', 'Три очка удачи до долгого отдыха: перебрасываешь свой бросок.', 'Черта', ['lucky_point']),
    trait('trait_shield_spell', 'Заклинание «Щит»', 'Реакцией тратишь ячейку 1-го круга: +5 к классу брони.', 'Волшебник, чародей', ['shield']),
    trait('trait_rebuke', 'Адское возмездие', 'Реакцией тратишь ячейку: обидчик получает 2к10 огнём.', 'Тифлинг, колдун', ['hellish_rebuke']),
    trait('trait_inspiration', 'Вдохновение', 'Увидел свой бросок — тратишь вдохновение и бросаешь с преимуществом.', 'Правила вдохновения', ['inspire']),
  ];
}

function combatActions() {
  const act = (id, label, description, effect) => ({ id, rk: 'action_basic', label, description, props: {}, effect });
  return [
    act('act_dodge', 'Уклонение', 'По тебе бьют с помехой до начала твоего хода.', 'dodge'),
    act('act_dash', 'Рывок', 'Скорость на этот ход удваивается.', 'dash'),
    act('act_disengage', 'Отход', 'Передвижение не провоцирует атак.', 'disengage'),
    act('act_hide', 'Засада', 'Скрытность против пассивной внимательности.', 'hide'),
    act('act_smite_note', 'Заклинание: состояние без концентрации', 'Для заклинаний, которые вешают состояние и не требуют концентрации.', 'spell_condition'),
    act('act_help', 'Помощь', 'Союзник получает преимущество на следующий бросок.', 'help'),
  ];
}

function monsters() {
  const attack = (id, label, description, toHit, dice, bonus, type) => ({
    id, rk: 'monster_attack', label, description,
    props: { to_hit: toHit, damage_dice: dice, damage_bonus: bonus, damage_type: type },
  });
  return [
    attack('goblin_scimitar', 'Гоблин: скимитар', 'Гоблин бьёт кривым клинком.', 4, '1d6', 2, 'рубящий'),
    attack('orc_greataxe', 'Орк: секира', 'Орк рубит секирой.', 5, '1d12', 3, 'рубящий'),
    attack('wolf_bite', 'Волк: укус', 'Волк кусает; при попадании цель может упасть.', 4, '2d4', 2, 'колющий'),
    attack('skeleton_shortsword', 'Скелет: короткий меч', 'Скелет колет ржавым мечом.', 4, '1d6', 2, 'колющий'),
    attack('zombie_slam', 'Зомби: удар', 'Зомби бьёт кулаком.', 3, '1d6', 1, 'дробящий'),
    attack('bandit_crossbow', 'Разбойник: лёгкий арбалет', 'Разбойник стреляет из арбалета.', 3, '1d8', 1, 'колющий'),
    attack('ogre_club', 'Огр: дубина', 'Огр обрушивает дубину.', 6, '2d8', 4, 'дробящий'),
    attack('dragon_bite', 'Молодой красный дракон: укус', 'Дракон кусает.', 10, '2d10', 6, 'колющий'),
  ];
}

export function compendium() {
  return {
    items: [...weapons(), ...armours(), ...wondrous(), ...potions(), ...gear()],
    actions: [...cantrips(), ...spells(), ...features(), ...combatActions(), ...monsters()],
  };
}
