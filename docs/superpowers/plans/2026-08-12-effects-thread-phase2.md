# Нить «Атака ← Оружие ← Меч» и словари: фаза 2

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Связь «эффект ↔ род записи ↔ запись» становится одной и видимой: эффект объявляет потребности («берёт из записи»), род закрывает их свойствами (с кнопкой автосоздания), компендиум показывает «владелец получит»; красные доноры чинятся кнопкой; кости и мишени бросков заводятся в словарях.

**Architecture:** Движок не меняется — форма `{param}` + `args` в привязке уже отыгрывается (`packages/engine/src/engine/refs.ts:98-110`). Меняются данные (образцы переписаны на потребности), появляется чистый конвертер `unifyRecordRefs` для старых миров, и четыре экрана дорисовывают нить. Спека: `docs/superpowers/specs/2026-08-11-effects-constructor-redesign-design.md`, раздел «Фаза 2 — нить».

**Tech Stack:** как в фазе 1 — React 19, TS, vitest (web: jsdom), zustand persist.

## Global Constraints

- Не трогать: `src/` (vanilla-PoC), `packages/engine/src/engine/**` и `packages/schema` (движок и схема заморожены; правятся только ДАННЫЕ образцов в `packages/engine/src/model/*`), `apps/server/src`.
- В видимых строках запрещены: «слот», «дырка», «привязка» (говорим «что запись даёт владельцу»), «порог», «величина», «параметр» (говорим «берёт из записи», «потребность»).
- Ни одного имени стата в коде экранов (критерий №3). Лейблы тестовых систем — можно.
- Тесты: `cd apps/web && pnpm vitest run <файл>`; движок: `pnpm --filter @vtt/engine test` (359 сейчас); полный: `make ts-test && make ts-check`.
- Коммит в `rules-constructor` после каждой задачи, сообщения по-русски, в конце:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

**Интерфейсы фазы 1, на которые опирается план (менять нельзя без задачи):**
- `SlotInput({ value, onChange, context, allow?, placeholder?, extraOptions?, dice? })`, `SlotOption { group; label; ref }` — `apps/web/src/screens/constructor/slot-input.tsx`.
- `GroupCard({ group, position, system, effect, earlier, problem, edit, onDelete })` — `card.tsx`.
- `problemOf(step, system, effect, earlier): string | null` — `step-card.tsx` (задача 2 меняет её сигнатуру — единственное согласованное исключение).
- `groupSteps`, `BRICKS` — `cards.ts`; `freeId(taken, base)` — `store/world.ts`; `slugOf` — приватный в `sheet-tab.tsx` (задача 6 выносит его в `store/world.ts` и реэкспортирует).
- Доноры: `DonorPalette`, приватные `neededBlocks/orderedBlocks` — `donors.tsx` (задача 3 выносит копирование блока в экспорт).

---

### Task 1: Конвертер `unifyRecordRefs` + образцы на потребностях

**Files:**
- Create: `apps/web/src/store/unify.ts`
- Test: `apps/web/src/store/unify.test.ts`
- Modify: `apps/web/src/store/world.ts` (вызовы конвертера)
- Modify: `packages/engine/src/model/system.ts` (эффект `strike` и род `weapon`)
- Modify: при падении — тесты движка, ссылающиеся на прежнюю структуру `strike` (`packages/engine/tests/rule.weapon.test.ts` и соседи): менять только структуру данных в тестах, не смысл проверок.

**Interfaces:**
- Consumes: типы `System, Effect, Step, RecordKind` из `@vtt/schema`.
- Produces: `unifyRecordRefs(system: System): System` — ЧИСТАЯ (вход не мутирует, возвращает новый объект; если менять нечего — возвращает вход как есть, по ссылке). Правило: каждый `{prop:K}`/`{item:K}` в слотах шагов эффекта →
  1) у эффекта появляется потребность `params[]`: `{ key: K1, label: L, kind: KIND }`, где `K1 = K`, если ключ свободен среди params, иначе `K_2`…; `L` — лейбл свойства `K` из первого объявившего рода (`system.records[*].props`), иначе `K`; `KIND` — `kind` того же свойства, иначе `'expr'`;
  2) слот шага становится `{param: K1}` (`optional` сохраняется);
  3) у каждого рода, чья привязка (`bindings[].effect`) указывает на этот эффект, `args[K1] ??= { prop: K }`.
  Триггерные `args` эффекта и всё прочее не трогаются.

