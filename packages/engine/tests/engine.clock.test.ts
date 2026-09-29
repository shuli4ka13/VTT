import { group, test, eq, ok, deepEq, throws } from './harness.ts';
import {
  idleClock, inCombat, expiryOf, startCombat, stopCombat, nextTurn, rollInitiative,
} from '../src/engine/clock.ts';
import { fireMoments, momentsOfTurn } from '../src/events/moments.ts';
import type { TurnOp } from '../src/events/moments.ts';
import type { Clock } from '../src/engine/clock.ts';
import { exchange } from '../src/events/exchange.ts';
import { system, arven, mirra, compendium } from './fixtures.ts';

const queue = (...values: number[]) => {
  const rest = [...values];
  return () => {
    if (!rest.length) throw new Error('кубик бросили больше раз, чем ожидал тест');
    return rest.shift()!;
  };
};

const rounds = (max: number) => ({ label: 'На раунды', activation: 'passive', duration: { kind: 'rounds', max } }) as any;
const turns = (max: number) => ({ label: 'На ходы', activation: 'passive', duration: { kind: 'turns', max } }) as any;
const scene = () => ({ label: 'До конца сцены', activation: 'passive', duration: { kind: 'scene' } }) as any;
const forever = () => ({ label: 'Навсегда', activation: 'passive', duration: { kind: 'permanent' } }) as any;

const fighting = (): ReturnType<typeof startCombat> => startCombat(idleClock(), ['a', 'b']);
const sheet = (id: string, effects: Record<string, unknown>[] = []) => ({ id, values: {}, effects }) as any;

group('срок эффекта считается в момент наложения', () => {
  test('вне боя раунды и ходы не считаются: эффект висит как временный', () => {
    deepEq(expiryOf(rounds(2), idleClock()), {});
    deepEq(expiryOf(turns(1), idleClock()), {});
  });

  test('в бою «N раундов» становится абсолютным номером раунда', () => {
    const clock = { ...fighting(), round: 3 };
    deepEq(expiryOf(rounds(2), clock), { until: 5 });
  });

  test('«N ходов» — счётчик своих ходов', () => {
    deepEq(expiryOf(turns(1), fighting()), { turnsLeft: 1 });
  });

  test('«до конца сцены» помечается и вне боя', () => {
    deepEq(expiryOf(scene(), idleClock()), { scene: true });
  });

  test('«пока не снимут» — без пометок', () => {
    deepEq(expiryOf(forever(), fighting()), {});
  });

  test('«до конца боя» помечается только в бою', () => {
    const combat = { label: 'До конца боя', activation: 'passive', duration: { kind: 'combat' } } as any;
    deepEq(expiryOf(combat, fighting()), { combat: true });
    deepEq(expiryOf(combat, idleClock()), {});
  });
});

const durations = {
  x: { label: 'Икс', activation: 'passive', duration: { kind: 'turns', max: 1 } },
  y: { label: 'Игрек', activation: 'passive', duration: { kind: 'turns', max: 1 } },
  щит: { label: 'Щит', activation: 'passive', duration: { kind: 'turns', max: 1, ends: 'turn-start' } },
  помощь: { label: 'Помощь', activation: 'passive', duration: { kind: 'turns', max: 1, ends: 'turn-start', whose: 'source' } },
};
const lapseWorld = (clock: Clock) => ({ system: { id: 'с', fields: [], effects: durations } as any, compendium: { records: [] }, die: () => 1, clock });

const turn = (op: TurnOp, before: Clock, sheets: any[]) => {
  const after = op === 'next' ? nextTurn(before) : op === 'stop' ? stopCombat() : before;
  const run = fireMoments(momentsOfTurn(op, before, after, sheets), sheets, lapseWorld(after));
  return { clock: after, sheets: run.sheets, expired: run.expired ?? [] };
};

