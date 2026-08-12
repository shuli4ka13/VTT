# Конструктор эффектов, фаза 1: понятные карточки

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Вкладка «Эффекты» перестаёт быть ассемблером: заготовки на языке игры, три карточки-понятия (проверка / изменение / число), зелёный пересказ с оранжевыми пропусками, слот без таксономии видов.

**Architecture:** Движок и схема не меняются. Пять типов шагов (`threshold/amount/compare/apply/status`) остаются в данных; склейка — только на экране: чистые функции `groupSteps` (пара amount+apply рисуется одной карточкой) и `readback` (шаг → сегменты текста/пропусков), поверх них три компонента карточек и новый `SlotInput`. Спека: `docs/superpowers/specs/2026-08-11-effects-constructor-redesign-design.md`.

**Tech Stack:** React 19, TypeScript, vitest (+jsdom и @testing-library/react уже стоят в `apps/web`), zustand-store `useWorld`.

## Global Constraints

- Не трогать: `src/` (старый vanilla-PoC — замороженный эталон), `packages/engine`, `packages/schema`, вкладки «Лист» и «Записи», `apps/server`.
- В интерфейсных строках запрещены слова: «слот», «дырка», «привязка», «порог», «величина», «применить» (как имя шага). Русские подписи.
- Ни одного конкретного имени стата в коде и заготовках (`hp`, `ac`, `str` — нельзя): критерий приёмки №3.
- Пересказ собирается только из лейблов текущей системы (`labelOfTag`), не из жанрового сленга.
- Шаг данных остаётся валидным для движка: карточки пишут те же пять типов.
- Тесты: `cd apps/web && pnpm vitest run <файл>`; полный прогон `make ts-test`; типы `make ts-check`.
- Коммиты в ветку `rules-constructor`, после каждой задачи.

**Существующие интерфейсы, на которые опирается план** (менять нельзя):
- `labelOfTag(system: System, tag: string): string` из `apps/web/src/ui/formula.tsx`.
- `freeId(taken: Iterable<string>, base: string): string` из `apps/web/src/store/world.ts`.
- `problemOf(step: Step, system: System, effect: Effect, earlier: string[]): string | null` из `apps/web/src/screens/constructor/step-card.tsx`.
- `SlotContext { system; effect; earlier: string[] }` и `type SlotKind` из `apps/web/src/screens/constructor/slots.tsx`.
- Примитивы из `apps/web/src/ui/primitives.tsx`: `Card, CardHead, Field, Input, Select, Button (variant?: 'primary'|'ghost'|'danger'), Segmented<T>{value, options:{key,label,title?}[], onChange}, Verdict, Fold, Chip`.
- Тип `Step` (`@vtt/schema`) — `{ id?: string; type: string; side?: 'sender'|'target' }` c passthrough: остальные ключи свободны, в коде читаются через `(step as any)`.

---

### Task 1: Пересказ — `readback.ts`

**Files:**
- Create: `apps/web/src/screens/constructor/readback.ts`
- Test: `apps/web/src/screens/constructor/readback.test.ts`

**Interfaces:**
- Consumes: `labelOfTag` (formula.tsx), типы `System, Effect, Step` из `@vtt/schema`.
- Produces:
  - `type Segment = { text: string } | { hole: string }`
  - `refSegment(ref: unknown, system: System, effect: Effect, emptyAs: string): Segment`
  - `dieWord(system: System, name: string): string`
  - `checkReadback(step: Step, system: System, effect: Effect): Segment[]`
  - `changeReadback(step: Step, amount: Step | null, system: System, effect: Effect): Segment[]`
  - `numberReadback(step: Step, system: System, effect: Effect): Segment[]`
  - `amountValueSegments(step: Step, system: System, effect: Effect): Segment[]`
  - `joinReadback(segments: Segment[]): string`

- [ ] **Step 1: Написать падающий тест**

```ts
// apps/web/src/screens/constructor/readback.test.ts
import { describe, it, expect } from 'vitest';
import { checkReadback, changeReadback, numberReadback, joinReadback } from './readback.ts';
import type { System, Effect, Step } from '@vtt/schema';

const system = {
  fields: [
    { tag: 'armor', label: 'Класс брони', value: { kind: 'stored', type: 'number', default: 10 } },
    { tag: 'wounds', label: 'Текущие хиты', value: { kind: 'stored', type: 'number', default: 10 } },
    { tag: 'power_mod', label: 'Мод Силы', value: { kind: 'formula', expr: '1' } },
  ],
  constants: { lead: { label: 'Ведущая кость', kind: 'die', dice: [{ count: 1, sides: 20 }] } },
  effects: { poison: { label: 'Отравлен', activation: 'passive', modifiers: [] } },
} as unknown as System;

const effect = { params: [{ key: 'p_1', label: 'кость урона', kind: 'dice' }] } as unknown as Effect;

describe('checkReadback', () => {
  it('порог броском читается фразой с лейблами системы', () => {
    const step = {
      type: 'threshold', side: 'sender', successWhen: 'atLeast', continueOn: 'success',
      roll: { die: { constant: 'lead' }, bonus: { expr: '#power_mod' }, check: null },
      versus: { tag: 'armor' },
    } as unknown as Step;
    expect(joinReadback(checkReadback(step, system, effect)))
      .toBe('Отправитель бросает 1к20 + Мод Силы против «Класс брони». Не добросил — эффект кончается.');
  });

  it('пустая мишень — оранжевый пропуск', () => {
    const step = { type: 'threshold', roll: { die: { constant: 'lead' } } } as unknown as Step;
    expect(joinReadback(checkReadback(step, system, effect)))
      .toBe('Отправитель бросает 1к20 против ⟨какого поля цели?⟩. Не добросил — эффект кончается.');
  });

  it('сравнение без броска', () => {
    const step = { type: 'compare', value: { ref: 'dmg' }, versus: { tag: 'armor' }, breakIf: 'atMost' } as unknown as Step;
    expect(joinReadback(checkReadback(step, system, effect)))
      .toBe('результат «dmg» против «Класс брони» у цели — не превысило, эффект кончается.');
  });
});

describe('changeReadback', () => {
  it('вычитание со склеенным числом: кости из записи + прибавка', () => {
    const amount = { id: 'dmg', type: 'amount', source: 'roll', dice: { param: 'p_1' }, bonus: { expr: '#power_mod' } } as unknown as Step;
    const apply = { type: 'apply', target: { tag: 'wounds' }, direction: 'subtract', value: { ref: 'dmg' } } as unknown as Step;
    expect(joinReadback(changeReadback(apply, amount, system, effect)))
      .toBe('Цель теряет ⟨кость урона — из записи⟩ + Мод Силы из «Текущие хиты».');
  });

  it('состояние по id читается лейблом', () => {
    const step = { type: 'status', mode: 'apply', effect: { const: 'poison' } } as unknown as Step;
    expect(joinReadback(changeReadback(step, null, system, effect)))
      .toBe('На цель вешается состояние «Отравлен».');
  });
});

describe('numberReadback', () => {
  it('одиночное число с именем', () => {
    const step = { id: 'dmg', type: 'amount', source: 'roll', dice: { const: '2d6' } } as unknown as Step;
    expect(joinReadback(numberReadback(step, system, effect)))
      .toBe('Считается число: 2d6 — дальше это «dmg».');
  });
});
```

