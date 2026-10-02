import { EngineError } from '../engine/errors.ts';
import { readingOf } from '../engine/readings.ts';
import type { ReadSpec } from '../engine/readings.ts';
import type { DieConstant, Die, RollEdit, RollEditOp } from '../model/types.ts';

export interface Term { count: number; sides: number; part?: string; extra?: boolean; minus?: boolean }

export interface Spec { label: string; terms: Term[]; read: ReadSpec }

export type Scope = { part: string } | 'unnamed' | 'main';

export interface Keep { n: number; from: 'best' | 'worst'; scope: Scope }

export interface Claim { terms: Term[]; read: ReadSpec; keeps: Keep[]; versusShift: number; degreeShift: number }

export interface Rolled {
  id: number;
  sides: number;
  part?: string;
  extra?: boolean;
  minus?: boolean;
  face: number;
  value: number;
  from?: number;
  out?: boolean;
}

export interface Roll {
  claim: Claim;
  dice: Rolled[];
  results: RollEdit[];
  edits: string[];
  plus: number;
  tags: string[];
  exploded: boolean;
}

export interface RollResult {
  total: number;
  natural: number;
  rolled: number;
  atMax: number;
  atMin: number;
  edited: boolean;
  dice: { rolls: number[]; kept: number | null };
  parts: Record<string, number>;
  tags: string[];
}

const NOTATION = /^(\d+)?\s*[dдк]\s*(\d+)$/iu;

export type CountOf = (ref: unknown, what: string) => number;

export function parse(input: string | DieConstant, countOf?: CountOf): Spec {
  if (typeof input === 'string') {
    const match = NOTATION.exec(input.trim());
    if (!match) throw new EngineError(`не понимаю запись кубиков «${input}»; ожидается вид «2к6»`);
    return { label: input.trim(), terms: [{ count: Number(match[1] ?? 1), sides: Number(match[2]) }], read: { kind: 'sum' } };
  }
  const terms = (input.dice ?? []).map((term): Term => {
    const raw = term.count ?? 1;
    const count = typeof raw === 'number' ? raw : countOf ? countOf(raw, `счёт костей «${term.label || input.label || '?'}»`) : NaN;
    if (!Number.isInteger(count) || count < 0) {
      throw new EngineError(`счёт костей «${input.label || '?'}» должен быть целым не меньше нуля, а вышло ${count}`);
    }
    return {
      count, sides: term.sides,
      ...(term.name ? { part: String(term.name) } : {}),
      ...(term.bonus ? { extra: true } : {}),
      ...(term.minus ? { minus: true } : {}),
    };
  });
  return { label: input.label ?? '', terms, read: readingOf(input.read) };
}

export function withCount(spec: Spec, count: number, owner: string): Spec {
  if (!Number.isInteger(count) || count < 0) {
    throw new EngineError(`${owner}: счёт костей «${spec.label || '?'}» должен быть целым не меньше нуля, а вышло ${count}`);
  }
  if (spec.terms.length !== 1) {
    throw new EngineError(`${owner}: число костей задаёт проверка, а кость «${spec.label || '?'}» составная — возьмите кость из одного вида`);
  }
  return { ...spec, terms: [{ ...spec.terms[0]!, count }] };
}

export function times(spec: Spec, n: number): Spec {
  const k = Math.max(0, Math.floor(n));
  return { ...spec, terms: spec.terms.map(term => ({ ...term, count: term.count * k })) };
}

export function notationOf(spec: Spec): string {
  const term = spec.terms[0];
  if (spec.terms.length !== 1 || !term) throw new EngineError(`«${spec.label}» — составная кость, числом её не записать`);
  return `${term.count}к${term.sides}`;
}

const num = (raw: unknown, fallback: number): number => {
  const n = Number(raw ?? fallback);
  return Number.isFinite(n) ? n : fallback;
};

const LADDER = [4, 6, 8, 10, 12, 20];

const partOf = (op: RollEditOp): string | undefined => (op.part ? String(op.part) : undefined);

const inPart = (part: string | undefined, wanted?: string): boolean => (wanted ? part === wanted : true);

const main = (die: Rolled, wanted?: string): boolean => inPart(die.part, wanted) && (Boolean(wanted) || !die.extra);

type ClaimOp = (claim: Claim, op: RollEditOp) => Claim;

type ResultOp = (dice: Rolled[], op: RollEditOp, roll: (sides: number) => number, fresh: () => number) => Rolled[];

