import { EngineError } from '../engine/errors.ts';
import { readingOf } from '../engine/readings.ts';
import { DICE_TEXT, DIE_LETTER } from '../words/glossary.ts';
import type { ReadSpec } from '../engine/readings.ts';
import type { DieConstant, Die, RollEdit, RollEditOp } from '../model/types.ts';

export interface Term { count: number; sides: number; part?: string }

export interface Zero { count: number; keep?: 'best' | 'worst' }

export interface Spec { label: string; terms: Term[]; read: ReadSpec; keeps?: Keep[]; zero?: Zero }

export type Scope = { part: string } | 'unnamed' | 'main';

export interface Keep { n: number; from: 'best' | 'worst'; scope: Scope }

export interface Claim { terms: Term[]; read: ReadSpec; keeps: Keep[]; versusShift: number; degreeShift: number }

export interface Rolled {
  id: number;
  sides: number;
  part?: string;
  face: number;
  value: number;
  from?: number;
  out?: boolean;
  wild?: boolean;
}

export interface Addend {
  label: string;
  value: number;
  dice: { sides: number; value: number }[];
}

export interface PendingAddend {
  label: string;
  value: (die: Die) => number;
}

export const PLUS_OP = 'plus';

export interface Roll {
  claim: Claim;
  dice: Rolled[];
  results: RollEdit[];
  edits: string[];
  canceled?: string[];
  addends: Addend[];
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


export type CountOf = (ref: unknown, what: string) => number;

export function parse(input: string | DieConstant, countOf?: CountOf): Spec {
  if (typeof input === 'string') {
    const match = DICE_TEXT.exec(input.trim());
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

export function withSides(spec: Spec, sides: number | readonly number[], owner: string): Spec {
  const list = typeof sides === 'number' ? [sides] : sides;
  const wrong = list.find(one => !Number.isInteger(one) || one < 1);
  if (wrong !== undefined) {
    throw new EngineError(`${owner}: грани кости «${spec.label || '?'}» должны быть целым числом от единицы, а вышло ${wrong}`);
  }
  if (typeof sides !== 'number') {
    if (spec.terms.length !== list.length) {
      throw new EngineError(`${owner}: бросают ${list.length} поля, а в кости «${spec.label || '?'}» видов: ${spec.terms.length} — их должно быть поровну`);
    }
    return { ...spec, terms: spec.terms.map((term, at) => ({ ...term, sides: list[at]! })) };
  }
  if (spec.terms.length !== 1) {
    throw new EngineError(`${owner}: грани задаёт проверка, а кость «${spec.label || '?'}» составная — возьмите кость из одного вида`);
  }
  return { ...spec, terms: [{ ...spec.terms[0]!, sides }] };
}

export function withKeep(spec: Spec, n: number, owner: string, from: Keep['from'] = 'best'): Spec {
  if (!Number.isInteger(n)) throw new EngineError(`${owner}: оставить можно целое число костей, а вышло ${n}`);
  if (n < 1) return spec;
  return { ...spec, keeps: [...(spec.keeps ?? []), { n, from, scope: 'main' }] };
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

export const LADDER = [4, 6, 8, 10, 12, 20];

const partOf = (op: RollEditOp): string | undefined => (op.part ? String(op.part) : undefined);

const inPart = (part: string | undefined, wanted?: string): boolean => (wanted ? part === wanted : true);

const main = (die: Rolled, wanted?: string): boolean => inPart(die.part, wanted);

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
    const at = claim.terms.findIndex(t => t.sides === sides && !t.part);
    if (at < 0) return { ...claim, terms: [...claim.terms, { count, sides }] };
    return { ...claim, terms: claim.terms.map((t, i) => (i === at ? { ...t, count: t.count + count } : t)) };
  },
  wild: claim => ({ ...claim, read: { ...claim.read, wild: true } }),
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
          id: fresh(), sides: d.sides, face, value: face, from: d.from ?? d.id,
          ...(d.part ? { part: d.part } : {}),
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
      return { ...d, face, value: face };
    });
  },
};

