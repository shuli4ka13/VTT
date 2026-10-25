import { diceExample } from './glossary.ts';

export interface StepWords {
  label: string;
  hint: string;
  slots: readonly Record<string, unknown>[];
  outputs: readonly { path: string; label: string; kind?: string }[];
  reasons: Readonly<Record<string, string>>;
  breakLines: Readonly<Record<string, string>>;
}

export interface SlotGate { key: string; is: string }

export function slotShown(slot: { onlyIf?: SlotGate }, step: Readonly<Record<string, unknown>>, slots: readonly Record<string, unknown>[]): boolean {
  const gate = slot.onlyIf;
  if (!gate) return true;
  const ruler = slots.find(one => one.key === gate.key) as { fallback?: unknown } | undefined;
  const value = step[gate.key] ?? ruler?.fallback ?? '';
  return String(value) === gate.is;
}

export const STEP_WORDS = {
  roll: {
    label: 'Бросок',
    hint: `Бросить кости или посчитать число. Если указано, кто бросает, — это чей-то бросок: на него действуют правки и «увидев кости»; против кого — решает сравнение, лист на другой его стороне. Без бросающего — просто расчёт. Кость пишется как ${diceExample}.`,
    slots: [
      { key: 'die', label: 'Кость', kind: 'ref', main: true, allow: ['name', 'expr', 'empty'], refersTo: 'constant' },
      { key: 'count', label: 'Сколько костей', kind: 'ref', allow: ['expr', 'empty'] },
      { key: 'fixed', label: 'Формула', kind: 'ref', main: true, allow: ['expr', 'empty'] },
      { key: 'bonus', label: 'Прибавка', kind: 'ref', main: true, allow: ['expr', 'empty'] },
      { key: 'by', label: 'Кто бросает', kind: 'sheet', allow: ['expr', 'empty'] },
      { key: 'tags', label: 'Метки броска', kind: 'roll', allow: [] },
    ],
    outputs: [
      { path: '', label: 'сколько вышло всего, с прибавками', kind: 'number' },
      { path: '.natural', label: 'что выпало на костях, без прибавок', kind: 'number' },
      { path: '.rolled', label: 'сколько костей бросили', kind: 'number' },
      { path: '.atMax', label: 'сколько костей легло максимумом', kind: 'number' },
      { path: '.atMin', label: 'сколько костей легло единицей', kind: 'number' },
      { path: '.edited', label: 'да или нет: правили', kind: 'boolean' },
    ],
    reasons: {},
    breakLines: {},
  },
  check: {
    label: 'Проверка',
    hint: 'Сравнить число или бросок с порогом. Итог — да или нет (или ступень): его читают условия «Если» ниже.',
    slots: [
      { key: 'value', label: 'Что проверяем', kind: 'ref', main: true, required: true, allow: ['expr'] },
      { key: 'versus', label: 'С чем', kind: 'ref', main: true, required: true, allow: ['expr'] },
      {
        key: 'successWhen', label: 'Успех, если', kind: 'choice', fallback: 'atLeast',
        options: ['atLeast', 'notOver', 'over', 'under', 'equals'],
        choice: [['atLeast', 'не меньше порога'], ['notOver', 'не больше порога'],
          ['over', 'строго больше'], ['under', 'строго меньше'], ['equals', 'ровно порог']],
      },
      { key: 'succeedOn', label: 'Всегда успех, если на кости не меньше', kind: 'ref', allow: ['expr', 'empty'] },
      { key: 'failOn', label: 'Всегда провал, если на кости не больше', kind: 'ref', allow: ['expr', 'empty'] },
      { key: 'degrees', label: 'Степени успеха', kind: 'degrees' },
    ],
    outputs: [
      { path: '.success', label: 'да или нет: пройдена', kind: 'boolean' },
      { path: '.margin', label: 'на сколько перебил порог', kind: 'number' },
      { path: '.total', label: 'сколько вышло всего', kind: 'number' },
      { path: '.natural', label: 'что выпало на костях, без прибавок', kind: 'number' },
      { path: '.degree', label: 'какая ступень успеха', kind: 'text' },
      { path: '.versus', label: 'порог', kind: 'number' },
      { path: '.atMax', label: 'сколько костей легло максимумом', kind: 'number' },
      { path: '.atMin', label: 'сколько костей легло единицей', kind: 'number' },
    ],
    reasons: {},
    breakLines: {},
  },
  apply: {
    label: 'Изменение',
    hint: 'Изменить поле листа: @цель.хиты, @носитель.ки. Единственный шаг, который меняет значения.',
    slots: [
      { key: 'target', label: 'Какое поле меняем', kind: 'field', main: true, required: true, allow: ['expr'] },
      {
        key: 'direction', label: 'Как', kind: 'choice', main: true, fallback: 'subtract',
        options: ['add', 'subtract', 'set'],
        choice: [['subtract', 'вычесть'], ['add', 'прибавить'], ['set', 'задать']],
      },
      { key: 'value', label: 'Сколько', kind: 'ref', main: true, required: true, allow: ['expr'] },
    ],
    outputs: [
      { path: '.amount', label: 'сколько применилось', kind: 'number' },
      { path: '.overkill', label: 'сколько не влезло', kind: 'number' },
    ],
    reasons: {},
    breakLines: {},
  },
  each: {
    label: 'Для каждого из списка',
    hint: 'Шаги выше выполняются один раз, шаги ниже — для каждого из списка по очереди: для каждой цели из входа-списка (только у действия кнопкой) или для каждой строки таблицы. Вызовы внутри цикла в подписке тратят её запас ответов — больше 32 подряд не пройдут.',
    slots: [
      { key: 'of', label: 'Из какого списка', kind: 'input', main: true, allow: [] },
      { key: 'rows', label: 'Строки таблицы', kind: 'ref', refersTo: 'table', allow: ['name'] },
      { key: 'as', label: 'Как зовётся строка', kind: 'name', allow: [] },
    ],
    outputs: [],
    reasons: {},
    breakLines: {},
  },
  branch: {
    label: 'Если',
    hint: 'Шаги внутри выполняются, только если условие верно. Ниже — «иначе, если» и «иначе».',
    slots: [
      { key: 'if', label: 'Условие', kind: 'ref', main: true, required: true, allow: ['expr'] },
    ],
    outputs: [],
    reasons: {},
    breakLines: {},
  },
  orElse: {
    label: 'Иначе',
    hint: 'Ветка выполняется, если ни одна ветка выше не подошла; с условием — «иначе, если».',
    slots: [
      { key: 'if', label: 'Условие', kind: 'ref', main: true, allow: ['expr', 'empty'] },
    ],
    outputs: [],
    reasons: {},
    breakLines: {},
  },
  end: {
    label: 'Конец «Если»',
    hint: 'Закрывает блок «Если».',
    slots: [],
    outputs: [],
    reasons: {},
    breakLines: {},
  },
  stop: {
    label: 'Стоп',
    hint: 'Дальше не идём. В цене и до «Для каждого из» — действие не состоялось, ничего не изменилось; в теле по цели — стоп для этой цели.',
    slots: [
      { key: 'note', label: 'Что сказать в журнал', kind: 'ref', allow: ['expr', 'empty'] },
    ],
    outputs: [],
    reasons: { stop: 'стоп' },
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
    hint: 'Увидев кости: перебросить кости, на которых выпало не больше числа, — или одну меньшую кость (с преимуществом это та, что не взята в расчёт). Засчитывается новая грань, остальные кости остаются.',
    slots: [
      {
        key: 'which', label: 'Что перебросить', kind: 'choice', options: ['', 'lowest'], fallback: '',
        choice: [['', 'кости не выше числа'], ['lowest', 'одну меньшую кость']],
      },
      { key: 'upTo', label: 'Перебросить, где выпало не больше', kind: 'ref', main: true, required: true, allow: ['expr'], onlyIf: { key: 'which', is: '' }, seed: { expr: '1' } },
    ],
    outputs: [],
    reasons: {},
    breakLines: {},
  },
  'roll-bump': {
    label: 'Поднять кость',
    hint: 'Увидев кости: прибавить к одной кости — к той, что от прибавки станет успехом (в наборе), иначе к самой низкой. Не выше граней кости.',
    slots: [
      { key: 'value', label: 'На сколько', kind: 'ref', main: true, required: true, allow: ['expr'], seed: { expr: '1' } },
    ],
    outputs: [],
    reasons: {},
    breakLines: {},
  },
  'roll-plus': {
    label: 'Прибавить',
    hint: 'Увидев кости: прибавить к итогу число или кость — кинуть(к6), кинуть(@кость). Натуральная кость не меняется, кость видна в журнале.',
    slots: [
      { key: 'value', label: 'Сколько', kind: 'ref', main: true, required: true, allow: ['expr'], placeholder: 'число или кость: кинуть(к6), кинуть(@кость)', dice: true },
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
      { key: 'column', label: 'Какая колонка', kind: 'ref', allow: ['name', 'empty'] },
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
      { path: '.incoming', label: 'сколько передали', kind: 'number' },
      { path: '.amount', label: 'сколько после правок вызова', kind: 'number' },
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