const CLAIM: Record<string, ClaimOp> = {
  addDie(claim, op) {
    const count = num(op.count, 1);
    const part = partOf(op);
    const first = claim.terms[0];
    if (!first) throw new EngineError('«добавить кость» нечего добавлять: в броске нет костей');
    if (part) {
      const at = claim.terms.findIndex(t => t.part === part);
      if (at < 0) throw new EngineError(`правка адресована части «${part}», а в этом броске такой части нет`);
      return { ...claim, terms: claim.terms.map((t, i) => (i === at ? { ...t, count: t.count + count } : t)) };
    }
    const sides = num(op.sides, first.sides);
    const at = claim.terms.findIndex(t => t.sides === sides && !t.part && !t.extra);
    if (at < 0) return { ...claim, terms: [...claim.terms, { count, sides }] };
    return { ...claim, terms: claim.terms.map((t, i) => (i === at ? { ...t, count: t.count + count } : t)) };
  },
  bonusDie(claim, op) {
    const first = claim.terms[0];
    if (!first) throw new EngineError('«добавить кость сверх» нечего добавлять: в броске нет костей');
    return { ...claim, terms: [...claim.terms, { count: num(op.count, 1), sides: num(op.sides, first.sides), extra: true, ...(op.minus ? { minus: true } : {}) }] };
  },
  keepBest: (claim, op) => ({ ...claim, keeps: [...claim.keeps, { n: num(op.n, 1), from: 'best', scope: partOf(op) ? { part: partOf(op)! } : 'main' }] }),
  keepWorst: (claim, op) => ({ ...claim, keeps: [...claim.keeps, { n: num(op.n, 1), from: 'worst', scope: partOf(op) ? { part: partOf(op)! } : 'main' }] }),
  dieStep(claim, op) {
    const by = num(op.by, 1);
    const part = partOf(op);
    const ladder = Array.isArray(op.ladder) ? (op.ladder as number[]) : LADDER;
    return {
      ...claim,
      terms: claim.terms.map(t => {
        if (!inPart(t.part, part)) return t;
        const at = ladder.indexOf(t.sides);
        if (at < 0) return t;
        return { ...t, sides: ladder[Math.min(ladder.length - 1, Math.max(0, at + by))]! };
      }),
    };
  },
  shiftVersus: (claim, op) => ({ ...claim, versusShift: claim.versusShift + num(op.by, 0) }),
  shiftDegree: (claim, op) => ({ ...claim, degreeShift: claim.degreeShift + num(op.by, 0) }),
};

function flipDigits(value: number, sides: number): number | null {
  const width = String(sides - 1).length;
  if (width < 2 || 10 ** width !== sides) return null;
  const flipped = Number([...String(value % sides).padStart(width, '0')].reverse().join(''));
  return flipped === 0 ? sides : flipped;
}

const RESULT: Record<string, ResultOp> = {
  floorDie(dice, op) {
    const least = num(op.least, 10);
    return dice.map(d => (!main(d, partOf(op)) || d.value >= least ? d : { ...d, value: least }));
  },
  explode(dice, op, roll, fresh) {
    const limit = num(op.limit, 10);
    const down = String(op.at ?? 'max') === 'min';
    const part = partOf(op);
    if (op.apart) {
      const out = [...dice];
      let guard = 0;
      for (let at = 0; at < out.length && guard < limit * Math.max(1, dice.length); at += 1) {
        const d = out[at]!;
        if (!main(d, part) || d.value !== d.sides) continue;
        const face = roll(d.sides);
        out.push({
          id: fresh(), sides: d.sides, face, value: d.minus ? -face : face, from: d.from ?? d.id,
          ...(d.part ? { part: d.part } : {}), ...(d.extra ? { extra: true } : {}), ...(d.minus ? { minus: true } : {}),
        });
        guard += 1;
      }
      return out;
    }
    return dice.map(d => {
      if (!main(d, part)) return d;
      const trigger = down ? 1 : d.sides;
      if (d.value !== trigger) return d;
      let value = d.value;
      let extra = d.value;
      let guard = 0;
      while (extra === trigger && guard++ < limit) {
        extra = roll(d.sides);
        value += down ? -extra : extra;
      }
      return { ...d, value };
    });
  },
  flip(dice, op) {
    const low = String(op.prefer ?? 'low') !== 'high';
    return dice.map(d => {
      if (!main(d, partOf(op))) return d;
      const flipped = flipDigits(d.value, d.sides);
      if (flipped === null) return d;
      const value = low ? Math.min(d.value, flipped) : Math.max(d.value, flipped);
      return value === d.value ? d : { ...d, value };
    });
  },
  reroll(dice, op, roll) {
    const limit = num(op.n, 1);
    return dice.map(d => {
      if (!main(d, partOf(op)) || d.value > limit) return d;
      const face = roll(d.sides);
      return { ...d, face, value: d.minus ? -face : face };
    });
  },
};

