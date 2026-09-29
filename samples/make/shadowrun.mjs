import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { modifiersOf } from './convert/modifiers.ts';
import { argsOf } from './convert/args.ts';
import { fieldRollsOf } from './convert/field-rolls.ts';
import { namesOf } from './convert/names.ts';
import { spendOf } from './convert/spend.ts';
import { addressesOf } from './convert/addresses.ts';
import { withTableFields } from '../../packages/engine/src/model/sheet-columns.ts';

const ATTRIBUTES = [
  ['body', 'Тело'], ['agility', 'Проворство'], ['reaction', 'Реакция'], ['strength', 'Сила'],
  ['willpower', 'Воля'], ['logic', 'Логика'], ['intuition', 'Интуиция'], ['charisma', 'Харизма'],
];

const SKILLS = [
  ['astral', 'Астрал', 'intuition', false],
  ['athletics', 'Атлетика', 'agility', true],
  ['biotech', 'Биотехнологии', 'logic', false],
  ['close_combat', 'Ближний бой', 'agility', true],
  ['cracking', 'Взлом', 'logic', false],
  ['perception', 'Внимание', 'intuition', true],
  ['conjuring', 'Воплощение', 'magic', false],
  ['enchanting', 'Зачарование', 'magic', false],
  ['engineering', 'Инженерное дело', 'logic', true],
  ['sorcery', 'Колдовство', 'magic', false],
  ['tasking', 'Многозадачность', 'resonance', false],
  ['con', 'Обман', 'charisma', true],
  ['outdoors', 'Ориентирование', 'intuition', true],
  ['piloting', 'Пилотирование', 'reaction', true],
  ['stealth', 'Скрытность', 'agility', true],
  ['firearms', 'Стрельба', 'agility', true],
  ['influence', 'Убеждение', 'charisma', true],
  ['exotic_weapons', 'Экзотическое оружие', 'agility', false],
  ['electronics', 'Электроника', 'logic', true],
];

const METATYPES = [
  ['человек', 'Преимущество 1–7, остальное 1–6', 0, 0, ''],
  ['дварф', 'Тело 1–7, Реакция 1–5, Сила 1–8, Воля 1–7', 0, 0, 'Инфразрение; Устойчивость к токсинам'],
  ['эльф', 'Проворство 1–7, Харизма 1–8', 0, 0, 'Сумеречное зрение'],
  ['орк', 'Тело 1–8, Сила 1–8, Харизма 1–5', 1, 0, 'Живучесть 1; Сумеречное зрение'],
  ['тролль', 'Тело 1–9, Проворство 1–5, Сила 1–9, Харизма 1–5', 2, 1, 'Живучесть 2; Инфразрение; Подкожные наросты (+1 к защите, безоружный урон физический)'],
];

const RANGES = ['вплотную', 'близкая', 'средняя', 'дальняя', 'экстремальная'];

const POOL_DIE = { constant: 'pool' };

const stored = (tag, label, group, def, extra = {}) => {
  const { control, ...bounds } = extra;
  return { tag, label, group, value: { kind: 'stored', type: 'number', default: def, ...bounds }, ...(control ? { control } : {}) };
};
const formula = (tag, label, group, expr, roll) => ({ tag, label, group, ...(roll ? { roll } : {}), value: { kind: 'formula', expr } });
const pool = label => ({ label, die: POOL_DIE, pool: true, tags: ['проверка'] });
const ofMeta = column => `если(@metatype != "", таблица("metatypes", @metatype, "${column}"), 0)`;
const PENALTY = '@wound_mod + @condition_mod';

function fields() {
  const out = [];
  out.push({ tag: 'metatype', label: 'Метатип', group: 'Личное дело', value: { kind: 'stored', type: 'choice', from: 'metatypes', default: 'человек' } });
  for (const [tag, label] of ATTRIBUTES) out.push(stored(tag, label, 'Характеристики', 3, { min: 0, max: 13 }));
  out.push(stored('edge', 'Преимущество (характеристика)', 'Особые', 2, { min: 1, max: 7 }));
  out.push({ ...stored('edge_left', 'Очки Преимущества', 'Особые', 2, { min: 0, max: 7, control: 'pips' }), lives: 'group' });
  out.push({ ...stored('edge_gained', 'Преимущества получено за раунд (не больше 2)', 'Особые', 0, { min: 0, max: 2 }), lives: 'group' });
  out.push(stored('essence', 'Сущность', 'Особые', 6, { min: 0, max: 6 }));
  out.push(stored('magic', 'Магия', 'Особые', 0, { min: 0 }));
  out.push(stored('resonance', 'Резонанс', 'Особые', 0, { min: 0 }));

  out.push({ tag: '__skills', label: '', value: { kind: 'stored', type: 'number', default: 0 }, cell: { table: 'skills', row: '_', column: '_' } });
  out.push(formula('composure', 'Самообладание', 'Наборы кубиков', `большее из(0, @willpower + @charisma + ${PENALTY})`, pool('Самообладание')));
  out.push(formula('judge_intentions', 'Проницательность', 'Наборы кубиков', `большее из(0, @willpower + @intuition + ${PENALTY})`, pool('Проницательность')));
  out.push(formula('memory', 'Память', 'Наборы кубиков', `большее из(0, @logic + @intuition + ${PENALTY})`, pool('Память')));
  out.push(formula('lift_carry', 'Поднятие тяжестей', 'Наборы кубиков', `большее из(0, @body + @strength + ${PENALTY})`, pool('Поднятие тяжестей')));

  out.push(stored('armor_worn', 'Броня: надетое', 'Защита', 0, { min: 0 }));
  out.push(stored('armor_extra', 'Броня: шлем, щит, накладки', 'Защита', 0, { min: 0 }));
  out.push(stored('armor_natural', 'Броня: аугментации (кожные пластины)', 'Защита', 0, { min: 0 }));
  out.push(stored('cover', 'Укрытие (0–4)', 'Защита', 0, { min: 0, max: 4 }));
  out.push(formula('defense_rating', 'Значение защиты', 'Защита',
    `@body + @armor_worn + @armor_extra + @armor_natural + ${ofMeta('dermal')} + @cover`));
  out.push(formula('defense_pool', 'Защита: набор (Реакция + Интуиция)', 'Защита', `большее из(0, @reaction + @intuition + @cover + ${PENALTY})`, pool('Защита')));
  out.push(formula('unarmed_rating', 'Значение атаки без оружия', 'Защита', '@strength + @reaction'));

  out.push(formula('physical_max', 'Счётчик здоровья: ячеек', 'Счётчики', `8 + округлить вверх(@body / 2) + ${ofMeta('toughness')}`));
  out.push({ ...stored('physical', 'Физический урон', 'Счётчики', 0, { min: 0 }), lives: 'group' });
  out.push(formula('stun_max', 'Счётчик оглушения: ячеек', 'Счётчики', '8 + округлить вверх(@willpower / 2)'));
  out.push({ ...stored('stun', 'Оглушающий урон', 'Счётчики', 0, { min: 0 }), lives: 'group' });
  out.push(formula('stun_overflow', 'Лишний оглушающий — в физический', 'Счётчики', 'большее из(0, @stun - @stun_max)'));
  out.push(formula('physical_total', 'Физический урон с переливом', 'Счётчики', '@physical + @stun_overflow'));
  out.push(formula('critical', 'Критический урон', 'Счётчики', 'большее из(0, @physical_total - @physical_max)'));
  out.push(formula('wound_mod', 'Штраф за раны', 'Счётчики',
    '0 - округлить вниз(меньшее из(@stun, @stun_max) / 3) - округлить вниз(меньшее из(@physical_total, @physical_max) / 3)'));
  out.push(stored('condition_mod', 'Штраф от состояний', 'Счётчики', 0));
  out.push(formula('knocked_out', 'Счётчик оглушения полон', 'Счётчики', '@stun >= @stun_max'));
  out.push(formula('bleeding_out', 'Счётчик здоровья полон', 'Счётчики', '@physical_total >= @physical_max'));
  out.push(formula('is_dead', 'Критический урон достиг Тело × 2', 'Счётчики', '@critical >= @body * 2'));
  out.push(formula('conscious', 'В сознании', 'Счётчики', 'все(@stun < @stun_max, @physical_total < @physical_max)'));

  out.push(formula('initiative', 'Уровень инициативы', 'Инициатива', `@reaction + @intuition + ${PENALTY}`));
  out.push(stored('init_dice', 'Кубиков инициативы', 'Инициатива', 1, { min: 1, max: 5 }));
  out.push(stored('simple_left', 'Простых действий осталось', 'Инициатива', 2, { min: 0, max: 5, control: 'pips' }));
  out.push(stored('complex_left', 'Сложных действий осталось', 'Инициатива', 1, { min: 0, max: 1, control: 'pips' }));
  out.push({ tag: 'battle', label: 'Идёт бой', group: 'Стол', lives: 'desk', value: { kind: 'stored', type: 'number', default: 0 } });
  return out;
}

