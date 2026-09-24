import { rowsOf, tableOf, isRange } from '../../../packages/engine/src/model/tables.ts';
import type { System, Effect, Param } from '../../../packages/engine/src/model/types.ts';

type Loose = Record<string, unknown>;

const same = (a: unknown, b: unknown): boolean => a === b || String(a) === String(b);

const freeKey = (taken: string[], wanted: string): string => {
  if (!taken.includes(wanted)) return wanted;
  let n = 2;
  while (taken.includes(`${wanted}_${n}`)) n++;
  return `${wanted}_${n}`;
};

const holdsRow = (system: System, table: string, value: unknown): boolean =>
  rowsOf(tableOf(system, table)).some(row => same(row.value, value));

function tablesOfWords(system: System, words: string[]): string[] | null {
  const out: string[] = [];
  for (const word of words) {
    const found = Object.entries(system.tables ?? {})
      .find(([id, table]) => !isRange(table) && holdsRow(system, id, word))?.[0];
    if (!found) return null;
    if (!out.includes(found)) out.push(found);
  }
  return out;
}

function emitsIn(system: System): { owner: Effect; step: Loose }[] {
  const out: { owner: Effect; step: Loose }[] = [];
  const visit = (owner: Effect, steps: unknown) => {
    if (!Array.isArray(steps)) return;
    for (const step of steps as Loose[]) {
      if (step.type === 'emit' && step.event) out.push({ owner, step });
      visit(owner, step.steps);
    }
  };
  for (const effect of Object.values(system.effects ?? {})) {
    visit(effect, effect.steps);
    visit(effect, effect.self);
    for (const handler of effect.on ?? []) {
      visit(effect, handler.steps);
      visit(effect, handler.self);
    }
  }
  return out;
}

const readsAmount = (effect: Effect): boolean =>
  /event[._](amount|incoming)/.test(JSON.stringify([effect.steps ?? [], effect.self ?? [], effect.on ?? []]));

function sourceTable(system: System, owner: Effect, ref: Loose): string | undefined {
  if (typeof ref.param === 'string') {
    const param = (owner.params ?? []).find(p => p.key === ref.param);
    return param?.kind === 'choice' ? param.from : undefined;
  }
  if (typeof ref.prop === 'string') {
    for (const kind of Object.values(system.records ?? {})) {
      const prop = (kind.props ?? []).find(p => p.key === ref.prop) as Loose | undefined;
      if (prop?.kind === 'choice' && typeof prop.from === 'string') return prop.from;
    }
  }
  return undefined;
}

export function unifyCalls(system: System): System {
  const emits = emitsIn(system);
  const calledIds = new Set(emits.map(({ step }) => String(step.event)));
  const legacy = Object.entries(system.effects ?? {}).filter(([id, effect]) =>
    effect.tagsFrom || effect.tags?.length || (calledIds.has(id) && emits.some(e => e.step.event === id && (e.step.amount !== undefined || Array.isArray(e.step.tags)))));
  if (!legacy.length) return system;

  const next = JSON.parse(JSON.stringify(system)) as System;
  const nextEmits = emitsIn(next);

  for (const [id] of legacy) {
    const effect = next.effects[id]!;
    const params: Param[] = [...(effect.params ?? [])];
    const keys = () => params.map(p => p.key);

    const from = effect.tagsFrom;
    let tables = !from ? [] : Array.isArray(from) ? [...from] : [from];
    if (!tables.length && effect.tags?.length) {
      const found = tablesOfWords(next, effect.tags);
      if (found) { tables = found; delete effect.tags; }
    }
    delete effect.tagsFrom;

    const calls = nextEmits.filter(({ step }) => step.event === id);
    const wantsAmount = calls.some(({ step }) => step.amount !== undefined) || readsAmount(effect);
    let main = params.find(p => (p as Loose).role === 'amount');
    if (!main && wantsAmount) {
      main = { key: freeKey(keys(), 'amount'), label: 'Сколько', kind: 'number', role: 'amount' } as Param;
      params.unshift(main);
    }
    for (const table of tables) {
      if (params.some(p => p.kind === 'choice' && p.from === table)) continue;
      params.push({
        key: freeKey(keys(), table), label: next.tables?.[table]?.label || table, kind: 'choice', from: table, optional: true,
      } as Param);
    }
    if (params.length) effect.params = params;

    for (const { owner, step } of calls) {
      const args = { ...((step.args ?? {}) as Loose) };
      if (main && step.amount !== undefined && args[main.key] === undefined) args[main.key] = step.amount;
      delete step.amount;

      const rest: unknown[] = [];
      for (const tag of Array.isArray(step.tags) ? step.tags : []) {
        const table = typeof tag === 'string'
          ? tables.find(t => holdsRow(next, t, tag))
          : (tag && typeof tag === 'object' ? sourceTable(next, owner, tag as Loose) : undefined);
        const param = table ? params.find(p => p.kind === 'choice' && p.from === table && args[p.key] === undefined) : undefined;
        if (param) args[param.key] = typeof tag === 'string' ? { const: tag } : tag;
        else rest.push(tag);
      }
      if (rest.length) step.tags = rest; else delete step.tags;
      if (Object.keys(args).length) step.args = args; else delete step.args;
    }
  }
  return next;
}
