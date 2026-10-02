import { External, emptyJournal } from '../src/core/external.ts';
import { Path } from '../src/core/path.ts';
import { Run, newSink } from '../src/core/run.ts';
import { parse, start, result, see, faces } from '../src/core/dice.ts';
import { initiative } from '../src/core/perform.ts';
import { render } from '../src/core/render.ts';
import type { Roll, SeenOp } from '../src/core/dice.ts';
import type { Report, Entry } from '../src/core/log.ts';
import type { Check } from '../src/engine/check.ts';
import type { MomentKey } from '../src/events/moments.ts';
import type { Clock } from '../src/engine/clock.ts';
import type { System, Sheet, Compendium, Die, DieConstant, RollEdit, Step, Param } from '../src/model/types.ts';

export interface LeadRoll {
  rolls: number[];
  raw: number[];
  kept: number | null;
  total: number;
  natural: number;
  parts: Record<string, number>;
  edits: string[];
  versusShift: number;
  degreeShift: number;
  read: string;
  tally: { dice: number; atMax: number; atMin: number };
  roll: Roll;
}

const view = (roll: Roll): LeadRoll => {
  const now = result(roll);
  return {
    rolls: now.dice.rolls, raw: faces(roll), kept: now.dice.kept, total: now.total, natural: now.natural, parts: now.parts,
    edits: roll.edits, versusShift: roll.claim.versusShift, degreeShift: roll.claim.degreeShift, read: roll.claim.read.kind,
    tally: { dice: now.rolled, atMax: now.atMax, atMin: now.atMin }, roll,
  };
};

export const rollLead = (def: DieConstant, die: Die, edits: RollEdit[] = []): LeadRoll => view(start(parse(def), edits, die));

export const seeRoll = (rolled: LeadRoll, op: SeenOp, die: Die): LeadRoll => view(see(rolled.roll, op, die));

export function rollNotation(notation: unknown, die: Die) {
  const rolled = result(start(parse(String(notation)), [], die));
  const sides = parse(String(notation)).terms[0]!.sides;
  return {
    notation, rolls: rolled.dice.rolls, total: rolled.total,
    tally: { dice: rolled.dice.rolls.length, atMax: rolled.dice.rolls.filter(v => v === sides).length, atMin: rolled.dice.rolls.filter(v => v === 1).length },
  };
}

interface World { system: System; compendium?: Compendium | null; die: Die; clock?: Clock | null }

const runOf = (world: World, sheets: readonly Sheet[]): Run =>
  new Run({ system: world.system, compendium: (world.compendium ?? { records: [] }) as Compendium, clock: world.clock ?? null, sheets }, new External(emptyJournal(), { die: world.die }, 'trial'));

const fired = (entries: readonly Entry[]): { sheetId: string; report: Report }[] =>
  entries.flatMap(entry => ('report' in entry && entry.report.kind === 'moment' ? [{ sheetId: entry.fromId, report: entry.report }] : []));

export function rollCheck(system: System, sheet: Sheet, check: Check, options: { compendium?: Compendium | null; die: Die; owner: string; sheets?: Sheet[] }) {
  const run = runOf({ system, compendium: options.compendium ?? null, die: options.die }, options.sheets ?? [sheet]);
  const out = run.check(sheet.id, check, Path.op('check'), options.owner);
  return { rolled: view(out.thrown.roll), bonus: out.bonus, total: out.total, edits: out.thrown.roll.edits };
}

export function rollInitiative(system: System, sheets: Sheet[], compendium: Compendium, die: Die) {
  return initiative(runOf({ system, compendium, die }, sheets), Path.op('turn'));
}

export function fireMoments(events: { moment: MomentKey; sheetId: string }[], sheets: Sheet[], world: World) {
  const run = runOf(world, sheets);
  const expired = events.flatMap(event => run.moment(event.moment, [event.sheetId], Path.op('moments')));
  return { sheets: [...run.state.sheets], reports: fired(run.state.log), expired, log: render(run.state.log, world.system, run.state.sheets) };
}

export function fireLifecycle(before: Sheet[], after: Sheet[], world: World) {
  const run = runOf(world, after);
  run.lifecycle(before, Path.op('life'));
  return { sheets: [...run.state.sheets], reports: fired(run.state.log) };
}

export function fireCrossings(before: Sheet[], after: Sheet[], world: World) {
  const run = runOf(world, after);
  run.crossings(before, Path.op('cross'));
  return { sheets: [...run.state.sheets], reports: fired(run.state.log) };
}

export function settle(before: Sheet[], after: Sheet[], world: World) {
  const run = runOf(world, after);
  run.settle(before, Path.op('settle'));
  return {
    sheets: [...run.state.sheets],
    aftermath: run.state.log.map(entry => ('report' in entry
      ? { kind: 'fired' as const, sheetId: entry.fromId, report: entry.report }
      : { kind: 'text' as const, text: entry.text })),
  };
}

export function runSteps(system: System, sheets: Sheet[], sheetId: string, steps: Step[], die: Die, args: Record<string, unknown> = {}, paramDefs: Param[] = [], compendium: Compendium = { records: [] } as Compendium) {
  const run = runOf({ system, compendium, die }, sheets);
  const sink = newSink();
  const ran = run.exec({
    path: Path.op('rule'), effectId: 'e', label: 'тест', owner: 'тест', home: sheetId, bound: { носитель: sheetId },
    args, paramDefs, props: null, claims: {}, hop: 0, inSub: false,
  }, steps, sink);
  return { ...ran, sink, sheets: [...run.state.sheets] };
}
