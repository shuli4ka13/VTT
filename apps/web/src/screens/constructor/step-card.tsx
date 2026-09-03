import type { System, Effect, Step } from '@vtt/schema';
import { compile } from '@vtt/engine/formula';
import { kindOf, declaredProps } from './slots.tsx';
import type { SlotKind, EarlierStep } from './slots.tsx';

interface SlotSpec {
  key: string;
  label: string;
  hint?: string;

  main?: boolean;
  allow?: SlotKind[];

  required?: boolean;

  choice?: readonly (readonly [string, string])[];

  fallback?: string;
}

interface StepSpec {
  type: string;
  label: string;

  hint: string;
  slots: SlotSpec[];
}

export const STEP_SPECS: StepSpec[] = [
  {
    type: 'threshold',
    label: 'Порог',
    hint: 'Бросок против величины. Не вышло — цепочка обрывается.',
    slots: [
      { key: 'roll.die', label: 'Кость', main: true, required: true, allow: ['constant'] },
      { key: 'roll.bonus', label: 'Прибавка к броску', main: true, allow: ['expr', 'const', 'param', 'prop', 'empty'] },
      { key: 'versus', label: 'Против чего', main: true, required: true, allow: ['tag', 'expr', 'const'] },
      { key: 'roll.check', label: 'Какой это бросок', allow: [] },
      { key: 'side', label: 'Кто бросает', fallback: 'source',
        choice: [['source', 'отправитель — это атака'], ['target', 'цель — это спасбросок']] },
      { key: 'successWhen', label: 'Успех, если бросок', fallback: 'atLeast',
        choice: [['atLeast', 'не меньше порога'], ['notOver', 'не больше порога'],
          ['over', 'строго больше'], ['under', 'строго меньше']] },
      { key: 'continueOn', label: 'Дальше при', fallback: 'success',
        choice: [['success', 'успехе'], ['fail', 'провале']] },
    ],
  },
  {
    type: 'amount',
    label: 'Величина',
    hint: 'Вычислить число: бросок костей, превышение или фикс записи.',
    slots: [
      { key: 'source', label: 'Откуда число', main: true, fallback: 'roll',
        choice: [['roll', 'свой бросок костей'], ['margin', 'превышение шага'], ['item', 'фикс записи']] },
      { key: 'dice', label: 'Кости', main: true, allow: ['prop', 'const', 'param', 'empty'] },
      { key: 'bonus', label: 'Прибавка', main: true, allow: ['expr', 'const', 'param', 'empty'] },
      { key: 'fixed', label: 'Фикс записи', allow: ['prop', 'const', 'empty'] },
      { key: 'margin', label: 'Превышение шага', allow: ['ref', 'empty'] },
    ],
  },
  {
    type: 'compare',
    label: 'Сравнение',
    hint: 'Величина против поля цели. Не дотянула — цепочка обрывается.',
    slots: [
      { key: 'value', label: 'Что сравниваем', main: true, required: true, allow: ['ref', 'expr', 'const'] },
      { key: 'versus', label: 'С чем', main: true, required: true, allow: ['tag', 'expr', 'const'] },
      { key: 'breakIf', label: 'Обрыв когда', fallback: 'less',
        choice: [['less', 'величина меньше'], ['atMost', 'величина не больше'], ['never', 'никогда']] },
    ],
  },
  {
    type: 'apply',
    label: 'Применить',
    hint: 'Изменить поле цели. Единственный шаг, который что-то меняет.',
    slots: [
      { key: 'target', label: 'Какое поле меняем', main: true, required: true, allow: ['tag'] },
      { key: 'direction', label: 'Как', main: true, fallback: 'subtract',
        choice: [['subtract', 'вычесть'], ['add', 'прибавить'], ['set', 'задать']] },
      { key: 'value', label: 'Сколько', main: true, required: true, allow: ['ref', 'expr', 'const'] },
      { key: 'floor', label: 'Не ниже', allow: ['const', 'tag', 'empty'] },
      { key: 'ceiling', label: 'Не выше', allow: ['const', 'tag', 'empty'] },
      { key: 'targetModifiers', label: 'Сопротивления цели', fallback: 'true',
        choice: [['true', 'учитываются'], ['false', 'не учитываются']] },
    ],
  },
  {
    type: 'status',
    label: 'Состояние',
    hint: 'Повесить эффект на цель или снять его.',
    slots: [
      { key: 'mode', label: 'Что делаем', main: true, fallback: 'apply',
        choice: [['apply', 'вешаем'], ['remove', 'снимаем']] },
      { key: 'effect', label: 'Какой эффект', main: true, required: true, allow: ['prop', 'const', 'param', 'empty'] },
    ],
  },
];

