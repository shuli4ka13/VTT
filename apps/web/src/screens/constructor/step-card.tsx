// Карточка шага.
//
// Главная переделка против PoC. Там карточка показывала 18 контролов, из
// которых 10 в обеих образцовых системах были одинаковы — то есть это были
// не решения, а умолчания, притворявшиеся решениями. Здесь слоты разделены:
//
//   ГЛАВНОЕ    — то, что различается между системами. Всегда на виду.
//   ТОНКОСТИ   — то, что почти всегда стоит по умолчанию. Свёрнуто, и в
//                свёрнутом виде читается одной строкой словами.
//
// Разделение не косметическое: оно отвечает на вопрос «что мне тут заполнять»,
// с которого началась эта переделка.
//
// Второе: приговор живёт НА КАРТОЧКЕ виноватого шага. Красная строка в шапке
// экрана не помогает найти, какой из трёх шагов сломан.

import type { ReactNode } from 'react';
import type { System, Effect, Step, SlotRef } from '@vtt/schema';
import { Card, CardHead, Field, Button, Select, Verdict, Fold } from '../../ui/primitives.tsx';
import { SlotEditor, kindOf, declaredProps } from './slots.tsx';
import type { SlotContext, SlotKind } from './slots.tsx';

interface SlotSpec {
  key: string;
  label: string;
  hint?: string;
  /** Слот в «главном» или в «тонкостях». */
  main?: boolean;
  allow?: SlotKind[];
  /** Слот обязателен: пустой подсвечивается как незаконченный. */
  required?: boolean;
  /** Слот-выбор из фиксированного словаря, а не структурная ссылка. */
  choice?: readonly (readonly [string, string])[];
  /** Умолчание для слота-выбора. */
  fallback?: string;
}

interface StepSpec {
  type: string;
  label: string;
  icon: string;
  hint: string;
  slots: SlotSpec[];
}

/**
 * Описания типов шагов для интерфейса. Формы слотов взяты у модулей движка
 * (`engine/steps/*`), но разделение на главное и тонкости — решение экрана:
 * движку всё равно, что автор заполняет чаще.
 */
