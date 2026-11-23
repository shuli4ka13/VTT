import { compile } from '../formula/index.ts';
import { calc, baseOf } from '../engine/calc.ts';
import { EngineError } from '../engine/errors.ts';
import { availableActions, actionOf } from '../events/actions.ts';
import { asksOf, checkInputs, normalizeInputs } from '../model/asks.ts';
import { findRecord, sheetKindOf, keyOf } from '../model/owned.ts';
import { findEffect, usesMax, reapplyOf } from '../engine/effects.ts';
import { expiryOf, inCombat, startCombat, nextTurn, stopCombat, passTime, spanText, joinCombat, leaveCombat } from '../engine/clock.ts';
import { momentsOfTurn } from '../events/moments.ts';
import type { MomentEvent } from '../events/moments.ts';
import { fieldCheck } from '../engine/check.ts';
import { newBreaches } from '../engine/limits.ts';
import { fieldOf, misfit, same } from '../model/sheet-columns.ts';
import { itemCell, parseItemTag, withItemValue, withoutItemValue } from '../model/item-ref.ts';
import { isBlank } from '../model/blank.ts';
import { freshSheet } from '../model/fresh.ts';
import { isSecret } from '../model/roles.ts';
import { DESK_ID, isDesk } from '../engine/owners.ts';
import { External, Pause, emptyJournal } from './external.ts';
import { Path } from './path.ts';
import { addendsText, verdictText } from './dice.ts';
import { Run } from './run.ts';
import { runAct } from './act.ts';
import { render, renderLines } from './render.ts';
import type { ActIntent } from './act.ts';
import type { Journal, Mode, Question } from './external.ts';
import type { Entry } from './log.ts';
import type { Clock } from '../engine/clock.ts';
import type { TurnOp } from '../events/moments.ts';
import type { System, Sheet, Compendium, Die, StoredValue, WornEffect, Owned, Field } from '../model/types.ts';
import { CALL_WORDS } from '../words/calls.ts';
import { tr } from '../words/tongue.ts';
import { inSystemTongue } from '../model/localize.ts';

export type Op =
  | { op: 'act'; intent: ActIntent }
  | { op: 'roll'; sheetId: string; tag: string; claims?: string[]; second?: string; versus?: number }
  | { op: 'set'; sheetId: string; tag: string; value: StoredValue }
  | { op: 'shift'; sheetId: string; tag: string; by: number }
  | { op: 'belonging'; sheetId: string; list: 'has' | 'effects'; id: string; on: boolean; off?: boolean; inst?: string; add?: boolean; in?: string | null }
  | { op: 'kind'; sheetId: string; of: string | null }
  | { op: 'group'; sheetId: string; group: string | null }
  | { op: 'turn'; turn: TurnOp; order?: string[]; who?: string[]; seconds?: number }
  | { op: 'sheet'; name: string; of?: string }
  | { op: 'drop'; sheetId: string };

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
  | { kind: 'done'; sheets: Sheet[]; clock: Clock | null; log: string[]; lines: (string[] | null)[]; entries: Entry[]; journal: Journal; fresh: number[] }
  | { kind: 'paused'; sheets: Sheet[]; clock: Clock | null; log: string[]; lines: (string[] | null)[]; entries: Entry[]; journal: Journal; fresh: number[]; question: Question };

export function perform(world: PerformWorld, op: Op): Performed {
  return inSystemTongue(world.system, () => performIn(world, op));
}

function performIn(world: PerformWorld, op: Op): Performed {
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
      kind: 'done', sheets: [...run.state.sheets], clock: run.clock, log: render(log, world.system, run.state.sheets), lines: renderLines(log, world.system, run.state.sheets),
      entries: log, journal: ext.settled(), fresh: ext.fresh,
    };
  } catch (err) {
    if (!(err instanceof Pause)) throw err;
    const log = [...run.state.log];
    return {
      kind: 'paused', sheets: [...run.state.sheets], clock: world.clock, log: render(log, world.system, run.state.sheets), lines: renderLines(log, world.system, run.state.sheets),
      entries: log, journal: ext.snapshot(), fresh: ext.fresh, question: err.question,
    };
  }
}