- [ ] **Step 2: Прогнать — убедиться, что падает**

Run: `cd apps/web && pnpm vitest run src/screens/constructor/readback.test.ts`
Expected: FAIL — `Cannot find module './readback.ts'`.

- [ ] **Step 3: Реализация**

```ts
// apps/web/src/screens/constructor/readback.ts
// Пересказ: шаг конвейера → фраза из сегментов. Сегмент-`text` — обычные
// слова, сегмент-`hole` — оранжевый пропуск: пусто там, где заполнить
// обязательно, или значение придёт из записи компендиума.
//
// Все имена — лейблы ТЕКУЩЕЙ системы (labelOfTag): переименовал поле —
// пересказ перестроился, ничего не сломалось (критерий №2).

import type { System, Effect, Step } from '@vtt/schema';
import { labelOfTag } from '../../ui/formula.tsx';

export type Segment = { text: string } | { hole: string };

const seg = (text: string): Segment => ({ text });
const hole = (label: string): Segment => ({ hole: label });

export function dieWord(system: System, name: string): string {
  const constant = system.constants?.[name];
  if (!constant) return name;
  const dice = (constant.dice ?? []).map(d => `${d.count ?? 1}к${d.sides}`).join(' + ');
  return dice || (constant.label ?? name);
}

/** Ссылка слота одним сегментом. Чем описать пустоту — знает вызывающий. */
export function refSegment(ref: unknown, system: System, effect: Effect, emptyAs: string): Segment {
  if (ref === null || ref === undefined || ref === '') return hole(emptyAs);
  if (typeof ref !== 'object') return seg(String(ref));
  const r = ref as Record<string, unknown>;
  if ('const' in r) return r.const === '' || r.const == null ? hole(emptyAs) : seg(String(r.const));
  if ('expr' in r) {
    const text = String(r.expr ?? '').trim();
    if (!text) return hole(emptyAs);
    return seg(text.replace(/#([\p{L}\p{N}_]+)/gu, (_, tag: string) => labelOfTag(system, tag)));
  }
  if ('tag' in r) return seg(`«${labelOfTag(system, String(r.tag))}»`);
  if ('param' in r) {
    const declared = effect.params?.find(p => p.key === r.param);
    return hole(`${declared?.label ?? String(r.param)} — из записи`);
  }
  if ('prop' in r || 'item' in r) return hole(`${String(r.prop ?? r.item)} — из записи`);
  if ('ref' in r) return seg(`результат «${String(r.ref).split('.')[0]}»`);
  if ('constant' in r) return seg(dieWord(system, String(r.constant)));
  return hole(emptyAs);
}

/** Хвост порога: [провалил, прошёл] — слово зависит от направления успеха. */
const SUCCESS_WORDS: Record<string, [string, string]> = {
  atLeast: ['Не добросил', 'Добросил'],
  over: ['Не перебросил', 'Перебросил'],
  notOver: ['Перебросил', 'Уложился'],
  under: ['Не уложился', 'Уложился'],
};

export function checkReadback(step: Step, system: System, effect: Effect): Segment[] {
  const s = step as any;
  if (step.type === 'compare') {
    const breakIf = s.breakIf ?? 'less';
    const tail = breakIf === 'never' ? 'обрыва нет, разница идёт дальше'
      : breakIf === 'atMost' ? 'не превысило, эффект кончается'
        : 'меньше — эффект кончается';
    return [
      refSegment(s.value, system, effect, 'что сравниваем?'), seg('против'),
      refSegment(s.versus, system, effect, 'с чем?'), seg(`у цели — ${tail}.`),
    ];
  }
  const roll = s.roll ?? {};
  const out: Segment[] = [seg(s.side === 'target' ? 'Цель бросает' : 'Отправитель бросает')];
  out.push(roll.die ? refSegment(roll.die, system, effect, 'какой костью?') : hole('какой костью?'));
  if (roll.bonus !== undefined && roll.bonus !== null) {
    const bonus = refSegment(roll.bonus, system, effect, 'прибавка?');
    if (!('text' in bonus) || (bonus.text !== '0' && bonus.text !== '')) out.push(seg('+'), bonus);
  }
  out.push(seg('против'), refSegment(s.versus, system, effect, 'какого поля цели?'));
  const words = SUCCESS_WORDS[s.successWhen ?? 'atLeast'] ?? SUCCESS_WORDS.atLeast!;
  const broken = (s.continueOn ?? 'success') === 'success' ? words[0] : words[1];
  out.push(seg(`. ${broken} — эффект кончается.`));
  return out;
}

export function amountValueSegments(step: Step, system: System, effect: Effect): Segment[] {
  const s = step as any;
  const source = typeof s.source === 'object' ? null : (s.source ?? 'roll');
  const out: Segment[] = [];
  if (source === 'item') out.push(refSegment(s.fixed, system, effect, 'фикс записи?'));
  else if (source === 'margin') {
    out.push(seg('превышение проверки'));
    if (s.margin) out.push(refSegment(s.margin, system, effect, 'какой?'));
  } else out.push(refSegment(s.dice, system, effect, 'какие кости?'));
  if (s.bonus !== undefined && s.bonus !== null) {
    const bonus = refSegment(s.bonus, system, effect, '');
    if (!('text' in bonus) || (bonus.text !== '0' && bonus.text !== '')) out.push(seg('+'), bonus);
  }
  return out;
}

export function changeReadback(step: Step, amount: Step | null, system: System, effect: Effect): Segment[] {
  const s = step as any;
  if (step.type === 'status') {
    const ref = s.effect;
    let what: Segment;
    if (ref && typeof ref === 'object' && 'const' in ref) {
      const id = String((ref as any).const ?? '');
      const known = id ? system.effects?.[id] : undefined;
      what = known ? seg(`«${known.label ?? id}».`) : hole(`«${id || '?'}» — в системе нет`);
    } else what = refSegment(ref, system, effect, 'какое состояние?');
    return (s.mode ?? 'apply') === 'remove'
      ? [seg('С цели снимается состояние'), what]
      : [seg('На цель вешается состояние'), what];
  }
  const field = refSegment(s.target, system, effect, 'какое поле?');
  const what = amount
    ? amountValueSegments(amount, system, effect)
    : [refSegment(s.value, system, effect, 'сколько?')];
  const direction = s.direction ?? 'subtract';
  if (direction === 'set') return [seg('Полю'), field, seg('цели ставится'), ...what, seg('.')];
  if (direction === 'add') return [seg('Цель получает'), ...what, seg('в'), field, seg('.')];
  return [seg('Цель теряет'), ...what, seg('из'), field, seg('.')];
}

export function numberReadback(step: Step, system: System, effect: Effect): Segment[] {
  const out: Segment[] = [seg('Считается число:'), ...amountValueSegments(step, system, effect)];
  out.push(step.id ? seg(`— дальше это «${step.id}».`) : seg('.'));
  return out;
}

/** Для тестов и свёрнутых сводок: пропуски в ⟨угловых скобках⟩. */
export const joinReadback = (segments: Segment[]): string =>
  segments.map(part => ('text' in part ? part.text : `⟨${part.hole}⟩`))
    .join(' ')
    .replace(/\s+([.,])/g, '$1')
    .replace(/\.\s*\./g, '.');
```