group('часы боя двигают ход, срок спадает на моментах', () => {
  test('бой начинается с первого в порядке, раунд первый', () => {
    const clock = fighting();
    ok(inCombat(clock));
    eq(clock.round, 1);
    eq(clock.active, 'a');
  });

  test('пустой порядок — бой не начать', () => {
    throws(() => startCombat(idleClock(), []), 'пуст');
  });

  test('следующий ход идёт по кругу, круг замкнулся — новый раунд', () => {
    const one = nextTurn(fighting());
    eq(one.active, 'b');
    eq(one.round, 1);
    const two = nextTurn(one);
    eq(two.active, 'a');
    eq(two.round, 2);
  });

  test('эффект на раунды спадает в начале указанного раунда, и только у кого истёк', () => {
    const sheets = [sheet('a', [{ effectId: 'x', until: 2 }]), sheet('b', [{ effectId: 'y', until: 3 }])];
    const one = turn('next', fighting(), sheets);
    deepEq(one.expired, [], 'раунд ещё первый');
    const two = turn('next', one.clock, one.sheets);
    deepEq(two.expired, [{ sheetId: 'a', effectId: 'x' }]);
    deepEq(two.sheets[0]!.effects, []);
    deepEq(two.sheets[1]!.effects, [{ effectId: 'y', until: 3 }]);
  });

  test('эффект на ходы тратится в конце хода владельца, чужие ходы его не трогают', () => {
    const sheets = [sheet('a', [{ effectId: 'x', turnsLeft: 1 }]), sheet('b', [{ effectId: 'y', turnsLeft: 1 }])];
    const one = turn('next', fighting(), sheets);
    deepEq(one.expired, [{ sheetId: 'a', effectId: 'x' }], 'ход a кончился — его эффект спал');
    deepEq(one.sheets[1]!.effects, [{ effectId: 'y', turnsLeft: 1 }], 'у b ход ещё не был');
  });

  test('эффект «до начала своего хода» спадает, когда ход владельца снова наступил', () => {
    const sheets = [sheet('a', [{ effectId: 'щит', turnsLeft: 1 }]), sheet('b')];
    const one = turn('next', fighting(), sheets);
    deepEq(one.expired, [], 'конец хода a щит не трогает');
    deepEq(one.sheets[0]!.effects, [{ effectId: 'щит', turnsLeft: 1 }]);
    const two = turn('next', one.clock, one.sheets);
    deepEq(two.expired, [{ sheetId: 'a', effectId: 'щит' }], 'начался новый ход a — щит спал');
    deepEq(two.sheets[0]!.effects, []);
  });

  test('«до начала хода того, кто наложил» считает ходы наложившего, а не носителя', () => {
    const sheets = [sheet('a'), sheet('b', [{ effectId: 'помощь', turnsLeft: 1, from: 'a' }])];
    const one = turn('next', fighting(), sheets);
    deepEq(one.expired, [], 'начался ход b — но наложил a');
    const two = turn('next', one.clock, one.sheets);
    deepEq(two.expired, [{ sheetId: 'b', effectId: 'помощь' }], 'начался ход a — помощь спала с b');
  });

  test('конец боя снимает раунды, ходы и «до конца боя», остальное не трогает', () => {
    const sheets = [sheet('a', [
      { effectId: 'x', until: 9 }, { effectId: 'y', turnsLeft: 3 }, { effectId: 'z', combat: true }, { effectId: 'w' },
    ]), sheet('b')];
    const out = turn('stop', fighting(), sheets);
    deepEq(out.sheets[0]!.effects, [{ effectId: 'w' }]);
    deepEq(out.expired.map(e => e.effectId), ['x', 'y', 'z']);
  });

  test('листы без изменений возвращаются теми же объектами — дельта только по делу', () => {
    const untouched = sheet('b');
    const one = turn('next', fighting(), [sheet('a'), untouched]);
    ok(one.sheets[1] === untouched);
  });

  test('вне боя следующий ход — ошибка словами', () => {
    throws(() => nextTurn(idleClock()), 'бой не идёт');
  });

  test('конец боя сбрасывает часы', () => {
    ok(!inCombat(stopCombat()));
  });

  test('конец сцены снимает только сценические эффекты', () => {
    const out = turn('scene', fighting(), [sheet('a', [{ effectId: 'x', scene: true }, { effectId: 'y' }])]);
    deepEq(out.sheets[0]!.effects, [{ effectId: 'y' }]);
    deepEq(out.expired, [{ sheetId: 'a', effectId: 'x' }]);
  });
});

group('инициатива — правило системы, не движка', () => {
  test('без объявленной инициативы порядок — как листы перечислены', () => {
    const bare: any = { ...system, initiative: undefined };
    deepEq(rollInitiative(bare, [arven, mirra], compendium, queue()).order, ['arven', 'mirra']);
  });

  test('с инициативой порядок по броску плюс бонус из формулы листа; правила комнаты доезжают', () => {
    const out = rollInitiative(system, [arven, mirra], compendium, queue(5, 15, 12));
    deepEq(out.order, ['mirra', 'arven']);
    deepEq(out.rolls[0]!.rolls, [5, 15], 'у Арвен кольчуга: правило «тяжёлый доспех мешает» дало помеху и на инициативу');
    deepEq(out.rolls[0]!.edits, ['Помеха']);
    eq(out.rolls[0]!.total < out.rolls[1]!.total, true);
  });

  test('правки броска на объявленный вид броска доезжают до инициативы', () => {
    const sys: any = {
      ...system,
      effects: { ...system.effects, alert: {
        label: 'Бдительный', activation: 'passive', duration: { kind: 'permanent' },
        modifiers: [{ kind: 'roll', target: 'roll:any', tags: ['проверка'], edit: 'advantage' }],
      } },
    };
    const keen = { ...mirra, effects: [{ effectId: 'alert' }] };
    const out = rollInitiative(sys, [keen], compendium, queue(3, 17));
    deepEq(out.rolls[0]!.rolls, [3, 17]);
    deepEq(out.rolls[0]!.edits, ['Преимущество']);
  });
});

group('ход в бою: наложенный эффект получает срок', () => {
  const sys: any = {
    ...system,
    effects: {
      ...system.effects,
      bless_action: { label: 'Благословить', activation: 'manual',
        steps: [{ type: 'status', mode: 'apply', effect: { const: 'timed' } }] },
      timed: { label: 'На два раунда', activation: 'passive', duration: { kind: 'rounds', max: 2 }, modifiers: [] },
    },
  };
  const book: any = { ...compendium, records: [...(compendium.records ?? []), { id: 'bless', rk: 'action', label: 'Благословить', bindings: [{ label: 'Благословить', effect: 'bless_action', args: {} }] }] };
  const cleric = { ...arven, records: ['bless'] };

  test('в третьем раунде «Благословлён» на два раунда получает until = 5', () => {
    const clock = { ...startCombat(idleClock(), ['arven', 'mirra']), round: 3 };
    const r = exchange({ system: sys, compendium: book, die: queue(), sheets: [cleric, mirra],
      actionId: 'bless:0', fromId: 'arven', toId: 'mirra', clock });
    deepEq(r.sheets.find(s => s.id === 'mirra')!.effects, [...mirra.effects, { effectId: 'timed', until: 5 }]);
  });

  test('вне боя тот же эффект висит без срока', () => {
    const r = exchange({ system: sys, compendium: book, die: queue(), sheets: [cleric, mirra],
      actionId: 'bless:0', fromId: 'arven', toId: 'mirra' });
    deepEq(r.sheets.find(s => s.id === 'mirra')!.effects, [...mirra.effects, { effectId: 'timed' }]);
  });
});
