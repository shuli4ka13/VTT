// Механики преимущества/помехи с примерами из реальных систем.
//
// Взято из reference/index.html:1872-1907 практически дословно — это самая
// ценная часть черновика: зародыш межсистемного словаря. Он доказывает, что
// «преимущество» — не одна механика, а семейство, и что модификаторы, правящие
// бросок, нельзя свести к числу.
//
// В PoC отыгрывается только `rerollBest` (см. src/engine/dice.js). Остальные
// объявлены, чтобы система могла на них ссылаться, и помечены как неотыгранные.

export const ADVANTAGE_METHODS = [
  {
    id: 'rerollNew', label: 'Переброс кости и выбор нового броска', implemented: false,
    examples: [
      { system: 'D&D 5e', example: '«Удача» полурослика — переброс 1 на к20, новый результат обязателен' },
      { system: 'WFRP / Dark Heresy', example: 'очко Судьбы — переброс проваленной проверки' },
      { system: 'Fate Core', example: 'инвок аспекта — переброс всех 4dF' },
    ],
  },
  {
    id: 'rerollBest', label: 'Переброс кости и выбор лучшего/худшего броска', implemented: true,
    examples: [
      { system: 'D&D 5e', example: 'преимущество/помеха — 2к20, берётся лучший или худший' },
      { system: 'Savage Worlds', example: 'бенни — переброс, остаётся лучший результат' },
      { system: 'Cypher System', example: 'переброс за 1 XP, берётся лучший' },
    ],
  },
  {
    id: 'difficulty', label: 'Повышение / понижение сложности', implemented: false,
    examples: [
      { system: 'Call of Cthulhu 7e', example: 'уровни: обычный / трудный (½ навыка) / экстремальный (⅕)' },
      { system: 'GURPS', example: 'модификаторы к целевому числу от −4 до +4' },
      { system: 'Pathfinder 2e', example: 'корректировка КС: ±2 / ±5 / ±10' },
    ],
  },
  {
    id: 'flip', label: 'Переворот числа', implemented: false,
    examples: [
      { system: 'Unknown Armies', example: 'flip-flop на к100: 71 → 17 при преимуществе' },
      { system: 'Eclipse Phase', example: 'переворот цифр к100 в свою пользу за очки мокси' },
    ],
  },
  {
    id: 'addDie', label: 'Добавление кости', implemented: false,
    examples: [
      { system: 'Blades in the Dark', example: '+1к в пул, засчитывается высший' },
      { system: 'Call of Cthulhu 7e', example: 'бонусная / штрафная кость десятков' },
      { system: 'Shadowrun / Мир Тьмы', example: 'дополнительные кубы в пул успехов' },
    ],
  },
  {
    id: 'dieSize', label: 'Повышение / понижение величины кости', implemented: false,
    examples: [
      { system: 'Savage Worlds', example: 'ступени черт: к6 → к8 → к10' },
      { system: 'Cortex Prime', example: 'step up / step down кости' },
      { system: 'Dungeon Crawl Classics', example: 'цепочка костей: к20 → к16 → к14…' },
    ],
  },
  {
    id: 'degree', label: 'Повышение / понижение степени успеха', implemented: false,
    examples: [
      { system: 'Pathfinder 2e', example: '±10 от КС = крит; эффекты сдвигают степень на шаг' },
      { system: 'PbtA', example: '10+ полный успех, 7–9 частичный, 6− провал' },
      { system: 'Genesys / FFG Star Wars', example: 'апгрейд кости повышает шанс триумфа' },
    ],
  },
];

export const findMethod = id => ADVANTAGE_METHODS.find(m => m.id === id) || null;

// Какие механики СУЩЕСТВУЮТ в мире этой системы — а не весь межсистемный
// словарь. Единый фильтр: раньше режим автора применял его инлайном,
// а компендиум рисовал справочник целиком, игнорируя объявление системы.
export const enabledMethods = system =>
  ADVANTAGE_METHODS.filter(m => ((system.advantage || {}).methods || {})[m.id]);