- [ ] **Step 4: Прогнать — зелено**

Run: `cd apps/web && pnpm vitest run src/screens/constructor/readback.test.ts`
Expected: PASS (6 тестов). Если падает пунктуация — чинить `joinReadback`/фразы, а не тесты.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/screens/constructor/readback.ts apps/web/src/screens/constructor/readback.test.ts
git commit -m "Пересказ шага словами: сегменты текста и оранжевых пропусков"
```

---

### Task 2: Склейка и заготовки — `cards.ts`

**Files:**
- Create: `apps/web/src/screens/constructor/cards.ts`
- Test: `apps/web/src/screens/constructor/cards.test.ts`

**Interfaces:**
- Consumes: `freeId` из `../../store/world.ts`; типы `System, Step`.
- Produces:
  - `type CardKind = 'check' | 'change' | 'number' | 'unknown'`
  - `interface CardGroup { kind: CardKind; indices: number[]; step: Step; amount: Step | null }`
  - `groupSteps(steps: Step[]): CardGroup[]`
  - `interface StepTemplate { key: string; label: string; hint: string; make(system: System, takenIds: string[]): Step[] }`
  - `STEP_TEMPLATES: StepTemplate[]` (attack, damage, heal, status)
  - `BRICKS: StepTemplate[]` (check, change, number)

- [ ] **Step 1: Написать падающий тест**

```ts
// apps/web/src/screens/constructor/cards.test.ts
import { describe, it, expect } from 'vitest';
import { groupSteps, STEP_TEMPLATES } from './cards.ts';
import type { System, Step } from '@vtt/schema';

const steps = (list: object[]) => list as unknown as Step[];
const system = { fields: [], constants: { lead: { label: 'Ведущая кость', kind: 'die', dice: [{ sides: 20 }] } }, effects: {} } as unknown as System;

describe('groupSteps', () => {
  it('пара amount+apply склеивается в одно изменение', () => {
    const groups = groupSteps(steps([
      { type: 'threshold' },
      { id: 'dmg', type: 'amount', source: 'roll' },
      { type: 'apply', value: { ref: 'dmg' } },
    ]));
    expect(groups.map(g => g.kind)).toEqual(['check', 'change']);
    expect(groups[1]!.indices).toEqual([1, 2]);
    expect(groups[1]!.amount?.id).toBe('dmg');
  });

  it('не склеивается, если на число ссылается кто-то ещё', () => {
    const groups = groupSteps(steps([
      { id: 'dmg', type: 'amount', source: 'roll' },
      { type: 'apply', value: { ref: 'dmg' } },
      { type: 'apply', value: { ref: 'dmg' } },
    ]));
    expect(groups.map(g => g.kind)).toEqual(['number', 'change', 'change']);
  });

  it('не склеивается, если apply берёт не весь результат', () => {
    const groups = groupSteps(steps([
      { id: 'hit', type: 'amount', source: 'roll' },
      { type: 'apply', value: { ref: 'hit.margin' } },
    ]));
    expect(groups.map(g => g.kind)).toEqual(['number', 'change']);
  });
});

describe('STEP_TEMPLATES', () => {
  it('атака: две карточки, ни одного тега поля внутри', () => {
    const attack = STEP_TEMPLATES.find(t => t.key === 'attack')!;
    const made = attack.make(system, []);
    expect(groupSteps(made).map(g => g.kind)).toEqual(['check', 'change']);
    expect(JSON.stringify(made)).not.toMatch(/"tag"/);
  });

  it('имя внутреннего числа не сталкивается с занятыми', () => {
    const attack = STEP_TEMPLATES.find(t => t.key === 'attack')!;
    const made = attack.make(system, ['n']);
    expect(made[1]!.id).toBe('n_2');
  });
});
```

- [ ] **Step 2: Прогнать — убедиться, что падает**

Run: `cd apps/web && pnpm vitest run src/screens/constructor/cards.test.ts`
Expected: FAIL — `Cannot find module './cards.ts'`.

- [ ] **Step 3: Реализация**

```ts
// apps/web/src/screens/constructor/cards.ts
// Склейка шагов в карточки и заготовки цепочек.
//
// В данных живут пять команд движка, на экране — три понятия:
//   проверка  = threshold | compare
//   изменение = apply | status; пара «amount + apply, который берёт ровно
//               его результат и никому больше не нужный» рисуется ОДНОЙ
//               карточкой — так атака остаётся двумя карточками без имён
//   число     = amount сам по себе (превышения, одно число на два изменения)
//
// Заготовки не знают ни одного тега поля (критерий №3): всё, что зависит
// от системы, остаётся оранжевым пропуском.

import type { System, Step } from '@vtt/schema';
import { freeId } from '../../store/world.ts';

export type CardKind = 'check' | 'change' | 'number' | 'unknown';

export interface CardGroup {
  kind: CardKind;
  /** Индексы шагов эффекта, которые правит эта карточка (1 или 2). */
  indices: number[];
  /** Главный шаг карточки: для склеенной пары — apply. */
  step: Step;
  /** Склеенный amount, если карточка «изменение» несёт число в себе. */
  amount: Step | null;
}

const KIND_OF: Record<string, CardKind> = {
  threshold: 'check', compare: 'check', apply: 'change', status: 'change', amount: 'number',
};

const takesWhole = (value: unknown, id: string): boolean =>
  !!value && typeof value === 'object' && (value as Record<string, unknown>).ref === id;

const mentions = (step: Step, id: string): boolean => {
  const text = JSON.stringify(step);
  return text.includes(`"ref":"${id}"`) || text.includes(`"ref":"${id}.`);
};