const tables = () => ({
  rolls: {
    label: 'Броски', key: 'word',
    columns: [{ key: 'успех', label: 'Успех', kind: 'text' }, { key: 'провал', label: 'Провал', kind: 'text' }],
    rows: [
      { value: 'проверка', cells: { успех: 'есть успехи', провал: 'ни одного успеха' } },
      { value: 'атака', cells: { успех: 'попадание', провал: 'промах' } },
      { value: 'защита' }, { value: 'сопротивление' }, { value: 'инициатива' }, { value: 'лечение' },
    ],
  },
  metatypes: {
    label: 'Метатипы', key: 'word',
    columns: [
      { key: 'ranges', label: 'Пределы характеристик (стр. 65)', kind: 'text' },
      { key: 'toughness', label: 'Живучесть: ячеек здоровья', kind: 'number' },
      { key: 'dermal', label: 'Подкожные наросты: к защите', kind: 'number' },
      { key: 'traits', label: 'Расовые качества', kind: 'text' },
    ],
    rows: METATYPES.map(([value, ranges, toughness, dermal, traits]) => ({ value, cells: { ranges, toughness, dermal, traits } })),
  },
  ranges: {
    label: 'Дистанции', key: 'word',
    columns: [{ key: 'meters', label: 'Метры', kind: 'text' }],
    rows: RANGES.map((value, at) => ({ value, cells: { meters: ['0–3', '4–50', '51–250', '251–500', '501+'][at] } })),
  },
  fire_modes: {
    label: 'Режимы стрельбы', key: 'word',
    columns: [{ key: 'ar', label: 'К значению атаки', kind: 'number' }, { key: 'dv', label: 'К урону', kind: 'number' }],
    rows: [
      { value: 'одиночный выстрел', cells: { ar: 0, dv: 0 } },
      { value: 'короткая очередь', cells: { ar: -2, dv: 1 } },
      { value: 'длинная очередь', cells: { ar: -4, dv: 2 } },
    ],
  },
  edge_actions: {
    label: 'Действия Преимущества при атаке (стр. 48–49)', key: 'word',
    columns: [
      { key: 'cost', label: 'Цена', kind: 'number' }, { key: 'dv', label: 'К урону', kind: 'number' },
      { key: 'pool', label: 'К набору', kind: 'number' }, { key: 'knockout', label: 'Вырубить (1 — да)', kind: 'number' },
      { key: 'text', label: 'По книге', kind: 'text' },
    ],
    rows: [
      { value: 'нет', cells: { cost: 0, dv: 0, pool: 0, knockout: 0, text: '' } },
      { value: 'Метко попасть', cells: { cost: 0, dv: 2, pool: -4, knockout: 0, text: 'Простое действие: +2 к урону за −4 к набору.' } },
      { value: 'Пырнуть', cells: { cost: 1, dv: 2, pool: -2, knockout: 0, text: 'Штраф «Метко попасть» снижается до −2.' } },
      { value: 'Вырубить ударом', cells: { cost: 2, dv: 0, pool: 0, knockout: 1, text: 'Ближний бой: урон больше Воли — счётчик оглушения полон.' } },
      { value: 'Метко попасть в жизненно важную часть', cells: { cost: 5, dv: 3, pool: 0, knockout: 0, text: '+3 к урону.' } },
    ],
  },
  damage_kinds: {
    label: 'Вид урона', key: 'word',
    columns: [{ key: 'physical', label: 'Физический', kind: 'number' }],
    rows: [{ value: 'физический', cells: { physical: 1 } }, { value: 'оглушающий', cells: { physical: 0 } }],
  },
  skills: {
    label: 'Навыки', key: 'word',
    columns: [
      { key: 'attribute', label: 'Характеристика', kind: 'tag' },
      { key: 'untrained', label: 'Без обучения', kind: 'boolean' },
      { key: 'rank', label: 'Ранг', kind: 'number', start: 0, min: 0, max: 10, sheet: {
        tag: '{key}', label: '{label}', group: 'Навыки',
      } },
      { key: 'pool', label: 'Набор', kind: 'expr', expr: `большее из(0, если(@строка.rank > 0, @строка.rank + @строка.attribute, если(@строка.untrained, @строка.attribute - 1, 0)) + ${PENALTY})`, sheet: {
        tag: '{key}_pool', label: '{label}: набор', group: 'Наборы кубиков',
        roll: { label: 'Проверка: {label}', die: POOL_DIE, count: { expr: '@{key}_pool' }, tags: ['проверка'] },
      } },
    ],
    rows: SKILLS.map(([tag, label, attribute, untrained]) => ({ value: label.toLowerCase(), key: tag, label, cells: { attribute, untrained } })),
  },
  adversaries: {
    label: 'Противники из книги (стр. 204–210)', key: 'word',
    columns: ['ПР', 'Т', 'П', 'Р', 'С', 'В', 'Л', 'И', 'Х', 'ЗЩТ', 'Инициатива', 'Счётчик'].map((label, at) => ({ key: `c${at}`, label, kind: 'text' })),
    rows: ADVERSARY_BOOK.map(([value, ...cells]) => ({ value, cells: Object.fromEntries(cells.map((cell, at) => [`c${at}`, cell])) })),
  },
});

