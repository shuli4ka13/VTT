import { group, test, deepEq } from './harness.ts';
import { lifecycleChanges } from '../src/events/lifecycle.ts';
import type { System, Sheet } from '../src/model/types.ts';

const system = {
  id: 'x', name: 'x', tables: { лист: { shape: 'single', columns: [] } },
  effects: { доза: { label: 'Доза', activation: 'passive', duration: { kind: 'permanent' }, reapply: 'stack', params: [{ key: 'что', kind: 'text' }] } },
} as unknown as System;
const sheet = (effects: object[]): Sheet => ({ id: 'я', systemId: 'x', name: 'я', values: {}, has: [], effects } as unknown as Sheet);

group('появилось и ушло — по экземпляру', () => {
  test('из двух доз ушла первая — «при спадании» получает её входы', () => {
    const a = { effectId: 'доза', inst: 'а', args: { что: 'джаз' } };
    const b = { effectId: 'доза', inst: 'б', args: { что: 'нитро' } };
    const out = lifecycleChanges([sheet([a, b])], [sheet([b])], { system });
    deepEq(out.map(c => [c.turn, c.entry.args]), [['detach', { что: 'джаз' }]]);
  });
});
