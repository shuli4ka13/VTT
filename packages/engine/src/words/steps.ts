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
  threshold: {
    label: 'Проверка',
    hint: `Бросок против величины. Не вышло — цепочка обрывается. Кость пишется как ${diceExample}.`,
    slots: [
      { key: 'roll.die', label: 'Кость', kind: 'ref', main: true, required: true, allow: ['constant'] },
      { key: 'roll.count', label: 'Сколько костей', kind: 'ref', allow: ['expr', 'const', 'param', 'prop', 'empty'] },
      {
        key: 'roll.bonus', label: 'Прибавка к броску', kind: 'ref', main: true,
        allow: ['expr', 'const', 'param', 'prop', 'empty'],
      },
      {
        key: 'versus', label: 'Против чего', kind: 'ref', main: true, required: true,
        allow: ['tag', 'expr', 'const', 'param', 'ref'],
      },
      { key: 'roll.tags', label: 'Метки броска', kind: 'roll', allow: [] },
      {
        key: 'side', label: 'Кто бросает', kind: 'choice', options: ['sender', 'target'], fallback: 'sender',
        choice: [['sender', 'отправитель — это атака'], ['target', 'цель — это спасбросок']],
      },
      {
        key: 'successWhen', label: 'Успех, если бросок', kind: 'choice', fallback: 'atLeast',
        options: ['atLeast', 'notOver', 'over', 'under', 'equals'],
        choice: [['atLeast', 'не меньше порога'], ['notOver', 'не больше порога'],
          ['over', 'строго больше'], ['under', 'строго меньше'], ['equals', 'ровно порог']],
      },
      {
        key: 'continueOn', label: 'Дальше при', kind: 'choice', options: ['success', 'fail', 'always'], fallback: 'success',
        choice: [['success', 'успехе'], ['fail', 'провале'], ['always', 'всегда — ветвят следующие шаги']],
      },
      { key: 'degrees', label: 'Степени успеха', kind: 'degrees' },
    ],
    outputs: [
      { path: '.success', label: 'да или нет: взят ли порог', kind: 'boolean' },
      { path: '.margin', label: 'на сколько перебил порог', kind: 'number' },
      { path: '.total', label: 'сколько вышло всего, с прибавками', kind: 'number' },
      { path: '.natural', label: 'что выпало на костях, без прибавок', kind: 'number' },
      { path: '.degree', label: 'какая ступень успеха', kind: 'text' },
      { path: '.rolled', label: 'сколько костей бросили', kind: 'number' },
      { path: '.atMax', label: 'сколько костей легло максимумом', kind: 'number' },
      { path: '.atMin', label: 'сколько костей легло единицей', kind: 'number' },
      { path: '.edited', label: 'да или нет: бросок правили', kind: 'boolean' },
      { path: '.versus', label: 'сколько вышло у второй стороны: порог или встречный бросок', kind: 'number' },
      { path: '.versusNatural', label: 'встречный бросок — что выпало на костях', kind: 'number' },
    ],
    reasons: { 'threshold-miss': 'промах', 'threshold-held': 'цель устояла' },
    breakLines: { success: 'если порог не взят — промах', fail: 'если порог взят — цель устояла' },
  },
  compare: {
    label: 'Сравнение',
    hint: 'Величина против поля цели. Не дотянула — цепочка обрывается.',
    slots: [
      { key: 'value', label: 'Что сравниваем', kind: 'ref', main: true, required: true, allow: ['ref', 'expr', 'const'] },
      {
        key: 'versus', label: 'С чем', kind: 'ref', main: true, required: true,
        allow: ['tag', 'expr', 'const', 'param', 'ref'],
      },
      {
        key: 'breakIf', label: 'Обрыв когда', kind: 'choice', options: ['less', 'atMost', 'never'], fallback: 'less',
        choice: [['less', 'величина меньше'], ['atMost', 'величина не больше'], ['never', 'никогда']],
      },
      { key: 'note', label: 'Что сказать при обрыве', kind: 'text', allow: [] },
    ],
    outputs: [{ path: '.margin', label: 'разница', kind: 'number' }],
    reasons: { 'compare-short': 'не пробило' },
    breakLines: {
      less: 'если величина меньше порога — не пробило',
      atMost: 'если величина не выше порога — не пробило',
    },
  },
  amount: {
    label: 'Число',
    hint: 'Вычислить число: бросок, превышение или фикс записи.',
    slots: [
      {
        key: 'source', label: 'Откуда число', kind: 'choice', options: ['roll', 'margin', 'item'], main: true, fallback: 'roll',
        choice: [['roll', 'свой бросок костей'], ['margin', 'превышение шага'], ['item', 'фикс записи']],
      },
      { key: 'dice', label: 'Кости', kind: 'ref', main: true, allow: ['prop', 'const', 'param', 'constant', 'empty'] },
      { key: 'bonus', label: 'Прибавка', kind: 'ref', main: true, allow: ['expr', 'const', 'param', 'empty'] },
      { key: 'fixed', label: 'Фикс записи', kind: 'ref', allow: ['prop', 'const', 'param', 'empty'] },
      { key: 'margin', label: 'Превышение шага', kind: 'ref', allow: ['ref', 'empty'] },
      { key: 'count', label: 'Сколько раз кинуть кости', kind: 'ref', allow: ['expr', 'const', 'param', 'tag', 'empty'] },
      { key: 'double', label: 'Удвоить кости, если', kind: 'guard' },
      { key: 'scale', label: 'Взять долю, если', kind: 'scale' },
    ],
    outputs: [{ path: '', label: 'посчитанное число', kind: 'number' }],
    reasons: {},
    breakLines: {},
  },
  apply: {
    label: 'Изменение',
    hint: 'Изменить поле цели. Единственный шаг, который что-то меняет.',
    slots: [
      { key: 'target', label: 'Какое поле меняем', kind: 'tag', main: true, required: true, allow: ['tag', 'param'] },
      {
        key: 'direction', label: 'Как', kind: 'choice', main: true, fallback: 'subtract',
        options: ['add', 'subtract', 'set'],
        choice: [['subtract', 'вычесть'], ['add', 'прибавить'], ['set', 'задать']],
      },
      { key: 'value', label: 'Сколько', kind: 'ref', main: true, required: true, allow: ['ref', 'expr', 'const', 'param'] },
      {
        key: 'targetModifiers', label: 'Сопротивления цели', kind: 'flag', fallback: 'true',
        choice: [['true', 'учитываются'], ['false', 'не учитываются']],
      },
    ],
    outputs: [
      { path: '.amount', label: 'сколько применилось', kind: 'number' },
      { path: '.overkill', label: 'сколько не влезло', kind: 'number' },
    ],
    reasons: {},
    breakLines: {},
  },
  status: {
    label: 'Состояние',
    hint: 'Повесить эффект на цель или снять его.',
    slots: [
      {
        key: 'mode', label: 'Что делаем', kind: 'choice', options: ['apply', 'remove'], main: true, fallback: 'apply',
        choice: [['apply', 'наложить'], ['remove', 'снять']],
      },
      {
        key: 'effect', label: 'Какой эффект', kind: 'ref', main: true, required: true,
        allow: ['prop', 'const', 'param', 'empty'], refersTo: 'effect',
      },
      { key: 'carry', label: 'Что наложенное запомнит', kind: 'ref', allow: ['ref', 'expr', 'const', 'param', 'empty'] },
    ],
    outputs: [],
    reasons: {},
    breakLines: {},
  },
  table: {
    label: 'Таблица',
    hint: 'Прочитать строку таблицы по числу или броску: травма, исход, сложность по дистанции.',
    slots: [
      { key: 'table', label: 'Какая таблица', kind: 'ref', main: true, required: true, allow: ['const', 'param', 'prop'] },
      { key: 'dice', label: 'Бросить', kind: 'ref', main: true, allow: ['const', 'param', 'prop', 'constant', 'empty'] },
      { key: 'value', label: 'Или взять число', kind: 'ref', main: true, allow: ['ref', 'expr', 'const', 'param', 'prop', 'empty'] },
    ],
    outputs: [{ path: '', label: 'строка таблицы', kind: 'text' }],
    reasons: {},
    breakLines: {},
  },
  emit: {
    label: 'Вызов',
    hint: 'Вызвать общий эффект из словаря: урон, лечение. Что с ним делать — знает правило приёма.',
    slots: [
      { key: 'event', label: 'Кого зовём', kind: 'event', main: true, required: true, allow: [] },
      { key: 'args', label: 'Что отправляем', kind: 'args', main: true, allow: [] },
      {
        key: 'strict', label: 'Если общий эффект оборвался', kind: 'flag', fallback: 'false',
        choice: [['false', 'идти дальше'], ['true', 'оборваться тоже']],
      },
    ],
    outputs: [
      { path: '.incoming', label: 'отправлено', kind: 'number' },
      { path: '.amount', label: 'дошло до цели', kind: 'number' },
    ],
    reasons: { 'emit-stopped': 'общий эффект оборвался' },
    breakLines: { strict: 'если общий эффект оборвался — обрыв и здесь' },
  },
} as const satisfies Record<string, StepWords>;

export type StepType = keyof typeof STEP_WORDS;

export const stepLabel = (type: string): string => (STEP_WORDS as Record<string, StepWords>)[type]?.label ?? type;

export const reasonWordOf = (type: string, reason: string): string | null =>
  (STEP_WORDS as Record<string, StepWords>)[type]?.reasons[reason] ?? null;