const ADVERSARY_BOOK = [
  ['Головорез из «Хуманиса»', '0', '2', '2', '2', '2', '2', '2', '2', '1', '2', '4 + 1к6', '9'],
  ['Шаман «Заботы о Терре!»', '0', '1', '2', '3', '2', '3', '2', '2', '2', '1', '5 + 1к6', '10'],
  ['Член мотобанды «Пятиглазые»', '1', '2', '2', '2', '2', '2', '2', '2', '1', '3', '4 + 1к6', '9'],
  ['Мафиози-коллектор', '1', '2(3)', '2', '2', '2', '2', '2', '2', '1', '7', '4 + 1к6', '10'],
  ['Громила «Сынов Саурона» (орк)', '2', '3', '2', '2', '4', '2', '1', '2', '1', '5', '4 + 1к6', '10'],
  ['Сборщик данных «Тесаков»', '2', '3', '2', '3', '1', '4', '4', '4', '1', '4', '6 + 1к6', '12'],
  ['Риггер «Минутмен Секьюрити»', '3', '2', '3', '4(5)', '2', '4', '4', '4', '1', '5', '9 + 1к6', '13'],
  ['Патрульный «Одинокой звезды»', '3', '3', '3', '3', '3', '3', '2', '3', '2', '6', '6 + 1к6', '10'],
  ['Солдат мафии', '4', '3', '2', '2', '3', '2', '1', '2', '1', '5', '4 + 1к6', '10'],
  ['Мастер клинка якудзы', '4', '3', '5(6)', '4(5)', '3', '3', '2', '3', '2', '6', '8 + 2к6', '14'],
  ['Боевой маг «Одинокой звезды»', '5', '3', '4', '4', '2', '4', '4', '4', '4', '10', '8 + 1к6', '10'],
  ['Офицер спецназа «Одинокой звезды»', '5', '4', '3(4)', '4(5)', '3(4)', '4', '2', '4', '3', '14(16)', '9 + 2к6', '15'],
  ['Офицер ООР «Доквагона»', '6', '4', '4(6)', '5(7)', '4(6)', '5', '3', '4', '3', '14', '11 + 3к6', '11'],
  ['Красный самурай «Ренраку»', '7', '5', '5(8)', '5(7)', '4(7)', '4', '4', '5', '4', '16', '12 + 3к6', '11'],
];

const constants = () => ({
  pool: { label: 'набор к6', kind: 'die', dice: [{ count: 1, sides: 6 }], read: { kind: 'count', atLeast: 5 } },
  init_die: { label: 'к6 инициативы', kind: 'die', dice: [{ count: 1, sides: 6 }] },
});

const rollEdits = () => ({
  reroll_failures: { label: 'Преимущество: перебросить все неуспехи', ops: [{ op: 'reroll', n: 4 }] },
  push_edge: { label: 'Преимущество: добавить характеристику к набору с подрывом шестёрок', ops: [{ op: 'addDie', count: { expr: '@edge' } }, { op: 'explode', apart: true }] },
});

const change = (tag, direction, expr, when) => ({
  type: 'apply', target: { tag }, direction, value: { expr }, targetModifiers: false, ...(when ? { when: { expr: when } } : {}),
});
const hang = id => ({ type: 'status', mode: 'apply', effect: { const: id } });
const drop = id => ({ type: 'status', mode: 'remove', effect: { const: id } });
const payEdge = n => [
  { type: 'compare', value: { expr: '@edge_left' }, versus: { expr: String(n) }, breakIf: 'less', note: `нужно ${n} очк. Преимущества` },
  change('edge_left', 'subtract', String(n)),
];

const GAIN = 'все(@получатель.edge_left < 7, @получатель.edge_gained < 2)';
const MODE = 'или(@режим, "одиночный выстрел")';
const RATING = `если(@дистанция == "вплотную", @ar1, если(@дистанция == "близкая", @ar2, если(@дистанция == "средняя", @ar3, если(@дистанция == "дальняя", @ar4, @ar5))))`;
const BONUS_HIT = 'если(или(@успех_за_преимущество, 0) >= 1, 1, 0)';
const NET = `@атака.natural + (${BONUS_HIT}) - @атака.versusNatural`;
const MOVE = 'или(@приём, "нет")';
const DV = `@dv + таблица("fire_modes", ${MODE}, "dv") + таблица("edge_actions", ${MOVE}, "dv") + ${NET}`;
const TAKEN = `большее из(0, ${DV} - @сопротивление.natural)`;