export const STEP_SPECS: StepSpec[] = [
  {
    type: 'threshold',
    label: 'Порог',
    icon: '⌖',
    hint: 'Бросок против величины. Не вышло — цепочка обрывается.',
    slots: [
      { key: 'roll.die', label: 'Кость', main: true, required: true, allow: ['constant'] },
      { key: 'roll.bonus', label: 'Прибавка к броску', main: true, allow: ['expr', 'const', 'param', 'prop', 'empty'],
        hint: 'Что прибавляется к кости: обычно бонус атаки бросающего.' },
      { key: 'versus', label: 'Против чего', main: true, required: true, allow: ['tag', 'expr', 'const'],
        hint: 'Величина, которую надо превзойти. Обычно поле ЦЕЛИ — класс брони.' },
      { key: 'roll.check', label: 'Мишень модификаторов броска', allow: [],
        hint: 'На эту мишень вешаются преимущество и помеха. Пусто — броском никто не управляет.' },
      { key: 'side', label: 'Кто бросает', fallback: 'sender',
        choice: [['sender', 'отправитель — это атака'], ['target', 'цель — это спасбросок']] },
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
    icon: 'Σ',
    hint: 'Вычислить число: бросок костей, превышение или фикс записи.',
    slots: [
      { key: 'source', label: 'Откуда число', main: true, fallback: 'roll',
        choice: [['roll', 'свой бросок костей'], ['margin', 'превышение шага'], ['item', 'фикс записи']] },
      { key: 'dice', label: 'Кости', main: true, allow: ['prop', 'const', 'param', 'empty'],
        hint: 'Запись «2d6». Обычно спрашивается у записи: у меча одна кость, у кинжала другая.' },
      { key: 'bonus', label: 'Прибавка', main: true, allow: ['expr', 'const', 'param', 'empty'],
        hint: 'Что прибавить к броску: обычно модификатор характеристики.' },
      { key: 'fixed', label: 'Фикс записи', allow: ['prop', 'const', 'empty'] },
      { key: 'margin', label: 'Превышение шага', allow: ['ref', 'empty'] },
    ],
  },
  {
    type: 'compare',
    label: 'Сравнение',
    icon: '⇄',
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
    icon: '✎',
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
    icon: '☄',
    hint: 'Повесить эффект на цель или снять его.',
    slots: [
      { key: 'mode', label: 'Что делаем', main: true, fallback: 'apply',
        choice: [['apply', 'вешаем'], ['remove', 'снимаем']] },
      { key: 'effect', label: 'Какой эффект', main: true, required: true, allow: ['prop', 'const', 'param', 'empty'] },
    ],
  },
];

export const specOf = (type: string) => STEP_SPECS.find(s => s.type === type) ?? null;

// ── чтение и запись вложенных слотов ────────────────────────────────────

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

// ── карточка ────────────────────────────────────────────────────────────

export function StepCard({ step, index, system, effect, earlier, problem, onEdit, onDelete }: {
  step: Step;
  index: number;
  system: System;
  effect: Effect;
  earlier: string[];
  problem: string | null;
  onEdit: (change: (draft: Step) => void) => void;
  onDelete: () => void;
}) {
  const spec = specOf(step.type);
  const context: SlotContext = { system, effect, earlier };

  if (!spec) {
    return (
      <Card tone="bad">
        <CardHead title={`Шаг ${index + 1}: неизвестный тип «${step.type}»`} />
        <Verdict tone="bad">Этот тип шага движку неизвестен — эффект не отработает.</Verdict>
      </Card>
    );
  }

  const main = spec.slots.filter(slot => slot.main);
  const fine = spec.slots.filter(slot => !slot.main);

  return (
    <Card tone={problem ? 'bad' : undefined}>
      <CardHead
        title={<><span aria-hidden>{spec.icon}</span> {index + 1}. {spec.label}</>}
        badge={step.id ? <span className="chip mono" title="имя шага — на него ссылаются следующие">«{step.id}»</span> : null}
        actions={<Button size="sm" variant="danger" onClick={onDelete}>×</Button>}
      />
      <p className="card__sub">{spec.hint}</p>

      {problem ? <Verdict tone="bad">{problem}</Verdict> : null}

      <div className="row">
        {main.map(slot => (
          <SlotField
            key={slot.key} slot={slot} step={step} context={context}
            onEdit={onEdit}
          />
        ))}
      </div>

      {fine.length ? (
        <Fold title="Тонкости" summary={summaryOf(fine, step, context)}>
          <div className="row">
            {fine.map(slot => (
              <SlotField
                key={slot.key} slot={slot} step={step} context={context}
                onEdit={onEdit}
              />
            ))}
          </div>
        </Fold>
      ) : null}

      <Field
        label="Имя шага"
        hint="Нужно, только если следующие шаги ссылаются на его результат."
      >
        <input
          className="input input--mono"
          value={step.id ?? ''}
          placeholder="например: hit"
          onChange={e => onEdit(draft => {
            const next = e.target.value.trim();
            if (next) draft.id = next; else delete draft.id;
          })}
        />
      </Field>
    </Card>
  );
}

function SlotField({ slot, step, context, onEdit }: {
  slot: SlotSpec;
  step: Step;
  context: SlotContext;
  onEdit: (change: (draft: Step) => void) => void;
}) {
  const value = read(step, slot.key);

  if (slot.choice) {
    return (
      <Field label={slot.label} hint={slot.hint}>
        <Select
          value={String(value ?? slot.fallback ?? slot.choice[0]![0])}
          options={slot.choice as never}
          onChange={next => onEdit(draft => write(draft, slot.key, coerce(next)))}
        />
      </Field>
    );
  }

  // Слот без списка допустимых видов — служебный: он либо ссылается на
  // мишень бросков, либо не редактируется структурно.
  if (slot.allow && slot.allow.length === 0) {
    return (
      <Field label={slot.label} hint={slot.hint}>
        <Select
          value={String(value ?? '')}
          options={[
            ['', '— нет —'],
            ...(context.system.rolls ?? []).map(r => [r.tag, r.label] as const),
          ] as never}
          onChange={next => onEdit(draft => write(draft, slot.key, next || null))}
        />
      </Field>
    );
  }

  const empty = value === null || value === undefined;

  return (
    <Field label={slot.label} hint={slot.hint} needed={Boolean(slot.required) && empty}>
      <SlotEditor
        value={value}
        onChange={next => onEdit(draft => write(draft, slot.key, next as SlotRef))}
        context={context}
        allow={slot.allow}
      />
    </Field>
  );
}

/** Свёрнутые тонкости читаются строкой: «отправитель · не меньше порога · при успехе». */
function summaryOf(slots: SlotSpec[], step: Step, context: SlotContext): ReactNode {
  const parts = slots.map(slot => {
    const value = read(step, slot.key);
    if (slot.allow && slot.allow.length === 0) {
      const roll = context.system.rolls?.find(r => r.tag === value);
      return roll ? roll.label : null;
    }
    if (slot.choice) {
      const key = String(value ?? slot.fallback ?? slot.choice[0]![0]);
      return slot.choice.find(([k]) => k === key)?.[1] ?? key;
    }
    if (value === null || value === undefined || value === '') return null;
    return kindOf(value).summary(value, context);
  }).filter(Boolean);

  return parts.length ? parts.join(' · ') : null;
}

const coerce = (value: string): unknown =>
  value === 'true' ? true : value === 'false' ? false : value;

/**
 * Приговор о шаге. Проверяется то, что можно проверить БЕЗ листа и без броска:
 * заполненность обязательных слотов и разрешимость ссылок. Значения здесь
 * не считаются — персонажа в конструкторе нет.
 */
export function problemOf(step: Step, system: System, effect: Effect, earlier: string[]): string | null {
  const spec = specOf(step.type);
  if (!spec) return `движок не знает типа шага «${step.type}»`;

  for (const slot of spec.slots) {
    const value = read(step, slot.key);
    if (slot.required && (value === null || value === undefined)) {
      return `не заполнено: ${slot.label.toLowerCase()}`;
    }
    if (value === null || value === undefined) continue;

    const kind = kindOf(value);
    const ref = value as Record<string, unknown>;

    if (kind.kind === 'prop') {
      const key = String(ref.prop ?? ref.item);
      if (!key) return `${slot.label.toLowerCase()}: свойство не выбрано`;
      if (!declaredProps(system).has(key)) {
        return `свойство «${key}» не объявлено ни одним родом записей — заведите его на вкладке «Записи»`;
      }
    }
    if (kind.kind === 'param') {
      const key = String(ref.param);
      if (!effect.params?.some(p => p.key === key)) {
        return `параметр «${key}» эффектом не объявлен`;
      }
    }
    if (kind.kind === 'tag') {
      const tag = String(ref.tag);
      if (!tag) return `${slot.label.toLowerCase()}: поле не выбрано`;
      if (!system.fields.some(f => f.tag === tag)) {
        return `поля «${tag}» в системе нет — заведите его на вкладке «Лист»`;
      }
    }
    if (kind.kind === 'constant') {
      const name = String(ref.constant);
      if (!system.constants?.[name]) return `кости «${name}» в системе нет`;
    }
    if (kind.kind === 'ref') {
      const name = String(ref.ref).split('.')[0]!;
      if (!earlier.includes(name)) {
        return `шага «${name}» выше по цепочке нет — на его результат не сослаться`;
      }
    }
  }
  return null;
}
