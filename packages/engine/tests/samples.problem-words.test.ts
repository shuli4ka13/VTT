import { describe, it, expect } from 'vitest';
import { LITE_WORLDS } from '../src/model/systems.ts';
import { lintSystem } from '../src/model/lint.ts';
import { flattenSystem } from '../src/model/inherit.ts';
import { slugOf } from '../src/model/sheet-columns.ts';

type Any = Record<string, any>;
const WORD = /[A-Za-z][A-Za-z0-9_]{2,}/g;
const MAX = Number(process.env.PROBLEM_WORDS ?? 40);

function labeled(system: Any): Set<string> {
  const out = new Set<string>();
  const put = (key: unknown, label: unknown) => {
    if (typeof key !== 'string' || typeof label !== 'string' || !label || !/^[A-Za-z]/.test(key)) return;
    const plain = key.replace(/_/g, ' ').toLowerCase();
    if (key.toLowerCase() === label.toLowerCase() || plain === label.toLowerCase()) return;
    out.add(key);
  };
  const steps = (list: unknown) => { for (const step of (Array.isArray(list) ? list : []) as Any[]) { put(step.id, step.label); put(step.as, step.asLabel); } };
  for (const [key, table] of Object.entries(system.tables ?? {}) as [string, Any][]) {
    put(key, table.label);
    for (const column of table.columns ?? []) put(column.key, column.label);
    for (const row of table.rows ?? []) put(row.value, row.label);
  }
  for (const [key, effect] of Object.entries(system.effects ?? {}) as [string, Any][]) {
    put(key, effect.label);
    for (const param of effect.params ?? []) put(param.key, param.label);
    for (const column of effect.returns ?? []) put(column.key, column.label);
    steps(effect.steps); steps(effect.cost);
    for (const handler of effect.on ?? []) { steps(handler.steps); steps(handler.cost); }
  }
  for (const name of ['tags', 'rolls', 'roll_edits', 'sheets', 'groups']) for (const [key, one] of Object.entries(system[name] ?? {}) as [string, Any][]) put(key, one?.label);
  for (const block of system.blocks ?? []) put(block.key, block.label);
  for (const page of system.pages ?? []) put(page.key, page.label);
  return out;
}

const MISSING_BY_KEY = [
  /^в таблице «» нет строки «»/,
  /^эффекта «» в системе нет/,
  /^«» — нет ни входа, ни шага с таким именем/,
  /читает «», а здесь такого имени нет/,
];

const stride = <T,>(list: T[], max: number): T[] => { const step = Math.max(1, Math.ceil(list.length / max)); return list.filter((_, index) => index % step === 0); };

const effectNames = (effect: Any): string[] => [
  ...(effect.params ?? []).map((one: Any) => one.key),
  ...(effect.returns ?? []).map((one: Any) => one.key),
  ...[effect.steps, effect.cost, ...(effect.on ?? []).flatMap((handler: Any) => [handler.steps, handler.cost])]
    .flatMap(list => (Array.isArray(list) ? list : []) as Any[]).flatMap(step => [step.id, step.as]),
].filter((one): one is string => typeof one === 'string');

const tableNames = (table: Any): string[] => [
  ...(table.columns ?? []).map((one: Any) => one.key),
  ...(table.rows ?? []).filter((row: Any) => typeof row.value === 'string').map((row: Any) => slugOf(row.value)),
];

describe('«Проблемы» называют существующую вещь подписью, а не ключом', () => {
  for (const world of LITE_WORLDS) {
    const base = world.system as Any;
    it(String(base.name), () => {
      const keys = labeled(base);
      const leaks = new Map<string, string>();
      const probe = (what: string, gone: string[], change: (draft: Any) => void) => {
        const draft = structuredClone(base);
        change(draft);
        let found: { text: string }[] = [];
        try { found = lintSystem(flattenSystem(draft as never), world.compendium as never); } catch { return; }
        for (const problem of found) {
          const hits = [...new Set(problem.text.match(WORD) ?? [])].filter(word => keys.has(word) && !gone.includes(word));
          if (!hits.length) continue;
          const shape = problem.text.replace(/«[^»]*»/g, '«»').replace(/\d+/g, 'N').slice(0, 90);
          if (MISSING_BY_KEY.some(rule => rule.test(shape))) continue;
          if (!leaks.has(shape)) leaks.set(shape, `[${what}] ${hits.slice(0, 3).join(', ')} :: ${problem.text.slice(0, 220)}`);
        }
      };
      probe('как есть', [], () => undefined);
      for (const id of stride(Object.keys(base.effects ?? {}), MAX)) probe(`без эффекта ${id}`, [id, ...effectNames(base.effects[id])], draft => { delete draft.effects[id]; });
      for (const id of stride(Object.keys(base.tables ?? {}), MAX)) probe(`без таблицы ${id}`, [id, ...tableNames(base.tables[id])], draft => { delete draft.tables[id]; });
      const columns = Object.entries(base.tables ?? {}).flatMap(([id, table]: [string, any]) => (table.columns ?? []).map((column: Any) => [id, column.key] as const));
      for (const [id, key] of stride(columns, MAX)) probe(`без колонки ${id}.${key}`, [key], draft => { draft.tables[id].columns = draft.tables[id].columns.filter((one: Any) => one.key !== key); });
      const rows = Object.entries(base.tables ?? {}).flatMap(([id, table]: [string, any]) => (table.rows ?? []).filter((row: Any) => typeof row.value === 'string').map((row: Any) => [id, row.value] as const));
      for (const [id, value] of stride(rows, MAX)) probe(`без строки ${id}.${value}`, [value, slugOf(value)], draft => { draft.tables[id].rows = draft.tables[id].rows.filter((one: Any) => one.value !== value); });
      const named = Object.entries(base.effects ?? {}).flatMap(([id, effect]: [string, any]) => (effect.steps ?? []).map((step: Any, index: number) => [id, index, step.id] as const)).filter(([, , name]) => typeof name === 'string');
      for (const [id, index, name] of stride(named, MAX)) probe(`шаг ${id}#${index} переименован`, [name], draft => { draft.effects[id].steps[index].id = 'zzz'; });
      for (const [id, index, name] of stride(named, MAX)) probe(`без шага ${id}#${index}`, [name], draft => { draft.effects[id].steps.splice(index, 1); });
      const params = Object.entries(base.effects ?? {}).flatMap(([id, effect]: [string, any]) => (effect.params ?? []).map((param: Any) => [id, param.key] as const));
      for (const [id, key] of stride(params, MAX)) probe(`без входа ${id}.${key}`, [key], draft => { draft.effects[id].params = draft.effects[id].params.filter((one: Any) => one.key !== key); });
      for (const name of ['tags', 'rolls', 'roll_edits', 'sheets']) for (const id of stride(Object.keys(base[name] ?? {}), MAX)) probe(`без ${name}.${id}`, [id], draft => { delete draft[name][id]; });
      for (const block of stride((base.blocks ?? []) as Any[], MAX)) probe(`без блока ${block.key}`, [block.key], draft => { draft.blocks = draft.blocks.filter((one: Any) => one.key !== block.key); });
      for (const page of (base.pages ?? []) as Any[]) probe(`без страницы ${page.key}`, [page.key], draft => { draft.pages = draft.pages.filter((one: Any) => one.key !== page.key); });
      expect([...leaks.values()]).toEqual([]);
    }, 120000);
  }
});
