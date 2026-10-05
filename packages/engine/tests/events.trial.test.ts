import { group, test, eq, ok, throws } from './harness.ts';
import { trial, dieOf, mannequin, sampleArg } from '../src/events/trial.ts';
import { PLAYABLE_WORLDS as SAMPLE_WORLDS } from '../src/model/systems.ts';
import { activationOf, isPipeline, calledOf } from '../src/engine/effects.ts';
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
    const called = new Set(calledOf(system).map(([key]) => key));
    const manual = Object.entries(system.effects)
      .filter(([key, e]) => isPipeline(e) && activationOf(e) === 'manual' && !called.has(key));

    test(`${system.name}: каждый активируемый эффект (${manual.length}) проходит пробу без ошибок движка`, () => {
      const people = ((world.sheets ?? []) as Sheet[]).filter(sheet => sheet.id !== 'стол');
      const a = people[0] ?? mannequin(system, 'проба-а', 'А');
      const b = people[1] ?? mannequin(system, 'проба-б', 'Б');
      for (const [id] of manual) {
        for (const dice of ['min', 'avg', 'max'] as const) {
          let out: ReturnType<typeof trial>;
          try { out = trial({ system, compendium, effectId: id, from: a, to: b, dice }); } catch (err) {
            ok(/не состоялось/.test((err as Error).message), `${id}/${dice}: ${(err as Error).message}`);
            continue;
          }
          ok(out.lines.length >= 1, `${id}/${dice}: нет строк журнала`);
          ok(out.lines[0]!.includes(`${a.name} применяет`), `${id}/${dice}: ${out.lines[0]}`);
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
    ok(!('__проба' in (system.tables ?? {})), 'исходная система не тронута');
  });

  test('висящий на листе — отказ словами', () => {
    const system = SAMPLE_WORLDS[0]!.system as System;
    const a = mannequin(system, 'а', 'А');
    throws(() => trial({ system, effectId: 'blessed', from: a, to: a }), 'висит на листе');
    throws(() => trial({ system, effectId: 'dying', from: a, to: a }), 'висит на листе');
    throws(() => trial({ system, effectId: 'нету', from: a, to: a }), 'нету');
  });

  test('образцы аргументов по виду входы', () => {
    const system = SAMPLE_WORLDS[0]!.system as System;
    eq(sampleArg('dice', system), '1к6');
    eq(sampleArg('number', system), 1);
    eq(typeof sampleArg('effect', system), 'string');
  });
});
