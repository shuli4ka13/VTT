import { group, test, eq } from './harness.ts';
import { PLAYABLE_WORLDS } from '../src/model/systems.ts';
import { calc, newPass } from '../src/engine/calc.ts';
import { exchange } from './play.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const sr = PLAYABLE_WORLDS.find(w => (w.system as System).id === 'shadowrun6')!;
const system = sr.system as System;
const compendium = sr.compendium as Compendium;

const runner = (values: Record<string, unknown>, has: Sheet['has'] = []): Sheet => ({
  id: 'бег', systemId: 'shadowrun6', of: 'runner', name: 'Бегущий',
  values: { metatype: 'человек', body: 3, agility: 3, reaction: 3, strength: 3, willpower: 3, logic: 3, intuition: 3, charisma: 3, edge: 3, edge_left: 0, ...values },
  has, effects: [],
}) as unknown as Sheet;
const at = (sheet: Sheet, tag: string) => calc(system, sheet, tag, newPass(system, sheet, { compendium }));
const tape = (...faces: number[]) => { const rest = [...faces]; return () => rest.shift() ?? 2; };
const traceOf = (out: ReturnType<typeof exchange>, step: string) =>
  out.reports.flatMap(r => (r.report.trace ?? []) as { step: unknown; total?: number }[]).find(t => t.step === step)?.total;
const fire = (has: Sheet['has'], inputs: Record<string, string>, values: Record<string, unknown> = {}) => exchange({
  system, compendium, die: tape(), sheets: [runner({ agility: 4, 'skills.стрельба.rank': 5, ...values }, has), { ...runner({}), id: 'цель' } as Sheet],
  actionId: 'predator_vi:0', fromId: 'бег', toIds: ['цель'], inputs: { дистанция: 'близкая', ...inputs },
});