export function groupSteps(list: Step[]): CardGroup[] {
  const out: CardGroup[] = [];
  for (let i = 0; i < list.length; i++) {
    const step = list[i]!;
    const next = list[i + 1];
    const glue = step.type === 'amount' && step.id && next?.type === 'apply'
      && takesWhole((next as any).value, step.id)
      && list.every((other, j) => j === i || j === i + 1 || !mentions(other, step.id!));
    if (glue) {
      out.push({ kind: 'change', indices: [i, i + 1], step: next!, amount: step });
      i++;
      continue;
    }
    out.push({ kind: KIND_OF[step.type] ?? 'unknown', indices: [i], step, amount: null });
  }
  return out;
}

// ── заготовки ───────────────────────────────────────────────────────────

export interface StepTemplate {
  key: string;
  label: string;
  hint: string;
  make(system: System, takenIds: string[]): Step[];
}

const firstDie = (system: System): string | undefined => Object.keys(system.constants ?? {})[0];

const blankCheck = (system: System): Step => {
  const die = firstDie(system);
  return {
    type: 'threshold', side: 'sender', successWhen: 'atLeast', continueOn: 'success',
    roll: { die: die ? { constant: die } : undefined, check: null },
  } as unknown as Step;
};

const numberPlusChange = (taken: string[], direction: 'subtract' | 'add'): Step[] => {
  const id = freeId(taken, 'n');
  return [
    { id, type: 'amount', source: 'roll' } as unknown as Step,
    {
      type: 'apply', direction, targetModifiers: direction === 'subtract', value: { ref: id },
    } as unknown as Step,
  ];
};

export const STEP_TEMPLATES: StepTemplate[] = [
  {
    key: 'attack', label: '+ атака с броском',
    hint: 'Бросок против поля цели; попал — цель теряет посчитанное.',
    make: (system, taken) => [blankCheck(system), ...numberPlusChange(taken, 'subtract')],
  },
  {
    key: 'damage', label: '+ просто урон',
    hint: 'Без проверки: посчитать и вычесть из поля цели.',
    make: (_system, taken) => numberPlusChange(taken, 'subtract'),
  },
  {
    key: 'heal', label: '+ лечение',
    hint: 'Посчитать и прибавить к полю цели.',
    make: (_system, taken) => numberPlusChange(taken, 'add'),
  },
  {
    key: 'status', label: '+ наложить состояние',
    hint: 'Повесить на цель эффект-состояние.',
    make: () => [{ type: 'status', mode: 'apply' } as unknown as Step],
  },
];

export const BRICKS: StepTemplate[] = [
  {
    key: 'check', label: '+ проверка',
    hint: 'Бросок или сравнение против поля цели. Может оборвать эффект.',
    make: system => [blankCheck(system)],
  },
  {
    key: 'change', label: '+ изменение',
    hint: 'Изменить поле цели или повесить состояние. Единственное, что меняет мир.',
    make: () => [{ type: 'apply', direction: 'subtract', targetModifiers: true } as unknown as Step],
  },
  {
    key: 'number', label: '+ число',
    hint: 'Отдельное число: превышение проверки или одно число на несколько изменений.',
    make: (_system, taken) => [{ id: freeId(taken, 'n'), type: 'amount', source: 'roll' } as unknown as Step],
  },
];
```

- [ ] **Step 4: Прогнать — зелено**

Run: `cd apps/web && pnpm vitest run src/screens/constructor/cards.test.ts`
Expected: PASS (5 тестов).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/screens/constructor/cards.ts apps/web/src/screens/constructor/cards.test.ts
git commit -m "Склейка шагов в три понятия и заготовки цепочек"
```

---

### Task 3: Слот без таксономии — `slot-input.tsx`

**Files:**
- Create: `apps/web/src/screens/constructor/slot-input.tsx`
- Modify: `apps/web/src/ui/primitives.css` (стили в конец файла)
- Test: `apps/web/src/screens/constructor/slot-input.test.tsx`

**Interfaces:**
- Consumes: `SlotContext`, `SlotKind` (типы из `slots.tsx`), `labelOfTag`, `dieWord` (Task 1), `Select` из primitives.
- Produces:
  - `parseTyped(text: string): SlotRef | null` — '' → null, число → `{const}`, иначе `{expr}`
  - `displayOf(ref: unknown, ctx: SlotContext): string`
  - `interface SlotOption { group: string; label: string; ref: SlotRef }`
  - `optionsFor(ctx: SlotContext, allow?: SlotKind[]): SlotOption[]` — «прямые» варианты: поля цели, «из записи» (params), результаты шагов, кости; вид `prop` НЕ предлагается (фаза 2 его убирает), но существующие значения показываются
  - `SlotInput({ value, onChange, context, allow, placeholder, extraOptions }): JSX.Element`

- [ ] **Step 1: Написать падающий тест (чистые функции + один DOM-тест)**

```tsx
// apps/web/src/screens/constructor/slot-input.test.tsx
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { parseTyped, displayOf, optionsFor, SlotInput } from './slot-input.tsx';
import type { SlotContext } from './slots.tsx';
import type { System, Effect } from '@vtt/schema';

const ctx: SlotContext = {
  system: {
    fields: [{ tag: 'armor', label: 'Класс брони', value: { kind: 'stored', type: 'number', default: 10 } }],
    constants: { lead: { label: 'Ведущая кость', kind: 'die', dice: [{ sides: 20 }] } },
    effects: {},
  } as unknown as System,
  effect: { params: [{ key: 'p_1', label: 'кость урона', kind: 'dice' }] } as unknown as Effect,
  earlier: ['hit'],
};

describe('parseTyped', () => {
  it('пусто → null, число → const, текст → expr', () => {
    expect(parseTyped('')).toBeNull();
    expect(parseTyped('3')).toEqual({ const: 3 });
    expect(parseTyped('#armor + 2')).toEqual({ expr: '#armor + 2' });
  });
});

describe('displayOf', () => {
  it('структурные ссылки показываются словами', () => {
    expect(displayOf({ tag: 'armor' }, ctx)).toBe('поле: Класс брони');
    expect(displayOf({ param: 'p_1' }, ctx)).toBe('из записи: кость урона');
    expect(displayOf({ ref: 'hit' }, ctx)).toBe('результат «hit»');
    expect(displayOf({ const: 5 }, ctx)).toBe('5');
  });
});

describe('optionsFor', () => {
  it('собирает поля, запись, результаты и кости; prop не предлагает', () => {
    const groups = new Set(optionsFor(ctx).map(o => o.group));
    expect(groups).toEqual(new Set(['Поля цели', 'Из записи', 'Результаты шагов', 'Кости']));
  });
  it('allow сужает список', () => {
    expect(optionsFor(ctx, ['ref']).map(o => o.label)).toEqual(['результат «hit»']);
  });
});

describe('SlotInput', () => {
  it('клик по варианту отдаёт структурную ссылку', () => {
    let got: unknown = 'untouched';
    render(<SlotInput value={undefined} onChange={next => { got = next; }} context={ctx} />);
    fireEvent.focus(screen.getByRole('textbox'));
    fireEvent.mouseDown(screen.getByText('Класс брони'));
    expect(got).toEqual({ tag: 'armor' });
  });

  it('набранное число уходит как const по Enter', () => {
    let got: unknown = 'untouched';
    render(<SlotInput value={undefined} onChange={next => { got = next; }} context={ctx} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '7' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(got).toEqual({ const: 7 });
  });
});
```

