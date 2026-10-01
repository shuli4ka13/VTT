import { rollCheck } from '../engine/check.ts';
import { rollInitiative } from '../engine/clock.ts';
import type { Check, Checked } from '../engine/check.ts';
import { State } from './state.ts';
import { External, emptyJournal } from './journal.ts';
import { Runner, newSink } from './run.ts';
import { describeEntry } from '../events/describe.ts';
import type { System, Sheet, Compendium, Die } from '../model/types.ts';

export interface SeenCheck extends Checked {
  sheets: Sheet[];
  lines: string[];
}

export function checkSeen(
  world: { system: System; compendium: Compendium; die: Die },
  sheets: Sheet[], sheetId: string, check: Check, owner: string,
): SeenCheck {
  const state = new State([...sheets], world.system, world.compendium, null);
  const run = new Runner(state, new External(emptyJournal(), world.die, true));
  const sink = newSink();
  const sheet = state.get(sheetId);
  const checked = rollCheck(world.system, sheet, check, {
    compendium: world.compendium, die: world.die, owner,
    seen: (rolled, tags, rollerId) => run.seen(rollerId, null, rolled, tags, `check:${owner}`, '', 0, sink),
  });
  const known = new Set(sheets.map(s => s.id));
  const changed = state.sheets.filter(s => known.has(s.id) && !sheets.includes(s));
  const lines = sink.after.map(entry => ('text' in entry ? entry.text : describeEntry(entry, world.system, state.sheets)));
  return { ...checked, total: checked.rolled.total + checked.bonus, sheets: changed, lines };
}

export function initiativeSeen(
  world: { system: System; compendium: Compendium; die: Die }, sheets: Sheet[],
): { order: string[]; rolls: ReturnType<typeof rollInitiative>['rolls']; sheets: Sheet[]; lines: string[] } {
  const state = new State([...sheets], world.system, world.compendium, null);
  const run = new Runner(state, new External(emptyJournal(), world.die, true));
  const sink = newSink();
  const rolled = rollInitiative(world.system, sheets, world.compendium, world.die,
    (thrown, tags, rollerId) => run.seen(rollerId, null, thrown, tags, `initiative:${rollerId}`, '', 0, sink));
  const known = new Set(sheets.map(s => s.id));
  const lines = sink.after.map(entry => ('text' in entry ? entry.text : describeEntry(entry, world.system, state.sheets)));
  return { ...rolled, sheets: state.sheets.filter(s => known.has(s.id)), lines };
}