- [ ] **Step 1: Написать падающий тест конвертера**

```ts
// apps/web/src/store/unify.test.ts
import { describe, it, expect } from 'vitest';
import { unifyRecordRefs } from './unify.ts';
import type { System } from '@vtt/schema';

const world = () => ({
  fields: [], constants: {}, rolls: [],
  effects: {
    hit: {
      label: 'Удар', activation: 'manual', params: [],
      steps: [
        { id: 'n', type: 'amount', source: 'roll', dice: { prop: 'кость' } },
        { type: 'apply', target: { tag: 'хиты' }, value: { ref: 'n' } },
      ],
    },
  },
  records: {
    weapon: {
      kind: 'item', label: 'Оружие',
      props: [{ key: 'кость', label: 'Кость урона', kind: 'dice' }],
      bindings: [{ label: 'Удар', effect: 'hit', args: {} }],
    },
  },
}) as unknown as System;

describe('unifyRecordRefs', () => {
  it('переносит прямое свойство в потребность и закрывает её в привязке', () => {
    const next = unifyRecordRefs(world());
    const effect = next.effects.hit!;
    expect(effect.params).toEqual([{ key: 'кость', label: 'Кость урона', kind: 'dice' }]);
    expect((effect.steps![0] as any).dice).toEqual({ param: 'кость' });
    expect((next.records!.weapon!.bindings![0] as any).args)
      .toEqual({ кость: { prop: 'кость' } });
  });

  it('вход не мутируется; чистая система возвращается как есть', () => {
    const source = world();
    const before = JSON.stringify(source);
    const next = unifyRecordRefs(source);
    expect(JSON.stringify(source)).toBe(before);
    expect(unifyRecordRefs(next)).toBe(next);
  });

  it('занятый ключ получает суффикс', () => {
    const source = world();
    (source.effects.hit as any).params = [{ key: 'кость', label: 'другая', kind: 'number' }];
    const next = unifyRecordRefs(source);
    expect((next.effects.hit!.steps![0] as any).dice).toEqual({ param: 'кость_2' });
    expect(next.effects.hit!.params!.map(p => p.key)).toEqual(['кость', 'кость_2']);
  });
});
```

- [ ] **Step 2: Прогнать — FAIL (модуля нет)**

Run: `cd apps/web && pnpm vitest run src/store/unify.test.ts`

- [ ] **Step 3: Реализация конвертера**