- [ ] **Step 2: Прогнать — убедиться, что падает**

Run: `cd apps/web && pnpm vitest run src/screens/constructor/slot-input.test.tsx`
Expected: FAIL — `Cannot find module './slot-input.tsx'`.

- [ ] **Step 3: Реализация компонента**

```tsx
// apps/web/src/screens/constructor/slot-input.tsx
// Слот без таксономии: одно поле. Печатаешь число или формулу — это они
// и есть; структурное (поле цели, «из записи», результат шага, кость) —
// выбирается из подсказки под полем. Человек не обязан знать слова
// «const», «expr» и «param»: вид определяется его жестом.

import { useMemo, useState } from 'react';
import type { System, Effect, SlotRef, Step } from '@vtt/schema';
import { Select } from '../../ui/primitives.tsx';
import { labelOfTag } from '../../ui/formula.tsx';
import { dieWord } from './readback.ts';
import type { SlotContext, SlotKind } from './slots.tsx';

export function parseTyped(text: string): SlotRef | null {
  const t = text.trim();
  if (!t) return null;
  if (/^-?\d+(\.\d+)?$/.test(t)) return { const: Number(t) };
  return { expr: t };
}

export function displayOf(ref: unknown, ctx: SlotContext): string {
  if (ref === null || ref === undefined) return '';
  if (typeof ref !== 'object') return String(ref);
  const r = ref as Record<string, unknown>;
  if ('const' in r) return String(r.const ?? '');
  if ('expr' in r) return String(r.expr ?? '');
  if ('tag' in r) return `поле: ${labelOfTag(ctx.system, String(r.tag))}`;
  if ('param' in r) {
    const declared = ctx.effect.params?.find(p => p.key === r.param);
    return `из записи: ${declared?.label ?? String(r.param)}`;
  }
  if ('prop' in r || 'item' in r) return `из записи: ${String(r.prop ?? r.item)}`;
  if ('ref' in r) return `результат «${String(r.ref)}»`;
  if ('constant' in r) return `кость: ${dieWord(ctx.system, String(r.constant))}`;
  return '';
}

export interface SlotOption { group: string; label: string; ref: SlotRef }

export function optionsFor(ctx: SlotContext, allow?: SlotKind[]): SlotOption[] {
  const ok = (kind: SlotKind) => !allow || allow.includes(kind);
  const out: SlotOption[] = [];
  if (ok('param')) {
    for (const p of ctx.effect.params ?? []) out.push({ group: 'Из записи', label: p.label ?? p.key, ref: { param: p.key } });
  }
  if (ok('ref')) for (const name of ctx.earlier) out.push({ group: 'Результаты шагов', label: `результат «${name}»`, ref: { ref: name } });
  if (ok('tag')) for (const f of ctx.system.fields) out.push({ group: 'Поля цели', label: f.label ?? f.tag, ref: { tag: f.tag } });
  if (ok('constant')) {
    for (const [key, c] of Object.entries(ctx.system.constants ?? {})) out.push({ group: 'Кости', label: c.label ?? key, ref: { constant: key } });
  }
  return out;
}

export function SlotInput({ value, onChange, context, allow, placeholder, extraOptions }: {
  value: unknown;
  onChange: (next: SlotRef | null) => void;
  context: SlotContext;
  allow?: SlotKind[];
  placeholder?: string;
  /** Дополнительные строки подсказки (например, состояния для карточки «изменение»). */
  extraOptions?: SlotOption[];
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const options = useMemo(
    () => [...(extraOptions ?? []), ...optionsFor(context, allow)],
    [context, allow, extraOptions],
  );
  const shown = draft ?? displayOf(value, context);
  const needle = (draft ?? '').toLowerCase();
  const filtered = needle ? options.filter(o => o.label.toLowerCase().includes(needle)) : options;

  const commitTyped = () => {
    if (draft !== null) { onChange(parseTyped(draft)); setDraft(null); }
    setOpen(false);
  };

  return (
    <div className="slot">
      <input
        className="input input--mono"
        value={shown}
        placeholder={placeholder ?? 'число, формула — или выберите из списка'}
        spellCheck={false}
        onFocus={() => setOpen(true)}
        onChange={e => { setDraft(e.target.value); setOpen(true); }}
        onBlur={() => setTimeout(commitTyped, 120)}
        onKeyDown={e => {
          if (e.key === 'Enter') commitTyped();
          if (e.key === 'Escape') { setDraft(null); setOpen(false); }
        }}
      />
      {open && filtered.length ? (
        <div className="slot__menu">
          {filtered.map((option, i) => (
            <button
              key={i} type="button" className="slot__option"
              onMouseDown={e => { e.preventDefault(); onChange(option.ref); setDraft(null); setOpen(false); }}
            >
              <span className="slot__group">{option.group}</span>
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
      {value && typeof value === 'object' && 'expr' in (value as object) ? (
        <Select
          value={(value as { of?: string }).of ?? 'source'}
          options={[['source', 'считает отправитель'], ['target', 'считает цель — её листом']] as const}
          onChange={of => onChange({ ...(value as { expr: string }), of: of === 'source' ? undefined : 'target' } as SlotRef)}
        />
      ) : null}
    </div>
  );
}
```

Стили — дописать в конец `apps/web/src/ui/primitives.css`:

```css
/* ── слот с подсказкой (конструктор эффектов) ── */
.slot { position: relative; display: grid; gap: 4px; }
.slot__menu {
  position: absolute; top: 100%; left: 0; right: 0; z-index: 30;
  max-height: 220px; overflow-y: auto; margin-top: 2px;
  background: var(--panel, #17171c); border: 1px solid var(--border, #333);
  border-radius: 8px; box-shadow: 0 6px 18px rgba(0, 0, 0, .35);
}
.slot__option {
  display: flex; gap: 8px; align-items: baseline; width: 100%;
  padding: 6px 10px; border: none; background: none; text-align: left;
  font: inherit; font-size: 13px; color: inherit; cursor: pointer;
}
.slot__option:hover { background: rgba(122, 132, 255, .12); }
.slot__group { font-size: 10px; text-transform: uppercase; letter-spacing: .4px; opacity: .5; min-width: 92px; }
```