const stageOf = (op: RollEditOp): 'claim' | 'result' => {
  const name = String(op.op);
  if (name in CLAIM) return 'claim';
  if (name in RESULT) return 'result';
  throw new EngineError(`неизвестная правка броска «${op.op}»; есть: ${[...Object.keys(CLAIM), ...Object.keys(RESULT)].join(', ')}`);
};

export const editStages = (): { op: string; stage: 'claim' | 'result' }[] =>
  [...Object.keys(CLAIM).map(op => ({ op, stage: 'claim' as const })), ...Object.keys(RESULT).map(op => ({ op, stage: 'result' as const }))];

function applyResults(dice: Rolled[], edits: RollEdit[], roll: (sides: number) => number, fresh: () => number): Rolled[] {
  let next = dice;
  for (const edit of edits) {
    for (const op of edit.ops ?? []) {
      if (stageOf(op) === 'result') next = RESULT[String(op.op)]!(next, op, roll, fresh);
    }
  }
  return next;
}

const nextId = (dice: readonly Rolled[]): (() => number) => {
  let next = dice.reduce((max, d) => Math.max(max, d.id), -1) + 1;
  return () => next++;
};

export function start(spec: Spec, edits: (RollEdit & { label?: string })[], die: Die, tags: readonly string[] = []): Roll {
  let claim: Claim = { terms: spec.terms, read: spec.read, keeps: [], versusShift: 0, degreeShift: 0 };
  for (const edit of edits) {
    for (const op of edit.ops ?? []) {
      if (stageOf(op) === 'claim') claim = CLAIM[String(op.op)]!(claim, op);
    }
  }
  const dice: Rolled[] = [];
  for (const term of claim.terms) {
    for (let i = 0; i < term.count; i++) {
      const face = die(term.sides);
      dice.push({
        id: dice.length, sides: term.sides, face, value: term.minus ? -face : face,
        ...(term.part ? { part: term.part } : {}),
        ...(term.extra ? { extra: true } : {}),
        ...(term.minus ? { minus: true } : {}),
      });
    }
  }
  const results = edits.filter(edit => (edit.ops ?? []).some(op => stageOf(op) === 'result'));
  const fresh = nextId(dice);
  const fired = new Set<RollEdit>();
  let rolled = dice;
  for (const edit of results) {
    const next = applyResults(rolled, [edit], die, fresh);
    if (JSON.stringify(next) !== JSON.stringify(rolled)) fired.add(edit);
    rolled = next;
  }
  const shown = edits.filter(edit => !results.includes(edit) || fired.has(edit) || (edit.ops ?? []).some(op => stageOf(op) === 'claim'));
  return {
    claim, dice: rolled, results,
    edits: shown.map(edit => edit.label || '').filter(Boolean), plus: 0, tags: [...tags],
    exploded: results.some(edit => (edit.ops ?? []).some(op => op.op === 'explode')),
  };
}

export function keep(dice: readonly Rolled[], n: number, from: 'best' | 'worst', scope: Scope): Rolled[] {
  const inScope = (d: Rolled): boolean => !d.extra && (
    scope === 'main' ? true : scope === 'unnamed' ? !d.part : d.part === scope.part);
  const pool = dice.filter(inScope);
  const chosen = new Set([...pool].sort((a, b) => (from === 'best' ? b.value - a.value : a.value - b.value)).slice(0, Math.max(1, Math.floor(n))));
  return dice.filter(d => !inScope(d) || chosen.has(d));
}

export function kept(roll: Roll): Rolled[] {
  let out = roll.dice.filter(d => !d.out);
  for (const one of roll.claim.keeps) out = keep(out, one.n, one.from, one.scope);
  return out;
}

const PER_DIE: Record<string, (value: number, versus: number) => boolean> = {
  atLeast: (v, n) => v >= n,
  notOver: (v, n) => v <= n,
  over: (v, n) => v > n,
  under: (v, n) => v < n,
};

