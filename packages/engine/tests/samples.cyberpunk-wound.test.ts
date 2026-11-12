import { describe, it, expect } from 'vitest';
import { SAMPLE_WORLDS } from '../src/model/systems.ts';
import { flattenSystem } from '../src/model/inherit.ts';
import { perform } from '../src/core/perform.ts';
import { exchange } from './play.ts';
import type { Sheet } from '../src/model/types.ts';

const world = SAMPLE_WORLDS.find(one => one.system.id === 'cp-slice')!;
const system = flattenSystem(world.system);

const shooter = (hp: number): Sheet[] => world.sheets.map(sheet => sheet.id === 'silver'
  ? { ...sheet, values: { ...sheet.values, hp } } as Sheet
  : sheet);

const shotTotal = (sheets: Sheet[]): number => {
  const played = exchange({
    system, compendium: world.compendium, die: () => 7, sheets,
    actionId: 'heavy-pistol:0', fromId: 'silver', toId: 'raze',
    inputs: { distance: 10, spend_luck: 0, aim: '' },
  } as never);
  const line = played.log.join('\n').match(/Бросок \([^)]*\): \[7\][^\n]*= (-?\d+)(?:\n|$)/);
  if (!line) throw new Error('бросок атаки не найден в журнале');
  return Number(line[1]);
};

const clickTotal = (sheets: Sheet[]): number => {
  const out = perform({ system, compendium: world.compendium, clock: null, sheets, die: () => 7 } as never,
    { op: 'roll', sheetId: 'silver', tag: 'skills.пистолеты.total' } as never);
  if (out.kind !== 'done') throw new Error('бросок спросил');
  const line = out.log.join('\n').match(/бросает[^\n]*= (-?\d+)(?:\n|$)/);
  if (!line) throw new Error('бросок не найден в журнале');
  return Number(line[1]);
};

describe('Киберпанк RED: тяжёлая рана', () => {
  it('атака в эффекте: минус два один раз', () => {
    expect(shotTotal(shooter(45)) - shotTotal(shooter(1))).toBe(2);
  });

  it('щелчок по навыку с листа: минус два один раз', () => {
    expect(clickTotal(shooter(45)) - clickTotal(shooter(1))).toBe(2);
  });
});
