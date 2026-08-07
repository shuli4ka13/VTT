# Этап 1: монорепо + перенос движка на TypeScript — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** pnpm-монорепо рядом с замороженным PoC; движок (`src/formula`,
`src/model`, `src/engine`, `src/events`) перенесён в `packages/engine` на
TypeScript один-в-один; тесты PoC переведены в Vitest; паритет-тест
доказывает, что новый движок считает те же числа, что старый.

**Architecture:** перенос механический — логика не меняется, добавляются
только типы. Типы модели на этом этапе **черновые и широкие** (ужмутся
Zod-схемами на этапе 2) — выдумывать точные формы данных до схемы запрещено.
Пакет отдаёт TS-исходники напрямую (`exports` → `./src/*.ts`), сборки нет —
потребители (Vitest, позже Vite и Nest) компилируют сами.

**Tech Stack:** pnpm workspaces, TypeScript (strict), Vitest.

## Global Constraints

- PoC заморожен: файлы `src/`, `tests/`, `server/`, `*.html`, `Makefile` **не правятся** (исключение: добавление строк в `.gitignore` и новых целей в `Makefile` — можно).
- `packages/engine`: рантайм-зависимостей ноль — `dependencies` в package.json пуст (закрыто тестом, задача 2).
- Ни `eval`, ни `new Function` (закрыто тестом-сканером, задача 2).
- Логика при переносе не меняется. Любое расхождение чисел с PoC — баг переноса; «заодно улучшил» запрещено, пока жив паритет-контроль.
- Комментарии в коде — по-русски, в стиле проекта: объяснять «почему», а не «что».
- Движок не знает имён статов: в `packages/engine/src/{engine,formula,events}` не должно появиться `str`/`hp`/`ac` (переносится тест-скан из acceptance).

---

### Задача 1: каркас монорепо

**Files:**
- Create: `pnpm-workspace.yaml`
- Create: `package.json` (корень)
- Create: `tsconfig.base.json`
- Modify: `.gitignore` (добавить строки)

**Interfaces:**
- Produces: workspace, в котором задача 2 создаст пакет `@vtt/engine`; корневой скрипт `pnpm test` гоняет тесты всех пакетов.

- [ ] **Шаг 1: файлы каркаса**

`pnpm-workspace.yaml`:
```yaml
packages:
  - packages/*
  - apps/*
```

`package.json`:
```json
{
  "name": "vtt-monorepo",
  "private": true,
  "scripts": {
    "test": "pnpm -r --if-present test",
    "typecheck": "pnpm -r --if-present typecheck",
    "test:poc": "node tests/run.js"
  }
}
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true
  }
}
```

В `.gitignore` добавить:
```
node_modules/
dist/
coverage/
```

- [ ] **Шаг 2: проверить, что PoC не задет**

Run: `node tests/run.js`
Expected: та же сводка, что до правок (505 зелёных). Ни один файл PoC не изменён: `git status` показывает только новые файлы и `.gitignore`.

- [ ] **Шаг 3: commit**

```bash
git add pnpm-workspace.yaml package.json tsconfig.base.json .gitignore
git commit -m "Каркас pnpm-монорепо рядом с замороженным PoC"
```

---

### Задача 2: скелет packages/engine + тесты-стражи

**Files:**
- Create: `packages/engine/package.json`
- Create: `packages/engine/tsconfig.json`
- Create: `packages/engine/vitest.config.ts`
- Test: `packages/engine/tests/guards.test.ts`

**Interfaces:**
- Produces: пакет `@vtt/engine` с командами `pnpm --filter @vtt/engine test` и `typecheck`; каталоги `src/` и `tests/`, куда задачи 3–8 кладут перенос.

- [ ] **Шаг 1: файлы пакета**

