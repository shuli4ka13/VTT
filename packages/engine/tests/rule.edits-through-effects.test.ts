import { group, test, eq, deepEq } from './harness.ts';
import { packRule, resolveRule } from '../src/engine/rule.ts';
import { newPass } from '../src/engine/calc.ts';

// Вопрос Влада: механики РАЗНЫХ систем правда доезжают через эффекты — или
// эффектом можно повесить только преимущество д&д-шного вида?
//
// Ответ обязан быть в тесте, а не в объяснении: один и тот же пассивный
// эффект несёт ссылку на запись словаря, а запись бывает какой угодно —
// ступень кости (Savage Worlds), лишняя кость в пул (Blades), сдвиг порога
// (GURPS), взрыв (Savage Worlds, Cyberpunk). Движок ни одну из них не знает
// лично, эффект — тем более: он называет запись и всё.

const queue = (...values: number[]) => {
  const rest = [...values];
  return () => {
    if (!rest.length) throw new Error('кубик бросили больше раз, чем ожидал тест');
    return rest.shift()!;
  };
};

const passive = (label: string, edit: string) => ({
  label, activation: 'passive', duration: { kind: 'permanent' },
  modifiers: [{ kind: 'roll', target: 'проверка', edit, condition: null }],
});

// Мир, устроенный НЕ как д&д: кость к6, чтение — сумма, порог 8.
const world = (edits: Record<string, unknown>, effects: string[]) => ({
  id: 'чужой-мир',
  fields: [],
  rolls: [{ tag: 'проверка', label: 'Проверка' }],
  constants: { кость: { label: 'Кость черты', kind: 'die', dice: [{ count: 1, sides: 6 }] } },
  roll_edits: edits,
  effects: Object.fromEntries(effects.map(e => [e, passive(e, e)])),
});

const sheet = (effects: string[]) => ({ id: 'герой', values: {}, effects: effects.map(effectId => ({ effectId })) });

const rule = {
  steps: [{
    id: 'try', type: 'threshold',
    roll: { die: { constant: 'кость' }, bonus: { const: 0 }, check: 'проверка' },
    versus: { const: 8 },
  }],
};

const run = (sys: any, sh: any, ...dice: number[]) => {
  const ctx = () => ({
    system: sys, sheet: sh, params: {}, item: null,
    die: queue(...dice), pass: newPass(sys, sh, { compendium: { items: [] } }),
  });
  return resolveRule(packRule(rule, ctx()), ctx());
};

group('механики разных систем доезжают через эффект', () => {
  test('Savage Worlds: эффект даёт ступень кости — бросается к8 вместо к6', () => {
    const sys = world({ ступень: { label: 'Мастерство', ops: [{ op: 'dieStep', by: 1 }] } }, ['ступень']);
    const asked: number[] = [];
    const spy = (sides: number) => { asked.push(sides); return 5; };
    const ctx = () => ({
      system: sys, sheet: sheet(['ступень']), params: {}, item: null,
      die: spy, pass: newPass(sys, sheet(['ступень']), { compendium: { items: [] } }),
    });
    resolveRule(packRule(rule, ctx()), ctx());
    eq(asked[0], 8, 'эффект сменил величину кости, не трогая систему');
  });

  test('Blades: эффект добавляет кость в пул', () => {
    const sys = world({ помощь: { label: 'Помощь напарника', ops: [{ op: 'addDie' }] } }, ['помощь']);
    const r = run(sys, sheet(['помощь']), 2, 6);
    deepEq(r.trace[0].rolls, [2, 6], 'костей стало две');
    eq(r.results.try.total, 8, 'чтение мира — сумма, значит сумма обеих');
  });

  test('GURPS: эффект сдвигает порог, а не кости', () => {
    const sys = world({ фора: { label: 'Фора', ops: [{ op: 'shiftVersus', by: -3 }] } }, ['фора']);
    const без = run(world({}, []), sheet([]), 6);
    const с = run(sys, sheet(['фора']), 6);
    eq(без.results.try.success, false, '6 против 8 — не дотянул');
    eq(с.results.try.success, true, 'порог стал 5 — тот же бросок прошёл');
    deepEq(с.trace[0].rolls, [6], 'кости не тронуты');
  });

  test('Savage Worlds: эффект делает кость взрывной — правка РЕЗУЛЬТАТА', () => {
    const sys = world({ взрыв: { label: 'Взрывная кость', ops: [{ op: 'explode' }] } }, ['взрыв']);
    const r = run(sys, sheet(['взрыв']), 6, 6, 3);
    eq(r.results.try.total, 15, '6 + 6 + 3 — цепочка взрывов');
    eq(r.results.try.success, true);
  });

  test('две правки от РАЗНЫХ эффектов складываются в одну заявку', () => {
    // Ступень кости от одного эффекта плюс лишняя кость от другого:
    // ни один из них не знает о существовании второго.
    const sys = world({
      ступень: { label: 'Мастерство', ops: [{ op: 'dieStep', by: 1 }] },
      помощь: { label: 'Помощь напарника', ops: [{ op: 'addDie' }] },
    }, ['ступень', 'помощь']);
    const asked: number[] = [];
    const spy = (sides: number) => { asked.push(sides); return 4; };
    const sh = sheet(['ступень', 'помощь']);
    const ctx = () => ({
      system: sys, sheet: sh, params: {}, item: null,
      die: spy, pass: newPass(sys, sh, { compendium: { items: [] } }),
    });
    const r = resolveRule(packRule(rule, ctx()), ctx());
    deepEq(asked, [8, 8], 'две кости, обе — уже подросшие');
    deepEq(r.trace[0].edits.sort(), ['Мастерство', 'Помощь напарника'],
      'журнал называет обе правки именами автора');
  });

  test('правка на ЧУЖОЙ бросок этот бросок не трогает', () => {
    const sys = world({ помощь: { label: 'Помощь', ops: [{ op: 'addDie' }] } }, ['помощь']);
    sys.rolls.push({ tag: 'другой', label: 'Другой бросок' });
    sys.effects.помощь.modifiers[0].target = 'другой';
    const r = run(sys, sheet(['помощь']), 5);
    deepEq(r.trace[0].rolls, [5], 'одна кость: правка висит на другой мишени');
  });
});
