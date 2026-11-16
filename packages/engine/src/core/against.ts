import { compile } from '../formula/index.ts';
import { rollEdits, rollHeld } from './edits.ts';
import { cancels } from '../model/cancels.ts';
import type { Held, Holder, RollEdits } from './edits.ts';
import { claimOf, applyResults, nextId, onlyPlus, changesFaces, result } from './dice.ts';
import type { Roll, RollResult, Rolled, Spec, Term } from './dice.ts';
import type { Pass } from '../engine/calc.ts';
import type { Die, System } from '../model/types.ts';
import type { Path } from './path.ts';
import { DESK_ID } from '../engine/owners.ts';

export interface RollRecord {
  path: Path;
  by: string;
  against: string | null;
  spec: Spec;
  tags: readonly string[];
  claims: readonly string[];
  roller: Pass;
  holders: readonly Holder[];
  roll: Roll;
  values: Record<string, unknown>;
  add: number;
}

export type Thrower = Omit<RollRecord, 'add'>;

const records = new WeakMap<object, RollRecord>();

export function keepRecord(made: object, thrower: Thrower, add: number): void {
  records.set(made, { ...thrower, add });
}

export function recordOf(made: unknown): RollRecord | null {
  return made && typeof made === 'object' ? records.get(made) ?? null : null;
}

export interface Names {
  sheet(name: string): string | null | undefined;
  roller(name: string): string | null | undefined;
}

const textOf = (ref: unknown): string | null => {
  if (typeof ref === 'string') return ref;
  if (ref && typeof ref === 'object' && 'expr' in ref) return String((ref as { expr: unknown }).expr);
  return null;
};

const depsOf = (ref: unknown): readonly string[] => {
  const text = textOf(ref);
  if (!text?.trim()) return [];
  try {
    return compile(text).deps;
  } catch {
    return [];
  }
};

const headOf = (dep: string): { head: string; field: boolean } => {
  const dot = dep.indexOf('.');
  return dot > 0 ? { head: dep.slice(0, dot), field: true } : { head: dep, field: false };
};

export function mentions(ref: unknown, name: string): boolean {
  return depsOf(ref).some(dep => headOf(dep).head === name);
}

export function opponentIn(ref: unknown, roller: string | null, names: Names): { known: boolean; id: string | null } {
  const found = new Set<string>();
  for (const dep of depsOf(ref)) {
    const { head, field } = headOf(dep);
    if (head === DESK_ID) continue;
    const thrower = names.roller(head);
    if (thrower === null) return { known: false, id: null };
    if (thrower !== undefined) {
      if (thrower !== roller) found.add(thrower);
      continue;
    }
    if (!field) continue;
    const sheet = names.sheet(head);
    if (sheet === null) return { known: false, id: null };
    if (sheet !== undefined && sheet !== roller) found.add(sheet);
  }
  return { known: true, id: found.size === 1 ? [...found][0]! : null };
}

export interface FacedTrace {
  against: string;
  edits: string[];
  dropped: string[];
  dice: number[];
  total?: number;
  stale?: boolean;
}

export function facedText(one: FacedTrace): string {
  if (one.stale) return `против ${one.against}: правки цели не учтены — кости уже выбраны «увидев кости»`;
  const parts = [...one.edits, ...(one.dropped.length ? [`снято: ${one.dropped.join(', ')}`] : [])];
  const dice = one.dice.length ? `; докинуто [${one.dice.join(', ')}]` : '';
  const total = one.total !== undefined ? ` → ${one.total}` : '';
  return `против ${one.against}: ${parts.join(', ')}${dice}${total}`;
}

export interface Faced {
  made: RollResult & { versusShift: number; degreeShift: number };
  total: number;
  trace: FacedTrace;
}

const signature = (set: RollEdits): string => JSON.stringify([
  set.edits.map(edit => `${edit.label}:${JSON.stringify(edit.ops ?? [])}`).sort(),
  set.addends.map(one => one.label).sort(),
]);

const termKey = (term: Term): string => `${term.part ?? ''}|${term.sides}`;

const minus = <T>(from: readonly T[], away: readonly T[]): T[] => {
  const rest = [...away];
  return from.filter(one => {
    const at = rest.indexOf(one);
    if (at < 0) return true;
    rest.splice(at, 1);
    return false;
  });
};

const who = (held: Held): string => held.source.label || held.source.id;

const diceWord = (n: number): string => {
  const tail = n % 100;
  if (tail % 10 === 1 && tail !== 11) return 'кость';
  if (tail % 10 >= 2 && tail % 10 <= 4 && (tail < 12 || tail > 14)) return 'кости';
  return 'костей';
};

const countOf = (edit: { ops?: readonly unknown[] }): number => Number((edit.ops?.[0] as { count?: unknown } | undefined)?.count ?? 0);

const facedOf = (roll: Roll, add: number, trace: FacedTrace): Faced => {
  const made = result(roll);
  return {
    made: { ...made, total: made.total + add, versusShift: roll.claim.versusShift, degreeShift: roll.claim.degreeShift },
    total: made.total + add,
    trace: trace.stale ? trace : { ...trace, total: made.total + add },
  };
};

const signedDice = (count: number): string => `${count > 0 ? '+' : '−'}${Math.abs(count)} ${diceWord(Math.abs(count))}`;