function effects() {
  const attack = (label, description) => ({
    label, group: 'Атака', activation: 'manual', description,
    params: [
      { key: 'attack_pool', label: 'Набор атаки', kind: 'number' },
      ...RANGES.map((range, at) => ({ key: `ar${at + 1}`, label: `Значение атаки: ${range}`, kind: 'number' })),
      { key: 'dv', label: 'Базовый урон', kind: 'number' },
      { key: 'physical_hit', label: 'Урон физический (1) или оглушающий (0)', kind: 'number' },
      { key: 'electric', label: 'Электрический урон (1 — да)', kind: 'number' },
      { key: 'дистанция', label: 'Дистанция', kind: 'choice', from: 'ranges', ask: { by: 'actor' } },
      { key: 'режим', label: 'Режим стрельбы', kind: 'choice', from: 'fire_modes', optional: true, ask: { by: 'actor' } },
      { key: 'успех_за_преимущество', label: '+1 успех за 3 очка Преимущества: 1 — да', kind: 'number', optional: true, ask: { by: 'actor', min: 0, max: 1 } },
      { key: 'приём', label: 'Приём', kind: 'choice', from: 'edge_actions', optional: true, ask: { by: 'actor' } },
    ],
    self: [
      { type: 'compare', value: { expr: '@edge_left' }, versus: { expr: '3' }, breakIf: 'less', note: 'нужно 3 очка Преимущества', when: { expr: `(${BONUS_HIT}) >= 1` } },
      change('edge_left', 'subtract', '3', `(${BONUS_HIT}) >= 1`),
      { type: 'compare', value: { expr: '@edge_left' }, versus: { expr: `таблица("edge_actions", ${MOVE}, "cost")` }, breakIf: 'less', note: 'на приём не хватает Преимущества' },
      change('edge_left', 'subtract', `таблица("edge_actions", ${MOVE}, "cost")`),
      { type: 'compare', value: { expr: '@complex_left' }, versus: { expr: '1' }, breakIf: 'less', note: 'сложное действие на этом ходу уже потрачено', when: { expr: '@стол.battle >= 1' } },
      change('complex_left', 'subtract', '1', '@стол.battle >= 1'),
    ],
    steps: [
      { id: 'атк', type: 'amount', source: 'item', fixed: { expr: `${RATING} + таблица("fire_modes", ${MODE}, "ar")` } },
      { type: 'compare', value: { expr: '@атк' }, versus: { expr: '1' }, breakIf: 'less', note: 'на этой дистанции оружие не бьёт' },
      change('edge_left', 'add', '1', `все(@атк - @получатель.defense_rating <= -4, ${GAIN})`),
      change('edge_gained', 'add', '1', `все(@атк - @получатель.defense_rating <= -4, ${GAIN})`),
      {
        id: 'атака', type: 'threshold',
        roll: { die: POOL_DIE, count: { expr: `большее из(0, @attack_pool + таблица("edge_actions", ${MOVE}, "pool"))` }, tags: ['атака'] },
        versus: { roll: { die: POOL_DIE, count: { expr: '@получатель.defense_pool' }, tags: ['защита'] } }, successWhen: 'atLeast', continueOn: 'always',
      },
      { type: 'compare', value: { expr: NET }, versus: { expr: '0' }, breakIf: 'less', note: 'промах: успехов атаки меньше, чем у защиты' },
      {
        id: 'сопротивление', type: 'threshold', side: 'target',
        roll: { die: POOL_DIE, count: { expr: '@получатель.body' }, tags: ['сопротивление'] },
        versus: { expr: '0' }, continueOn: 'always',
      },
      change('physical', 'add', TAKEN, '@physical_hit >= 1'),
      change('stun', 'add', TAKEN, '@physical_hit < 1'),
      { ...hang('shocked'), when: { expr: `все(@electric >= 1, ${TAKEN} >= 1)` } },
      { ...hang('prone'), when: { expr: `${TAKEN} > @получатель.body` } },
      change('stun', 'set', '@получатель.stun_max', `все(таблица("edge_actions", ${MOVE}, "knockout") >= 1, ${TAKEN} > @получатель.willpower)`),
    ],
  });

  const onField = (label, description, tag, steps) => ({
    label, group: 'Общие правила', description, activation: 'passive', duration: { kind: 'permanent' }, params: [],
    on: [{ on: `field:${tag}`, steps }],
  });
  const state = (label, description, modifiers = [], extra = {}) => ({
    label, group: 'Состояния', activation: 'passive', duration: { kind: 'permanent' }, description, modifiers, ...extra,
  });
  const penalty = value => ({ kind: 'value', target: 'condition_mod', op: 'add', value, stacking: 'sum', condition: null });
  const note = (label, description, when) => ({
    label, group: 'Общие правила', activation: 'passive', duration: { kind: 'permanent' }, params: [], description,
    on: ['ranged_attack'].map(on => ({ on, role: 'sender', if: { expr: when }, steps: [] })),
  });
  const recover = (label, description, pool, tag) => ({
    label, group: 'Лечение', activation: 'manual', description,
    steps: [
      { id: 'заживление', type: 'threshold', roll: { die: POOL_DIE, count: { expr: pool }, tags: ['лечение'] }, versus: { expr: '0' }, continueOn: 'always' },
      change(tag, 'subtract', `меньшее из(@${tag}, @заживление.natural)`),
    ],
  });

  return {
    ranged_attack: attack('Атаковать',
      'Навык оружия + Проворство против Реакции + Интуиции цели. Значение атаки оружия на дистанции против значения защиты цели: у кого больше на 4 — тому очко Преимущества. Попадание при успехах не меньше, чем у защиты; чистые успехи — к урону, при ничьей — базовый урон. Сопротивление — Тело. Урон больше Тела — «Распластан».'),
    edge_gain: {
      label: 'Преимущество за значение атаки', group: 'Общие правила', activation: 'passive', duration: { kind: 'permanent' }, params: [],
      description: 'Значение атаки больше значения защиты цели на 4 и больше — очко Преимущества атакующему (не больше 7).',
      on: ['ranged_attack'].map(on => ({
        on, to: 'other', if: { expr: '@атк - @defense_rating >= 4' },
        steps: [change('edge_left', 'add', '1', GAIN), change('edge_gained', 'add', '1', GAIN)],
      })),
    },
    reroll_failures: {
      label: 'Преимущество: перебросить все неуспехи', group: 'Преимущество', activation: 'passive', duration: { kind: 'permanent' }, params: [],
      description: 'Увидел свой бросок — за 4 очка Преимущества перебросить все кубики с 1–4. После сбоя нельзя.',
      on: [{ on: '*', role: 'sender', phase: 'before', ask: true, claims: ['reroll_failures'], self: payEdge(4), steps: [] }],
    },
    push_edge: {
      label: 'Преимущество: добавить к набору', group: 'Преимущество', activation: 'passive', duration: { kind: 'permanent' }, params: [],
      description: 'Увидел свой бросок — за 4 очка Преимущества добавить к набору характеристику Преимущество; шестёрки подрываются: каждая даёт ещё кубик.',
      on: [{ on: '*', role: 'sender', phase: 'before', ask: true, claims: ['push_edge'], self: payEdge(4), steps: [] }],
    },
    round_edge: {
      label: 'Новый раунд: предел Преимущества', group: 'Общие правила', activation: 'passive', duration: { kind: 'permanent' }, params: [],
      description: 'В начале раунда счётчик полученного за раунд Преимущества обнуляется.',
      on: [{ on: 'moment:round-start', steps: [change('edge_gained', 'set', '0')] }],
    },
    turn_actions: {
      label: 'Начало хода: действия', group: 'Общие правила', activation: 'passive', duration: { kind: 'permanent' }, params: [],
      description: 'Одно сложное и одно простое действие, плюс простое за каждый кубик инициативы (не больше пяти простых).',
      on: [{ on: 'moment:turn-start', steps: [change('simple_left', 'set', 'меньшее из(5, 1 + @init_dice)'), change('complex_left', 'set', '1')] }],
    },
    battle_start: {
      label: 'Начало боя', group: 'Общие правила', activation: 'passive', duration: { kind: 'permanent' }, params: [],
      description: 'Бой пошёл: действия считаются.',
      on: [{ on: 'moment:combat-start', steps: [change('battle', 'set', '1')] }],
    },
    battle_end: {
      label: 'Конец боя', group: 'Общие правила', activation: 'passive', duration: { kind: 'permanent' }, params: [],
      description: 'Вне боя действия не считаются.',
      on: [{ on: 'moment:combat-end', steps: [change('battle', 'set', '0')] }],
    },
    second_wind: {
      label: 'Второе дыхание', group: 'Преимущество', activation: 'manual',
      description: 'За 3 очка Преимущества — освободить 1 ячейку оглушения.',
      self: payEdge(3), steps: [change('stun', 'subtract', 'меньшее из(@stun, 1)')],
    },
    shrug_off: {
      label: 'Ранен не так сильно', group: 'Преимущество', activation: 'manual',
      description: 'За 4 очка Преимущества — освободить 1 ячейку здоровья.',
      self: payEdge(4), steps: [change('physical', 'subtract', 'меньшее из(@physical, 1)')],
    },
    scene_start: {
      label: 'Начало сцены', group: 'Преимущество', activation: 'manual',
      description: 'В начале сцены очков Преимущества — сколько характеристика Преимущество.',
      steps: [change('edge_left', 'set', '@edge')],
    },
    glitch: note('Сбой', 'Единицы больше чем на половине кубиков атаки — сбой.', 'все(@атака.atMin * 2 > @атака.rolled, @атака.natural >= 1)'),
    critical_glitch: note('Критический сбой', 'Сбой без единого успеха.', 'все(@атака.atMin * 2 > @атака.rolled, @атака.natural == 0)'),
    first_aid: {
      label: 'Первая помощь', group: 'Лечение', activation: 'manual',
      description: 'Биотехнологии + Логика, порог 5 − Сущность цели, в течение минуты после боя. Чистый успех — 1 оглушающий, два — 1 физический.',
      params: [{ key: 'healer_pool', label: 'Набор', kind: 'number' }],
      steps: [
        {
          id: 'помощь', type: 'threshold', roll: { die: POOL_DIE, count: { expr: '@healer_pool' }, tags: ['лечение'] },
          versus: { expr: 'большее из(0, округлить вниз(5 - @получатель.essence))' }, continueOn: 'always',
        },
        change('stun', 'subtract', 'меньшее из(@получатель.stun, большее из(0, @помощь.margin))', '@помощь.success'),
        change('physical', 'subtract', 'меньшее из(@получатель.physical, округлить вниз(большее из(0, @помощь.margin - @получатель.stun) / 2))', '@помощь.success'),
      ],
    },
    rest_hour: recover('Час отдыха', 'Тело + Воля: каждый успех — 1 оглушающий.', '@body + @willpower', 'stun'),
    rest_day: recover('День отдыха', 'Тело + Тело: каждый успех — 1 физический.', '@body * 2', 'physical'),
    prone: state('Распластан', 'Перемещение 2 м; +2 к защите от дальних атак со средней дистанции, −2 против вплотную и близкой; −4 к ближнему бою. Снимается действием «Встать».'),
    shocked: state('Электрошок', '−2 к инициативе, нельзя делать Рывок, −1 ко всем наборам; 2 раунда.', [penalty(-1)],
      { duration: { kind: 'rounds', max: 2 } }),
    dazed: state('Ошеломление', 'Показатель инициативы −4, нельзя получать и тратить Преимущество.'),
    chilled: state('Заморозка', '−4 к инициативе, −1 ко всем наборам, кроме сопротивления урону.', [penalty(-1)], { duration: { kind: 'rounds', max: 3 } }),
    fatigued: state('Утомление I', '−2 ко всем наборам, кроме сопротивления урону.', [penalty(-2)]),
    frightened: state('Испуг', '−4 к проверкам против источника или для защиты от него.'),
    stand_up: {
      label: 'Встать', group: 'Действия', activation: 'manual', description: 'Простое действие: снять «Распластан».',
      self: [
        { type: 'compare', value: { expr: '@simple_left' }, versus: { expr: '1' }, breakIf: 'less', note: 'простых действий не осталось', when: { expr: '@стол.battle >= 1' } },
        change('simple_left', 'subtract', '1', '@стол.battle >= 1'),
      ],
      steps: [drop('prone')],
    },
    unconscious: state('Без сознания', 'Полон счётчик оглушения.'),
    bleeding: state('Тяжело ранен', 'Полон счётчик здоровья: без сознания, дальше урон критический.'),
    dead: state('Мёртв', 'Критический урон достиг Тело × 2.'),
    knock_out: onField('Потеря сознания', 'Счётчик оглушения полон — «Без сознания».', 'knocked_out', [hang('unconscious')]),
    bleed_out: onField('Тяжёлое ранение', 'Счётчик здоровья полон — «Тяжело ранен».', 'bleeding_out', [hang('bleeding')]),
    die: onField('Смерть', 'Критический урон достиг Тело × 2 — «Мёртв».', 'is_dead', [drop('bleeding'), hang('dead')]),
    come_to: onField('Приходит в себя', 'Оба счётчика снова не полны — состояния сняты.', 'conscious', [drop('unconscious'), drop('bleeding')]),
  };
}