const stageOf = (op: RollEditOp): 'claim' | 'result' | 'plus' => {
  const name = String(op.op);
  if (name === PLUS_OP) return 'plus';
  if (name in CLAIM) return 'claim';
  if (name in RESULT) return 'result';
  throw new EngineError(`неизвестная правка броска «${op.op}»; есть: ${[...Object.keys(CLAIM), ...Object.keys(RESULT), PLUS_OP].join(', ')}`);
};

export const editStages = (): { op: string; stage: 'claim' | 'result' | 'plus' }[] => [
  ...Object.keys(CLAIM).map(op => ({ op, stage: 'claim' as const })),
  ...Object.keys(RESULT).map(op => ({ op, stage: 'result' as const })),
  { op: PLUS_OP, stage: 'plus' as const },
];

export const onlyPlus = (edit: RollEdit): boolean => {
  const ops = edit.ops ?? [];
  return ops.length > 0 && ops.every(op => stageOf(op) === 'plus');
};

export const changesFaces = (edit: RollEdit): boolean => (edit.ops ?? []).some(op => stageOf(op) === 'result');

export function applyResults(dice: Rolled[], edits: RollEdit[], roll: (sides: number) => number, fresh: () => number): Rolled[] {
  let next = dice;
  for (const edit of edits) {
    for (const op of edit.ops ?? []) {
      if (stageOf(op) === 'result') next = RESULT[String(op.op)]!(next, op, roll, fresh);
    }
  }
  return next;
}

export const nextId = (dice: readonly Rolled[]): (() => number) => {
  let next = dice.reduce((max, d) => Math.max(max, d.id), -1) + 1;
  return () => next++;
};

export function claimOf(spec: Spec, edits: readonly RollEdit[]): Claim {
  let claim: Claim = { terms: spec.terms, read: spec.read, keeps: [...(spec.keeps ?? [])], versusShift: 0, degreeShift: 0 };
  for (const edit of edits) {
    for (const op of edit.ops ?? []) {
      if (stageOf(op) === 'claim') claim = CLAIM[String(op.op)]!(claim, op);
    }
  }
  return spec.zero ? zeroed(claim, spec.zero) : claim;
}

function zeroed(claim: Claim, zero: Zero): Claim {
  const main = claim.terms.length === 1 ? claim.terms : claim.terms.filter(t => !t.part);
  if (main.length !== 1 || main[0]!.count > 0 || zero.count < 1) return claim;
  return {
    ...claim,
    terms: claim.terms.map(t => (t === main[0] ? { ...t, count: zero.count } : t)),
    keeps: [...claim.keeps, { n: 1, from: zero.keep ?? 'worst', scope: main[0]!.part ? { part: main[0]!.part } : 'unnamed' }],
  };
}

