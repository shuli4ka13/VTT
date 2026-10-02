import { diceExample } from './glossary.ts';

export interface StepWords {
  label: string;
  hint: string;
  slots: readonly Record<string, unknown>[];
  outputs: readonly { path: string; label: string; kind?: string }[];
  reasons: Readonly<Record<string, string>>;
  breakLines: Readonly<Record<string, string>>;
}

export const STEP_WORDS = {
  roll: {
    label: 'Бросок',
    hint: `Бросить кости или посчитать число. Если указано, кто бросает, — это чей-то бросок: на него действуют правки и «увидев кости». Без этого — просто расчёт. Кость пишется как ${diceExample}.`,
    slots: [
      { key: 'die', label: 'Кость', kind: 'ref', main: true, allow: ['name', 'expr', 'empty'], refersTo: 'constant' },
      { key: 'count', label: 'Сколько костей', kind: 'ref', allow: ['expr', 'empty'] },
      { key: 'fixed', label: 'Формула', kind: 'ref', main: true, allow: ['expr', 'empty'] },
      { key: 'bonus', label: 'Прибавка', kind: 'ref', main: true, allow: ['expr', 'empty'] },
      { key: 'by', label: 'Кто бросает', kind: 'sheet', allow: ['expr', 'empty'] },
      { key: 'against', label: 'Против кого', kind: 'sheet', allow: ['expr', 'empty'] },
      { key: 'tags', label: 'Метки броска', kind: 'roll', allow: [] },
    ],
    outputs: [
      { path: '', label: 'сколько вышло всего, с прибавками', kind: 'number' },
      { path: '.natural', label: 'что выпало на костях, без прибавок', kind: 'number' },
      { path: '.rolled', label: 'сколько костей бросили', kind: 'number' },
      { path: '.atMax', label: 'сколько костей легло максимумом', kind: 'number' },
      { path: '.atMin', label: 'сколько костей легло единицей', kind: 'number' },
      { path: '.edited', label: 'да или нет: бросок правили', kind: 'boolean' },
    ],
    reasons: {},
    breakLines: {},
  },
  check: {
    label: 'Проверка',
    hint: 'Сравнить число или бросок с порогом. Можно остановить цепочку при провале или при успехе.',
    slots: [
      { key: 'value', label: 'Что проверяем', kind: 'ref', main: true, required: true, allow: ['ref', 'expr', 'const', 'param'] },
      { key: 'versus', label: 'С чем', kind: 'ref', main: true, required: true, allow: ['ref', 'expr', 'const', 'param'] },
      {
        key: 'successWhen', label: 'Успех, если', kind: 'choice', fallback: 'atLeast',
        options: ['atLeast', 'notOver', 'over', 'under', 'equals'],
        choice: [['atLeast', 'не меньше порога'], ['notOver', 'не больше порога'],
          ['over', 'строго больше'], ['under', 'строго меньше'], ['equals', 'ровно порог']],
      },
      { key: 'succeedOn', label: 'Всегда успех, если на кости не меньше', kind: 'ref', allow: ['expr', 'const', 'param', 'prop', 'empty'] },
      { key: 'failOn', label: 'Всегда провал, если на кости не больше', kind: 'ref', allow: ['expr', 'const', 'param', 'prop', 'empty'] },
      {
        key: 'continueOn', label: 'Дальше при', kind: 'choice', options: ['success', 'fail', 'always'], fallback: 'success',
        choice: [['success', 'успехе'], ['fail', 'провале'], ['always', 'всегда — ветвят следующие шаги']],
      },
      { key: 'degrees', label: 'Степени успеха', kind: 'degrees' },
      { key: 'note', label: 'Что сказать при остановке', kind: 'text', allow: [] },
    ],
    outputs: [
      { path: '.success', label: 'да или нет: проверка пройдена', kind: 'boolean' },
      { path: '.margin', label: 'на сколько перебил порог', kind: 'number' },
      { path: '.total', label: 'сколько вышло всего', kind: 'number' },
      { path: '.natural', label: 'что выпало на костях, без прибавок', kind: 'number' },
      { path: '.degree', label: 'какая ступень успеха', kind: 'text' },
      { path: '.versus', label: 'порог', kind: 'number' },
      { path: '.atMax', label: 'сколько костей легло максимумом', kind: 'number' },
      { path: '.atMin', label: 'сколько костей легло единицей', kind: 'number' },
    ],
    reasons: { 'check-miss': 'не вышло', 'check-held': 'устоял' },
    breakLines: { success: 'если не вышло — стоп', fail: 'если вышло — стоп' },
  },
  apply: {
    label: 'Изменение',
    hint: 'Изменить поле листа: @цель.хиты, @носитель.ки. Единственный шаг, который меняет значения.',
    slots: [
      { key: 'target', label: 'Какое поле меняем', kind: 'field', main: true, required: true, allow: ['expr', 'param'] },
      {
        key: 'direction', label: 'Как', kind: 'choice', main: true, fallback: 'subtract',
        options: ['add', 'subtract', 'set'],
        choice: [['subtract', 'вычесть'], ['add', 'прибавить'], ['set', 'задать']],
      },
      { key: 'value', label: 'Сколько', kind: 'ref', main: true, required: true, allow: ['ref', 'expr', 'const', 'param'] },
    ],
    outputs: [
      { path: '.amount', label: 'сколько применилось', kind: 'number' },
      { path: '.overkill', label: 'сколько не влезло', kind: 'number' },
    ],
    reasons: {},
    breakLines: {},
  },
  each: {
    label: 'Для каждой цели',
    hint: 'Делит цепочку действия: шаги выше выполняются один раз, шаги ниже — для каждого листа из списка по очереди.',
    slots: [
      { key: 'of', label: 'Из какого списка', kind: 'input', main: true, required: true, allow: [] },
      { key: 'as', label: 'Как назвать каждого', kind: 'text', main: true, required: true, allow: [] },
    ],
    outputs: [],
    reasons: {},
    breakLines: {},
  },
  'roll-add': {
    label: 'Докинуть',
    hint: 'Увидев кости: докинуть ещё к выпавшему и, если нужно, оставить лучшую или худшую. Выпавшее остаётся.',
    slots: [
      { key: 'count', label: 'Сколько костей', kind: 'ref', main: true, required: true, allow: ['expr'] },
      { key: 'sides', label: 'Сколько граней', kind: 'ref', allow: ['expr', 'empty'] },
      {
        key: 'keep', label: 'Оставить', kind: 'choice', options: ['', 'best', 'worst'], fallback: '',
        choice: [['', 'все'], ['best', 'лучшую'], ['worst', 'худшую']],
      },
      {
        key: 'explode', label: 'Максимум', kind: 'flag', fallback: 'false',
        choice: [['false', 'как обычно'], ['true', 'взрывается — во всём наборе']],
      },
    ],
    outputs: [],
    reasons: {},
    breakLines: {},
  },
  'roll-reroll': {
    label: 'Перебросить',
    hint: 'Увидев кости: перебросить кости, на которых выпало не больше числа. Остальные остаются.',
    slots: [
      { key: 'upTo', label: 'Перебросить, где выпало не больше', kind: 'ref', main: true, required: true, allow: ['expr', 'const', 'param', 'prop'] },
    ],
    outputs: [],
    reasons: {},
    breakLines: {},
  },
  'roll-plus': {
    label: 'Прибавить',
    hint: 'Увидев кости: прибавить к итогу число или кость. Натуральная кость не меняется.',
    slots: [
      { key: 'value', label: 'Сколько', kind: 'ref', main: true, required: true, allow: ['expr', 'const', 'param', 'prop'] },
    ],
    outputs: [],
    reasons: {},
    breakLines: {},
  },
  status: {
    label: 'Состояние',
    hint: 'Повесить эффект на лист или снять его.',
    slots: [
      {
        key: 'mode', label: 'Что делаем', kind: 'choice', options: ['apply', 'remove'], main: true, fallback: 'apply',
        choice: [['apply', 'наложить'], ['remove', 'снять']],
      },
      {
        key: 'effect', label: 'Какой эффект', kind: 'ref', main: true, required: true,
        allow: ['name', 'expr', 'empty'], refersTo: 'effect',
      },
      { key: 'to', label: 'На кого', kind: 'sheet', main: true, required: true, allow: ['expr'] },
      { key: 'args', label: 'Что наложенное запомнит', kind: 'args', allow: [] },
    ],
    outputs: [],
    reasons: {},
    breakLines: {},
  },
  table: {
    label: 'Таблица',
    hint: 'Прочитать строку таблицы по числу или броску: травма, исход, сложность по дистанции.',
    slots: [
      { key: 'table', label: 'Какая таблица', kind: 'ref', main: true, required: true, allow: ['name', 'expr'], refersTo: 'table' },
      { key: 'dice', label: 'Бросить', kind: 'ref', main: true, allow: ['name', 'expr', 'empty'], refersTo: 'constant' },
      { key: 'value', label: 'Или взять число', kind: 'ref', main: true, allow: ['expr', 'empty'] },
    ],
    outputs: [{ path: '', label: 'строка таблицы', kind: 'text' }],
    reasons: {},
    breakLines: {},
  },
  emit: {
    label: 'Вызов',
    hint: 'Вызвать общий эффект из словаря: урон, лечение. Что с ним делать — знает правило приёма.',
    slots: [
      { key: 'effect', label: 'Кого зовём', kind: 'event', main: true, required: true, allow: [] },
      { key: 'args', label: 'Что передаётся', kind: 'args', main: true, allow: [] },
    ],
    outputs: [
      { path: '.incoming', label: 'отправлено', kind: 'number' },
      { path: '.amount', label: 'дошло после правок', kind: 'number' },
    ],
    reasons: { 'emit-stopped': 'общий эффект оборвался' },
    breakLines: {},
  },
} as const satisfies Record<string, StepWords>;

export type StepType = keyof typeof STEP_WORDS;

export const stepLabel = (type: string): string => (STEP_WORDS as Record<string, StepWords>)[type]?.label ?? type;

export const reasonWordOf = (type: string, reason: string): string | null =>
  (STEP_WORDS as Record<string, StepWords>)[type]?.reasons[reason] ?? null;

export const forcedWords = (die: number, success: boolean): string => `на кости ${die} — всегда ${success ? 'успех' : 'провал'}`;