- [ ] **Step 4: Прогнать — зелено**

Run: `cd apps/web && pnpm vitest run src/screens/constructor/slot-input.test.tsx`
Expected: PASS (6 тестов).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/screens/constructor/slot-input.tsx apps/web/src/screens/constructor/slot-input.test.tsx apps/web/src/ui/primitives.css
git commit -m "Слот без таксономии: печатаешь значение или выбираешь из подсказки"
```

---

### Task 4: Карточки трёх понятий — `card.tsx`

**Files:**
- Create: `apps/web/src/screens/constructor/card.tsx`
- Test: `apps/web/src/screens/constructor/card.test.tsx`

**Interfaces:**
- Consumes: `CardGroup` (Task 2), `checkReadback/changeReadback/numberReadback/Segment` (Task 1), `SlotInput, SlotOption` (Task 3), `problemOf` (step-card.tsx), примитивы `Card, CardHead, Field, Fold, Segmented, Verdict, Button, Select, Input`.
- Produces:
  - `GroupCard({ group, position, system, effect, earlier, problem, edit, onDelete }): JSX.Element`
    - `position: number` — номер карточки (1-based) для заголовка;
    - `edit(slotIndexInGroup: number, change: (draft: Step) => void): void` — 0 = главный шаг… для склейки: 0 = amount, 1 = apply;
    - `problem: string | null` — уже вычисленный приговор группы.
  - `Readback({ segments }: { segments: Segment[] }): JSX.Element` — зелёная строка, пропуски классом `.hole`.

Правила карточек (все — в этом файле, он один владеет отображением):

- Заголовок: `«{position} · Проверка|Изменение|Число»`; для «Числа» рядом мини-инпут имени (`step.id`, mono) — имя нужно, только на него ссылаются.
- Приговор группы (`problem`) — `<Verdict tone="bad">` под заголовком, карточка `tone="bad"`.
- **Проверка**: `Segmented` «броском / без броска» (значение из `step.type`); переключение меняет `type` и досыпает умолчания, НЕ стирая чужие ключи (принцип «смена рода не выбрасывает работу»). Броском: SlotInput «кость» (`allow: ['constant']`), SlotInput «прибавка», SlotInput «против» (`allow: ['tag','param','ref']` + печать формулы/числа). Без броска: SlotInput «что сравниваем» + «против». Тонкости (Fold): кто бросает (Select sender/target), направление успеха (Select atLeast/notOver/over/under), «дальше при» (Select success/fail), мишень модификаторов (Select из `system.rolls`), для compare — «обрыв когда» (Select less/atMost/never). Под карточкой пунктирная строка `.card-break`: «здесь эффект может оборваться» (для compare с `breakIf: 'never'` — не рисуется).
- **Изменение**: `Segmented` «поле / состояние» (`apply`/`status`, переключение как выше). Поле: SlotInput «какое поле» (`allow: ['tag']`), Select «как» (вычесть/прибавить/задать), «сколько»: при склейке — два SlotInput (кости ← `amount.dice`, прибавка ← `amount.bonus`), иначе один SlotInput на `value`. Тонкости: «не ниже» (`floor`), «не выше» (`ceiling`), «сопротивления цели» (Select учитываются/нет → `targetModifiers`). Состояние: Select «вешаем/снимаем» (`mode`) + SlotInput «какое» c `extraOptions` — пассивные эффекты системы как `{ const: id }`.
- **Число**: Select «откуда» (свой бросок / превышение проверки / фикс записи → `source`), SlotInput'ы `dice/bonus` или `margin` (`allow: ['ref']`) или `fixed` по источнику — показываются ТОЛЬКО слоты выбранного источника (урок из ревью: главное следует за выбором).
- **unknown**: красная карточка «движок не знает типа «X»» + кнопка удаления.

- [ ] **Step 1: Написать падающий тест**

```tsx
// apps/web/src/screens/constructor/card.test.tsx
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GroupCard } from './card.tsx';
import { groupSteps, STEP_TEMPLATES } from './cards.ts';
import type { System, Effect, Step } from '@vtt/schema';

const system = {
  fields: [{ tag: 'armor', label: 'Класс брони', value: { kind: 'stored', type: 'number', default: 10 } }],
  constants: { lead: { label: 'Ведущая кость', kind: 'die', dice: [{ sides: 20 }] } },
  rolls: [], effects: {},
} as unknown as System;
const effect = { params: [] } as unknown as Effect;

const attackSteps = () => STEP_TEMPLATES.find(t => t.key === 'attack')!.make(system, []);

describe('GroupCard', () => {
  it('проверка показывает пересказ с пропуском мишени', () => {
    const group = groupSteps(attackSteps())[0]!;
    render(<GroupCard group={group} position={1} system={system} effect={effect}
      earlier={[]} problem={null} edit={() => {}} onDelete={() => {}} />);
    expect(screen.getByText('какого поля цели?')).toBeTruthy();
  });

  it('переключение «без броска» меняет тип на compare, не стирая roll', () => {
    const steps = attackSteps();
    const group = groupSteps(steps)[0]!;
    const edits: Array<(draft: Step) => void> = [];
    render(<GroupCard group={group} position={1} system={system} effect={effect}
      earlier={[]} problem={null} edit={(_, change) => edits.push(change)} onDelete={() => {}} />);
    fireEvent.click(screen.getByText('без броска'));
    const draft = structuredClone(steps[0]!);
    edits.forEach(change => change(draft));
    expect(draft.type).toBe('compare');
    expect((draft as any).roll).toBeDefined();
  });

  it('склеенное изменение правит кости внутреннего числа', () => {
    const steps = attackSteps();
    const group = groupSteps(steps)[1]!;
    let edited: { at: number } | null = null;
    render(<GroupCard group={group} position={2} system={system} effect={effect}
      earlier={[]} problem={null}
      edit={(at, change) => { edited = { at }; change(structuredClone(group.amount!)); }}
      onDelete={() => {}} />);
    const dice = screen.getByPlaceholderText('какие кости: 1к8, 2к6…');
    fireEvent.change(dice, { target: { value: '1d8' } });
    fireEvent.keyDown(dice, { key: 'Enter' });
    expect(edited).toEqual({ at: 0 });
  });
});
```

- [ ] **Step 2: Прогнать — убедиться, что падает**

Run: `cd apps/web && pnpm vitest run src/screens/constructor/card.test.tsx`
Expected: FAIL — `Cannot find module './card.tsx'`.

- [ ] **Step 3: Реализация**

Каркас файла (полный, дальше только заполнить тела веток по правилам выше):

```tsx
// apps/web/src/screens/constructor/card.tsx
// Карточка группы шагов: три понятия поверх пяти команд движка.
// Пересказ — сверху; контролы следуют за выбором (у «числа» видны только
// слоты выбранного источника); переключатели меняют step.type, ничего
// не стирая — вернул переключатель, вернулась и работа.