export function retarget(record: RollRecord, opponent: string, name: string, die: (key: string) => Die, system: System): Faced | null {
  const was = rollHeld(record.holders, record.by, record.against, record.tags, record.values);
  const now = rollHeld(record.holders, record.by, opponent, record.tags, record.values);
  const before = rollEdits(was, record.claims, record.roller, record.tags);
  const after = rollEdits(now, record.claims, record.roller, record.tags);
  if (signature(before) === signature(after)) return null;
  const dictionary = system.roll_edits ?? {};
  const wordLabel = (key: string): string => dictionary[key]?.label || key;
  const gained = minus([...after.words, ...after.canceled], [...before.words, ...before.canceled]);
  const explained = new Set<string>();
  const edits = [
    ...gained.map(key => {
      const from = now.find(held => held.edit === key && !was.some(old => old.edit === key));
      const head = from ? `${who(from)} — ${wordLabel(key)}` : wordLabel(key);
      const partner = after.canceled.find(other => cancels(dictionary, key, other));
      if (!after.canceled.includes(key) || !partner) return head;
      explained.add(partner);
      return `${head} гасит «${wordLabel(partner)}»`;
    }),
    ...after.counts.filter(edit => !before.counts.some(one => one.label === edit.label && countOf(one) === countOf(edit)))
      .map(edit => `${edit.label}: ${signedDice(countOf(edit))}`),
    ...minus(after.bonuses, before.bonuses),
  ];
  const dropped = [
    ...minus(before.words, after.words).filter(key => !explained.has(key)).map(wordLabel),
    ...before.counts.filter(edit => !after.counts.some(one => one.label === edit.label && countOf(one) === countOf(edit)))
      .map(edit => `${edit.label} ${signedDice(countOf(edit))}`),
    ...minus(before.bonuses, after.bonuses),
  ];
  const claimWas = claimOf(record.spec, before.edits);
  const claimNow = claimOf(record.spec, after.edits);
  const keeps = record.roll.claim.keeps;
  const continues = claimWas.keeps.length <= keeps.length
    && claimWas.keeps.every((one, at) => JSON.stringify(one) === JSON.stringify(keeps[at]))
    && (keeps.length === claimWas.keeps.length || JSON.stringify(claimNow.keeps) === JSON.stringify(claimWas.keeps));
  if (!continues) return facedOf(record.roll, record.add, { against: name, edits, dropped, dice: [], stale: true });

  const fresh = nextId(record.roll.dice);
  const results = after.edits.filter(changesFaces);
  const pool = claimWas.terms.reduce((sum, term) => sum + term.count, 0);
  const starts = claimWas.terms.map((_, at) => claimWas.terms.slice(0, at).reduce((sum, term) => sum + term.count, 0));
  const taken = new Set<number>();
  const kept = new Set<number>();
  const grown: Rolled[] = [];
  for (const term of claimNow.terms) {
    const match = claimWas.terms.findIndex((one, at) => !taken.has(at) && termKey(one) === termKey(term));
    if (match >= 0) taken.add(match);
    const have = match >= 0 ? claimWas.terms[match]!.count : 0;
    for (let nth = 0; nth < term.count; nth++) {
      if (nth < have) {
        kept.add(starts[match]! + nth);
        continue;
      }
      const roll = die(`${termKey(term)}#${nth}`);
      const face = roll(term.sides);
      const made: Rolled = {
        id: fresh(), sides: term.sides, face, value: face,
        ...(term.part ? { part: term.part } : {}),
      };
      grown.push(...applyResults([made], results, roll, fresh));
    }
  }
  const dice = [
    ...record.roll.dice.filter(one => {
      const root = one.from ?? one.id;
      return root >= pool || kept.has(root);
    }),
    ...grown,
  ];

  const owned = before.addends.length;
  const fromEdits = record.roll.addends.slice(0, owned);
  const fromSeen = record.roll.addends.slice(owned);
  const left = [...fromEdits];
  for (const label of minus(before.addends.map(one => one.label), after.addends.map(one => one.label))) {
    const at = left.findIndex(one => one.label === label);
    if (at >= 0) left.splice(at, 1);
  }
  const owed = before.addends.map(one => one.label);
  const seenLabels = new Map<string, number>();
  const thrownDice: number[] = grown.map(one => one.value);
  for (const one of after.addends) {
    const nth = seenLabels.get(one.label) ?? 0;
    seenLabels.set(one.label, nth + 1);
    const at = owed.indexOf(one.label);
    if (at >= 0) {
      owed.splice(at, 1);
      continue;
    }
    const bySides = new Map<number, Die>();
    const faces: { sides: number; value: number }[] = [];
    const value = one.value(sides => {
      let roll = bySides.get(sides);
      if (!roll) {
        roll = die(`+${one.label}#${nth}|${sides}`);
        bySides.set(sides, roll);
      }
      const face = roll(sides);
      faces.push({ sides, value: face });
      return face;
    });
    thrownDice.push(...faces.map(face => face.value));
    left.push({ label: one.label, value, dice: faces });
  }

  const shown = after.edits
    .filter(edit => !onlyPlus(edit) && (!changesFaces(edit) || record.roll.edits.includes(edit.label)))
    .map(edit => edit.label)
    .filter(Boolean);
  const { canceled: _was, ...rest } = record.roll;
  const gone = [...new Set(after.canceled)].map(wordLabel);
  const roll: Roll = {
    ...rest,
    claim: { ...claimNow, keeps: [...claimNow.keeps, ...keeps.slice(claimWas.keeps.length)] },
    dice, addends: [...left, ...fromSeen], results, edits: shown,
    ...(gone.length ? { canceled: gone } : {}),
  };
  return facedOf(roll, record.add, { against: name, edits, dropped, dice: thrownDice });
}