```ts
// apps/web/src/store/unify.ts
// Конвертер старых миров к одной связи: прямые {prop} в слотах шагов
// становятся потребностями эффекта, привязки родов закрывают их свойством.
// Чистый: не мутирует вход; системе без прямых ссылок возвращает её саму.

import type { System } from '@vtt/schema';

const DIRECT = (ref: unknown): string | null =>
  ref && typeof ref === 'object' && ('prop' in (ref as object) || 'item' in (ref as object))
    ? String((ref as { prop?: unknown; item?: unknown }).prop ?? (ref as { item?: unknown }).item)
    : null;

export function unifyRecordRefs(system: System): System {
  const hasDirect = Object.values(system.effects ?? {}).some(effect =>
    (effect.steps ?? []).some(step =>
      Object.values(step as Record<string, unknown>).some(v =>
        DIRECT(v) !== null
        || (v && typeof v === 'object' && Object.values(v as object).some(w => DIRECT(w) !== null)))));
  if (!hasDirect) return system;

  const next = structuredClone(system);
  const propDecl = (key: string) => {
    for (const kind of Object.values(next.records ?? {})) {
      const found = (kind.props ?? []).find(p => p.key === key);
      if (found) return found;
    }
    return null;
  };

  for (const [effectId, effect] of Object.entries(next.effects ?? {})) {
    const params = (effect.params ??= []);
    const renames = new Map<string, string>();

    const convert = (holder: Record<string, unknown>, slot: string) => {
      const key = DIRECT(holder[slot]);
      if (key === null) return;
      let paramKey = renames.get(key);
      if (!paramKey) {
        paramKey = key;
        for (let n = 2; params.some(p => p.key === paramKey); n++) paramKey = `${key}_${n}`;
        const decl = propDecl(key);
        params.push({ key: paramKey, label: decl?.label ?? key, kind: (decl?.kind ?? 'expr') as never });
        renames.set(key, paramKey);
      }
      const optional = (holder[slot] as { optional?: boolean }).optional;
      holder[slot] = optional ? { param: paramKey, optional } : { param: paramKey };
    };

    for (const step of effect.steps ?? []) {
      const record = step as unknown as Record<string, unknown>;
      for (const slot of Object.keys(record)) {
        const value = record[slot];
        if (value && typeof value === 'object' && !('prop' in value) && !('item' in value)) {
          // составной слот (roll): вглубь на один уровень
          for (const inner of Object.keys(value as Record<string, unknown>)) {
            convert(value as Record<string, unknown>, inner);
          }
        }
        convert(record, slot);
      }
    }

    if (renames.size) {
      for (const kind of Object.values(next.records ?? {})) {
        for (const binding of kind.bindings ?? []) {
          if (binding.effect !== effectId) continue;
          binding.args ??= {};
          for (const [propKey, paramKey] of renames) {
            (binding.args as Record<string, unknown>)[paramKey] ??= { prop: propKey };
          }
        }
      }
    }
  }
  return next;
}
```

- [ ] **Step 4: Прогнать тест конвертера — PASS (3 теста)**

- [ ] **Step 5: Подключить конвертер к стору**

В `apps/web/src/store/world.ts`: импорт `unifyRecordRefs`; в `replaceWorld` — `system: unifyRecordRefs(world.system)`; в опции `persist` добавить
`onRehydrateStorage: () => state => { if (state) state.system = unifyRecordRefs(state.system); }`
(сигнатуру сверить с установленной версией zustand — если middleware ждёт другую форму, привести к ней, поведение то же: конвертация после гидрации).

- [ ] **Step 6: Переписать образец D&D на потребности**

В `packages/engine/src/model/system.ts`, эффект `strike`: слот костей шага-величины `{ prop: 'damage_dice' }` → `{ param: 'damage_dice' }`; в `params` эффекта добавить `{ key: 'damage_dice', label: 'Кость урона', kind: 'dice' }`; в привязке рода `weapon` — `args: { damage_dice: { prop: 'damage_dice' } }`. Комментарий у привязки обновить: аргументы теперь ЕСТЬ — они закрывают потребности. Проверить `system-cyberpunk.ts` тем же способом (`grep "prop:"` по файлу) и привести найденное.

- [ ] **Step 7: Полные прогоны**

