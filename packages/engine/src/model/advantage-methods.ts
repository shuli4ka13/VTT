import type { System, RollEditOp } from './types.ts';

export interface EditRecipe {
  key: string;
  label: string;
  ops: RollEditOp[];
  canceledBy?: string;
}

export interface AdvantageMethod {
  id: string;
  label: string;
  implemented: boolean;
  examples: { system: string; example: string }[];
  recipes: EditRecipe[];
}

const pair = (
  up: [string, string, RollEditOp[]], down: [string, string, RollEditOp[]],
): EditRecipe[] => [
  { key: up[0], label: up[1], ops: up[2], canceledBy: down[0] },
  { key: down[0], label: down[1], ops: down[2], canceledBy: up[0] },
];

export const ADVANTAGE_METHODS: AdvantageMethod[] = [
  {
    id: 'rerollNew', label: 'Переброс кости и выбор нового броска', implemented: true,
    examples: [
      { system: 'D&D 5e', example: '«Удача» полурослика — переброс 1 на к20, новый результат обязателен' },
      { system: 'WFRP / Dark Heresy', example: 'очко Судьбы — переброс проваленной проверки' },
      { system: 'Fate Core', example: 'инвок аспекта — переброс всех 4dF' },
    ],
    recipes: [{ key: 'lucky', label: 'Удача', ops: [{ op: 'reroll', n: 1 }] }],
  },
  {
    id: 'rerollBest', label: 'Переброс кости и выбор лучшего/худшего броска', implemented: true,
    examples: [
      { system: 'D&D 5e', example: 'преимущество/помеха — 2к20, берётся лучший или худший' },
      { system: 'Savage Worlds', example: 'бенни — переброс, остаётся лучший результат' },
      { system: 'Cypher System', example: 'переброс за 1 XP, берётся лучший' },
    ],
    recipes: pair(
      ['advantage', 'Преимущество', [{ op: 'addDie' }, { op: 'keepBest', n: 1 }]],
      ['disadvantage', 'Помеха', [{ op: 'addDie' }, { op: 'keepWorst', n: 1 }]],
    ),
  },
  {
    id: 'difficulty', label: 'Повышение / понижение сложности', implemented: true,
    examples: [
      { system: 'Call of Cthulhu 7e', example: 'уровни: обычный / трудный (½ навыка) / экстремальный (⅕)' },
      { system: 'GURPS', example: 'модификаторы к целевому числу от −4 до +4' },
      { system: 'Pathfinder 2e', example: 'корректировка КС: ±2 / ±5 / ±10' },
    ],
    recipes: pair(
      ['easier', 'Легче', [{ op: 'shiftVersus', by: -2 }]],
      ['harder', 'Труднее', [{ op: 'shiftVersus', by: 2 }]],
    ),
  },
  {
    id: 'flip', label: 'Переворот числа', implemented: true,
    examples: [
      { system: 'Unknown Armies', example: 'flip-flop на к100: 71 → 17 при преимуществе' },
      { system: 'Eclipse Phase', example: 'переворот цифр к100 в свою пользу за очки мокси' },
    ],
    recipes: pair(
      ['flip_low', 'Переворот в свою пользу', [{ op: 'flip', prefer: 'low' }]],
      ['flip_high', 'Переворот против', [{ op: 'flip', prefer: 'high' }]],
    ),
  },
  {
    id: 'addDie', label: 'Добавление кости', implemented: true,
    examples: [
      { system: 'Blades in the Dark', example: '+1к в пул, засчитывается высший' },
      { system: 'Call of Cthulhu 7e', example: 'бонусная / штрафная кость десятков' },
      { system: 'Shadowrun / Мир Тьмы', example: 'дополнительные кубы в пул успехов' },
    ],
    recipes: [{ key: 'extra_die', label: 'Лишняя кость', ops: [{ op: 'addDie' }] }],
  },
  {
    id: 'dieSize', label: 'Повышение / понижение величины кости', implemented: true,
    examples: [
      { system: 'Savage Worlds', example: 'ступени черт: к6 → к8 → к10' },
      { system: 'Cortex Prime', example: 'step up / step down кости' },
      { system: 'Dungeon Crawl Classics', example: 'цепочка костей: к20 → к16 → к14…' },
    ],
    recipes: pair(
      ['step_up', 'Кость выше', [{ op: 'dieStep', by: 1 }]],
      ['step_down', 'Кость ниже', [{ op: 'dieStep', by: -1 }]],
    ),
  },
  {
    id: 'degree', label: 'Повышение / понижение степени успеха', implemented: true,
    examples: [
      { system: 'Pathfinder 2e', example: '±10 от КС = крит; эффекты сдвигают степень на шаг' },
      { system: 'PbtA', example: '10+ полный успех, 7–9 частичный, 6− провал' },
      { system: 'Genesys / FFG Star Wars', example: 'апгрейд кости повышает шанс триумфа' },
    ],
    recipes: pair(
      ['degree_up', 'Степень выше', [{ op: 'shiftDegree', by: 1 }]],
      ['degree_down', 'Степень ниже', [{ op: 'shiftDegree', by: -1 }]],
    ),
  },
];

export const findMethod = (id: string) => ADVANTAGE_METHODS.find(m => m.id === id) || null;

export const enabledMethods = (system: System) =>
  ADVANTAGE_METHODS.filter(m => ((system.advantage || {}).methods || {})[m.id]);