import type { System, Effect, Step } from '@vtt/schema';
import { Card, CardHead, Field, Fold, Segmented, Verdict, Button, Select, Input } from '../../ui/primitives.tsx';
import type { CardGroup } from './cards.ts';
import { checkReadback, changeReadback, numberReadback, type Segment } from './readback.ts';
import { SlotInput, type SlotOption } from './slot-input.tsx';
import type { SlotContext } from './slots.tsx';

const TITLES: Record<string, string> = { check: 'Проверка', change: 'Изменение', number: 'Число' };

export function Readback({ segments }: { segments: Segment[] }) {
  return (
    <p className="readback">
      {segments.map((part, i) => 'text' in part
        ? <span key={i}>{part.text} </span>
        : <span key={i} className="readback__hole">{part.hole}</span>)}
    </p>
  );
}

export function GroupCard({ group, position, system, effect, earlier, problem, edit, onDelete }: {
  group: CardGroup;
  position: number;
  system: System;
  effect: Effect;
  earlier: string[];
  problem: string | null;
  edit: (slotIndexInGroup: number, change: (draft: Step) => void) => void;
  onDelete: () => void;
}) {
  const context: SlotContext = { system, effect, earlier };
  const step = group.step as any;

  if (group.kind === 'unknown') {
    return (
      <Card tone="bad">
        <CardHead title={`${position} · движок не знает типа «${group.step.type}»`}
          actions={<Button size="sm" variant="danger" onClick={onDelete}>×</Button>} />
      </Card>
    );
  }

  const segments = group.kind === 'check' ? checkReadback(group.step, system, effect)
    : group.kind === 'change' ? changeReadback(group.step, group.amount, system, effect)
      : numberReadback(group.step, system, effect);

  return (
    <>
      <Card tone={problem ? 'bad' : undefined}>
        <CardHead
          title={`${position} · ${TITLES[group.kind]}`}
          actions={<Button size="sm" variant="danger" onClick={onDelete}>×</Button>}
        />
        {problem ? <Verdict tone="bad">{problem}</Verdict> : null}
        <Readback segments={segments} />
        {group.kind === 'check' ? <CheckBody step={step} context={context} edit={edit} system={system} /> : null}
        {group.kind === 'change' ? <ChangeBody group={group} context={context} edit={edit} system={system} /> : null}
        {group.kind === 'number' ? <NumberBody step={step} context={context} edit={edit} /> : null}
      </Card>
      {breakLine(group)}
    </>
  );
}

function breakLine(group: CardGroup) {
  if (group.kind !== 'check') return null;
  if (group.step.type === 'compare' && (group.step as any).breakIf === 'never') return null;
  return <p className="card-break">здесь эффект может оборваться</p>;
}
```

Тела `CheckBody`, `ChangeBody`, `NumberBody` — по правилам из блока «Interfaces» выше; ключевые фрагменты, которые легко сделать неправильно:

```tsx
// Переключатель проверки: тип меняется, чужая нагрузка остаётся.
const mode = step.type === 'compare' ? 'plain' : 'roll';
<Segmented
  value={mode}
  options={[{ key: 'roll', label: 'броском' }, { key: 'plain', label: 'без броска' }]}
  onChange={next => edit(0, draft => {
    const d = draft as any;
    if (next === 'roll') {
      draft.type = 'threshold';
      d.roll ??= { die: firstDie(system) ? { constant: firstDie(system) } : undefined, check: null };
      d.side ??= 'sender'; d.successWhen ??= 'atLeast'; d.continueOn ??= 'success';
    } else {
      draft.type = 'compare';
      d.breakIf ??= 'less';
    }
  })}
/>

// «Сколько» склеенного изменения: кости правят amount (индекс 0), поле — apply (индекс 1).
{group.amount ? (
  <>
    <Field label="Сколько — кости">
      <SlotInput value={(group.amount as any).dice} context={context}
        placeholder="какие кости: 1к8, 2к6…"
        onChange={next => edit(0, draft => { (draft as any).dice = next ?? undefined; })} />
    </Field>
    <Field label="и прибавка">
      <SlotInput value={(group.amount as any).bonus} context={context}
        onChange={next => edit(0, draft => { (draft as any).bonus = next ?? undefined; })} />
    </Field>
  </>
) : (
  <Field label="Сколько">
    <SlotInput value={step.value} context={context} allow={['ref', 'param', 'const']}
      onChange={next => edit(0, draft => { (draft as any).value = next ?? undefined; })} />
  </Field>
)}

// Состояния для карточки «изменение → состояние»: пассивные эффекты системы.
const statusOptions: SlotOption[] = Object.entries(system.effects ?? {})
  .filter(([, e]) => (e.activation ?? 'manual') === 'passive')
  .map(([id, e]) => ({ group: 'Состояния', label: e.label ?? id, ref: { const: id } }));