type Handler<K extends Op['op']> = (run: Run, op: Extract<Op, { op: K }>, root: Path) => boolean;

const sheetOf = (run: Run, id: string): Sheet => {
  const sheet = run.sheet(id);
  if (!sheet) throw new EngineError(tr`в комнате нет листа «${id}»`);
  return sheet;
};

function withinLimits(run: Run, was: Sheet, next: Sheet): void {
  const sheets = run.state.sheets.map(s => (s.id === next.id ? was : s));
  const broken = newBreaches(run.system, was, next, { compendium: run.world.compendium, shared: run.views.shared(sheets) });
  if (broken.length) throw new EngineError(tr`так нельзя: ${broken.map(one => one.text).join('; ')}`);
}

function bound(run: Run, sheetId: string, raw: unknown, what: string): number | null {
  if (raw === undefined || raw === null || raw === '') return null;
  const value = typeof raw === 'number' ? raw : compile(String(raw)).evaluate(run.view(sheetId).resolve);
  if (typeof value !== 'number') throw new EngineError(tr`${what} — не число`);
  return value;
}

function storedField(run: Run, sheetId: string, tag: string): { field: Field; stored: Extract<Field['value'], { kind: 'stored' }>; holder: Sheet } {
  const field = fieldOf(run.system, tag);
  if (!field) throw new EngineError(tr`система не объявляет поля «${tag}»`);
  if (field.value.kind !== 'stored') throw new EngineError(tr`поле «${field.label}» считает движок по правилу — вписать в него значение нельзя`);
  return { field, stored: field.value, holder: sheetOf(run, run.views.holderOf(run.state.sheets, sheetOf(run, sheetId).id, tag)) };
}

function putValue(run: Run, holder: Sheet, tag: string, value: StoredValue): boolean {
  const next: Sheet = { ...holder, values: { ...holder.values, [tag]: value } };
  withinLimits(run, holder, next);
  run.state.put(next);
  return true;
}

function setItem(run: Run, sheet: Sheet, key: string, column: string, value: StoredValue): boolean {
  const cell = itemCell(run.system, run.world.compendium, sheet, key, column);
  const wrong = misfit(cell.field, value);
  if (wrong) throw new EngineError(wrong);
  const stored = cell.field.value;
  if (stored.kind === 'stored' && typeof value === 'number') {
    const low = bound(run, sheet.id, stored.min, tr`нижняя граница поля`);
    const high = bound(run, sheet.id, stored.max, tr`верхняя граница поля`);
    if (low !== null && value < low) throw new EngineError(tr`«${cell.field.label}» не меньше ${low}`);
    if (high !== null && value > high) throw new EngineError(tr`«${cell.field.label}» не больше ${high}`);
  }
  const next = isBlank(value) || same(value, cell.plain) ? withoutItemValue(sheet, key, column) : withItemValue(sheet, key, column, value);
  withinLimits(run, sheet, next);
  run.state.put(next);
  return true;
}

export interface InitiativeRoll { sheetId: string; rolls: number[]; total: number; edits: string[] }

export function fightersOf(run: Run, who?: string[]): Sheet[] {
  const grouped = (sheet: Sheet) => run.state.sheets.some(other => other.group === sheet.id);
  if (!who) return run.state.sheets.filter(sheet => !isDesk(sheet) && !grouped(sheet));
  if (new Set(who).size !== who.length) throw new EngineError(tr`участник боя указан дважды`);
  return who.map(id => {
    const sheet = sheetOf(run, id);
    if (isDesk(sheet)) throw new EngineError(tr`стол в бою не участвует`);
    if (grouped(sheet)) throw new EngineError(tr`«${sheet.name}» — группа: в бой вступают её участники`);
    return sheet;
  });
}

