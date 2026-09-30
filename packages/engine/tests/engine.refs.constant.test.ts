import { group, test, eq } from './harness.ts';
import { packRef } from '../src/engine/refs.ts';
import { newPass } from '../src/engine/calc.ts';
import type { System, Sheet } from '../src/model/types.ts';

group('ссылка на кость системы понимается везде', () => {
  test('{ constant } даёт запись кости, как если бы её вписали числом', () => {
    const system = { id: 's', name: 's', tables: {}, effects: {}, constants: { hit: { kind: 'die', label: 'Кость', dice: [{ count: 2, sides: 6 }] } } } as unknown as System;
    const sheet = { id: 'h', systemId: 's', name: 'h', values: {}, has: [], effects: [] } as Sheet;
    eq(JSON.stringify(packRef({ constant: 'hit' }, { pass: newPass(system, sheet) })), JSON.stringify({ const: '2d6' }));
  });
});
