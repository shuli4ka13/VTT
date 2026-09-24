import { group, test, ok } from './harness.ts';
import { exchange } from '../src/events/exchange.ts';
import { calcAll, newPass } from '../src/engine/calc.ts';
import { randomDie } from '../src/engine/dice.ts';
import { system, compendium, sheets, arven, mirra } from './fixtures.ts';

const ms = (work: () => void): number => {
  let best = Infinity;
  for (let run = 0; run < 3; run++) {
    const started = performance.now();
    work();
    best = Math.min(best, performance.now() - started);
  }
  return best;
};

group('бюджет времени — страховка от регрессий', () => {
  test('300 ходов с ответками укладываются в полсекунды', () => {
    const took = ms(() => {
      for (let i = 0; i < 300; i++) {
        exchange({
          system, compendium, die: randomDie, sheets,
          actionId: 'longsword-item:0', fromId: arven.id, toId: mirra.id,
        });
      }
    });
    ok(took < 500, `300 ходов заняли ${Math.round(took)} мс`);
  });

  test('1000 полных пересчётов листа укладываются в полсекунды', () => {
    const took = ms(() => {
      for (let i = 0; i < 1000; i++) {
        calcAll(system, arven, newPass(system, arven, { compendium }));
      }
    });
    ok(took < 500, `1000 пересчётов заняли ${Math.round(took)} мс`);
  });
});