group('Shadowrun 6, глава «Снаряжение и импланты»: ситуации книжника (стр. 39, 108–109, 244–293)', () => {
  test('SR-GEAR-1 (стр. 282): сорт импланта множит Сущность — киберглаза 3 дельта 0,15, б/у 0,33', () => {
    const essence = (grade: string) => at(runner({}, [{ of: 'cybereyes', values: { rating: 3, grade } }]), 'essence') as number;
    eq(Math.round((6 - essence('дельта')) * 100) / 100, 0.15);
    eq(Math.round((6 - essence('б/у')) * 100) / 100, 0.33);
    eq(Math.round((6 - essence('стандарт')) * 100) / 100, 0.3);
  });

  test('SR-GEAR-2 (стр. 39): Сущность ниже целого — минус уровень Магии; ровно 5,0 — тоже минус один', () => {
    eq(at(runner({ magic: 5 }, [{ of: 'cybereyes', values: { rating: 1 } }]), 'magic'), 4);
    eq(at(runner({ magic: 5 }, [{ of: 'cybereyes', values: { rating: 1 } }, { of: 'cyberjack', values: { rating: 1 } }]), 'magic'), 3);
  });

  test('SR-GEAR-5 (стр. 108, 264–266): две брони не складываются — берётся большая; шлем сверху', () => {
    const both = runner({ body: 4 }, [{ of: 'armor_jacket' }, { of: 'armor_clothing' }, { of: 'helmet' }]);
    eq(at(both, 'defense_rating'), 4 + 4 + 1);
    eq(at(runner({ body: 4 }, [{ of: 'armor_clothing' }, { of: 'helmet' }]), 'defense_rating'), 4 + 2 + 1);
  });

  test('SR-GEAR-6 (стр. 109, 260): газоотвод гасит штраф КО до 0 и ДО до −2; СУ не меняет', () => {
    const vented = [{ of: 'predator_vi', id: 'ствол' }, { of: 'gas_vent', in: 'ствол' }] as Sheet['has'];
    eq(traceOf(fire([{ of: 'predator_vi' }], { режим: 'короткая очередь' }), 'атк'), 8);
    eq(traceOf(fire(vented, { режим: 'короткая очередь' }), 'атк'), 10);
    eq(traceOf(fire(vented, { режим: 'длинная очередь' }), 'атк'), 8);
    eq(traceOf(fire(vented, { режим: 'длинная очередь' }), 'ур'), 3 + 2);
  });

  test('SR-GEAR-7 (стр. 261–262): ПБОП — ЗА +2, СУ −1', () => {
    const apds = [{ of: 'predator_vi', id: 'ствол' }, { of: 'ammo_apds', in: 'ствол' }] as Sheet['has'];
    eq(traceOf(fire(apds, {}), 'атк'), 12);
    eq(traceOf(fire(apds, {}), 'ур'), 2);
  });

  test('SR-GEAR-8 (стр. 259–260, 285): лазерный прицел и смартган со смартлинком не складываются', () => {
    const laser = (wireless: boolean) => [{ of: 'colt_l36', id: 'ствол' }, { of: 'laser_sight', in: 'ствол', ...(wireless ? { values: { wireless: true } } : {}) }] as Sheet['has'];
    const colt = (has: Sheet['has'], values: Record<string, unknown> = {}) => traceOf(exchange({
      system, compendium, die: tape(), sheets: [runner({ agility: 4, 'skills.стрельба.rank': 5, ...values }, has), { ...runner({}), id: 'цель' } as Sheet],
      actionId: 'colt_l36:0', fromId: 'бег', toIds: ['цель'], inputs: { дистанция: 'близкая' },
    }), 'атк');
    const base = colt([{ of: 'colt_l36' }])!;
    eq(colt(laser(false)), base + 1);
    eq(colt(laser(true)), base + 2);
    const both = [...laser(true), { of: 'smartgun_external', in: 'ствол' }] as Sheet['has'];
    eq(colt(both, { smartlink: true }), base + 2);
  });

  test('SR-GEAR-bone (стр. 291): плотность костей добавляет рейтинг к сопротивлению физическому урону, оглушающему — нет', () => {
    const soakDice = (damage: 'физический' | 'оглушающий') => {
      const target = { ...runner({ body: 3 }, [{ of: 'bone_density', values: { rating: 2 } }]), id: 'цель' } as Sheet;
      const bare = { ...runner({ body: 3 }), id: 'цель' } as Sheet;
      const dice = (sheet: Sheet) => {
        const out = exchange({
          system, compendium, die: () => 6, sheets: [runner({ agility: 4, 'skills.стрельба.rank': 5, 'skills.ближний_бой.rank': 5 }, [{ of: damage === 'физический' ? 'predator_vi' : 'stun_baton' }]), sheet],
          actionId: damage === 'физический' ? 'predator_vi:0' : 'stun_baton:0', fromId: 'бег', toIds: ['цель'], inputs: damage === 'физический' ? { дистанция: 'близкая' } : {},
        });
        return out.reports.flatMap(r => (r.report.trace ?? []) as { step: unknown; rolls?: number[] }[]).find(entry => entry.step === 'сопротивление_бросок')?.rolls?.length as number;
      };
      return dice(target) - dice(bare);
    };
    eq(soakDice('физический'), 2);
    eq(soakDice('оглушающий'), 0);
  });

  test('Сырость (стр. 54): электрошоковый удар — сопротивление на 6 кубиков меньше, обычный — без штрафа', () => {
    const soakDice = (wet: boolean, baton: string) => {
      const target = { ...runner({ body: 8, reaction: 1, intuition: 1 }), id: 'цель', effects: wet ? [{ effectId: 'wet' }] : [] } as Sheet;
      const out = exchange({
        system, compendium, die: () => 6, sheets: [runner({ 'skills.ближний_бой.rank': 5, agility: 5 }, [{ of: baton }]), target],
        actionId: `${baton}:0`, fromId: 'бег', toIds: ['цель'], inputs: {},
      });
      return out.reports.flatMap(r => (r.report.trace ?? []) as { step: unknown; rolls?: number[] }[]).find(entry => entry.step === 'сопротивление_бросок')?.rolls?.length as number;
    };
    eq(soakDice(false, 'stun_baton') - soakDice(true, 'stun_baton'), 6);
    eq(soakDice(false, 'sap') - soakDice(true, 'sap'), 0);
  });
});
