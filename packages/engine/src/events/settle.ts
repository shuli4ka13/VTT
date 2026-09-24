import { EngineError } from '../engine/errors.ts';
import { sweepBonds } from './bonds.ts';
import type { BondBreak } from './bonds.ts';
import { fireLifecycle } from './lifecycle.ts';
import { fireCrossings } from './moments.ts';
import type { Fired } from './moments.ts';
import type { WorldContext } from './envelope.ts';
import type { Sheet } from '../model/types.ts';

export type Aftermath = ({ kind: 'fired' } & Fired) | ({ kind: 'broken' } & BondBreak);

const MAX_ROUNDS = 8;

export function settle(before: Sheet[], after: Sheet[], world: WorldContext): { sheets: Sheet[]; aftermath: Aftermath[] } {
  const aftermath: Aftermath[] = [];
  let hookedFrom = before;
  let crossedFrom = before;
  let current = after;

  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const hooked = fireLifecycle(hookedFrom, current, world);
    const crossed = fireCrossings(crossedFrom, hooked.sheets, world);
    const swept = sweepBonds(world.system, crossed.sheets);
    aftermath.push(
      ...hooked.reports.map(fired => ({ kind: 'fired' as const, ...fired })),
      ...crossed.reports.map(fired => ({ kind: 'fired' as const, ...fired })),
      ...swept.broken.map(broken => ({ kind: 'broken' as const, ...broken })),
    );
    if (!crossed.reports.length && !swept.broken.length) return { sheets: swept.sheets, aftermath };
    hookedFrom = hooked.sheets;
    crossedFrom = crossed.sheets;
    current = swept.sheets;
  }
  throw new EngineError(`наложения, поля и связи будят друг друга без остановки: больше ${MAX_ROUNDS} кругов`);
}