export const specOf = (type: string) => STEP_SPECS.find(s => s.type === type) ?? null;

const formulaDeps = (source: string): readonly string[] | null => {
  try { return compile(source).deps; } catch { return null; }
};

const read = (step: Step, path: string): unknown =>
  path.split('.').reduce<any>((node, key) => (node == null ? undefined : node[key]), step);

const write = (step: Step, path: string, value: unknown): void => {
  const keys = path.split('.');
  const last = keys.pop()!;
  let node = step as any;
  for (const key of keys) {
    node[key] ??= {};
    node = node[key];
  }
  if (value === null || value === undefined) delete node[last];
  else node[last] = value;
};

export interface Problem { text: string; missingField?: string }

export function problemOf(step: Step, system: System, effect: Effect, earlier: EarlierStep[]): Problem | null {
  const spec = specOf(step.type);
  if (!spec) return { text: `движок не знает типа шага «${step.type}»` };

  for (const slot of spec.slots) {
    const value = read(step, slot.key);
    if (slot.required && (value === null || value === undefined)) {
      return { text: `не заполнено: ${slot.label.toLowerCase()}` };
    }
    if (value === null || value === undefined) continue;

    const kind = kindOf(value);
    const ref = value as Record<string, unknown>;

    if (kind.kind === 'prop') {
      const key = String(ref.prop ?? ref.item);
      if (!key) return { text: `${slot.label.toLowerCase()}: свойство не выбрано` };
      if (!declaredProps(system).has(key)) {
        return { text: `свойство «${key}» не объявлено ни одним родом записей — заведите его на вкладке «Записи»` };
      }
    }
    if (kind.kind === 'param') {
      const key = String(ref.param);
      if (!effect.params?.some(p => p.key === key)) {
        return { text: `потребность «${key}» эффектом не объявлена` };
      }
    }
    if (kind.kind === 'tag') {
      const tag = String(ref.tag);
      if (!tag) return { text: `${slot.label.toLowerCase()}: поле не выбрано` };
      if (!system.fields.some(f => f.tag === tag)) {
        return { text: `поля «${tag}» в системе нет — заведите его на вкладке «Лист»`, missingField: tag };
      }
    }
    if (kind.kind === 'expr') {
      const source = String(ref.expr ?? '').trim();
      const deps = source ? formulaDeps(source) : null;

      const missing = deps?.find(tag =>
        !system.fields.some(f => f.tag === tag) && !earlier.some(step => step.id === tag));
      if (missing) {
        return {
          text: `формула ссылается на поле «${missing}», которого в системе нет — заведите его на вкладке «Лист»`,
          missingField: missing,
        };
      }
    }
    if (kind.kind === 'constant') {
      const name = String(ref.constant);
      if (!system.constants?.[name]) return { text: `кости «${name}» в системе нет` };
    }
    if (kind.kind === 'ref') {
      const name = String(ref.ref).split('.')[0]!;
      if (!earlier.some(s => s.id === name)) {
        return { text: `шага «${name}» выше по цепочке нет — на его результат не сослаться` };
      }
    }
  }
  return null;
}