`packages/engine/package.json`:
```json
{
  "name": "@vtt/engine",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./formula": "./src/formula/index.ts",
    "./model/*": "./src/model/*.ts",
    "./engine/*": "./src/engine/*.ts",
    "./events/*": "./src/events/*.ts"
  },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

`packages/engine/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src", "tests"],
  "compilerOptions": {
    "types": [],
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "allowJs": true
  }
}
```

`noEmit` + `allowImportingTsExtensions` — потому что пакет отдаёт исходники
и импортирует с расширением `.ts`; `allowJs` — чтобы паритет-тест (задача 8)
мог импортировать старый PoC-JS без деклараций (`checkJs` выключен —
PoC не проверяется, только читается).

`packages/engine/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['tests/**/*.test.ts'] },
});
```

Пустой `packages/engine/src/index.ts` (наполняется задачами 3–6):
```ts
// Публичный вход пакета. Пока пуст: перенос идёт задачами 3–6.
export {};
```

- [ ] **Шаг 2: тесты-стражи** (`packages/engine/tests/guards.test.ts`)

Два инварианта спеки, которые обязаны жить раньше любого кода:

```ts
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const root = new URL('..', import.meta.url).pathname;

// Рекурсивный обход src/ — сканеру нельзя зависеть от структуры каталогов.
function* walk(dir: string): Generator<string> {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (p.endsWith('.ts')) yield p;
  }
}