const setTo = (target, expr) => ({ kind: 'value', target, op: 'set', value: { expr }, stacking: 'override', condition: null });

const RANGE_PROPS = RANGES.map((range, at) => ({ key: `ar${at + 1}`, label: `АТК: ${range}`, kind: 'number' }));
const RANGE_ARGS = Object.fromEntries(RANGES.map((_, at) => [`ar${at + 1}`, { prop: `ar${at + 1}` }]));

const records = () => ({
  runner: { kind: 'sheet', label: 'Раннер', icon: '🕶', group: 'Листы', hint: 'Лист игрока: все блоки.' },
  grunt: {
    kind: 'sheet', label: 'Пешка', icon: '👥', group: 'Листы',
    hint: 'Пешка из отряда (стр. 203): одна шкала на оба вида урона, 8 + ⌈больше из Воли и Тела / 2⌉, штраф за каждые 2 ячейки.',
    blocks: ['Характеристики', 'Навыки', 'Наборы кубиков', 'Защита', 'Счётчики', 'Инициатива'],
    modifiers: [
      setTo('physical_max', '8 + округлить вверх(большее из(@willpower, @body) / 2)'),
      setTo('physical_total', '@physical + @stun'),
      setTo('knocked_out', 'нет'),
      setTo('wound_mod', '0 - округлить вниз(меньшее из(@physical + @stun, @physical_max) / 2)'),
    ],
  },
  opponent: {
    kind: 'sheet', label: 'Противник', icon: '👤', group: 'Листы', hint: 'Лист противника: характеристики, навыки, защита, счётчики.',
    blocks: ['Характеристики', 'Навыки', 'Наборы кубиков', 'Защита', 'Счётчики', 'Инициатива'],
  },
  weapon: {
    kind: 'item', label: 'Оружие', icon: '🔫', group: 'Снаряжение', hint: 'Базовый урон, вид, пять значений атаки по дистанциям и навык.',
    props: [
      { key: 'dv', label: 'Базовый урон', kind: 'number' },
      { key: 'damage_kind', label: 'Вид урона', kind: 'choice', from: 'damage_kinds' },
      { key: 'electric', label: 'Электрический (1 — да)', kind: 'number' },
      ...RANGE_PROPS,
      { key: 'skill', label: 'Навык', kind: 'choice', from: 'skills' },
    ],
    bindings: [{
      label: 'Атаковать', effect: 'ranged_attack',
      args: {
        attack_pool: { expr: 'таблица("skills", @skill, "pool")' },
        ...RANGE_ARGS,
        dv: { prop: 'dv' }, electric: { prop: 'electric' },
        physical_hit: { expr: 'таблица("damage_kinds", @damage_kind, "physical")' },
      },
    }],
  },
  armor: {
    kind: 'item', label: 'Броня', icon: '🧥', group: 'Снаряжение', hint: 'Прибавка к значению защиты. Броня не складывается, шлемы и щиты — сверху.',
    props: [{ key: 'rating', label: 'К значению защиты', kind: 'number' }, { key: 'accessory', label: 'Шлем или щит (1 — да)', kind: 'number' }],
  },
  action: { kind: 'action', label: 'Действие', icon: '✦', group: 'Приёмы', hint: 'Преимущество, лечение, простые действия.', props: [], bindings: [] },
});

