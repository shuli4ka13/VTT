import type { Scenario } from './run.ts';

const ARVEN_HAS = [{ of: 'chain_mail' }, { of: 'shield_item' }, { of: 'longsword' }, { of: 'trait_extra_attack' }, { of: 'trait_improved_crit' }, { of: 'trait_style_defense' }];
const arvenPlain = { values: { inspiration: 0 }, has: ARVEN_HAS };
const fat = (hp: number) => ({ values: { hp_block: hp, hp_current: hp } });
const mirra33 = { values: { hp_bonus: 1, hp_current: 33 } };
const PAD = 'Лишние кости в dice (на промахе, на отказе) — то, что нынешний движок бросает и выбрасывает: кость урона бросается даже при промахе и отказе. По правилам игры этих бросков нет.';

export const scenarios: Scenario[] = [
  {
    name: 'Попадание и промах обычной атакой',
    rule: `PHB/SRD 5.1, «Бросок атаки»: к20 + бонус атаки (Сила +4, мастерство +3 на 5 уровне = +7) против КБ; равно или больше — попадание. Урон оружия: 1к8 + модификатор Силы (+4). Промах урона не наносит. Орк КБ 13. ${PAD}`,
    world: 'dnd5e',
    sheets: { arven: arvenPlain, orc: fat(40) },
    dice: [12, 5, 2],
    steps: [
      { act: 'longsword:0', from: 'arven', to: 'orc' },
      { act: 'longsword:0', from: 'arven', to: 'orc' },
    ],
    expect: { values: { orc: { hp_current: 31 } }, log: ['попадание', 'промах'] },
  },
  {
    name: 'КБ гоблина по книге монстров — 15 (попадание ровно на КБ)',
    rule: 'SRD 5.1, «Гоблин»: КБ 15 (кожаный доспех и щит) — это итоговый класс брони. Бросок 8 + 7 = 15 равен КБ — попадание, урон 1к8(3) + 4 = 7. В образце у гоблина ac_base = 15, а лист прибавляет Ловкость (+2), получается КБ 17 и промах; так же у орка (13 вместо 14: КБ 13 в книге) и огра (КБ 11 в книге, на листе 10).',
    world: 'dnd5e',
    sheets: { arven: arvenPlain, goblin: fat(20) },
    dice: [8, 3],
    steps: [{ act: 'longsword:0', from: 'arven', to: 'goblin' }],
    expect: { values: { goblin: { ac: 15, hp_current: 13 } } },
  },
  {
    name: 'Крит чемпиона на 19: кости урона удваиваются, модификатор нет',
    rule: 'PHB, «Улучшенный критический удар» чемпиона: критическое попадание на 19 и 20. Крит: бросаются дважды кости урона оружия, модификатор прибавляется один раз. 19 + 7 попадает; 2к8 (3+6) + 4 = 13.',
    world: 'dnd5e',
    sheets: { arven: arvenPlain, orc: fat(40) },
    dice: [19, 3, 6],
    steps: [{ act: 'longsword:0', from: 'arven', to: 'orc' }],
    expect: { values: { orc: { hp_current: 27 } } },
  },
  {
    name: 'Натуральная 20 попадает при любом КБ, натуральная 1 всегда промах',
    rule: `PHB, «Бросок атаки»: 20 на кости — всегда попадание (и крит), 1 — всегда промах, какой бы ни был бонус. Шаг 1: орк (+5) бьёт Арвена с КБ 35 и выбрасывает 20: попадание-крит, 2к12 (4+7) + 3 = 14, хиты 49 → 35 (максимум по правилам: 10 + 4 × 6 + 5 × 3). Шаг 2: Арвен (+7) бьёт орка с КБ 1 и выбрасывает 1: 8 против КБ 1, но 1 всегда промах — урона нет. ${PAD}`,
    world: 'dnd5e',
    sheets: {
      arven: { values: { inspiration: 0, ac_base: 30 }, has: ARVEN_HAS.filter(item => item.of !== 'chain_mail') },
      orc: { values: { ac_base: 0, hp_block: 40, hp_current: 40 } },
    },
    dice: [20, 4, 7, 1],
    steps: [
      { act: 'orc_greataxe:0', from: 'orc', to: 'arven' },
      { act: 'longsword:0', from: 'arven', to: 'orc' },
    ],
    expect: { values: { arven: { hp_current: 35 }, orc: { hp_current: 40 } } },
  },
  {
    name: 'Огненный шар по трём целям: кости один раз, спасбросок у каждого, ячейка одна, нечем платить — отказ',
    rule: `PHB/SRD, «Огненный шар»: 8к6 огнём, спасбросок Ловкости; успех — половина. Кости урона бросаются один раз на всех. Сложность Мирры 8 + 3 + 4 = 15, успех при равенстве. Кости 4+5+6+3+2+6+1+6 = 33. Гоблин (Лов +2): 12 → 14 — провал, 33. Орк (Лов +1): 14 → 15 — успех, 33 / 2 = 16 (с округлением вниз). Огр (Лов −1): 3 → 2 — провал, 33. Ячейка одна: 3 круга 1 → 0. Второе сотворение без ячейки — отказ. ${PAD}`,
    world: 'dnd5e',
    sheets: { mirra: { values: { 'slots.3.left': 1 } }, goblin: fat(40), orc: fat(40), ogre: fat(100) },
    dice: [4, 5, 6, 3, 2, 6, 1, 6, 12, 14, 3],
    steps: [
      { act: 'fireball:0', from: 'mirra', to: ['goblin', 'orc', 'ogre'], inputs: { slot: 3 } },
      { act: 'fireball:0', from: 'mirra', to: ['goblin'], inputs: { slot: 3 }, refused: 'нет ячейки' },
    ],
    expect: { values: { goblin: { hp_current: 7 }, orc: { hp_current: 24 }, ogre: { hp_current: 67 }, mirra: { 'slots.3.left': 0 } } },
  },
  {
    name: 'Щит: реакция с вопросом, +5 КБ до начала следующего хода владельца',
    rule: `PHB/SRD, заклинание «Щит»: реакция при попадании по тебе, ячейка 1 круга; +5 к КБ, в том числе против вызвавшей атаки, до начала твоего следующего хода. Мирра КБ 14. Орк (+5) выбрасывает 9 → 14, попадает; Мирра отвечает «Щит» — КБ 19, промах. Гоблин (+4) в свой ход: 12 → 16 против 19 — промах (щит ещё держится). В начале хода Мирры щит спадает. Ячейка 4 → 3. ${PAD}`,
    world: 'dnd5e',
    sheets: { mirra: mirra33, orc: fat(40), goblin: fat(40) },
    dice: [9, 5, 12],
    steps: [
      { turn: 'start', order: ['orc', 'goblin', 'mirra'] },
      { act: 'orc_greataxe:0', from: 'orc', to: 'mirra', answers: [['shield']] },
      { turn: 'next' },
      { act: 'goblin_scimitar:0', from: 'goblin', to: 'mirra' },
      { turn: 'next' },
    ],
    expect: { values: { mirra: { hp_current: 33, 'slots.1.left': 3 } }, effects: { mirra: { not: ['shield_up'] } }, notLog: ['попадание'] },
  },
  {
    name: 'Адское возмездие: реакция после урона, спасбросок обидчика, половина урона',
    rule: `PHB/SRD, «Адское возмездие»: реакция на полученный урон, ячейка 1 круга; обидчик спасается Ловкостью против сложности Мирры (15), 2к10 огнём, успех — половина. Орк бьёт Мирру: 14 + 5 = 19 попадает, урон 8 + 3 = 11, хиты 33 → 22. Щит Мирра отклоняет, возмездие принимает. Кости возмездия 5+6 = 11, спасбросок орка (Лов +1) 14 → 15 — успех, половина 11 / 2 = 5 (вниз), хиты орка 40 → 35. Ячейка 4 → 3. Порядок костей: спасбросок орка, потом урон возмездия — шаги ответа идут по порядку.`,
    world: 'dnd5e',
    sheets: { mirra: mirra33, orc: fat(40) },
    dice: [14, 8, 14, 5, 6],
    steps: [
      { turn: 'start', order: ['orc', 'mirra'] },
      { act: 'orc_greataxe:0', from: 'orc', to: 'mirra', answers: [[], ['hellish_rebuke']] },
    ],
    expect: { values: { mirra: { hp_current: 22, 'slots.1.left': 3 }, orc: { hp_current: 35 } } },
  },
  {
    name: 'Концентрация: удар срывает спасбросок Телосложения, срывается и держимое заклинание',
    rule: `PHB/SRD, «Концентрация»: при уроне спасбросок Телосложения против большего из 10 и половины урона; провал — заклинание кончается. Мирра держит «Удержание личности» на огре (Мудрость −2: 5 → 3 против 15 — парализован, ячейка 2 круга 3 → 2). Орк попадает (14 + 5 = 19 против КБ 14), урон 8 + 3 = 11, СЛ 10. Спасбросок Мирры: к20 4 + Тел +2 + мастерство +3 (чародей) = 9 — провал. Концентрация срывается, паралич с огра спадает. Щит и возмездие Мирра отклоняет.`,
    world: 'dnd5e',
    sheets: { mirra: mirra33, orc: fat(40) },
    dice: [5, 14, 8, 4],
    steps: [
      { act: 'hold_person:0', from: 'mirra', to: 'ogre', inputs: { slot: 2 } },
      { act: 'orc_greataxe:0', from: 'orc', to: 'mirra', answers: [[], []] },
    ],
    expect: { values: { mirra: { hp_current: 22, 'slots.2.left': 2 } }, effects: { ogre: { not: ['paralyzed'] }, mirra: { not: ['concentration'] } } },
  },
  {
    name: 'Сопротивление, уязвимость и спасбросок вместе: половина, потом сопротивление',
    rule: 'PHB, «Сопротивление и уязвимость»: сопротивление вдвое уменьшает урон, уязвимость вдвое увеличивает; округление вниз; применяются после прочих правок, в том числе после «половина при успехе». Огненный шар 8к6 = 35. Гоблин с сопротивлением огню спасся (14 + 2 = 16 ≥ 15): 35 / 2 = 17, затем 17 / 2 = 8, хиты 40 → 32. Орк без свойств не спасся (3 + 1 = 4): 35, хиты 5. Огр с уязвимостью не спасся (3 − 1 = 2): 70, хиты 100 → 30.',
    world: 'dnd5e',
    sheets: {
      mirra: { values: { 'slots.3.left': 1 } },
      goblin: { ...fat(40), effects: ['fire_resistance'] },
      orc: fat(40),
      ogre: { ...fat(100), effects: ['fire_vulnerable'] },
    },
    dice: [6, 5, 4, 5, 4, 3, 4, 4, 14, 3, 3],
    steps: [{ act: 'fireball:0', from: 'mirra', to: ['goblin', 'orc', 'ogre'], inputs: { slot: 3 } }],
    expect: { values: { goblin: { hp_current: 32 }, orc: { hp_current: 5 }, ogre: { hp_current: 30 } } },
  },
  {
    name: 'Помеха, и преимущество с помехой гасят друг друга (сколько бы источников ни было)',
    rule: `PHB, «Преимущество и помеха»: помеха — две кости, берётся худшая. Если есть и то и другое, они гасят друг друга и кидается одна кость — независимо от числа источников каждого. Шаг 1: Арвен атакует орка, который уклоняется (помеха): 16 и 4 → 4, 4 + 7 = 11 против КБ 13 — промах. Шаг 2: Силь (+7) под «безрассудной атакой» и «помощью» (два преимущества) бьёт того же орка (помеха) — одна кость, 10 + 7 = 17, попадание; 1к8 5 + 4 = 9, хиты орка 40 → 31. ${PAD}`,
    world: 'dnd5e',
    sheets: {
      arven: arvenPlain,
      sil: { values: {}, has: [{ of: 'rapier' }], effects: ['reckless', 'helped'] },
      orc: { ...fat(40), effects: ['dodging'] },
    },
    dice: [16, 4, 10, 5],
    steps: [
      { act: 'longsword:0', from: 'arven', to: 'orc' },
      { act: 'rapier:0', from: 'sil', to: 'orc' },
    ],
    expect: { values: { orc: { hp_current: 31 } }, log: ['(Помеха)'] },
  },
  {
    name: 'Ярость: урон выше, сопротивление физическому урону, расход ресурса',
    rule: 'PHB, «Ярость» варвара: бонусным действием; пока длится — бонус к урону рукопашным оружием на Силе (+2 до 8 уровня), сопротивление дробящему, колющему, рубящему. Не в тяжёлом доспехе. Арвен (варвар, щит, без доспеха, КБ 14) впадает в ярость: ярости 3 → 2. Орк бьёт (10 + 5 = 15 — попал), урон 8 + 3 = 11 рубящим, с сопротивлением 11 / 2 = 5, хиты 49 → 44. Арвен отвечает мечом: 12 + 7 = 19, урон 1к8 (5) + 4 + 2 = 11, хиты орка 40 → 29.',
    world: 'dnd5e',
    sheets: {
      arven: {
        values: { inspiration: 0, class_name: 'варвар', 'resources.rages.max': 3, 'resources.rages.left': 3 },
        has: [{ of: 'shield_item' }, { of: 'longsword' }, { of: 'feature_rage' }],
      },
      orc: fat(40),
    },
    dice: [10, 8, 12, 5],
    steps: [
      { act: 'feature_rage:0', from: 'arven', to: 'arven' },
      { act: 'orc_greataxe:0', from: 'orc', to: 'arven' },
      { act: 'longsword:0', from: 'arven', to: 'orc' },
    ],
    expect: { values: { arven: { hp_current: 44, 'resources.rages.left': 2 }, orc: { hp_current: 29 } }, effects: { arven: { has: ['raging'] } } },
  },
  {
    name: 'Дополнительная атака и Всплеск действий: две атаки за действие, третья без действия отказ',
    rule: `PHB, «Дополнительная атака» (воин 5): действием «Атака» — две атаки. «Всплеск действий»: одно дополнительное действие в этот ход, раз до отдыха. В бою Арвен (атак 2): две атаки по 15 + 7 = 22 против КБ 11, каждая 1к8 (4) + 4 = 8. Третья — отказ, действия нет. После Всплеска ещё две атаки; пятая — отказ. Огр 100 − 4 × 8 = 68. ${PAD}`,
    world: 'dnd5e',
    sheets: { arven: { ...arvenPlain, has: [...ARVEN_HAS, { of: 'feature_action_surge' }] }, ogre: fat(100) },
    dice: [15, 4, 15, 4, 15, 4, 15, 4],
    steps: [
      { turn: 'start', order: ['arven', 'ogre'] },
      { act: 'longsword:0', from: 'arven', to: 'ogre' },
      { act: 'longsword:0', from: 'arven', to: 'ogre' },
      { act: 'longsword:0', from: 'arven', to: 'ogre', refused: 'действие' },
      { act: 'feature_action_surge:0', from: 'arven', to: 'arven' },
      { act: 'longsword:0', from: 'arven', to: 'ogre' },
      { act: 'longsword:0', from: 'arven', to: 'ogre' },
      { act: 'longsword:0', from: 'arven', to: 'ogre', refused: 'действие' },
    ],
    expect: { values: { ogre: { hp_current: 68 }, arven: { 'resources.action_surge.left': 0 } } },
  },
  {
    name: 'Благословение: одна ячейка на двух целей, +1к4 к атаке поверх преимущества',
    rule: `PHB/SRD, «Благословение»: до трёх существ, ячейка 1 круга, концентрация; цели прибавляют 1к4 к броскам атаки и спасбросков. Преимущество (две кости к20) не отменяет к4. Доран кастует на Арвена и Мирру: ячейка 4 → 3, на Дорана — концентрация. Арвен (безрассудная атака — преимущество): к20 2 и 5 → 5, к4 3, 5 + 3 + 7 = 15 против КБ 13 — попадание (без благословения 12 — промах); урон 6 + 4 = 10, хиты орка 30.`,
    world: 'dnd5e',
    sheets: { arven: { ...arvenPlain, effects: ['reckless'] }, orc: fat(40) },
    dice: [2, 5, 3, 6],
    steps: [
      { act: 'bless_spell:0', from: 'doran', to: ['arven', 'mirra'], inputs: { slot: 1 } },
      { act: 'longsword:0', from: 'arven', to: 'orc' },
    ],
    expect: {
      values: { orc: { hp_current: 30 }, doran: { 'slots.1.left': 3 } },
      effects: { arven: { has: ['blessed'] }, mirra: { has: ['blessed'] }, doran: { has: ['concentration'] } },
    },
  },
  {
    name: 'Порча: спасбросок Харизмы, провалившие вычитают к4 из атаки',
    rule: `SRD, «Порча»: до трёх существ спасаются Харизмой; провалившие, пока держится концентрация, вычитают к4 из бросков атаки и спасбросков. Доран кастует на орка: спасбросок 2 — провал, ячейка 4 → 3, на Дороне концентрация. Орк (+5) бьёт Мирру (КБ 14): 11 + 5 = 16, −к4 3 → 13 — промах (без порчи было бы попадание), кость урона на промахе не бросается.`,
    world: 'dnd5e',
    sheets: { mirra: mirra33, orc: fat(40), doran: { has: [{ of: 'bane_spell' }] } },
    dice: [2, 11, 3],
    steps: [
      { act: 'bane_spell:0', from: 'doran', to: 'orc', inputs: { slot: 1 } },
      { act: 'orc_greataxe:0', from: 'orc', to: 'mirra' },
    ],
    expect: {
      values: { mirra: { hp_current: 33 }, doran: { 'slots.1.left': 3 } },
      effects: { orc: { has: ['baned'] }, doran: { has: ['concentration'] } },
      log: ['− Под порчей к4: 3'],
    },
  },
  {
    name: 'Указание: один раз, увидев проверку; заговор кончается — концентрация спадает',
    rule: 'SRD, «Указание»: заговор, концентрация; один раз цель прибавляет к4 к проверке характеристики — до или после броска; затем заклинание оканчивается. Ячейка не тратится. Доран даёт указание Арвену (без кольчуги — без помехи на скрытность). Арвен прячется от орка: к20 9, увидев бросок, берёт указание — к4 3. Указание сгорело, концентрация Дорана спала.',
    world: 'dnd5e',
    sheets: { arven: { values: { inspiration: 0 }, has: ARVEN_HAS.filter(item => item.of !== 'chain_mail') } },
    dice: [9, 3],
    steps: [
      { act: 'guidance_cantrip:0', from: 'doran', to: 'arven' },
      { act: '+hide', from: 'arven', to: 'orc', answers: [['guided']] },
    ],
    expect: {
      values: { doran: { 'slots.1.left': 4 } },
      effects: { arven: { not: ['guided'] }, doran: { not: ['concentration'] } },
      log: ['прибавлено к4: 3', 'держать больше нечего'],
    },
  },
  {
    name: 'Вдохновение барда: кость по уровню барда, одному союзнику и не себе',
    rule: `PHB/SRD, «Бардовское вдохновение»: бонусным действием одно существо, кроме тебя, получает кость вдохновения (к10 с 10-го уровня); увидев свой бросок, прибавляет её один раз. Мирра — бард 10-го уровня. Себе — отказ, ресурс цел. Арвену — кость к10, вдохновение 3 → 2; вторая кость тому, у кого она уже есть, — отказ, ресурс цел. Арвен бьёт орка: 4 + 7 = 11 против КБ 13 — промах, увидев бросок, прибавляет к10 5 → 16, попадание; урон 6 + 4 = 10, хиты 40 → 30.`,
    world: 'dnd5e',
    sheets: {
      arven: arvenPlain,
      mirra: { values: { class_name: 'бард', level: 10, 'resources.bardic.max': 3, 'resources.bardic.left': 3 }, has: [{ of: 'feature_bardic' }] },
      orc: fat(40),
    },
    dice: [4, 5, 6],
    steps: [
      { act: 'feature_bardic:0', from: 'mirra', to: 'mirra', refused: 'одному союзнику, не себе' },
      { act: 'feature_bardic:0', from: 'mirra', to: 'arven' },
      { act: 'feature_bardic:0', from: 'mirra', to: 'arven', refused: 'уже есть кость вдохновения' },
      { act: 'longsword:0', from: 'arven', to: 'orc', answers: [['bardic_ready']] },
    ],
    expect: {
      values: { orc: { hp_current: 30 }, mirra: { 'resources.bardic.left': 2 } },
      effects: { arven: { not: ['bardic_ready'] } },
      log: ['прибавлено к10: 5'],
    },
  },
  {
    name: 'Героическое вдохновение (2024): с преимуществом перебрасывается меньшая кость',
    rule: 'SRD 5.2 / PHB 2024, «Героическое вдохновение»: потратив его, сразу после броска перебрасываешь любую кость, засчитывается новая. Арвен безрассудна — атака с преимуществом: к20 3 и 5, итог 5 + 7 = 12 против КБ орка 13 — промах. Вдохновение: перебрасывается меньшая, не взятая кость 3 → 18; бо́льшая из 18 и 5 — 18, 18 + 7 = 25 — попадание; урон 6 + 4 = 10, хиты 40 → 30; вдохновение 1 → 0.',
    world: 'dnd5e',
    sheets: {
      arven: { values: { inspiration: 1 }, has: [...ARVEN_HAS, { of: 'trait_inspiration' }], effects: ['reckless'] },
      orc: fat(40),
    },
    dice: [3, 5, 18, 6],
    steps: [{ act: 'longsword:0', from: 'arven', to: 'orc', answers: [['inspire']] }],
    expect: {
      values: { orc: { hp_current: 30 }, arven: { inspiration: 0 } },
      log: ['переброшено 3 → 18'],
    },
  },
  {
    name: 'Точная атака: увидев бросок атаки, кость превосходства к итогу',
    rule: 'Книга игрока, мастер боевых искусств, «Точная атака»: тратишь кость превосходства (к10 с 10-го уровня воина) и прибавляешь к броску атаки — до или после броска. Арвен 10-го уровня (+8): 4 + 8 = 12 против КБ орка 13 — промах; приём: к10 3 → 15, попадание; кости превосходства 4 → 3; урон 6 + 4 = 10, хиты 40 → 30.',
    world: 'dnd5e',
    sheets: {
      arven: { values: { inspiration: 0, level: 10, 'resources.superiority.max': 4, 'resources.superiority.left': 4 }, has: [...ARVEN_HAS, { of: 'trait_precision' }] },
      orc: fat(40),
    },
    dice: [4, 3, 6],
    steps: [{ act: 'longsword:0', from: 'arven', to: 'orc', answers: [['precision_attack']] }],
    expect: {
      values: { orc: { hp_current: 30 }, arven: { 'resources.superiority.left': 3 } },
      log: ['прибавлено к10: 3'],
    },
  },
  {
    name: 'Скрытая атака: 3к6 после попадания, один раз за ход',
    rule: 'PHB, «Скрытая атака» плута: раз за ход, при попадании с преимуществом или с союзником у цели; добавляет (уровень / 2, вверх) к6 = 3к6 на 5 уровне. Силь в бою бьёт рапирой: 15 + 7 = 22, 1к8 5 + 4 = 9. Скрытая атака: 3к6 (2+3+4) = 9, хиты орка 40 → 22. Вторая в тот же ход — отказ. Тип урона — тип оружия, им попали: рапира — колющий. ' + PAD,
    world: 'dnd5e',
    sheets: { sil: { values: {}, has: [{ of: 'rapier' }, { of: 'feature_sneak' }] }, orc: fat(40) },
    dice: [15, 5, 2, 3, 4],
    steps: [
      { turn: 'start', order: ['sil', 'orc'] },
      { act: 'rapier:0', from: 'sil', to: 'orc' },
      { act: 'feature_sneak:0', from: 'sil', to: 'orc', inputs: { damage_type: 'колющий' } },
      { act: 'feature_sneak:0', from: 'sil', to: 'orc', inputs: { damage_type: 'колющий' }, refused: 'раз за ход' },
    ],
    expect: { values: { orc: { hp_current: 22 } } },
  },
  {
    name: 'Наложение рук (2024): сколько назовёшь из запаса, бонусное действие за ход одно',
    rule: 'PHB 2024 / SRD 5.2, «Наложение рук» паладина: запас хитов — пять на уровень паладина, до долгого отдыха; бонусным действием касаешься существа и восстанавливаешь из запаса столько хитов, сколько назовёшь. Арвен — паладин 5 уровня: запас 25 (в образце запас — две хранимые клетки «Всего» и «Осталось», формулы по уровню нет). В бою он лечит Дорана (30 хитов) на 5: хиты 35, запас 25 → 20, а бонусное действие тратится одно (1 → 0), сколько бы хитов ни назвали; обычное действие остаётся. Второе наложение в тот же ход — отказ: бонусного действия нет, запас остаётся 20.',
    world: 'dnd5e',
    sheets: {
      arven: {
        values: { class_name: 'паладин', 'resources.lay_on_hands.max': 25, 'resources.lay_on_hands.left': 25 },
        has: [{ of: 'feature_lay_hands' }],
      },
      doran: { values: { hp_current: 30 } },
    },
    dice: [],
    steps: [
      { turn: 'start', order: ['arven', 'doran'] },
      { act: 'feature_lay_hands:0', from: 'arven', to: 'doran', inputs: { amount: 5 } },
      { act: 'feature_lay_hands:0', from: 'arven', to: 'doran', inputs: { amount: 5 }, refused: 'бонусное действие на этом ходу уже потрачено' },
    ],
    expect: {
      values: { doran: { hp_current: 35 }, arven: { 'resources.lay_on_hands.left': 20, 'turn.бонусное.left': 0, 'turn.действие.left': 1 } },
      log: ['зовёт «Лечение»: 5', 'Хиты 30 → 35 (+5)'],
    },
  },
];
