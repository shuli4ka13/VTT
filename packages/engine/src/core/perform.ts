import { compile } from '../formula/index.ts';
import { EngineError } from '../engine/errors.ts';
import { availableActions, actionOf } from '../events/actions.ts';
import { asksOf, checkInputs, normalizeInputs } from '../model/asks.ts';
import { findRecord, sheetKindOf } from '../model/owned.ts';
import { findEffect, usesMax, reapplyOf } from '../engine/effects.ts';
import { expiryOf, inCombat, startCombat, nextTurn, stopCombat } from '../engine/clock.ts';
import { momentsOfTurn } from '../events/moments.ts';
import { fieldCheck } from '../engine/check.ts';
import { newBreaches } from '../engine/limits.ts';
import { fieldOf } from '../model/sheet-columns.ts';
import { DESK_ID, isDesk } from '../engine/owners.ts';
import { External, Pause, emptyJournal } from './external.ts';
import { Path } from './path.ts';
import { Run } from './run.ts';
import { runAct } from './act.ts';
import { render } from './render.ts';
import type { ActIntent } from './act.ts';
import type { Journal, Mode, Question } from './external.ts';
import type { Entry } from './log.ts';
import type { Clock } from '../engine/clock.ts';
import type { TurnOp } from '../events/moments.ts';
import type { System, Sheet, Compendium, Die, StoredValue, WornEffect } from '../model/types.ts';

export type Op =
  | { op: 'act'; intent: ActIntent }
  | { op: 'roll'; sheetId: string; tag: string }
  | { op: 'set'; sheetId: string; tag: string; value: StoredValue }
  | { op: 'belonging'; sheetId: string; list: 'has' | 'effects'; id: string; on: boolean; off?: boolean }
  | { op: 'kind'; sheetId: string; of: string | null }
  | { op: 'group'; sheetId: string; group: string | null }
  | { op: 'turn'; turn: TurnOp; order?: string[] }
  | { op: 'sheet'; name: string; of?: string };

export interface PerformWorld {
  system: System;
  compendium: Compendium;
  clock: Clock | null;
  sheets: readonly Sheet[];
  die: Die;
  newId?: () => string;
  journal?: Partial<Journal>;
  mode?: Mode;
}

export type Performed =
  | { kind: 'done'; sheets: Sheet[]; clock: Clock | null; log: string[]; entries: Entry[]; journal: Journal; fresh: number[] }
  | { kind: 'paused'; sheets: Sheet[]; clock: Clock | null; log: string[]; entries: Entry[]; journal: Journal; fresh: number[]; question: Question };

export function perform(world: PerformWorld, op: Op): Performed {
  const journal: Journal = { ...emptyJournal(), ...(world.journal ?? {}) } as Journal;
  const ext = new External(journal, { die: world.die, ...(world.newId ? { newId: world.newId } : {}) }, world.mode ?? 'real');
  const run = new Run({ system: world.system, compendium: world.compendium, clock: world.clock, sheets: world.sheets }, ext);
  const root = Path.op(op.op);
  const before = world.sheets;
  try {
    const settles = OPS[op.op](run, op as never, root);
    if (settles) run.settle(before, root);
    const log = [...run.state.log];
    return {
      kind: 'done', sheets: [...run.state.sheets], clock: run.clock, log: render(log, world.system, world.compendium, run.state.sheets),
      entries: log, journal: ext.settled(), fresh: ext.fresh,
    };
  } catch (err) {
    if (!(err instanceof Pause)) throw err;
    const log = [...run.state.log];
    return {
      kind: 'paused', sheets: [...run.state.sheets], clock: run.clock, log: render(log, world.system, world.compendium, run.state.sheets),
      entries: log, journal: ext.snapshot(), fresh: ext.fresh, question: err.question,
    };
  }
}

type Handler<K extends Op['op']> = (run: Run, op: Extract<Op, { op: K }>, root: Path) => boolean;

const sheetOf = (run: Run, id: string): Sheet => {
  const sheet = run.sheet(id);
  if (!sheet) throw new EngineError(`в комнате нет листа «${id}»`);
  return sheet;
};

function withinLimits(run: Run, was: Sheet, next: Sheet): void {
  const sheets = run.state.sheets.map(s => (s.id === next.id ? was : s));
  const broken = newBreaches(run.system, was, next, { compendium: run.world.compendium, shared: run.views.shared(sheets) });
  if (broken.length) throw new EngineError(`так нельзя: ${broken.map(one => one.text).join('; ')}`);
}

function bound(run: Run, sheetId: string, raw: unknown, what: string): number | null {
  if (raw === undefined || raw === null || raw === '') return null;
  const value = typeof raw === 'number' ? raw : compile(String(raw)).evaluate(run.view(sheetId).resolve);
  if (typeof value !== 'number') throw new EngineError(`${what} — не число`);
  return value;
}