const P = 'физический';
const S = 'оглушающий';
const weapon = (id, label, group, dv, kind, ars, skill, extra = '', electric = 0) => ({
  id, rk: 'weapon', label,
  description: `${group}. Урон ${dv}${kind === P ? 'ф' : 'о'}${electric ? '(э)' : ''}, АТК ${ars.map(a => a || '—').join('/')}. ${extra}`.trim(),
  props: { dv, damage_kind: kind, electric, ...Object.fromEntries(ars.map((a, at) => [`ar${at + 1}`, a])), skill },
});
const gun = (id, label, group, dv, ars, extra, kind = P, electric = 0) => weapon(id, label, group, dv, kind, ars, 'стрельба', extra, electric);
const melee = (id, label, group, dv, kind, ar, extra = '', electric = 0) => weapon(id, label, group, dv, kind, [ar, 0, 0, 0, 0], 'ближний бой', extra, electric);
const armor = (id, label, rating, extra = '', accessory = false) => ({
  id, rk: 'armor', label, description: `Значение защиты +${rating}. ${extra}`.trim(), props: { rating, accessory: accessory ? 1 : 0 },
  modifiers: [accessory
    ? { kind: 'value', target: 'armor_extra', op: 'add', value: rating, stacking: 'sum', condition: null }
    : { kind: 'value', target: 'armor_worn', op: 'add', value: rating, stacking: 'max', condition: null }],
});
const action = (id, label, effect) => ({ id, rk: 'action', label, bindings: [{ label, effect, args: {} }] });

