const sheet = (id, name, kind, values, equipped, actions, effects = []) => ({
  id, systemId: 'dnd5e', kind, name, values, equipped, effects, actions,
});

const PROF = tags => Object.fromEntries(tags.map(tag => [`${tag}_prof`, 1]));
const EXPERT = tags => Object.fromEntries(tags.map(tag => [`${tag}_prof`, 2]));

export function sheets() {
  return [
    sheet('arven', 'Арвен', 'pc', {
      race: 'Человек', class_name: 'Воительница', subclass: 'Чемпион',
      background: 'Солдат', alignment: 'Законно-добрая',
      str: 18, dex: 14, con: 16, int: 10, wis: 12, cha: 8,
      level: 5, xp: 6500, inspiration: 1,
      ...PROF(['str_save', 'con_save']),
      ...PROF(['athletics', 'perception', 'survival']),
      ...EXPERT(['intimidation']),
      speed: 30, languages: 'Общий, Дварфский',
      hp_max: 44, hp_current: 44, hp_temp: 0, hit_die: '1к10', hit_dice_left: 5,
      crit_from: 19,
      second_wind_max: 1, second_wind_left: 1,
      action_surge_max: 1, action_surge_left: 1,
      gp: 120, sp: 40,
    }, ['chain_mail', 'shield_item', 'longsword', 'handaxe'],
    ['trait_extra_attack', 'trait_improved_crit', 'trait_style_defense', 'feature_second_wind',
      'feature_action_surge', 'feature_hit_die', 'trait_inspiration',
      'act_dodge', 'act_dash', 'act_disengage', 'act_help']),

    sheet('mirra', 'Мирра', 'pc', {
      race: 'Тифлинг', class_name: 'Чародейка', subclass: 'Драконья кровь',
      background: 'Шарлатанка', alignment: 'Хаотично-нейтральная',
      str: 8, dex: 16, con: 14, int: 12, wis: 10, cha: 18,
      level: 5, xp: 6500, caster_level: 5,
      ...PROF(['con_save', 'cha_save']),
      ...PROF(['arcana', 'deception']),
      ...EXPERT(['persuasion']),
      speed: 30, darkvision: 60, languages: 'Общий, Инфернальный',
      hp_max: 33, hp_current: 33, hit_die: '1к6', hit_dice_left: 5,
      slots_1: 4, slots_2: 3, slots_3: 2,
      sorcery_max: 5, sorcery_left: 5,
      gp: 95,
    }, ['leather', 'dagger', 'arcane_focus'],
    ['fire_bolt', 'light', 'prestidigitation', 'magic_missile', 'burning_hands',
      'fireball', 'haste', 'hold_person', 'misty_step', 'mage_armor',
      'trait_shield_spell', 'trait_rebuke', 'trait_darkvision', 'trait_infernal',
      'act_dodge', 'act_dash', 'act_disengage']),

    sheet('doran', 'Доран', 'pc', {
      race: 'Дварф', class_name: 'Жрец', subclass: 'Домен жизни',
      background: 'Прислужник', alignment: 'Нейтрально-добрый',
      str: 14, dex: 10, con: 16, int: 10, wis: 18, cha: 12,
      level: 5, xp: 6500, caster_level: 5, casts_wis: true,
      ...PROF(['wis_save', 'cha_save']),
      ...PROF(['medicine', 'religion', 'insight', 'history']),
      speed: 25, darkvision: 60, languages: 'Общий, Дварфский',
      hp_max: 38, hp_current: 38, hit_die: '1к8', hit_dice_left: 5,
      slots_1: 4, slots_2: 3, slots_3: 2,
      channel_max: 1, channel_left: 1,
      gp: 60,
    }, ['scale_mail', 'shield_item', 'mace', 'holy_symbol'],
    ['sacred_flame', 'guidance_cantrip', 'cure_wounds', 'healing_word', 'bless_spell',
      'lesser_restoration', 'aid', 'feature_turn_undead', 'feature_hit_die',
      'trait_darkvision', 'trait_dwarf_resilience', 'act_dodge', 'act_help']),

    sheet('sil', 'Силь', 'pc', {
      race: 'Полурослик', class_name: 'Плутовка', subclass: 'Вор',
      background: 'Преступница', alignment: 'Хаотично-нейтральная',
      str: 10, dex: 18, con: 14, int: 14, wis: 12, cha: 12,
      level: 5, xp: 6500,
      ...PROF(['dex_save', 'int_save']),
      ...PROF(['acrobatics', 'investigation', 'perception']),
      ...EXPERT(['stealth', 'sleight_of_hand']),
      speed: 25, languages: 'Общий, Воровской жаргон',
      hp_max: 33, hp_current: 33, hit_die: '1к8', hit_dice_left: 5,
      luck_max: 3, luck_left: 3,
      gp: 150,
    }, ['studded_leather', 'rapier', 'shortbow', 'dagger', 'thieves_tools'],
    ['feature_sneak', 'trait_uncanny', 'trait_lucky_halfling', 'feat_lucky', 'feature_hit_die',
      'act_dodge', 'act_dash', 'act_disengage', 'act_hide']),

    sheet('goblin', 'Гоблин-налётчик', 'npc', {
      race: 'Гоблин', class_name: 'Налётчик', alignment: 'Нейтрально-злой',
      str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8,
      level: 1, speed: 30, darkvision: 60,
      hp_max: 7, hp_current: 7, hit_die: '1к6', hit_dice_left: 1,
      ac_base: 15,
    }, [], ['goblin_scimitar', 'act_hide', 'act_disengage']),

    sheet('orc', 'Орк-воин', 'npc', {
      race: 'Орк', class_name: 'Воин', alignment: 'Хаотично-злой',
      str: 16, dex: 12, con: 16, int: 7, wis: 11, cha: 10,
      level: 2, speed: 30, darkvision: 60,
      hp_max: 15, hp_current: 15, hit_die: '1к8', hit_dice_left: 2,
      ac_base: 13,
    }, [], ['orc_greataxe', 'act_dash']),

    sheet('ogre', 'Огр', 'npc', {
      race: 'Огр', class_name: 'Великан', alignment: 'Хаотично-злой',
      str: 19, dex: 8, con: 16, int: 5, wis: 7, cha: 7,
      level: 7, speed: 40, darkvision: 60,
      hp_max: 59, hp_current: 59, hit_die: '1к10', hit_dice_left: 7,
      ac_base: 11,
    }, [], ['ogre_club']),
  ];
}

export function mannequins() {
  return [
    sheet('манекен-а', 'Манекен А', 'npc', {
      str: 16, dex: 14, con: 14, int: 12, wis: 12, cha: 10,
      level: 5, caster_level: 5, hp_max: 40, hp_current: 40,
      slots_1: 4, slots_2: 3, slots_3: 2, ac_base: 14,
      athletics_prof: 1, perception_prof: 1, con_save_prof: 1,
      second_wind_max: 1, second_wind_left: 1, rages_max: 3, rages_left: 3,
      channel_max: 1, channel_left: 1, bardic_max: 4, bardic_left: 4,
      lay_on_hands_max: 25, lay_on_hands_left: 25, luck_max: 3, luck_left: 3,
      action_surge_max: 1, action_surge_left: 1, relentless_max: 1, relentless_left: 1,
      inspiration: 1, hit_dice_left: 5, hit_die: '1к10',
    }, [], []),
    sheet('манекен-б', 'Манекен Б', 'npc', {
      str: 12, dex: 12, con: 12, int: 10, wis: 10, cha: 10,
      level: 5, hp_max: 40, hp_current: 40, ac_base: 13, hit_die: '1к8', hit_dice_left: 5,
    }, [], []),
  ];
}