const OPS: { [K in Op['op']]: Handler<K> } = {
  act(run, { intent }, root) {
    const actor = sheetOf(run, intent.fromId);
    for (const id of intent.toIds) sheetOf(run, id);
    const { system, compendium } = run.world;
    const action = actionOf(intent.actionId, { system, compendium });
    if (!availableActions(actor, { system, compendium }).some(one => one.id === intent.actionId)) {
      throw new EngineError(`у «${actor.name}» нет действия «${action.label}» — запись не на листе или выключена`);
    }
    const asked = asksOf(intent.actionId, { system, compendium });
    const trouble = checkInputs(asked, intent.inputs, system, run.view(actor.id));
    if (trouble) throw new EngineError(trouble);
    const inputs = normalizeInputs(asked, intent.inputs);
    runAct(run, { ...intent, ...(Object.keys(inputs).length ? { inputs } : {}) }, root);
    return true;
  },

  roll(run, { sheetId, tag }, root) {
    const sheet = sheetOf(run, sheetId);
    const check = fieldCheck(run.system, tag);
    const { thrown, bonus, total, entries } = run.check(sheetId, check, root.step('roll'), check.label);
    const rolled = thrown.result;
    const named = thrown.roll.edits.length ? ` (${thrown.roll.edits.join(', ')})` : '';
    const shown = rolled.dice.kept != null && rolled.dice.rolls.length > 1
      ? `[${rolled.dice.rolls.join(', ')}] → ${rolled.dice.kept}` : `[${rolled.dice.rolls.join(', ')}]`;
    run.state.write({
      text: thrown.roll.claim.read.kind === 'count'
        ? `${sheet.name} бросает «${check.label}»: ${shown}${named} — успехов: ${total}`
        : `${sheet.name} бросает «${check.label}»: ${shown}${named} + ${bonus} = ${total}`,
    }, ...entries);
    return true;
  },

  set(run, { sheetId, tag, value }) {
    const field = fieldOf(run.system, tag);
    if (!field) throw new EngineError(`система не объявляет поля «${tag}»`);
    if (field.value.kind !== 'stored') throw new EngineError(`поле «${field.label}» считает движок по правилу — вписать в него значение нельзя`);
    const holder = sheetOf(run, run.views.holderOf(run.state.sheets, sheetOf(run, sheetId).id, tag));
    if (typeof value === 'number') {
      const low = bound(run, holder.id, field.value.min, 'нижняя граница поля');
      const high = bound(run, holder.id, field.value.max, 'верхняя граница поля');
      if (low !== null && value < low) throw new EngineError(`«${field.label}» не меньше ${low}`);
      if (high !== null && value > high) throw new EngineError(`«${field.label}» не больше ${high}`);
    }
    const next: Sheet = { ...holder, values: { ...holder.values, [tag]: value } };
    withinLimits(run, holder, next);
    run.state.put(next);
    return true;
  },

  belonging(run, { sheetId, list, id, on, off }, root) {
    const sheet = sheetOf(run, sheetId);
    const { system, compendium } = run.world;
    let next: Sheet;
    if (list === 'has') {
      if (!findRecord(compendium, id)) throw new EngineError(`в компендиуме нет записи «${id}»`);
      const owned = sheet.has ?? [];
      const was = owned.find(entry => entry.of === id);
      const entry = { ...(was ?? { of: id }) };
      if (off) entry.off = true; else delete entry.off;
      next = { ...sheet, has: !on ? owned.filter(other => other.of !== id) : was ? owned.map(other => (other.of === id ? entry : other)) : [...owned, entry] };
    } else {
      const effect = findEffect(system, id);
      if (!effect) throw new EngineError(`система не объявляет эффекта «${id}»`);
      if (on && (effect.activation ?? 'manual') === 'manual') throw new EngineError('активируемый эффект не вешают — его применяют действием');
      const worn: WornEffect[] = [...(sheet.effects ?? [])];
      if (!on) {
        next = { ...sheet, effects: worn.filter(entry => entry.effectId !== id) };
      } else {
        const max = usesMax(effect);
        const fresh: WornEffect = {
          effectId: id, ...expiryOf(effect, run.clock), ...(max === null ? {} : { usesLeft: max }),
          ...(reapplyOf(effect) === 'stack' ? { inst: run.ext.id(root.phase('inst')) } : {}),
        };
        const at = worn.findIndex(entry => entry.effectId === id);
        if (at < 0 || reapplyOf(effect) === 'stack') worn.push(fresh);
        else if (reapplyOf(effect) === 'refresh') worn[at] = fresh;
        next = { ...sheet, effects: worn };
      }
    }
    withinLimits(run, sheet, next);
    run.state.put(next);
    return true;
  },

  kind(run, { sheetId, of }) {
    const sheet = sheetOf(run, sheetId);
    if (of !== null && isDesk({ id: of })) throw new EngineError('тип «стол» только у стола комнаты');
    if (of !== null && !run.system.sheets?.[of]) throw new EngineError(`система не объявляет типа листа «${of}»`);
    const { of: _was, ...rest } = sheet;
    void _was;
    const next: Sheet = of === null ? rest : { ...rest, of };
    withinLimits(run, sheet, next);
    run.state.put(next);
    return true;
  },

  group(run, { sheetId, group }) {
    const sheet = sheetOf(run, sheetId);
    const sheets = run.state.sheets;
    if (group !== null) {
      const holder = sheets.find(entry => entry.id === group);
      if (!holder) throw new EngineError(`в комнате нет листа «${group}»`);
      if (group === sheetId) throw new EngineError('лист не может быть группой самому себе');
      if (isDesk(holder)) throw new EngineError('стол и так общий для всех — группой его не назначают');
      if (sheets.some(entry => entry.group === sheetId)) throw new EngineError(`«${sheet.name}» — группа для других листов, в группу её не поставить`);
      if (holder.group) throw new EngineError(`«${holder.name}» сам состоит в группе — группы не вкладываются`);
    }
    const { group: _was, ...rest } = sheet;
    void _was;
    const next: Sheet = group === null ? rest : { ...rest, group };
    run.state.write({ text: group === null ? `«${sheet.name}» вышел из группы` : `«${sheet.name}» теперь в группе «${sheets.find(entry => entry.id === group)!.name}»` });
    withinLimits(run, sheet, next);
    run.state.put(next);
    return true;
  },

  turn(run, { turn, order }, root) {
    const before = run.clock ?? { round: 0, order: [], active: null };
    const nameOf = (id: string) => run.sheet(id)?.name ?? id;
    let next: Clock = before;
    if (turn === 'start') {
      let line = order ?? [];
      if (line.length) {
        const unknown = line.find(id => !run.sheet(id));
        if (unknown) throw new EngineError(`в комнате нет листа «${unknown}»`);
      } else {
        const spec = run.system.initiative;
        const fighters = run.state.sheets.filter(sheet => !isDesk(sheet) && !run.state.sheets.some(other => other.group === sheet.id));
        if (spec) {
          const rolls = fighters.map(sheet => {
            const checked = run.check(sheet.id, spec as never, root.phase('initiative').at(sheet.id), 'инициатива');
            run.state.write(...checked.entries);
            return { sheetId: sheet.id, total: checked.total };
          });
          line = [...rolls].sort((a, b) => b.total - a.total).map(r => r.sheetId);
          run.state.write({ text: `Инициатива: ${[...rolls].sort((a, b) => b.total - a.total).map(r => `${nameOf(r.sheetId)} ${r.total}`).join(', ')}` });
        } else {
          line = fighters.map(sheet => sheet.id);
        }
      }
      next = startCombat(before, line);
      run.state.write({ text: `Раунд 1. Ход: ${nameOf(String(next.active))}` });
    } else if (turn === 'next') {
      next = nextTurn(before);
      run.state.write({ text: next.round !== before.round ? `Раунд ${next.round}. Ход: ${nameOf(String(next.active))}` : `Ход: ${nameOf(String(next.active))}` });
    } else if (turn === 'stop') {
      next = stopCombat();
      run.state.write({ text: 'Бой окончен' });
    } else if (turn === 'short-rest' || turn === 'long-rest') {
      if (inCombat(before)) throw new EngineError('в бою не отдыхают — сначала закончите бой');
      run.state.write({ text: turn === 'long-rest' ? 'Долгий отдых' : 'Короткий отдых' });
    } else {
      run.state.write({ text: 'Сцена закрыта' });
    }
    run.clock = next;
    for (const event of momentsOfTurn(turn, before, next, [...run.state.sheets])) run.moment(event.moment, event.sheetId, root);
    return true;
  },

  sheet(run, { name, of }, root) {
    if (of && !sheetKindOf(run.system, { of } as Sheet)) throw new EngineError(`в системе нет типа листа «${of}»`);
    const sheet = {
      id: run.ext.id(root.phase('id')), systemId: run.system.id ?? '', ...(of ? { of } : {}), name, values: {}, has: [], effects: [],
    } as Sheet;
    run.state.put(sheet);
    run.state.write({ text: `Лист «${name}» заведён` });
    return false;
  },
};

export { DESK_ID };