Run: `pnpm --filter @vtt/engine test` — если тесты падают на структуре `strike`, поправить в тестах данные (не смысл). Затем `cd apps/web && pnpm vitest run && pnpm typecheck`.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/store packages/engine
git commit -m "Одна связь с записью: потребности эффекта, конвертер миров, образцы переписаны"
```

---

### Task 2: «Берёт из записи» видимой таблицей + потребность из слота + структурный problemOf

**Files:**
- Modify: `apps/web/src/screens/constructor/effects-tab.tsx` (ParamsEditor → видимая секция)
- Modify: `apps/web/src/screens/constructor/slot-input.tsx` (пункт «новая потребность»)
- Modify: `apps/web/src/screens/constructor/step-card.tsx` (`problemOf` возвращает структуру)
- Modify: `apps/web/src/screens/constructor/card.tsx`, `effects-tab.tsx` (потребители problemOf)
- Test: дополнить `effects-tab.test.tsx`, `slot-input.test.tsx`

**Interfaces:**
- Produces: `problemOf(...): { text: string; missingField?: string } | null` — `missingField` = тег поля, которого нет в системе (для кнопки задачи 3). Все места, читавшие строку, читают `.text`.
- Produces: `SlotInput` принимает `onCreateFromRecord?: () => SlotRef` — если передан, в конце группы «Из записи» рендерится пункт «из записи → новая потребность…»; клик вызывает колбэк и коммитит возвращённый ref.
- ParamsEditor убирается из `Fold`, становится карточкой «Что эффект берёт из записи» с таблицей строк: Input названия, Select «чем заполнят» (`dice → кости (1d8)`, `number → число`, `expr → формула`, `effect → эффект-состояние`, `choice → выбор`, `tag → поле листа`), Select «кто считает» (`отправитель / цель — её листом`), кнопка удаления. Пустая — одна строка-подсказка «пока ничего — слоты шагов заполнены напрямую» и кнопка «+ брать из записи».

- [ ] **Step 1: Падающие тесты**

В `effects-tab.test.tsx` (фикстура beforeEach уже создаёт эффект strike):

```tsx
it('«Берёт из записи» — видимая секция с кнопкой', () => {
  render(<EffectsTab />);
  expect(screen.getByText('Что эффект берёт из записи')).toBeTruthy();
  fireEvent.click(screen.getByText('+ брать из записи'));
  const effect = useWorld.getState().system.effects.strike!;
  expect(effect.params!.length).toBe(1);
});
```

В `slot-input.test.tsx`:

```tsx
it('пункт «новая потребность» зовёт колбэк и коммитит его ref', () => {
  let got: unknown = null;
  render(<SlotInput value={undefined} onChange={next => { got = next; }} context={ctx}
    onCreateFromRecord={() => ({ param: 'новая' })} />);
  fireEvent.focus(screen.getByRole('textbox'));
  fireEvent.mouseDown(screen.getByText(/новая потребность/));
  expect(got).toEqual({ param: 'новая' });
});
```

- [ ] **Step 2: Прогнать — FAIL**

- [ ] **Step 3: Реализация**

`slot-input.tsx`: после `optionsFor`-пунктов группы «Из записи» добавить, если передан `onCreateFromRecord`, синтетический пункт `{ group: 'Из записи', label: 'из записи → новая потребность…' }` с отдельной обработкой mousedown: `onChange(onCreateFromRecord())`.

`card.tsx`: в местах, где SlotInput может брать из записи (кости склейки, «сколько», dice/fixed «числа», «какое состояние»), передать `onCreateFromRecord`, который через `edit` дописывает эффекту потребность (`freeId(params.keys, 'из_записи')`, label по подписи слота, kind: dice-слоту `dice`, состоянию `effect`, прочим `expr`) и возвращает `{param: key}`. ВАЖНО: `edit` правит шаг; потребность живёт на ЭФФЕКТЕ — прокинуть из effects-tab в GroupCard колбэк `onAddParam(label, kind): string` (возвращает ключ), внутри `edit(draft-эффекта)`. Расширение пропсов GroupCard — согласованное исключение задачи.

`problemOf`: `return { text: '…', missingField: tag }` в ветке «поля нет»; остальные ветки — `{ text }`. Потребители: `effects-tab.tsx` (`problems[i]?.text`), `card.tsx` (`problem.text` в Verdict; сам prop становится структурой или null).

`effects-tab.tsx`: ParamsEditor переписать по правилам из Interfaces (без Fold; строки таблицы — `.row`).

- [ ] **Step 4: Все веб-тесты + typecheck — PASS**

- [ ] **Step 5: Commit** — `git add apps/web && git commit -m "Потребности эффекта видны и заводятся из слота"`

---

### Task 3: Красный донор чинится кнопкой

**Files:**
- Modify: `apps/web/src/screens/constructor/donors.tsx` (экспорт копирования блока)
- Modify: `apps/web/src/screens/constructor/effects-tab.tsx`, `card.tsx` (кнопка у ошибки)
- Test: дополнить `effects-tab.test.tsx`

**Interfaces:**
- Produces (donors.tsx): `findDonorBlock(tag: string): { donor: System; group: string } | null` — ищет по `SAMPLE_SYSTEMS` поле с тегом; `copyDonorBlock(editSystem, donor, group): void` — вынесенное тело нынешнего `copy` из `Blocks` (замыкание+порядок+таблицы), `Blocks` переиспользует его.
- GroupCard получает `problemAction?: ReactNode`, рендерит рядом с Verdict ошибки.
- effects-tab: если `problems[i]?.missingField` и `findDonorBlock` нашёл — кнопка `взять блок «<group>» из «<donor.name>»`, по клику `copyDonorBlock(...)`.

- [ ] **Step 1: Падающий тест**

```tsx
it('ошибка про недостающее поле предлагает взять блок донора', () => {
  useWorld.setState(state => ({
    ...state,
    system: {
      ...state.system,
      effects: {
        strike: {
          label: 'Атака', activation: 'manual', params: [],
          steps: [{ type: 'apply', target: { tag: 'hp_current' }, value: { const: 1 } }],
        },
      },
    },
    activeEffectId: 'strike',
  }));
  render(<EffectsTab />);
  const fix = screen.getByText(/взять блок/);
  fireEvent.click(fix);
  expect(useWorld.getState().system.fields.some(f => f.tag === 'hp_current')).toBe(true);
});
```

(`hp_current` — тег из образца D&D: тест опирается на реальные `SAMPLE_SYSTEMS`, потому и находит блок «Здоровье».)

- [ ] **Step 2: FAIL → Step 3: реализация по Interfaces → Step 4: PASS + typecheck**

- [ ] **Step 5: Commit** — `"Красный донор чинится кнопкой: блок приезжает с зависимостями"`

---

### Task 4: «Записи»: потребности привязки и кнопка «завести свойство»

**Files:**
- Modify: `apps/web/src/screens/constructor/records-tab.tsx` (BindingEditor)
- Test: create `apps/web/src/screens/constructor/records-tab.test.tsx`

**Interfaces:**
- BindingEditor: для эффекта привязки перечисляет `effect.params` («Что эффект берёт из записи»); на каждую потребность:
  - `SlotEditor` (существующий, из `slots.tsx`) со `allow: ['prop','const','expr','empty']` над `binding.args[param.key]`;
  - если потребность не закрыта (`args[key]` пуст) — кнопка `+ завести свойство «<label>»`: добавляет роду `props.push({ key: slugOf(label) с freeId-разрешением коллизий, label, kind: соответствие } )` и сразу `args[key] = { prop: newKey }`. Соответствие видов: `dice→dice`, `number→number`, `effect→effect`, `tag→text`, иначе `expr`.
  - Приговор привязки: `<Verdict tone="bad">не закрыто: …список лейблов…</Verdict>` при незакрытых.
- `slugOf` вынести из `sheet-tab.tsx` в `store/world.ts` (экспорт), sheet-tab импортирует оттуда.

- [ ] **Step 1: Падающий тест**

```tsx
// records-tab.test.tsx (@vitest-environment jsdom)
// Фикстура: system с эффектом hit (params: [{key:'кость', label:'Кость урона', kind:'dice'}])
// и родом weapon (props: [], bindings: [{label:'Удар', effect:'hit', args:{}}]), activeRecordKind:'weapon'.
it('незакрытая потребность заводит свойство кнопкой и закрывается', () => {
  render(<RecordsTab />);
  expect(screen.getByText(/не закрыто/).textContent).toContain('Кость урона');
  fireEvent.click(screen.getByText('+ завести свойство «Кость урона»'));
  const kind = useWorld.getState().system.records!.weapon!;
  expect(kind.props!.some(p => p.label === 'Кость урона' && p.kind === 'dice')).toBe(true);
  expect((kind.bindings![0] as any).args['кость']).toEqual({ prop: kind.props![0]!.key });
  expect(screen.queryByText(/не закрыто/)).toBeNull();
});
```

- [ ] **Step 2: FAIL → Step 3: реализация → Step 4: PASS, полный веб-прогон + typecheck**

- [ ] **Step 5: Commit** — `"Род видит потребности эффекта и заводит свойства под них кнопкой"`

---

### Task 5: Компендиум: «владелец получит»

**Files:**
- Modify: `apps/web/src/screens/compendium/compendium.tsx`
- Test: create `apps/web/src/screens/compendium/compendium.test.tsx` (лёгкий)

В форме записи (где рендерится род и его props) — строка: `владелец получит: <bindings[].label через « · »>`, класс `.faint`; если привязок нет — не рендерить. Тест: запись рода с привязкой «Удар» → текст «владелец получит: Удар» на экране.

- [ ] Steps: тест FAIL → правка → PASS → Commit `"Запись говорит, что даст владельцу"`

---

### Task 6: Словари: кости и мишени бросков

**Files:**
- Create: `apps/web/src/screens/constructor/dictionaries.tsx`
- Modify: `apps/web/src/screens/constructor/effects-tab.tsx` (фолд «Словари» в левой колонке, под «Действуют на всех»)
- Test: create `apps/web/src/screens/constructor/dictionaries.test.tsx`

**Interfaces:**
- `DictionariesFold({ system })` (стор берёт сам через useWorld): `<Fold title="Словари">` с двумя подсекциями.
- **Кости** (`system.constants`, `kind === 'die'`): строка = Input лейбла + Input записи (`1d20`; парсить `normalizeDice` из `slot-input.tsx` — экспортирована) + удалить. Составная кость (`dice.length > 1` или именованные части) — read-only строка «составная — правится в данных». Добавление: `+ кость` → ключ `freeId(keys, slugOf(label || 'кость'))`, `{ label, kind:'die', dice:[{count,sides}] }`. Удаление разрешено, только если ключ не встречается в мире: `JSON.stringify({system}).split('"constant":"key"')` — иначе кнопка задизаблена с title «кость используется».
- **Мишени бросков** (`system.rolls`): строка = Input лейбла (тег показывается `.mono`-бейджем) + удалить (если тег не встречается как `roll.check`/мишень модификаторов: скан JSON по `"key"`). Добавление: `+ мишень` → `{ tag: freeId(теги, slugOf(label || 'бросок')), label }`. Подпись-хинт: «чек-мишени полей включаются на „Листе“».

- [ ] **Step 1: Падающий тест**

```tsx
it('кость заводится и попадает в словарь системы', () => {
  render(<EffectsTab />);
  fireEvent.click(screen.getByText('Словари'));
  fireEvent.click(screen.getByText('+ кость'));
  const dies = Object.values(useWorld.getState().system.constants ?? {});
  expect(dies.some(c => c.kind === 'die')).toBe(true);
});
it('мишень броска заводится с тегом из названия', () => { /* аналогично: + мишень, ввести
  «Бросок защиты» в Input лейбла новой строки, проверить rolls[0] = {tag:'бросок_защиты', label:'Бросок защиты'} */ });
```

(Второй тест написать полностью, по образцу первого — с реальным вводом в Input.)

- [ ] **Step 2: FAIL → Step 3: реализация → Step 4: PASS + typecheck**

- [ ] **Step 5: Commit** — `"Словари системы: кости и мишени бросков заводятся на месте"`

---

### Task 7: Смоук нити целиком

Без новых файлов. `make ts-test && make ts-check` — всё зелёное. В браузере на :8300 пройти сквозной сценарий и записать результат в отчёт задачи:
1. «начать заново» → «Эффекты» → «+ активируемый» → кирпичами: проверка + изменение.
2. В «сколько — кости» выбрать «из записи → новая потребность» → секция «Берёт из записи» показала строку.
3. «Записи» → «+ род» → привязка на эффект → видна потребность → «+ завести свойство» → закрылась.
4. Компендиум → запись рода → «владелец получит» + поле кости в форме.
5. «Эффекты» → донор «Атака» → ошибка про поле → кнопка «взять блок…» → ошибка ушла.
6. «Словари» → завести кость `1d10` и мишень — появились в выпадашках карточек.
Хвосты чинить по одному коммиту. Затем сдача Владу.