describe('стражи пакета engine', () => {
  it('рантайм-зависимостей — ноль', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    expect(pkg.dependencies ?? {}).toEqual({});
  });

  it('ни eval, ни new Function во всём src/', () => {
    // Паттерн собран из кусков, чтобы сканер не ловил сам себя.
    const banned = new RegExp('\\be' + 'val\\s*\\(|new\\s+Fun' + 'ction');
    for (const file of walk(join(root, 'src'))) {
      expect(banned.test(readFileSync(file, 'utf8')), file).toBe(false);
    }
  });
});
```

- [ ] **Шаг 3: установка и прогон**

Run: `pnpm install && pnpm --filter @vtt/engine test`
Expected: 2 passed.

- [ ] **Шаг 4: commit**

```bash
git add packages/engine pnpm-lock.yaml
git commit -m "Скелет @vtt/engine: ноль зависимостей и запрет eval закрыты стражами"
```

---

### Задача 3: инвентаризация тестов PoC + перенос языка формул

**Files:**
- Create: `packages/engine/src/formula/{errors,lex,parse,deps,evaluate,index}.ts` (перенос из `src/formula/*.js`)
- Test: `packages/engine/tests/` — формульные тесты из `tests/formula.*.test.js`

**Interfaces:**
- Produces (публичный контракт `@vtt/engine/formula`, дословно из PoC):
```ts
export type Resolve = (tag: string) => number | boolean;
export interface Formula {
  readonly source: string;
  readonly ast: Node;             // тип Node выводится из parse.ts при переносе
  readonly deps: readonly string[];
  evaluate(resolve: Resolve): number | boolean;
}
export function compile(source: string): Formula; // бросает FormulaSyntaxError
export { FormulaError, FormulaSyntaxError, FormulaRuntimeError };
export { lex, FUNCTION_NAMES };
```

- [ ] **Шаг 1: инвентаризация**

Run: `ls tests/*.test.js`
Разложить список по задачам этого плана: `formula.*` → сюда; модельные (serialize, migrate, effect-kinds) → задача 4; движковые (calc, modifiers, targets, rule.*, steps, tables, lead-die, effects) → задача 5; события (events, exchange) → задача 6; `acceptance` → задача 7. **`ui.*.test.js` и серверные — не переносить** (умирают со старым фронтом; сервер — этап 3). Результат — списком в сообщении коммита задачи 7.

- [ ] **Шаг 2: перенести формульные тесты (сначала тесты!)**

Механическая замена харнеса на Vitest, содержание проверок не меняется:

| PoC (`tests/harness.js`) | Vitest |
|---|---|
| `import {...} from './harness.js'` | `import { describe, it, expect } from 'vitest'` |
| `group('x', fn)` | `describe('x', fn)` |
| `test('x', fn)` | `it('x', fn)` |
| `eq(a, b, msg?)` | `expect(a, msg).toBe(b)` |
| `deepEq(a, b, msg?)` | `expect(a, msg).toEqual(b)` |
| `ok(x, msg?)` | `expect(x, msg).toBeTruthy()` |
| прочие хелперы | посмотреть реализацию в `tests/harness.js`, мапить по смыслу (бросок → `expect(fn).toThrow(...)`) |

Импорты модулей: `../../src/formula/index.js` → `../src/formula/index.js` (без расширения или `.js` — как настроен резолвер; единообразно по всем задачам).

- [ ] **Шаг 3: убедиться, что тесты падают**

Run: `pnpm --filter @vtt/engine test`
Expected: FAIL — модулей ещё нет.

- [ ] **Шаг 4: перенести модули формул**

Копия `src/formula/*.js` → `.ts`, поверх — типы. Правила переноса (действуют и в задачах 4–6):
- тело функций не трогать; типы — только в сигнатурах, полях объектов и `type`/`interface`;
- союзный тип `Node` для AST выписать из фактических объектов в `parse.js` (все `{ kind: ... }`-формы), не выдумывать;
- `Object.freeze` и кэш `compile` сохранить как есть;
- комментарии PoC переносить дословно — они и есть документация.

Реэкспортировать из `packages/engine/src/index.ts`:
```ts
export { compile, lex, FUNCTION_NAMES, FormulaError, FormulaSyntaxError, FormulaRuntimeError } from './formula/index.ts';
```

- [ ] **Шаг 5: тесты зелёные, типы сходятся**

Run: `pnpm --filter @vtt/engine test && pnpm --filter @vtt/engine typecheck`
Expected: PASS оба.

- [ ] **Шаг 6: commit**

```bash
git add packages/engine
git commit -m "Перенос языка формул на TS: lex → parse → AST → evaluate/deps"
```

---

### Задача 4: перенос модели

**Files:**
- Create: `packages/engine/src/model/types.ts` (новый — черновые типы)
- Create: `packages/engine/src/model/{effect-kinds,advantage-methods,amount-sources,serialize,migrate,system,system-cyberpunk,systems,compendium,sheets}.ts`
- Test: модельные тесты из инвентаризации задачи 3

**Interfaces:**
- Consumes: `compile` из задачи 3 (migrate может валидировать формулы).
- Produces: черновые типы модели, которыми типизируются задачи 5–6:
```ts
// types.ts — ЧЕРНОВИК до этапа 2 (Zod). Широкие типы с известными полями;
// точная форма — в src/model/system.js PoC, он источник правды.
export interface Field { tag: string; label: string; group?: string; [k: string]: unknown }
export interface Effect { label?: string; activation?: string; steps?: Step[]; modifiers?: unknown[]; params?: Param[]; [k: string]: unknown }
export type Step = { id?: string; type: string; [k: string]: unknown };
export type Param = { key: string; label?: string; kind?: string; of?: 'target'; [k: string]: unknown };
export interface System { fields: Field[]; effects: Record<string, Effect>; records?: Record<string, unknown>; room_rules?: string[]; constants?: Record<string, unknown>; tables?: Record<string, unknown>; [k: string]: unknown }
export interface Sheet { id: string; name?: string; values: Record<string, unknown>; [k: string]: unknown }
export interface Compendium { items?: Record<string, unknown>[]; actions?: Record<string, unknown>[] }
export interface World { system: System; compendium: Compendium; sheets: Sheet[] }
export function migrateWorld(world: unknown): World;   // migrate.ts
export function packSheet(sheet: Sheet): string;        // serialize.ts — фактические
export function unpackSheet(json: string): Sheet;       //   имена сверить с serialize.js
```
Фактические имена экспортов `serialize.ts`/`migrate.ts` — из одноимённых `.js`; если расходятся с блоком выше, правится блок в следующей задаче, не код.

- [ ] **Шаг 1: перенести модельные тесты** (по таблице из задачи 3)

Run: `pnpm --filter @vtt/engine test` → Expected: FAIL (модулей нет).

- [ ] **Шаг 2: перенести модули**

Правила задачи 3. Образцы (`system.ts`, `system-cyberpunk.ts`, `compendium.ts`, `sheets.ts`, `systems.ts`) — это данные: типизировать `satisfies System` / `satisfies Compendium`, чтобы черновые типы проверялись на живых образцах.

- [ ] **Шаг 3: зелёные тесты + typecheck**

Run: `pnpm --filter @vtt/engine test && pnpm --filter @vtt/engine typecheck` → PASS.

- [ ] **Шаг 4: commit**

```bash
git add packages/engine
git commit -m "Перенос модели: черновые типы, сторож DTO, миграция v1, образцы данными"
```

---

### Задача 5: перенос движка

**Files:**
- Create: `packages/engine/src/engine/{errors,dice,tables,targets,modifiers,calc,refs,lead-die,effects,rule}.ts`
- Create: `packages/engine/src/engine/steps/{index,threshold,amount,compare,apply,status}.ts`
- Test: движковые тесты из инвентаризации

**Interfaces:**
- Consumes: `compile` (задача 3), типы модели (задача 4).
- Produces (ключевые сигнатуры, дословно из PoC):
```ts
export interface Pass {
  system: System; sheet: Sheet;
  memo: Map<string, number | boolean>;
  visiting: Set<string>; path: string[]; computed: string[];
  modifiers: CollectedModifiers | null;
  resolve: Resolve;
}
export function newPass(system: System, sheet: Sheet, options?: { compendium?: Compendium; modifiers?: CollectedModifiers }): Pass;
export function calc(system: System, sheet: Sheet, tag: string, pass?: Pass): number | boolean;
export function findField(system: System, tag: string): Field | null;
// Реестр шагов: модуль шага — { pack, resolve, slots, outputs, lint, traceLine },
// точные сигнатуры выписать из src/engine/steps/index.js при переносе.
```

- [ ] **Шаг 1: перенести движковые тесты** → Run: `pnpm --filter @vtt/engine test` → FAIL.

- [ ] **Шаг 2: перенести модули** (правила задачи 3; порядок по зависимостям: errors → dice → tables → targets → modifiers → calc → refs → lead-die → effects → rule → steps/*). Тип `StepModule` выписать из фактического реестра `steps/index.js` и типизировать им все шесть модулей — это тот же приём, что будет реестром видов слотов на фронте.

- [ ] **Шаг 3: зелёные тесты + typecheck** → PASS.

- [ ] **Шаг 4: commit**

```bash
git add packages/engine
git commit -m "Перенос движка: calc/модификаторы/мишени/конвейер, шаги за реестром"
```

---

### Задача 6: перенос событий

**Files:**
- Create: `packages/engine/src/events/{envelope,exchange}.ts`
- Test: событийные тесты из инвентаризации

**Interfaces:**
- Consumes: движок (задача 5), модель (задача 4).
- Produces (дословно из PoC, `src/events/exchange.js:16`):
```ts
export function exchange(args: {
  system: System; compendium: Compendium; die: Die;
  sheets: Sheet[]; actionId: string; fromId: string; toId: string;
}): { sheets: Sheet[]; reports: { fromId: string; toId: string; report: unknown }[] };
// Тип Die выписать из фактического употребления в src/engine/dice.js.
// Из envelope.ts: send, receive, availableActions, actionOf, bindingsOf,
// propsOf, effectLabelOf, spendUse — сигнатуры из envelope.js при переносе.
```

- [ ] **Шаг 1: перенести тесты** → FAIL. **Шаг 2: перенести модули.** **Шаг 3:** тесты + typecheck → PASS.

- [ ] **Шаг 4: commit**

```bash
git add packages/engine
git commit -m "Перенос событий: конверт и обмен с ответками"
```

---

### Задача 7: перенос приёмочных тестов

**Files:**
- Test: `packages/engine/tests/acceptance.test.ts` (перенос `tests/acceptance.test.js`)

**Interfaces:**
- Consumes: весь пакет.

- [ ] **Шаг 1: перенести приёмочные тесты.** Критерии 1–5, 7 переносятся по таблице задачи 3. Сканеры (критерий №6 — нет eval; «одна модель» — `system.rules`/`system.modifiers`/`compendium.effects` читает только migrate; «движок не знает имён статов») переписать на обход `packages/engine/src` тем же `walk`, что в задаче 2. Скан имён статов НЕ включает `src/model` — образцы имена статов содержат по праву.

- [ ] **Шаг 2: прогон** → Run: `pnpm --filter @vtt/engine test` → PASS. В сообщение коммита — инвентаризация из задачи 3: какие файлы PoC куда переехали, какие оставлены (ui.*, серверные) и почему.

- [ ] **Шаг 3: commit**

```bash
git add packages/engine
git commit -m "Приёмочные критерии 1–7 переехали тестами нового стека"
```

---

### Задача 8: паритетный контроль старый↔новый

**Files:**
- Test: `packages/engine/tests/parity.test.ts`

**Interfaces:**
- Consumes: новый движок (`../src/...`) и **старый PoC напрямую** (`../../../src/...` — обычный ESM-JS, Vitest его ест без настройки).

- [ ] **Шаг 1: тест паритета значений.** По каждому образцовому миру (реестр — `src/model/systems.js` PoC), по каждому листу из `src/model/sheets.js`, по каждому полю системы: `calc` старым и новым движком (оба с `{ compendium }`) обязаны дать одно и то же — включая совпадение ошибок (обе стороны бросили / обе посчитали).

```ts
import { describe, it, expect } from 'vitest';
import * as oldCalc from '../../../src/engine/calc.js';
import { calc, newPass } from '../src/engine/calc.ts';

// Обе стороны считают одним способом; сравниваем исходы, включая ошибки.
const attempt = (fn: () => unknown) => {
  try { return { ok: true, value: fn() }; }
  catch (e) { return { ok: false, error: String((e as Error).constructor.name) }; }
};

// ...для каждого (system, sheet, field.tag):
const a = attempt(() => oldCalc.calc(system, sheet, tag, oldCalc.newPass(system, sheet, { compendium })));
const b = attempt(() => calc(system, sheet, tag, newPass(system, sheet, { compendium })));
expect(b, `${system.name} · ${sheet.id} · ${tag}`).toEqual(a);
```

- [ ] **Шаг 2: тест паритета хода.** Сценарий из PoC-тестов (атака с триггерной ответкой «Шипы»): один и тот же детерминированный стаб кости — взять готовый из `tests/events.test.js` PoC, один стаб на оба движка — прогнать через старый `exchange` и новый; сравнить `toEqual` получившиеся `sheets` (это одновременно проверка критерия №1: в листах нет вычисленного мусора) и число `reports`.

- [ ] **Шаг 3: прогон** → `pnpm --filter @vtt/engine test` → PASS. Затем контрольный смок: `pnpm test` в корне (все пакеты) и `node tests/run.js` (PoC цел, 505).

- [ ] **Шаг 4: commit**

```bash
git add packages/engine
git commit -m "Паритет-контроль: новый движок считает те же числа, что PoC"
```

---

## Самопроверка при исполнении

После задачи 8 этап закрыт, если одновременно: Vitest пакета зелёный целиком;
`typecheck` чистый; `node tests/run.js` даёт 505; `git status` не показывает
изменений в файлах PoC. Если паритет падает — чинится **новый** код, старый
неприкосновенен.
