// Реестр видов слотов — та же идиома, что реестр шагов в движке: вид ссылки
// знает про себя всё сам, а редактор эффекта не знает ни одного вида лично.
//
// В PoC это жило внутри одного файла на 817 строк, который поэтому и разросся:
// добавить вид ссылки значило дописать ещё одну ветку в трёх местах. Здесь
// новый вид — новая запись в SLOT_KINDS, и больше ничего.
//
// Шесть видов, и каждый на своём месте:
//   const  / expr / tag / constant — ЗАКОН МИРА, один на всю систему
//   prop                           — то, что разное У КАЖДОЙ ЗАПИСИ
//   param                          — то, что разное У КАЖДОГО РОДА,
//                                    или что обязана посчитать цель
//   ref                            — результат предыдущего шага

import type { ReactNode } from 'react';
import type { System, Effect, SlotRef } from '@vtt/schema';
import { Input, Select } from '../../ui/primitives.tsx';
import { FormulaInput, labelOfTag } from '../../ui/formula.tsx';

export type SlotKind = 'const' | 'expr' | 'tag' | 'constant' | 'prop' | 'param' | 'ref' | 'empty';

export interface SlotContext {
  system: System;
  effect: Effect;
  /** Имена шагов, на результат которых можно сослаться (все, что ВЫШЕ по цепочке). */
  earlier: string[];
}

export interface SlotKindModule {
  kind: SlotKind;
  /** Человеческое имя вида — то, что автор видит в выпадашке. */
  label: string;
  /** Одной строкой: чем этот вид отличается от соседних. */
  hint: string;
  /** Опознать вид по данным. */
  matches: (ref: unknown) => boolean;
  /** Заготовка при переключении на этот вид. */
  blank: (context: SlotContext) => SlotRef | null;
  /** Как показать заполненный слот в свёрнутой сводке. */
  summary: (ref: any, context: SlotContext) => string;
  /** Редактор значения. */
  editor: (ref: any, onChange: (next: SlotRef | null) => void, context: SlotContext) => ReactNode;
  /** Доступен ли вид в этом эффекте. */
  available?: (context: SlotContext) => boolean;
}

const has = (ref: unknown, key: string) =>
  Boolean(ref) && typeof ref === 'object' && key in (ref as object);