const compendium = () => ({
  records: [
    melee('combat_knife', 'Боевой нож', 'Клинки (стр. 249)', 3, P, 8, 'Можно метнуть: близкая 2, до 20 м.'),
    melee('combat_axe', 'Боевой топор', 'Клинки (стр. 249)', 5, P, 9),
    melee('katana', 'Катана', 'Клинки (стр. 249)', 4, P, 10),
    melee('spear', 'Копьё', 'Клинки (стр. 249)', 4, P, 8),
    melee('sword', 'Меч', 'Клинки (стр. 249)', 3, P, 9),
    melee('knife', 'Нож', 'Клинки (стр. 249)', 2, P, 6),
    melee('club', 'Дубинка', 'Дробящее (стр. 249)', 3, S, 6),
    melee('stun_baton', 'Оглушающая дубинка', 'Дробящее (стр. 249)', 5, S, 6, '', 1),
    melee('staff', 'Посох', 'Дробящее (стр. 249)', 4, S, 8),
    melee('sap', 'Слеппер', 'Дробящее (стр. 249)', 2, S, 6),
    melee('telescoping_staff', 'Телескопический посох', 'Дробящее (стр. 249)', 4, S, 8),
    melee('knucks', 'Кастет', 'Безоружное (стр. 250)', 3, P, 6),
    melee('bike_chain', 'Мотоциклетная цепь', 'Безоружное (стр. 250)', 2, S, 5),
    melee('shock_gloves', 'Электрошоковые перчатки', 'Безоружное (стр. 250)', 4, S, 5, '', 1),
    weapon('throwing_knives', 'Метательные ножи', 'Метательное (стр. 250)', 2, P, [10, 9, 3, 0, 0], 'атлетика'),
    weapon('shuriken', 'Метательные звёздочки', 'Метательное (стр. 250)', 2, P, [9, 11, 5, 0, 0], 'атлетика'),
    gun('super_shock', '«Дефайанс Супер Шок»', 'Шокер (стр. 250)', 6, [10, 6, 0, 0, 0], 'ОВ, 4(м), до 20 м.', S, 1),
    gun('pulsar', '«Ямаха Пульсар I»', 'Шокер (стр. 250)', 4, [9, 9, 0, 0, 0], 'ОВ, 4(м), до 50 м.', S, 1),
    gun('streetline', '«Стритлайн Спешл»', 'Карманный пистолет (стр. 252)', 2, [8, 8, 0, 0, 0], 'ОВ, 6(о).'),
    gun('palm_pistol', '«Вальтер Палм Пистол»', 'Карманный пистолет (стр. 252)', 2, [12, 7, 0, 0, 0], 'ОВ/ДО, 6(л).'),
    gun('light_fire_70', '«Арес Лайт Фаер 70»', 'Лёгкий пистолет (стр. 252)', 2, [10, 7, 6, 0, 0], 'КО, 16(о).'),
    gun('beretta_101t', '«Беретта 101Т»', 'Лёгкий пистолет (стр. 252)', 2, [9, 8, 6, 0, 0], 'КО, 21(о).'),
    gun('colt_l36', '«Кольт Америка L36»', 'Лёгкий пистолет (стр. 252)', 2, [8, 8, 6, 0, 0], 'КО, 11(о).'),
    gun('security_600', '«Фичетти Секьюрити 600»', 'Лёгкий пистолет (стр. 252)', 2, [10, 9, 6, 0, 0], 'КО, 30(о).'),
    gun('black_scorpion', '«Ческа Блэк Скорпион»', 'Автоматический пистолет (стр. 253)', 2, [10, 9, 8, 0, 0], 'КО/ДО, 35(о).'),
    gun('predator_vi', '«Арес Предатор VI»', 'Тяжёлый пистолет (стр. 254)', 3, [10, 10, 8, 0, 0], 'КО/ДО, 15(о).'),
    gun('ultra_power', '«Браунинг Ультра Пауэр»', 'Тяжёлый пистолет (стр. 254)', 3, [10, 9, 6, 0, 0], 'КО, 10(о).'),
    gun('manhunter', '«Кольт Мэнхантер»', 'Тяжёлый пистолет (стр. 254)', 3, [11, 9, 7, 0, 0], 'КО, 14(о).'),
    gun('super_warhawk', '«Ругер Супер Вархок»', 'Тяжёлый пистолет (стр. 254)', 4, [8, 11, 8, 0, 0], 'КО, 6(б).'),
    gun('ingram_xi', '«Инграм Смартган XI»', 'Пистолет-пулемёт (стр. 254)', 3, [11, 9, 6, 0, 0], 'КО/ДО, 32(о).'),
    gun('hk_227', '«ХК-227»', 'Пистолет-пулемёт (стр. 254)', 3, [10, 11, 8, 0, 0], 'КО/ДО, 28(о).'),
    gun('uzi_v', '«Узи V»', 'Пистолет-пулемёт (стр. 254)', 3, [8, 8, 7, 0, 0], 'КО/ДО/НО, 24(о).'),
    gun('t250', '«Дефайанс Т-250»', 'Дробовик (стр. 255)', 4, [7, 10, 6, 0, 0], 'ОВ/КО, 5(м).'),
    gun('roomsweeper', '«Ремингтон Румсвипер»', 'Дробовик (стр. 255)', 5, [9, 8, 4, 0, 0], 'КО, 8(м).'),
    gun('ak_97', 'АК-97', 'Винтовка (стр. 256)', 5, [4, 11, 9, 7, 1], 'КО/ДО/НО, 38(о).'),
    gun('ares_alpha', '«Арес Альфа»', 'Винтовка (стр. 256)', 4, [4, 10, 9, 7, 2], 'КО/ДО/НО, 42(о).'),
    gun('colt_m23', '«Кольт М23»', 'Винтовка (стр. 256)', 4, [5, 8, 8, 8, 1], 'КО/ДО/НО, 40(о).'),
    gun('desert_strike', '«Арес Дезерт Страйк»', 'Снайперская винтовка (стр. 256)', 5, [3, 10, 10, 10, 10], 'КО, 14(о).'),
    gun('ruger_101', '«Ругер 101»', 'Снайперская винтовка (стр. 256)', 5, [2, 6, 10, 12, 11], 'КО, 8(м).'),
    gun('ingram_valiant', '«Инграм Вэлиант»', 'Лёгкий пулемёт (стр. 257)', 4, [2, 11, 12, 7, 3], 'КО/ДО/НО, 50(о).'),
    armor('synth_leather', 'Синтекожаная куртка', 1),
    armor('armor_clothing', 'Армированная одежда', 2),
    armor('actioneer', 'Боевой деловой костюм', 2),
    armor('chameleon_suit', 'Костюм-хамелеон', 2, 'Очко Преимущества на Скрытность.'),
    armor('armor_vest', 'Бронежилет', 3),
    armor('lined_coat', 'Пальто с подкладом', 3),
    armor('urban_explorer', 'Комбинезон городского исследователя', 3),
    armor('armor_jacket', 'Армированная куртка', 4),
    armor('full_body_armor', 'Доспех полной защиты', 5),
    armor('gang_jacket', 'Бандитская куртка', 1, 'Встречается в блоках противников (стр. 205), в таблице брони её нет.'),
    armor('helmet', 'Шлем', 1, '', true),
    armor('full_body_helmet', 'Шлем доспеха полной защиты', 2, '', true),
    armor('ballistic_shield', 'Баллистический щит', 2, '', true),
    action('act_scene', 'Начало сцены', 'scene_start'),
    action('act_second_wind', 'Второе дыхание (3 Преимущества)', 'second_wind'),
    action('act_shrug', 'Ранен не так сильно (4 Преимущества)', 'shrug_off'),
    action('act_stand', 'Встать', 'stand_up'),
    action('act_rest_hour', 'Час отдыха', 'rest_hour'),
    action('act_rest_day', 'День отдыха', 'rest_day'),
    { id: 'act_first_aid', rk: 'action', label: 'Первая помощь', bindings: [{ label: 'Первая помощь', effect: 'first_aid', args: { healer_pool: { expr: '@biotech_pool' } } }] },
  ],
});

const sheet = (id, name, of, values, has) => ({ id, systemId: 'shadowrun6', of, name, values, has: has.map(o => ({ of: o })), effects: [] });
const RUNNER_ACTIONS = ['act_scene', 'act_second_wind', 'act_shrug', 'act_stand', 'act_rest_hour', 'act_rest_day', 'act_first_aid'];