export function initiative(run: Run, root: Path, who?: string[], phase = 'initiative'): { order: string[]; rolls: InitiativeRoll[] } {
  const spec = run.system.initiative;
  const fighters = fightersOf(run, who);
  if (!spec) return { order: fighters.map(sheet => sheet.id), rolls: [] };
  const rolls = fighters.map((sheet): InitiativeRoll => {
    const checked = run.check(sheet.id, spec as never, root.phase(phase).at(sheet.id), tr`инициатива`);
    run.state.write(...checked.entries);
    return { sheetId: sheet.id, rolls: checked.thrown.result.dice.rolls, total: checked.total, edits: checked.thrown.roll.edits };
  });
  const ties = spec.ties ?? [];
  if (!ties.length) return { order: [...rolls].sort((a, b) => b.total - a.total).map(r => r.sheetId), rolls };
  const ranks = new Map(rolls.map(r => {
    const sheet = run.state.sheets.find(s => s.id === r.sheetId)!;
    return [r.sheetId, [r.total, ...ties.map(tag => Number(calc(run.system, sheet, tag, run.view(sheet.id))) || 0)]];
  }));
  const same = (a: number[], b: number[]) => a.length === b.length && a.every((x, i) => x === b[i]);
  for (let toss = 0; toss < 8; toss++) {
    const tied = rolls.filter(r => rolls.some(o => o !== r && same(ranks.get(o.sheetId)!, ranks.get(r.sheetId)!)));
    if (!tied.length) break;
    for (const r of tied) ranks.set(r.sheetId, [...ranks.get(r.sheetId)!, run.ext.dice(root.phase(`${phase}-lot`).item(toss).at(r.sheetId))(6)]);
  }
  const width = Math.max(...[...ranks.values()].map(k => k.length));
  const rank = (id: string) => [...ranks.get(id)!, ...Array(width - ranks.get(id)!.length).fill(0)];
  const order = [...rolls].map(r => r.sheetId).sort((a, b) => {
    const x = rank(a); const y = rank(b);
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return y[i]! - x[i]!;
    return 0;
  });
  return { order, rolls };
}

