type Loose = Record<string, any>;

export const SPEND = 'spend';

const spendEffect = {
  label: 'Потратить',
  group: 'Вызываемые',
  description: 'Проверить, что запаса хватает, и отнять. Не хватает — действие обрывается.',
  activation: 'manual',
  params: [
    { key: 'what', label: 'Что тратим', kind: 'tag' },
    { key: 'amount', label: 'Сколько', kind: 'number' },
    { key: 'note', label: 'Если не хватает', kind: 'text', optional: true },
  ],
  steps: [
    { type: 'compare', value: { expr: '@what' }, versus: { expr: '@amount' }, breakIf: 'less', note: { expr: '@note' } },
    { type: 'apply', target: { param: 'what' }, direction: 'subtract', value: { expr: '@amount' }, targetModifiers: false },
  ],
};

const lone = (ref: Loose | undefined): string | null => {
  const m = /^\s*@([\p{L}\p{N}_.]+)\s*$/u.exec(String(ref?.expr ?? ''));
  return m ? m[1]! : null;
};

function pairAt(list: Loose[], at: number): Loose | null {
  const [check, take] = [list[at], list[at + 1]];
  if (check?.type !== 'compare' || take?.type !== 'apply') return null;
  const field = lone(check.value);
  if (!field || (check.breakIf ?? 'less') !== 'less' || check.when || take.when || check.id) return null;
  if (take.target?.tag !== field || take.direction !== 'subtract' || take.targetModifiers !== false || take.id) return null;
  if (String(take.value?.expr ?? '').trim() !== String(check.versus?.expr ?? '').trim()) return null;
  return {
    type: 'emit', event: SPEND, strict: true,
    args: {
      what: { expr: `@${field}` },
      amount: { expr: String(check.versus.expr) },
      ...(check.note ? { note: { expr: JSON.stringify(check.note) } } : {}),
    },
  };
}

function steps(list: unknown, found: { any: boolean }): unknown {
  if (!Array.isArray(list)) return list;
  const out: Loose[] = [];
  for (let at = 0; at < list.length; at++) {
    const call = pairAt(list, at);
    if (call) { out.push(call); at++; found.any = true; } else out.push(list[at]);
  }
  return out;
}

export function spendOf(world: Loose): Loose {
  const found = { any: false };
  const effects = Object.fromEntries(Object.entries(world.system.effects ?? {}).map(([id, raw]) => {
    const e = { ...(raw as Loose) };
    for (const key of ['steps', 'self', 'attach', 'detach']) if (e[key]) e[key] = steps(e[key], found);
    if (Array.isArray(e.on)) e.on = e.on.map((h: Loose) => ({ ...h, ...(h.steps ? { steps: steps(h.steps, found) } : {}), ...(h.self ? { self: steps(h.self, found) } : {}) }));
    return [id, e];
  }));
  if (found.any && !effects[SPEND]) effects[SPEND] = spendEffect;
  return { ...world, system: { ...world.system, effects } };
}