const sheets = () => [
  sheet('razor', 'Бритва', 'runner', {
    metatype: 'орк', body: 5, agility: 5, reaction: 4, strength: 4, willpower: 3, logic: 2, intuition: 4, charisma: 2,
    edge: 3, edge_left: 3, essence: 5, firearms: 6, close_combat: 5, athletics: 3, perception: 3, stealth: 3,
  }, ['predator_vi', 'katana', 'armor_jacket', ...RUNNER_ACTIONS]),
  sheet('silk', 'Шёлк', 'runner', {
    metatype: 'эльф', body: 2, agility: 3, reaction: 3, strength: 2, willpower: 4, logic: 3, intuition: 4, charisma: 6,
    edge: 4, edge_left: 4, con: 6, influence: 6, firearms: 3, perception: 4, biotech: 2,
  }, ['colt_l36', 'lined_coat', ...RUNNER_ACTIONS]),
  sheet('hammer', 'Молот', 'runner', {
    metatype: 'тролль', body: 8, agility: 3, reaction: 3, strength: 8, willpower: 3, logic: 2, intuition: 3, charisma: 2,
    edge: 2, edge_left: 2, close_combat: 5, firearms: 3, athletics: 4, influence: 3,
  }, ['staff', 'ak_97', 'armor_vest', 'helmet', ...RUNNER_ACTIONS]),
  sheet('humanis', 'Головорез из «Хуманиса» (ПР 0)', 'opponent', {
    body: 2, agility: 2, reaction: 2, strength: 2, willpower: 2, logic: 2, intuition: 2, charisma: 1, athletics: 1, close_combat: 3, influence: 1,
  }, ['club']),
  { ...sheet('fiveeyes', 'Член мотобанды «Пятиглазые» №1', 'grunt', {
    body: 2, agility: 2, reaction: 2, strength: 2, willpower: 2, logic: 2, intuition: 2, charisma: 1,
    athletics: 2, close_combat: 3, perception: 1, piloting: 2, firearms: 2, influence: 3,
  }, ['bike_chain', 'streetline', 'gang_jacket']), group: 'fiveeyes_squad' },
  { id: 'fiveeyes_squad', systemId: 'shadowrun6', name: 'Отряд «Пятиглазые» (ПР 1)', values: { edge_left: 1 }, has: [], effects: [] },
  { ...sheet('fiveeyes_2', 'Член мотобанды «Пятиглазые» №2', 'grunt', {
    body: 2, agility: 2, reaction: 2, strength: 2, willpower: 2, logic: 2, intuition: 2, charisma: 1,
    athletics: 2, close_combat: 3, perception: 1, piloting: 2, firearms: 2, influence: 3,
  }, ['bike_chain', 'streetline', 'gang_jacket']), group: 'fiveeyes_squad' },
  sheet('sauron', 'Громила «Сынов Саурона» (ПР 2)', 'opponent', {
    metatype: 'орк', body: 3, agility: 2, reaction: 2, strength: 4, willpower: 2, logic: 1, intuition: 2, charisma: 1,
    athletics: 2, close_combat: 4, perception: 3, firearms: 3, influence: 5,
  }, ['beretta_101t', 'knucks', 'armor_clothing']),
  sheet('lone_star', 'Патрульный «Одинокой звезды» (ПР 3)', 'opponent', {
    body: 3, agility: 3, reaction: 3, strength: 3, willpower: 3, logic: 2, intuition: 3, charisma: 2,
    athletics: 1, biotech: 1, close_combat: 4, perception: 4, con: 1, piloting: 2, firearms: 4, influence: 2, electronics: 1,
  }, ['colt_l36', 'stun_baton', 'armor_vest']),
  sheet('mafia', 'Солдат мафии (ПР 4)', 'opponent', {
    body: 3, agility: 2, reaction: 2, strength: 3, willpower: 2, logic: 1, intuition: 2, charisma: 1,
    athletics: 3, biotech: 2, close_combat: 5, perception: 4, con: 3, piloting: 1, firearms: 4, influence: 4,
  }, ['beretta_101t', 'sap', 'armor_clothing']),
  sheet('swat', 'Офицер спецназа «Одинокой звезды» (ПР 5)', 'opponent', {
    body: 4, agility: 4, reaction: 5, strength: 4, willpower: 4, logic: 2, intuition: 4, charisma: 3, essence: 3, armor_natural: 3,
    athletics: 3, biotech: 2, close_combat: 4, perception: 4, con: 2, outdoors: 2, piloting: 2, stealth: 4, firearms: 6, influence: 3, electronics: 2,
  }, ['colt_m23', 'manhunter', 'stun_baton', 'full_body_armor', 'full_body_helmet']),
  { id: 'стол', systemId: 'shadowrun6', name: 'Стол', values: { battle: 0 }, has: [], effects: [] },
];

const mannequin = (id, name) => ({ id, systemId: 'shadowrun6', name, values: { body: 4, agility: 4, reaction: 4, strength: 4, willpower: 4, logic: 4, intuition: 4, charisma: 4, edge_left: 7, firearms: 4, biotech: 2 }, has: [], effects: [] });

const world = {
  title: 'Shadowrun: Шестой мир',
  system: {
    id: 'shadowrun6',
    name: 'Shadowrun: Шестой мир',
    groups: Object.fromEntries(['Стол', 'Личное дело', 'Характеристики', 'Особые', 'Навыки', 'Наборы кубиков', 'Защита', 'Счётчики', 'Инициатива',
      'Атака', 'Преимущество', 'Лечение', 'Действия', 'Состояния', 'Общие правила', 'Листы', 'Снаряжение', 'Приёмы'].map(name => [name, {}])),
    fields: fields(),
    constants: constants(),
    tables: tables(),
    roll_edits: rollEdits(),
    initiative: { die: { constant: 'init_die' }, bonus: { expr: '@initiative' }, tags: ['инициатива'] },
    effects: effects(),
    records: records(),
    grants: ['knock_out', 'bleed_out', 'die', 'come_to', 'edge_gain', 'reroll_failures', 'push_edge', 'round_edge', 'turn_actions', 'battle_start', 'battle_end', 'glitch', 'critical_glitch'],
    mannequins: [mannequin('манекен-а', 'Манекен А'), mannequin('манекен-б', 'Манекен Б')],
  },
  compendium: compendium(),
  sheets: sheets(),
};

const done = addressesOf(spendOf(namesOf(fieldRollsOf(argsOf(modifiersOf(world))))));
done.system = withTableFields(done.system);

const out = fileURLToPath(new URL('../shadowrun.world.json', import.meta.url));
writeFileSync(out, `${JSON.stringify(done, null, 2)}\n`);
console.log(`Shadowrun 6: полей ${done.system.fields.length}, эффектов ${Object.keys(world.system.effects).length}, записей ${world.compendium.records.length}, листов ${world.sheets.length}`);