```

Индексация `edit`: для склейки `indices=[amount, apply]` — `edit(0, …)` правит amount, `edit(1, …)` правит apply; для одиночной карточки — только `edit(0, …)`. `ChangeBody` при отсутствии склейки правит apply через `edit(0, …)`.

Стили — дописать в `apps/web/src/ui/primitives.css`:

```css
/* ── пересказ на карточке шага ── */
.readback {
  border-left: 3px solid var(--ok, #4caf7d); background: rgba(76, 175, 125, .07);
  border-radius: 6px; padding: 8px 11px; margin: 6px 0 10px;
  font-size: 13.5px; line-height: 1.5;
}
.readback__hole {
  background: rgba(255, 152, 0, .16); border: 1px dashed #ff9800;
  border-radius: 4px; padding: 0 5px; margin-right: 4px; white-space: nowrap;
}
.card-break {
  margin: -4px 0 10px 14px; padding-left: 10px; font-size: 12px; opacity: .65;
  border-left: 2px dotted var(--bad, #e05555);
}
```

- [ ] **Step 4: Прогнать — зелено**

Run: `cd apps/web && pnpm vitest run src/screens/constructor/card.test.tsx`
Expected: PASS (3 теста).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/screens/constructor/card.tsx apps/web/src/screens/constructor/card.test.tsx apps/web/src/ui/primitives.css
git commit -m "Карточки трёх понятий: пересказ сверху, контролы за выбором"
```

---

### Task 5: Врезка в экран — палитра и группы

**Files:**
- Modify: `apps/web/src/screens/constructor/effects-tab.tsx`
- Modify: `apps/web/src/screens/constructor/step-card.tsx` (удалить мёртвые `StepCard`, `SlotField`, `summaryOf`; `STEP_SPECS`, `specOf`, `problemOf`, `read`, `write` остаются)
- Test: `apps/web/src/screens/constructor/effects-tab.test.tsx`

**Interfaces:**
- Consumes: `groupSteps, STEP_TEMPLATES, BRICKS` (Task 2), `GroupCard` (Task 4), `problemOf` (step-card.tsx).
- Produces: экран; наружные контракты не меняются.

Правки `effects-tab.tsx` (метод — заменить куски внутри `EffectEditor`):

1. Убрать импорт `StepCard`; добавить импорты `groupSteps, STEP_TEMPLATES, BRICKS` и `GroupCard`.
2. Список карточек:

```tsx
{groupSteps(steps).map((group, at) => (
  <GroupCard
    key={group.indices[0]}
    group={group}
    position={at + 1}
    system={system}
    effect={effect}
    earlier={earlierOf(group.indices[0]!)}
    problem={group.indices.map(i => problems[i]).find(Boolean) ?? null}
    edit={(k, change) => edit(draft => {
      const index = group.indices[k] ?? group.indices[0]!;
      change(draft.steps![index]!);
    })}
    onDelete={() => edit(draft => {
      [...group.indices].sort((a, b) => b - a).forEach(i => draft.steps!.splice(i, 1));
    })}
  />
))}
```

3. Палитра вместо ряда `STEP_SPECS`-кнопок — два ряда:

```tsx
<div className="inline inline--tight">
  {STEP_TEMPLATES.map(t => (
    <Button key={t.key} size="sm" variant="primary" title={t.hint}
      onClick={() => edit(draft => {
        const taken = (draft.steps ?? []).map(s => s.id).filter(Boolean) as string[];
        (draft.steps ??= []).push(...t.make(system, taken));
      })}>
      {t.label}
    </Button>
  ))}
</div>
<div className="inline inline--tight">
  {BRICKS.map(b => (
    <Button key={b.key} size="sm" title={b.hint}
      onClick={() => edit(draft => {
        const taken = (draft.steps ?? []).map(s => s.id).filter(Boolean) as string[];
        (draft.steps ??= []).push(...b.make(system, taken));
      })}>
      {b.label}
    </Button>
  ))}
</div>
```

4. Словарь: заголовок фолда параметров `«Дырки для записей компендиума»` → `«Что эффект берёт из записи»`; summary при пустоте → `«ничего — все значения заданы в шагах»`. Кнопка `«+ параметр»` → `«+ брать из записи»`.
5. В `step-card.tsx` удалить компоненты `StepCard`, `SlotField`, `summaryOf` и их импорты (`SlotEditor`, `Fold` и пр., если больше не нужны). Файл после чистки — только реестр `STEP_SPECS` + `problemOf` + `read/write`.

- [ ] **Step 1: Написать падающий тест**

```tsx
// apps/web/src/screens/constructor/effects-tab.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EffectsTab } from './effects-tab.tsx';
import { useWorld } from '../../store/world.ts';

describe('EffectsTab: палитра трёх понятий', () => {
  beforeEach(() => {
    useWorld.setState(state => ({
      ...state,
      system: {
        ...state.system,
        effects: { strike: { label: 'Атака', activation: 'manual', params: [], steps: [] } },
      },
      activeEffectId: 'strike',
    }));
  });

  it('заготовка «атака с броском» кладёт две карточки', () => {
    render(<EffectsTab />);
    fireEvent.click(screen.getByText('+ атака с броском'));
    expect(screen.getByText('1 · Проверка')).toBeTruthy();
    expect(screen.getByText('2 · Изменение')).toBeTruthy();
    expect(screen.queryByText(/порог/i)).toBeNull();
  });

  it('на экране нет слова «дырка»', () => {
    render(<EffectsTab />);
    expect(screen.queryByText(/дырк/i)).toBeNull();
    expect(screen.getByText('Что эффект берёт из записи')).toBeTruthy();
  });
});
```

Примечание: если `useWorld.setState` в сторе обёрнут `persist`, сигнатура та же — этот вызов работает; если тест упрётся в `localStorage`, jsdom его предоставляет.

- [ ] **Step 2: Прогнать — убедиться, что падает**

Run: `cd apps/web && pnpm vitest run src/screens/constructor/effects-tab.test.tsx`
Expected: FAIL — на текущем экране нет кнопки «+ атака с броском».

- [ ] **Step 3: Внести правки 1–5**

По коду из блока выше. После правок мёртвый код не оставлять: `pnpm typecheck` в `apps/web` должен быть чистым.

- [ ] **Step 4: Прогнать всё — зелено**

Run: `cd apps/web && pnpm vitest run && pnpm typecheck`
Expected: PASS все файлы (включая старый `app.border.test.ts` — граница режимов не тронута), typecheck без ошибок.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/screens/constructor/
git commit -m "Палитра эффектов: заготовки и три кирпича вместо пяти команд"
```

---

### Task 6: Смоук вживую и сдача

**Files:**
- Modify: нет (только проверка)

- [ ] **Step 1: Полный прогон репозитория**

Run: `make ts-test && make ts-check`
Expected: все пакеты зелёные. Тесты движка не тронуты — если упали, значит, задет чужой код: откатывать свою правку, не тест.

- [ ] **Step 2: Смоук в браузере**

Run: `make ts` (если не запущен), открыть `http://localhost:8300/author/system` → вкладка «Эффекты».
Проверить руками, по пунктам:
1. «+ активируемый» → «+ атака с броском» → ровно две карточки, зелёные пересказы, оранжевые пропуски «какого поля цели?» и «какие кости?».
2. В пропуск «против» кликнуть слот → в подсказке видны поля системы; выбор поля меняет пересказ.
3. Переключатель «без броска» → карточка перестроилась, обратно — бросок вернулся с костью.
4. Донор «Атака» из D&D 5e → карточки читаются, битые ссылки видны приговором на карточке.
5. Удаление карточки-склейки убирает оба шага; «шагов: N» в списке слева согласован.

- [ ] **Step 3: Зафиксировать хвосты**

Если смоук нашёл мелочи — чинить и коммитить по одной: `git commit -m "..."` на каждую.

- [ ] **Step 4: Сдача Владу**

Позвать проверить руками на `:8300`: собрать «Огненный шар» (атака по спасброску — заготовка «атака с броском», перещёлкнутая на «цель бросает») без подсказок. Где застрял — записать дословно: это вход фазы 2.
