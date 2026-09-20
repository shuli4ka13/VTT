import { group, test, eq, ok, throws } from './harness.ts';
import { trial, dieOf, mannequin, sampleArg } from '../src/events/trial.ts';
import { SAMPLE_WORLDS } from '../src/model/systems.ts';
import { activationOf, isPipeline } from '../src/engine/effects.ts';
import type { System, Compendium, Sheet } from '../src/model/types.ts';

group('пробный прогон эффекта на манекенах', () => {
  test('кости трёх режимов предсказуемы', () => {
    eq(dieOf('min')(20), 1);
    eq(dieOf('max')(20), 20);
    eq(dieOf('avg')(20), 11);
    eq(dieOf('avg')(6), 4);
    eq(dieOf('random', () => 0.999)(6), 6);
    eq(dieOf('random', () => 0)(6), 1);
  });

  for (const world of SAMPLE_WORLDS) {
    const system = world.system as System;
    const compendium = world.compendium as Compendium;
    const manual = Object.entries(system.effects).filter(([, e]) => isPipeline(e) && activationOf(e) === 'manual');

    test(`${system.name}: каждый активируемый эффект (${manual.length}) проходит пробу без ошибок движка`, () => {
      const a = mannequin(system, 'проба-а', 'А');
      const b = mannequin(system, 'проба-б', 'Б');
      for (const [id] of manual) {
        for (const dice of ['min', 'avg', 'max'] as const) {
          const out = trial({ system, compendium, effectId: id, from: a, to: b, dice });
          ok(out.lines.length >= 1, `${id}/${dice}: нет строк журнала`);
          ok(out.lines[0]!.includes('А применяет'), `${id}/${dice}: ${out.lines[0]}`);
        }
      }
    });
  }

  test('образцовый лист вместо манекена: удар Арвен по Мирре с максимумом на костях меняет хиты', () => {
    const world = SAMPLE_WORLDS[0]!;
    const system = world.system as System;
    const [arven, mirra] = world.sheets as Sheet[];
    const out = trial({ system, compendium: world.compendium as Compendium, effectId: 'strike', from: arven!, to: mirra!, dice: 'max', args: { damage_dice: '1d8' } });
    const after = out.sheets.find(s => s.id === mirra!.id)!;
    ok(Number(after.values.hp_current) < Number(mirra!.values.hp_current), out.lines.join('\n'));
    ok(!('__проба' in (system.records ?? {})), 'исходная система не тронута');
  });

  test('пассивный и срабатывающий сам — отказ словами', () => {
    const system = SAMPLE_WORLDS[0]!.system as System;
    const a = mannequin(system, 'а', 'А');
    throws(() => trial({ system, effectId: 'shield_up', from: a, to: a }), 'пассивный');
    throws(() => trial({ system, effectId: 'thorns', from: a, to: a }), 'срабатывает сам');
    throws(() => trial({ system, effectId: 'нету', from: a, to: a }), 'нету');
  });

  test('образцы аргументов по виду потребности', () => {
    const system = SAMPLE_WORLDS[0]!.system as System;
    eq(sampleArg('dice', system), '1к6');
    eq(sampleArg('number', system), 1);
    eq(typeof sampleArg('effect', system), 'string');
  });
});