const OPS: { [K in Op['op']]: Handler<K> } = {
  act(run, { intent }, root) {
    const actor = sheetOf(run, intent.fromId);
    for (const id of intent.toIds) sheetOf(run, id);
    const { system, compendium } = run.world;
    const action = actionOf(intent.actionId, { system, compendium });
    if (!availableActions(actor, { system, compendium }).some(one => one.id === intent.actionId)) {
      throw new EngineError(tr`у «${actor.name}» нет действия «${action.label}» — запись не на листе или выключена`);
    }
    const asked = asksOf(intent.actionId, { system, compendium });
    const trouble = checkInputs(asked, intent.inputs, system, run.view(actor.id), intent.toIds);
    if (trouble) throw new EngineError(trouble);
    const inputs = normalizeInputs(asked, intent.inputs);
    runAct(run, { ...intent, ...(Object.keys(inputs).length ? { inputs } : {}) }, root);
    return true;
  },

  roll(run, { sheetId, tag, claims, second, versus }, root) {
    const sheet = sheetOf(run, sheetId);
    const check = fieldCheck(run.system, tag, second);
    const { thrown, bonus, total, entries, threshold, degree, success, margin } = run.check(sheetId, check, root.step('roll'), check.label, claims ?? [], versus ?? null);
    const verdict = verdictText({ threshold, under: check.under === true, success, margin: check.margin ? margin : null, degree });
    const rolled = thrown.result;
    const named = thrown.roll.edits.length ? ` (${thrown.roll.edits.join(', ')})` : '';
    const gone = CALL_WORDS.roll.canceled(thrown.roll.canceled ?? []);
    const shown = rolled.dice.kept != null && rolled.dice.rolls.length > 1
      ? `[${rolled.dice.rolls.join(', ')}] → ${rolled.dice.kept}` : `[${rolled.dice.rolls.join(', ')}]`;
    const closed = [tag, ...(second ? [second] : [])].some(name => isSecret(fieldOf(run.system, name)));
    const plain = verdictText({ success, degree });
    run.state.write({
      text: closed
        ? tr`${sheet.name} бросает «${check.label}»: ${shown}${named}${plain}${gone}`
        : thrown.roll.claim.read.kind === 'count'
        ? tr`${sheet.name} бросает «${check.label}»: ${shown}${named}${addendsText(thrown.roll.addends)} — успехов: ${total}${verdict}${gone}`
        : check.bonus
          ? tr`${sheet.name} бросает «${check.label}»: ${shown}${named}${addendsText(thrown.roll.addends)} + ${bonus} = ${total}${verdict}${gone}`
          : tr`${sheet.name} бросает «${check.label}»: ${shown}${named}${addendsText(thrown.roll.addends)} = ${total}${verdict}${gone}`,
    }, ...entries);
    return true;
  },

  set(run, { sheetId, tag, value }) {
    const item = parseItemTag(tag);
    if (item) return setItem(run, sheetOf(run, sheetId), item.key, item.column, value);
    const { field, stored, holder } = storedField(run, sheetId, tag);
    const wrong = misfit(field, value);
    if (wrong) throw new EngineError(wrong);
    if (typeof value === 'number') {
      const low = bound(run, holder.id, stored.min, tr`нижняя граница поля`);
      const high = bound(run, holder.id, stored.max, tr`верхняя граница поля`);
      if (low !== null && value < low) throw new EngineError(tr`«${field.label}» не меньше ${low}`);
      if (high !== null && value > high) throw new EngineError(tr`«${field.label}» не больше ${high}`);
    }
    return putValue(run, holder, tag, value);
  },

  shift(run, { sheetId, tag, by }) {
    if (parseItemTag(tag)) throw new EngineError(tr`значению вещи прибавить и отнять нельзя — впишите его целиком`);
    const { field, stored, holder } = storedField(run, sheetId, tag);
    const was = baseOf(run.view(holder.id), field) ?? stored.default;
    if (stored.type !== 'number' || typeof was !== 'number' || !Number.isFinite(by)) throw new EngineError(tr`«${field.label}» — не число: прибавить и отнять нечего`);
    const low = bound(run, holder.id, stored.min, tr`нижняя граница поля`);
    const high = bound(run, holder.id, stored.max, tr`верхняя граница поля`);
    const value = Math.min(high ?? Infinity, Math.max(low ?? -Infinity, was + by));
    return value === was ? false : putValue(run, holder, tag, value);
  },

  belonging(run, { sheetId, list, id, on, off, inst, add, in: host }, root) {
    const sheet = sheetOf(run, sheetId);
    const { system, compendium } = run.world;
    let next: Sheet;
    if (list === 'has') {
      if (!findRecord(compendium, id)) throw new EngineError(tr`в компендиуме нет записи «${id}»`);
      const owned = sheet.has ?? [];
      const keys = new Set(owned.map(keyOf));
      if (host && !keys.has(host)) throw new EngineError(tr`у листа нет вещи «${host}» — ставить некуда`);
      if (inst && !keys.has(inst)) throw new EngineError(tr`у листа нет вещи «${inst}»`);
      const mine = (entry: Owned): boolean => (inst ? keyOf(entry) === inst : entry.of === id);
      if (!inst && owned.filter(entry => entry.of === id).length > 1 && !(on && add)) {
        throw new EngineError(tr`у листа несколько «${findRecord(compendium, id)!.label}» — укажите, какой экземпляр`);
      }
      if (!on) {
        const gone = new Set(owned.filter(mine).map(keyOf));
        for (let grew = true; grew;) {
          grew = false;
          for (const entry of owned) if (entry.in && gone.has(entry.in) && !gone.has(keyOf(entry))) { gone.add(keyOf(entry)); grew = true; }
        }
        next = { ...sheet, has: owned.filter(entry => !gone.has(keyOf(entry))) };
      } else {
        const was = add ? undefined : owned.find(mine);
        const fresh: Owned = was ? { ...was } : { of: id };
        if (!was && (add || owned.some(entry => entry.of === id))) fresh.id = run.ext.id(root.phase('item').phase(id));
        if (off) fresh.off = true; else delete fresh.off;
        if (host !== undefined) {
          if (host === null) delete fresh.in;
          else {
            const byKey = new Map(owned.map(entry => [keyOf(entry), entry] as const));
            const seen = new Set<string>();
            for (let at: string | undefined = host; at && !seen.has(at); at = byKey.get(at)?.in) {
              if (at === keyOf(fresh)) throw new EngineError(tr`вещь не ставится сама в себя — ни прямо, ни через другую вещь`);
              seen.add(at);
            }
            fresh.in = host;
          }
        }
        next = { ...sheet, has: was ? owned.map(entry => (entry === was ? fresh : entry)) : [...owned, fresh] };
      }
    } else {
      const effect = findEffect(system, id);
      if (!effect) throw new EngineError(tr`система не объявляет эффекта «${id}»`);
      if (on && (effect.activation ?? 'manual') === 'manual') throw new EngineError(tr`активируемый эффект не вешают — его применяют действием`);
      const worn: WornEffect[] = [...(sheet.effects ?? [])];
      if (!on) {
        next = { ...sheet, effects: worn.filter(entry => entry.effectId !== id) };
      } else {
        const counted = run.durationOf(effect, sheet.id, {}, root.phase('belonging'), `«${effect.label ?? id}»`);
        const max = usesMax(effect, counted);
        const fresh: WornEffect = {
          effectId: id, ...expiryOf(effect, run.clock, counted), ...(max === null ? {} : { usesLeft: max }),
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
    if (of !== null && isDesk({ id: of })) throw new EngineError(tr`тип «стол» только у стола комнаты`);
    if (of !== null && !run.system.sheets?.[of]) throw new EngineError(tr`система не объявляет типа листа «${of}»`);
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
      if (!holder) throw new EngineError(tr`в комнате нет листа «${group}»`);
      if (group === sheetId) throw new EngineError(tr`лист не может быть группой самому себе`);
      if (isDesk(holder)) throw new EngineError(tr`стол и так общий для всех — группой его не назначают`);
      if (sheets.some(entry => entry.group === sheetId)) throw new EngineError(tr`«${sheet.name}» — группа для других листов, в группу её не поставить`);
      if (holder.group) throw new EngineError(tr`«${holder.name}» сам состоит в группе — группы не вкладываются`);
    }
    const { group: _was, ...rest } = sheet;
    void _was;
    const next: Sheet = group === null ? rest : { ...rest, group };
    run.state.write({ text: group === null ? tr`«${sheet.name}» вышел из группы` : tr`«${sheet.name}» теперь в группе «${sheets.find(entry => entry.id === group)!.name}»` });
    withinLimits(run, sheet, next);
    run.state.put(next);
    return true;
  },

  turn(run, { turn, order, who, seconds }, root) {
    const before = run.clock ?? { round: 0, order: [], active: null };
    const nameOf = (id: string) => run.sheet(id)?.name ?? id;
    const totalsOf = (rolls: InitiativeRoll[]) => Object.fromEntries(rolls.map(r => [r.sheetId, r.total]));
    let next: Clock = before;
    let events: MomentEvent[] | null = null;
    if (turn === 'start') {
      if (order?.length && who?.length) throw new EngineError(tr`либо бросок инициативы, либо порядок руками — не оба`);
      let line = order ?? [];
      let scores: Record<string, number> = {};
      if (line.length) {
        const unknown = line.find(id => !run.sheet(id));
        if (unknown) throw new EngineError(tr`в комнате нет листа «${unknown}»`);
      } else {
        const rolled = initiative(run, root, who?.length ? who : undefined);
        line = rolled.order;
        scores = totalsOf(rolled.rolls);
        if (rolled.rolls.length) {
          run.state.write({ text: tr`Инициатива: ${rolled.order.filter(id => id in scores).map(id => `${nameOf(id)} ${scores[id]}`).join(', ')}` });
        }
      }
      next = startCombat(before, line, scores);
      run.state.write({ text: tr`Раунд 1. Ход: ${nameOf(String(next.active))}` });
    } else if (turn === 'join') {
      if (!who?.length) throw new EngineError(tr`кто вступает в бой — не указано`);
      if (!inCombat(before)) throw new EngineError(tr`бой не идёт — вступать некуда`);
      const already = who.find(id => before.order.includes(id));
      if (already) throw new EngineError(tr`«${nameOf(already)}» уже в бою`);
      const ranked = Boolean(before.scores);
      const rolled = ranked ? initiative(run, root, who, 'join') : { order: who, rolls: [] };
      const scores = totalsOf(rolled.rolls);
      next = joinCombat(before, rolled.order, scores);
      for (const id of who) run.state.write({ text: id in scores ? tr`${nameOf(id)} вступает в бой: инициатива ${scores[id]}` : tr`${nameOf(id)} вступает в бой` });
      events = [];
    } else if (turn === 'leave') {
      if (!who?.length) throw new EngineError(tr`кто выходит из боя — не указано`);
      if (!inCombat(before)) throw new EngineError(tr`бой не идёт — выходить не из чего`);
      const stranger = who.find(id => !before.order.includes(id));
      if (stranger) throw new EngineError(tr`«${nameOf(stranger)}» не в бою`);
      for (const id of who) run.state.write({ text: tr`${nameOf(id)} выходит из боя` });
      if (before.order.every(id => who.includes(id))) {
        next = stopCombat(before);
        run.state.write({ text: tr`Бой окончен` });
        events = momentsOfTurn('stop', before, next, [...run.state.sheets]);
      } else {
        let moved = before;
        const passed: MomentEvent[] = [];
        while (moved.active && who.includes(String(moved.active))) {
          const step = nextTurn(moved);
          passed.push(...momentsOfTurn('next', moved, step, [...run.state.sheets])
            .filter(event => !(event.moment === 'turn-start' || event.moment === 'turn-end') || !who.includes(event.sheetId) || (event.moment === 'turn-end' && event.sheetId === before.active)));
          moved = step;
        }
        next = leaveCombat(moved, who);
        if (next.active !== before.active) {
          run.state.write({ text: next.round !== before.round ? tr`Раунд ${next.round}. Ход: ${nameOf(String(next.active))}` : tr`Ход: ${nameOf(String(next.active))}` });
        }
        events = [...passed, ...who.map(sheetId => ({ moment: 'combat-leave' as const, sheetId }))];
      }
    } else if (turn === 'next') {
      next = nextTurn(before);
      run.state.write({ text: next.round !== before.round ? tr`Раунд ${next.round}. Ход: ${nameOf(String(next.active))}` : tr`Ход: ${nameOf(String(next.active))}` });
    } else if (turn === 'stop') {
      next = stopCombat(before);
      run.state.write({ text: tr`Бой окончен` });
    } else if (turn === 'time') {
      const span = Math.max(0, Number(seconds ?? 0));
      if (!span) throw new EngineError(tr`сколько времени прошло — не указано`);
      next = passTime(before, span);
      run.state.write({ text: tr`Прошло ${spanText(span)}` });
    } else if (turn === 'short-rest' || turn === 'long-rest') {
      if (inCombat(before)) throw new EngineError(tr`в бою не отдыхают — сначала закончите бой`);
      run.state.write({ text: turn === 'long-rest' ? tr`Долгий отдых` : tr`Короткий отдых` });
    } else {
      run.state.write({ text: tr`Сцена закрыта` });
    }
    run.clock = next;
    const fired = events ?? momentsOfTurn(turn, before, next, [...run.state.sheets]);
    for (const [index, event] of fired.entries()) {
      if (index > 0 && fired[index - 1]!.moment === event.moment) continue;
      const subjects: string[] = [];
      for (let at = index; at < fired.length && fired[at]!.moment === event.moment; at += 1) subjects.push(fired[at]!.sheetId);
      run.moment(event.moment, subjects, root);
    }
    return true;
  },

  sheet(run, { name, of }, root) {
    if (of && !sheetKindOf(run.system, { of } as Sheet)) throw new EngineError(tr`в системе нет типа листа «${of}»`);
    const sheet = freshSheet(run.system, { id: run.ext.id(root.phase('id')), name, ...(of ? { of } : {}) });
    run.state.put(sheet);
    run.state.write({ text: tr`Лист «${name}» заведён` });
    return false;
  },

  drop(run, { sheetId }, root) {
    const sheet = sheetOf(run, sheetId);
    if (isDesk(sheet)) throw new EngineError(tr`стол комнаты не убирается`);
    if (inCombat(run.clock) && run.clock.order.includes(sheetId)) OPS.turn(run, { op: 'turn', turn: 'leave', who: [sheetId] }, root.phase('leave'));
    for (const other of run.state.sheets) {
      if (other.group !== sheetId) continue;
      const { group: _group, ...rest } = other;
      run.state.put(rest as Sheet);
      run.state.write({ text: tr`${other.name} выходит из группы «${sheet.name}»` });
    }
    run.state.drop(sheetId);
    run.state.write({ text: tr`Лист «${sheet.name}» убран` });
    return true;
  },
};

export { DESK_ID };
