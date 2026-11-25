import { describe, it, expect } from 'vitest';
import { SAMPLE_WORLDS } from '@vtt/engine/samples';
import type { Sheet, System } from '@vtt/schema';
import { dryRun } from './dry-run.ts';

const world = SAMPLE_WORLDS[0]!;
const system = world.system as unknown as System;
const sheetOf = (id: string): Sheet => world.sheets.find(sheet => sheet.id === id) as unknown as Sheet;

describe('проба на листах образца', () => {
  it('висящий «Щит» со staged: отчёты есть, отказа нет', () => {
    const out = dryRun(system, world.compendium as never, 'shield', 'avg', [sheetOf('mirra'), sheetOf('goblin')], { handler: 0 });
    expect(out.trouble).toBeNull();
    expect(out.reports.length).toBeGreaterThan(0);
  });

  it('«Атака» без staged работает как раньше', () => {
    const out = dryRun(system, world.compendium as never, 'strike', 'max', [sheetOf('arven'), sheetOf('goblin')]);
    expect(out.trouble).toBeNull();
    expect(out.reports.length).toBeGreaterThan(0);
    expect(out.lines.length).toBeGreaterThan(0);
  });

  it('отказ — словами движка и пустые отчёты', () => {
    const out = dryRun(system, world.compendium as never, 'shield', 'avg', [sheetOf('arven'), sheetOf('goblin')], { handler: 0 });
    expect(out.trouble).toContain('нет ячейки');
    expect(out.reports).toEqual([]);
  });
});