function read(dice: Rolled[], spec: ReadSpec): { total: number; single: number | null } {
  if (!dice.length) return { total: 0, single: null };
  const sum = (list: Rolled[]) => list.reduce((acc, d) => acc + d.value, 0);
  if (spec.kind === 'sum') return { total: sum(dice), single: dice.length === 1 ? dice[0]!.value : null };
  if (spec.kind === 'best' || spec.kind === 'worst') {
    const taken = keep(dice, Number(spec.keep ?? 1), spec.kind, 'main').filter(d => !d.extra);
    return { total: sum(taken) + sum(dice.filter(d => d.extra)), single: taken.length === 1 ? taken[0]!.value : null };
  }
  if (spec.kind === 'count') {
    const direction = Object.keys(PER_DIE).find(key => spec[key] !== undefined);
    if (!direction) throw new EngineError(`чтению «счёт успехов» нужен порог на кость — одно из: ${Object.keys(PER_DIE).join(', ')}`);
    const versus = Number(spec[direction]);
    return { total: dice.filter(d => PER_DIE[direction]!(d.value, versus)).length, single: null };
  }
  throw new EngineError(`неизвестное чтение костей «${spec.kind}»; есть: sum, best, worst, count`);
}

export function result(roll: Roll): RollResult {
  const taken = kept(roll);
  const { total, single } = read(taken, roll.claim.read);
  const physical = (d: Rolled) => !d.extra && d.from === undefined;
  const counted = taken.filter(physical);
  const parts: Record<string, number> = {};
  for (const d of taken) if (d.part) parts[d.part] = (parts[d.part] ?? 0) + d.value;
  return {
    total: total + roll.plus,
    natural: read(taken.filter(d => !d.extra), roll.claim.read).total,
    rolled: roll.dice.filter(physical).length,
    atMax: counted.filter(d => d.face === d.sides).length,
    atMin: counted.filter(d => d.face === 1).length,
    edited: roll.edits.length > 0,
    dice: { rolls: roll.dice.map(d => d.value), kept: single },
    parts,
    tags: [...roll.tags],
  };
}

export const faces = (roll: Roll): number[] => roll.dice.map(d => (d.minus ? -d.face : d.face));

export type SeenOp =
  | { kind: 'add'; count: number; sides?: number; keep?: 'best' | 'worst'; explode?: boolean }
  | { kind: 'reroll'; upTo: number }
  | { kind: 'plus'; value: number };

const EXPLODE: RollEdit = { label: '', ops: [{ op: 'explode', apart: true }] };

export function see(roll: Roll, op: SeenOp, die: Die): Roll {
  if (op.kind === 'plus') return { ...roll, plus: roll.plus + op.value };
  const fresh = nextId(roll.dice);
  const taken = new Set(kept(roll));
  if (op.kind === 'reroll') {
    let dice = [...roll.dice];
    const targets = roll.dice.filter(d => taken.has(d) && !d.extra && d.from === undefined && d.value > 0 && d.value <= op.upTo);
    for (const target of targets) {
      const face = die(target.sides);
      const again = applyResults([{ ...target, face, value: target.minus ? -face : face }], roll.results, die, fresh);
      const at = dice.findIndex(d => d.id === target.id);
      dice = [...dice.slice(0, at).filter(d => d.from !== target.id), ...again, ...dice.slice(at + 1).filter(d => d.from !== target.id)];
    }
    return { ...roll, dice };
  }
  const sides = op.sides ?? roll.dice.find(d => !d.extra)?.sides ?? 6;
  const added: Rolled[] = Array.from({ length: Math.max(0, op.count) }, () => {
    const face = die(sides);
    return { id: fresh(), sides, face, value: face };
  });
  const grown = applyResults(added, roll.results, die, fresh);
  const before = op.keep ? roll.dice.map(d => (taken.has(d) ? d : { ...d, out: true })) : roll.dice;
  const dice = !op.explode ? [...before, ...grown]
    : roll.exploded ? [...before, ...applyResults(grown, [EXPLODE], die, fresh)]
      : applyResults([...before, ...grown], [EXPLODE], die, fresh);
  const held = [...taken].filter(d => !d.extra && !d.part).length;
  const keeps: Keep[] = op.keep
    ? [...roll.claim.keeps.filter(k => typeof k.scope === 'object'), { n: Math.max(1, held), from: op.keep, scope: 'unnamed' }]
    : roll.claim.keeps;
  return {
    ...roll, dice, claim: { ...roll.claim, keeps }, exploded: roll.exploded || Boolean(op.explode),
  };
}