export const SLOT_KINDS: SlotKindModule[] = [
  {
    kind: 'empty',
    label: '— пусто —',
    hint: 'Значение придёт откуда-то ещё. Для необязательных мест это законно.',
    matches: ref => ref === null || ref === undefined,
    blank: () => null,
    summary: () => '—',
    editor: () => <span className="faint">Ничего не выбрано.</span>,
  },
  {
    kind: 'const',
    label: 'Значение',
    hint: 'Просто число или текст. Закон мира: одинаков у всех.',
    matches: ref => has(ref, 'const'),
    blank: () => ({ const: 0 }),
    summary: ref => String(ref.const),
    editor: (ref, onChange) => (
      <Input
        value={String(ref.const ?? '')}
        onChange={next => onChange({ const: /^-?\d+(\.\d+)?$/.test(next) ? Number(next) : next })}
      />
    ),
  },
  {
    kind: 'expr',
    label: 'Формула',
    hint: 'Считается по листу. Чей лист — задаёт «сторона».',
    matches: ref => has(ref, 'expr'),
    blank: () => ({ expr: '' }),
    summary: (ref, ctx) => ref.expr
      ? ref.expr.replace(/#([\p{L}\p{N}_]+)/gu, (_: string, tag: string) => labelOfTag(ctx.system, tag))
      : 'формула не дописана',
    editor: (ref, onChange, ctx) => (
      <div className="stack stack--tight">
        <FormulaInput
          system={ctx.system}
          value={ref.expr ?? ''}
          onChange={expr => onChange({ ...ref, expr })}
        />
        <Select
          value={ref.of ?? 'source'}
          options={[
            ['source', 'считает отправитель'],
            ['target', 'считает цель — её листом'],
          ] as const}
          onChange={of => onChange({ ...ref, of: of === 'source' ? undefined : of })}
        />
      </div>
    ),
  },
  {
    kind: 'tag',
    label: 'Поле цели',
    hint: 'Значение поля у ПОЛУЧАТЕЛЯ: класс брони, текущие хиты.',
    matches: ref => has(ref, 'tag'),
    blank: ctx => ({ tag: ctx.system.fields[0]?.tag ?? '' }),
    summary: (ref, ctx) => ref.tag ? labelOfTag(ctx.system, ref.tag) : 'поле не выбрано',
    editor: (ref, onChange, ctx) => {
      const known = ctx.system.fields.some(f => f.tag === ref.tag);
      return (
        <Select
          value={ref.tag ?? ''}
          options={[
            ['', '— выберите поле —'],
            // Ссылка на поле, которого в системе нет, обязана остаться видимой:
            // иначе автор не узнает, что именно потерялось при переносе.
            ...(ref.tag && !known ? [[ref.tag, `${ref.tag} — в системе нет`] as const] : []),
            ...ctx.system.fields.map(f => [f.tag, f.label] as const),
          ] as never}
          onChange={tag => onChange({ ...ref, tag })}
        />
      );
    },
  },
  {
    kind: 'constant',
    label: 'Кость системы',
    hint: 'Ведущая кость мира. Сменить её размер — сменить все броски разом.',
    matches: ref => has(ref, 'constant'),
    blank: ctx => ({ constant: Object.keys(ctx.system.constants ?? {})[0] ?? 'lead_die' }),
    summary: (ref, ctx) => {
      const constant = ctx.system.constants?.[ref.constant];
      const dice = (constant?.dice ?? []).map(d => `${d.count ?? 1}к${d.sides}`).join(' + ');
      return dice || ref.constant;
    },
    editor: (ref, onChange, ctx) => (
      <Select
        value={ref.constant ?? ''}
        options={[
          ['', '— выберите кость —'],
          ...Object.entries(ctx.system.constants ?? {}).map(([key, c]) => [key, c.label ?? key] as const),
        ] as never}
        onChange={constant => onChange({ ...ref, constant })}
      />
    ),
  },
  {
    kind: 'prop',
    label: 'Свойство записи',
    hint: 'То, что разное у каждой записи: кость урона меча против кинжала.',
    matches: ref => has(ref, 'prop') || has(ref, 'item'),
    blank: () => ({ prop: '' }),
    summary: (ref, ctx) => {
      const key = ref.prop ?? ref.item;
      const declared = declaredProps(ctx.system).get(key);
      return declared ? `${declared} (спросят у записи)` : `«${key}» — род не объявлен`;
    },
    editor: (ref, onChange, ctx) => {
      const props = [...declaredProps(ctx.system)];
      return (
        <Select
          value={ref.prop ?? ref.item ?? ''}
          options={[
            ['', '— выберите свойство —'],
            ...props.map(([key, label]) => [key, label] as const),
          ] as never}
          onChange={prop => onChange({ prop })}
        />
      );
    },
  },
  {
    kind: 'param',
    label: 'Потребность эффекта',
    hint: 'Потребность, которую закроет род записи. Нужен, когда один эффект обслуживает разные рода.',
    matches: ref => has(ref, 'param'),
    blank: ctx => ({ param: ctx.effect.params?.[0]?.key ?? '' }),
    summary: (ref, ctx) => {
      const declared = ctx.effect.params?.find(p => p.key === ref.param);
      return declared ? `${declared.label ?? declared.key} (заполнит запись)` : `«${ref.param}» — не объявлен`;
    },
    editor: (ref, onChange, ctx) => (
      <Select
        value={ref.param ?? ''}
        options={[
          ['', '— выберите потребность —'],
          ...(ctx.effect.params ?? []).map(p => [p.key, p.label ?? p.key] as const),
        ] as never}
        onChange={param => onChange({ param })}
      />
    ),
    available: ctx => Boolean(ctx.effect.params?.length),
  },
  {
    kind: 'ref',
    label: 'Результат шага',
    hint: 'То, что уже посчитал шаг выше по цепочке.',
    matches: ref => has(ref, 'ref'),
    blank: ctx => ({ ref: ctx.earlier[0] ?? '' }),
    summary: ref => `шаг «${ref.ref}»`,
    editor: (ref, onChange, ctx) => (
      <Select
        value={ref.ref ?? ''}
        options={[
          ['', '— выберите шаг —'],
          ...ctx.earlier.map(name => [name, `шаг «${name}»`] as const),
        ] as never}
        onChange={next => onChange({ ref: next })}
      />
    ),
    available: ctx => ctx.earlier.length > 0,
  },
];

export const kindOf = (ref: unknown): SlotKindModule =>
  SLOT_KINDS.find(module => module.matches(ref)) ?? SLOT_KINDS[0]!;

/**
 * Какие свойства вообще объявлены родами записей. Список выводится, а не
 * хранится: свойство объявляет РОД, и ссылка на необъявленное — ошибка,
 * которую приговор обязан назвать, а не пропустить в мир.
 */
export function declaredProps(system: System): Map<string, string> {
  const out = new Map<string, string>();
  for (const kind of Object.values(system.records ?? {})) {
    for (const prop of kind.props ?? []) {
      out.set(prop.key, `${prop.label ?? prop.key} · ${kind.label ?? 'род'}`);
    }
  }
  return out;
}

/** Редактор слота: выбор вида плюс редактор выбранного вида. */
export function SlotEditor({ value, onChange, context, allow }: {
  value: unknown;
  onChange: (next: SlotRef | null) => void;
  context: SlotContext;
  /** Какие виды уместны в этом слоте. Пусто — все доступные. */
  allow?: SlotKind[];
}) {
  const current = kindOf(value);
  const kinds = SLOT_KINDS
    .filter(module => !allow || allow.includes(module.kind))
    .filter(module => !module.available || module.available(context));

  return (
    <div className="stack stack--tight">
      <Select
        value={current.kind}
        options={kinds.map(module => [module.kind, module.label] as const) as never}
        onChange={kind => {
          const module = SLOT_KINDS.find(m => m.kind === kind)!;
          onChange(module.blank(context));
        }}
      />
      {current.editor(value, onChange, context)}
    </div>
  );
}
