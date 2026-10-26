import { group, test, eq, deepEq } from './harness.ts';
import { PLAYABLE_WORLDS } from '../src/model/systems.ts';
import { calc, newPass } from '../src/engine/calc.ts';
import { exchange } from './play.ts';
import { perform } from '../src/core/perform.ts';
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

  test('SR-GEAR-reflex (стр. 293): Датчик рефлексов добавляет 1 к рангу навыка, набор растёт на 1', () => {
    const rank = (ranked: number, withSensor: boolean) => {
      const sheet = runner({ agility: 3, 'skills.стрельба.rank': ranked }, withSensor ? [{ of: 'reflex_recorder', values: { skill: 'стрельба' } }] : []);
      return [at(sheet, 'skills.стрельба.rank'), at(sheet, 'skills.стрельба.pool')];
    };
    deepEq(rank(3, true), [4, 7]);
    deepEq(rank(3, false), [3, 6]);
    eq(rank(0, true)[0], 1);
  });

  const toxin = (vector: string) => {
    const base = compendium.records.find(r => r.id === 'tox_gamma_scopolamine')!;
    return { ...base, id: 'tox_probe', cells: { ...(base.cells as Record<string, unknown>), vector } };
  };
  const poisoned = (vector: string, victim: Sheet, die: () => number) => exchange({
    system, compendium: { ...compendium, records: [...compendium.records, toxin(vector)] } as Compendium, die,
    sheets: [runner({}, [{ of: 'tox_probe' }]), victim], actionId: 'tox_probe:0', fromId: 'бег', toIds: ['цель'],
  });
  const resistDice = (out: ReturnType<typeof exchange>) =>
    out.reports.flatMap(r => (r.report.trace ?? []) as { step: unknown; rolls?: number[] }[]).find(entry => entry.step === 'стойкость')?.rolls?.length as number;

  test('SR-DRUG-respirator (стр. 280): респиратор 3 даёт +3 кубика против вдыхаемого, против инъекционного — нет', () => {
    const wearer = (vector: string, mask: boolean) => resistDice(poisoned(vector, { ...runner({}, mask ? [{ of: 'surv_respirator', values: { rating: 3 } }] : []), id: 'цель' } as Sheet, () => 2));
    eq(wearer('вдыхаемый', true) - wearer('вдыхаемый', false), 3);
    eq(wearer('инъекционный', true) - wearer('инъекционный', false), 0);
  });

  test('SR-DRUG-over (стр. 122): сила 12 против 12 успехов — эффектов нет, против 11 — Неподвижность и Ошеломление', () => {
    const victim = () => ({ ...runner({ body: 6, willpower: 6 }), id: 'цель' }) as Sheet;
    const tapeOf = (hits: number) => { const faces = [...Array(hits).fill(6), ...Array(12 - hits).fill(1)] as number[]; return () => faces.shift() ?? 1; };
    const clean = poisoned('инъекционный', victim(), tapeOf(12)).sheets.find(s => s.id === 'цель')!;
    eq(clean.effects.some(e => e.effectId === 'immobilized' || e.effectId === 'dazed'), false);
    const hit = poisoned('инъекционный', victim(), tapeOf(11)).sheets.find(s => s.id === 'цель')!;
    eq(['immobilized', 'dazed'].every(id => hit.effects.some(e => e.effectId === id)), true);
  });

  const dropEffect = (sheet: Sheet, effectId: string) => {
    const out = perform({ system, compendium, clock: null, sheets: [sheet], die: () => 1 }, { op: 'belonging', sheetId: sheet.id, list: 'effects', id: effectId, on: false } as never);
    if (out.kind !== 'done') throw new Error(out.kind);
    return out.sheets[0]!;
  };
  const withEffect = (sheet: Sheet, effectId: string, args: Record<string, unknown>) => ({ ...sheet, effects: [...sheet.effects, { effectId, args }] }) as Sheet;

  test('SR-DRUG-kamikaze (стр. 125): отходняк — Реакция −1, Воля −1, Утомление II и 6 оглушающего на вдвое больший срок; ломка снимает своё Утомление', () => {
    const fresh = runner({});
    const crashed = dropEffect(withEffect(fresh, 'dg_kamikaze', { dur: 30 }), 'dg_kamikaze');
    eq(crashed.values.stun, 6);
    eq(crashed.effects.find(e => e.effectId === 'dg_kamikaze_crash')?.args?.dur, 60);
    eq(crashed.effects.find(e => e.effectId === 'fatigued')?.args?.level, 2);
    eq(at(crashed, 'reaction'), (at(fresh, 'reaction') as number) - 1);
    eq(at(crashed, 'willpower'), (at(fresh, 'willpower') as number) - 1);
    const done = dropEffect(crashed, 'dg_kamikaze_crash');
    eq(done.effects.some(e => e.effectId === 'fatigued'), false);
  });

  test('SR-DRUG-nitro (стр. 125): Нитро — Внимание +2; отходняк — 9 оглушающего и −2 кубика всем проверкам, включая сопротивление, на срок эффекта', () => {
    const fresh = runner({});
    eq(at(withEffect(fresh, 'dg_nitro', { dur: 30 }), 'skills.внимание.pool'), (at(fresh, 'skills.внимание.pool') as number) + 2);
    const crashed = dropEffect(withEffect(fresh, 'dg_nitro', { dur: 30 }), 'dg_nitro');
    eq(crashed.values.stun, 9);
    eq(crashed.effects.find(e => e.effectId === 'dg_nitro_crash')?.args?.dur, 30);
    const dice = (sheet: Sheet, tag: string) => {
      const out = perform({ system, compendium, clock: null, sheets: [sheet], die: () => 6 }, { op: 'roll', sheetId: sheet.id, tag } as never);
      if (out.kind !== 'done') throw new Error(out.kind);
      return (/\[([^\]]*)\]/.exec(out.log.join('\n'))?.[1] ?? '').split(',').filter(Boolean).length;
    };
    eq(dice(fresh, 'skills.внимание.pool') - dice(crashed, 'skills.внимание.pool'), 2);
    const soak = (target: Sheet) => {
      const out = exchange({ system, compendium, die: () => 6, sheets: [runner({ agility: 4, 'skills.стрельба.rank': 5 }, [{ of: 'predator_vi' }]), { ...target, id: 'цель' } as Sheet], actionId: 'predator_vi:0', fromId: 'бег', toIds: ['цель'], inputs: { дистанция: 'близкая' } });
      return out.reports.flatMap(r => (r.report.trace ?? []) as { step: unknown; rolls?: number[] }[]).find(entry => entry.step === 'сопротивление_бросок')?.rolls?.length as number;
    };
    eq(soak(fresh) - soak({ ...crashed, effects: crashed.effects.filter(e => e.effectId !== 'fatigued') } as Sheet), 2);
  });

  test('SR-DRUG-longway (стр. 125): конец «Долгого пути» не наносит 12 оглушающего, даёт Утомление I', () => {
    const crashed = dropEffect(withEffect(runner({}), 'dg_long_way', { dur: 30 }), 'dg_long_way');
    eq(Number(crashed.values.stun ?? 0), 0);
    eq(crashed.effects.find(e => e.effectId === 'fatigued')?.args?.level ?? 1, 1);
  });
});

