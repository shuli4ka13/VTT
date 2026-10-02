import { describe, it, expect } from 'vitest';
import { SAMPLE_WORLDS } from '../src/model/systems.ts';
import { flattenSystem } from '../src/model/inherit.ts';
import { idleClock, startCombat, nextTurn, stopCombat } from '../src/engine/clock.ts';
import { fireMoments, momentsOfTurn, describeMoment } from '../src/events/moments.ts';
import { settle } from '../src/events/settle.ts';
import { initiativeSeen, checkSeen } from '../src/lang/check.ts';
import { fieldCheck } from '../src/engine/check.ts';
import { effectLabelOf } from '../src/events/actions.ts';
import { fieldsOf } from '../src/model/sheet-columns.ts';
import { perform } from '../src/core/perform.ts';
import type { Clock } from '../src/engine/clock.ts';
import type { TurnOp } from '../src/events/moments.ts';
import type { Sheet, System, Compendium, Die } from '../src/model/types.ts';

const dice = (): Die => {
  const seen = new Map<number, number>();
  return sides => {
    const n = seen.get(sides) ?? 0;
    seen.set(sides, n + 1);
    return ((n * 7 + 3) % sides) + 1;
  };
};

function oldTurn(system: System, compendium: Compendium, sheets: Sheet[], clock: Clock, op: TurnOp) {
  const die = dice();
  const nameOf = (id: string) => sheets.find(s => s.id === id)?.name ?? id;
  const lines: string[] = [];
  let after = sheets;
  let next = clock;
  if (op === 'start') {
    const rolled = initiativeSeen({ system, compendium, die }, after);
    after = rolled.sheets.length ? sheets.map(s => rolled.sheets.find(r => r.id === s.id) ?? s) : after;
    lines.push(...rolled.lines);
    if (rolled.rolls.length) lines.push(`Инициатива: ${rolled.rolls.slice().sort((a, b) => b.total - a.total).map(r => `${nameOf(r.sheetId)} ${r.total}`).join(', ')}`);
    next = startCombat(clock, rolled.order);
    lines.push(`Раунд 1. Ход: ${nameOf(String(next.active))}`);
  } else if (op === 'next') {
    next = nextTurn(clock);
    lines.push(next.round !== clock.round ? `Раунд ${next.round}. Ход: ${nameOf(String(next.active))}` : `Ход: ${nameOf(String(next.active))}`);
  } else if (op === 'stop') {
    next = stopCombat();
    lines.push('Бой окончен');
  } else if (op === 'short-rest' || op === 'long-rest') {
    lines.push(op === 'long-rest' ? 'Долгий отдых' : 'Короткий отдых');
  } else {
    lines.push('Сцена закрыта');
  }
  const world = { system, compendium, die, clock: next };
  const fired = fireMoments(momentsOfTurn(op, clock, next, after), after, world);
  after = fired.sheets;
  for (const e of fired.expired ?? []) lines.push(`«${effectLabelOf(system, e.effectId)}» спало с ${nameOf(e.sheetId)}`);
  for (const entry of fired.reports) lines.push(describeMoment(world, entry, after));
  const done = settle(sheets, after, world);
  for (const entry of done.aftermath) {
    if (entry.kind === 'fired') { lines.push(describeMoment(world, entry, done.sheets)); continue; }
    lines.push(`«${effectLabelOf(system, entry.effectId)}» спало с ${done.sheets.find(s => s.id === entry.sheetId)?.name ?? entry.sheetId}: держать стало нечем`);
  }
  return { sheets: done.sheets.map(s => ({ id: s.id, values: s.values, effects: s.effects })), clock: next, log: lines };
}

const strip = (sheets: Sheet[]) => sheets.map(s => ({ id: s.id, values: s.values, effects: (s.effects ?? []).map(({ inst: _inst, ...rest }: Record<string, unknown>) => rest) }));

for (const sample of SAMPLE_WORLDS) {
  const system = flattenSystem(sample.system);
  const compendium = sample.compendium;
  describe(`ход, два ядра: ${system.id}`, () => {
    it('начало боя, ходы по кругу, конец боя, отдых и сцена', () => {
      const diffs: string[] = [];
      let sheetsOld: Sheet[] = sample.sheets;
      let clock: Clock = idleClock();
      const ops: TurnOp[] = ['start', ...Array.from({ length: sample.sheets.length + 2 }, () => 'next' as const), 'stop', 'short-rest', 'long-rest', 'scene'];
      for (const op of ops) {
        const old = oldTurn(system, compendium, sheetsOld, clock, op);
        const fresh = perform({ system, compendium, clock, sheets: sheetsOld, die: dice(), mode: 'trial' }, { op: 'turn', turn: op });
        if (fresh.kind !== 'done') throw new Error('ход встал на вопрос');
        const now = { sheets: strip(fresh.sheets).filter(s => old.sheets.some(o => o.id === s.id)), clock: fresh.clock, log: fresh.log };
        const was = { ...old, sheets: strip(old.sheets as Sheet[]) };
        if (JSON.stringify(now) !== JSON.stringify(was)) diffs.push(`${op}\n  было: ${JSON.stringify(was).slice(0, 900)}\n  стало: ${JSON.stringify(now).slice(0, 900)}`);
        sheetsOld = old.sheets as Sheet[];
        clock = old.clock;
      }
      expect(diffs.length, diffs.slice(0, 3).join('\n')).toBe(0);
    });

    it('бросок по каждому полю с броском — как раньше', () => {
      const diffs: string[] = [];
      for (const field of fieldsOf(system).filter(f => f.roll)) {
        for (const sheet of sample.sheets.filter((s: Sheet) => s.id !== 'стол')) {
          let check;
          try { check = fieldCheck(system, field.tag); } catch { continue; }
          let old: { sheets: unknown; total: number } | { error: string };
          try {
            const seen = checkSeen({ system, compendium, die: dice() }, sample.sheets, sheet.id, check, check.label);
            old = { sheets: seen.sheets.length, total: seen.total };
          } catch (err) { old = { error: (err as Error).message }; }
          let now: typeof old;
          try {
            const out = perform({ system, compendium, clock: null, sheets: sample.sheets, die: dice(), mode: 'trial' }, { op: 'roll', sheetId: sheet.id, tag: field.tag });
            const line = out.log[0] ?? '';
            now = { sheets: 0, total: Number(/(?:= |успехов: )(-?\d+)$/.exec(line)?.[1]) };
          } catch (err) { now = { error: (err as Error).message }; }
          const comparable = 'total' in old && 'total' in now ? old.total === now.total : JSON.stringify(old) === JSON.stringify(now);
          if (!comparable) diffs.push(`${sheet.id} · ${field.tag}: было ${JSON.stringify(old)}, стало ${JSON.stringify(now)}`);
        }
      }
      expect(diffs.length, diffs.slice(0, 5).join('\n')).toBe(0);
    });
  });
}