export function start(spec: Spec, edits: (RollEdit & { label?: string })[], die: Die, tags: readonly string[] = []): Roll {
  const claim = claimOf(spec, edits);
  const dice: Rolled[] = [];
  for (const term of claim.terms) {
    for (let i = 0; i < term.count; i++) {
      const face = die(term.sides);
      dice.push({
        id: dice.length, sides: term.sides, face, value: face,
        ...(term.part ? { part: term.part } : {}),
        ...((claim.read as { wild?: boolean }).wild && dice.length === 0 && !term.part ? { wild: true } : {}),
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
  const shown = edits.filter(edit => !onlyPlus(edit) && (!results.includes(edit) || fired.has(edit) || (edit.ops ?? []).some(op => stageOf(op) === 'claim')));
  return {
    claim, dice: rolled, results,
    edits: shown.map(edit => edit.label || '').filter(Boolean), addends: [], tags: [...tags],
    exploded: results.some(edit => (edit.ops ?? []).some(op => op.op === 'explode')),
  };
}

const withAddends = (roll: Roll, more: readonly Addend[]): Roll =>
  (more.length ? { ...roll, addends: [...roll.addends, ...more] } : roll);

export function addTo(roll: Roll, pending: readonly PendingAddend[], die: Die): Roll {
  return withAddends(roll, pending.map((one): Addend => {
    const dice: Addend['dice'] = [];
    const value = one.value(sides => {
      const face = die(sides);
      dice.push({ sides, value: face });
      return face;
    });
    if (!Number.isFinite(value)) throw new EngineError(`прибавка «${one.label}» дала не число`);
    return { label: one.label, value, dice };
  }));
}

export function verdictText(made: { threshold?: number | null; under?: boolean; success?: boolean | null; margin?: number | null; degree?: string | null }): string {
  const bar = made.threshold === null || made.threshold === undefined ? '' : ` · ${made.under ? 'не больше' : 'порог'} ${made.threshold}`;
  const passed = made.success === null || made.success === undefined ? '' : `${bar ? ':' : ' ·'} ${made.success ? 'успех' : 'провал'}`;
  const steps = made.margin === null || made.margin === undefined ? '' : ` · степеней: ${made.margin}`;
  return `${bar}${passed}${steps}${made.degree ? ` · ${made.degree}` : ''}`;
}

export function addendsText(addends: readonly { label: string; value: number; dice?: readonly { sides: number; value: number }[] }[]): string {
  return addends.map(one => {
    const size = Math.abs(one.value);
    const sign = one.value < 0 ? ' − ' : ' + ';
    const dice = one.dice ?? [];
    if (!dice.length) return `${sign}${one.label}: ${size}`;
    const sides = [...new Set(dice.map(d => d.sides))];
    const what = sides.length === 1
      ? `${dice.length > 1 ? dice.length : ''}${DIE_LETTER}${sides[0]}`
      : dice.map(d => `${DIE_LETTER}${d.sides}`).join(' + ');
    const sum = dice.reduce((acc, d) => acc + d.value, 0);
    const faces = dice.length > 1 || sum !== size ? ` [${dice.map(d => d.value).join(', ')}]` : '';
    return `${sign}${one.label} ${what}${faces}: ${size}`;
  }).join('');
}

export function keep(dice: readonly Rolled[], n: number, from: 'best' | 'worst', scope: Scope): Rolled[] {
  const inScope = (d: Rolled): boolean => (scope === 'main' ? true : scope === 'unnamed' ? !d.part : d.part === scope.part);
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
    const taken = keep(dice, Number(spec.keep ?? 1), spec.kind, 'main');
    return { total: sum(taken), single: taken.length === 1 ? taken[0]!.value : null };
  }
  if (spec.kind === 'count') {
    const direction = Object.keys(PER_DIE).find(key => spec[key] !== undefined);
    if (!direction) throw new EngineError(`чтению «счёт успехов» нужен порог на кость — одно из: ${Object.keys(PER_DIE).join(', ')}`);
    const versus = Number(spec[direction]);
    const hit = (d: Rolled) => PER_DIE[direction]!(d.value, versus);
    const wild = (spec as { wild?: boolean }).wild ? dice.find(d => d.wild) : undefined;
    if (!wild) return { total: dice.filter(hit).length, single: null };
    const glitched = wild.face === 1;
    const counted = dice.filter(d => hit(d) && !(glitched && d.value === versus));
    return { total: counted.length + (hit(wild) ? 2 : 0), single: null };
  }
  throw new EngineError(`неизвестное чтение костей «${spec.kind}»; есть: sum, best, worst, count`);
}

export function result(roll: Roll): RollResult {
  const taken = kept(roll);
  const { total, single } = read(taken, roll.claim.read);
  const physical = (d: Rolled) => d.from === undefined;
  const counted = taken.filter(physical);
  const parts: Record<string, number> = {};
  for (const d of taken) if (d.part) parts[d.part] = (parts[d.part] ?? 0) + d.value;
  return {
    total: total + roll.addends.reduce((sum, one) => sum + one.value, 0),
    natural: read(taken, roll.claim.read).total,
    rolled: roll.dice.filter(physical).length,
    atMax: counted.filter(d => d.face === d.sides).length,
    atMin: counted.filter(d => d.face === 1).length,
    edited: roll.edits.length > 0 || roll.addends.length > 0,
    dice: { rolls: roll.dice.map(d => d.value), kept: single },
    parts,
    tags: [...roll.tags],
  };
}

export const faces = (roll: Roll): number[] => roll.dice.map(d => d.face);

export const LOWEST = 'lowest';
export const ALL = 'all';

export type SeenOp =
  | { kind: 'add'; count: number; sides?: number; keep?: 'best' | 'worst'; explode?: boolean }
  | { kind: 'reroll'; upTo: number }
  | { kind: 'reroll'; which: typeof LOWEST | typeof ALL }
  | { kind: 'plus'; addend: Addend }
  | { kind: 'bump'; by: number };

export function lowestOf(roll: Roll): Rolled | null {
  let found: Rolled | null = null;
  for (const d of roll.dice) {
    if (d.out || d.part || d.from !== undefined) continue;
    if (!found || d.value < found.value) found = d;
  }
  return found;
}

const EXPLODE: RollEdit = { label: '', ops: [{ op: 'explode', apart: true }] };

export function bumpTarget(roll: Roll, by: number): Rolled | null {
  const taken = new Set(kept(roll));
  const read = roll.claim.read as { kind: string; atLeast?: number };
  const pool = roll.dice.filter(d => taken.has(d) && d.from === undefined && d.face < d.sides);
  if (!pool.length) return null;
  const reach = typeof read.atLeast === 'number' ? pool.filter(d => d.face < read.atLeast! && d.face + by >= read.atLeast!) : [];
  if (reach.length) return reach.reduce((best, d) => (d.face > best.face ? d : best));
  return pool.reduce((low, d) => (d.face < low.face ? d : low));
}

export function see(roll: Roll, op: SeenOp, die: Die): Roll {
  if (op.kind === 'plus') return withAddends(roll, [op.addend]);
  if (op.kind === 'bump') {
    const by = Math.max(0, Math.trunc(op.by));
    const target = bumpTarget(roll, by);
    if (!target) return roll;
    const face = Math.min(target.sides, target.face + by);
    const fresh = nextId(roll.dice);
    const again = applyResults([{ ...target, face, value: face }], roll.results, die, fresh);
    const at = roll.dice.findIndex(d => d.id === target.id);
    return { ...roll, dice: [...roll.dice.slice(0, at).filter(d => d.from !== target.id), ...again, ...roll.dice.slice(at + 1).filter(d => d.from !== target.id)] };
  }
  const fresh = nextId(roll.dice);
  const taken = new Set(kept(roll));
  if (op.kind === 'reroll') {
    let dice = [...roll.dice];
    const whole = 'which' in op && op.which === ALL;
    const lowest = 'which' in op && !whole ? lowestOf(roll) : null;
    const targets = whole
      ? roll.dice.filter(d => !d.out && !d.part && d.from === undefined)
      : 'which' in op
      ? (lowest ? [lowest] : [])
      : roll.dice.filter(d => taken.has(d) && d.from === undefined && d.value > 0 && d.value <= op.upTo);
    for (const target of targets) {
      const face = die(target.sides);
      const again = applyResults([{ ...target, face, value: face }], roll.results, die, fresh);
      const at = dice.findIndex(d => d.id === target.id);
      dice = [...dice.slice(0, at).filter(d => d.from !== target.id), ...again, ...dice.slice(at + 1).filter(d => d.from !== target.id)];
    }
    if (whole && result({ ...roll, dice }).total <= result(roll).total) return roll;
    return { ...roll, dice };
  }
  const sides = op.sides ?? roll.dice[0]?.sides ?? 6;
  const added: Rolled[] = Array.from({ length: Math.max(0, op.count) }, () => {
    const face = die(sides);
    return { id: fresh(), sides, face, value: face };
  });
  const grown = applyResults(added, roll.results, die, fresh);
  const before = op.keep ? roll.dice.map(d => (taken.has(d) ? d : { ...d, out: true })) : roll.dice;
  const dice = !op.explode ? [...before, ...grown]
    : roll.exploded ? [...before, ...applyResults(grown, [EXPLODE], die, fresh)]
      : applyResults([...before, ...grown], [EXPLODE], die, fresh);
  const held = [...taken].filter(d => !d.part).length;
  const keeps: Keep[] = op.keep
    ? [...roll.claim.keeps.filter(k => typeof k.scope === 'object'), { n: Math.max(1, held), from: op.keep, scope: 'unnamed' }]
    : roll.claim.keeps;
  return {
    ...roll, dice, claim: { ...roll.claim, keeps }, exploded: roll.exploded || Boolean(op.explode),
  };
}
