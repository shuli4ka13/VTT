import { group, test, eq, deepEq } from './harness.ts';
import { rollLead, seeRoll } from './kit.ts';
import { traceLine } from '../src/engine/steps/roll-reroll.ts';
import type { DieConstant } from '../src/model/types.ts';

const queue = (...values: number[]) => () => values.shift() ?? 1;
const d20: DieConstant = { label: 'к20', kind: 'die', dice: [{ count: 1, sides: 20 }] } as DieConstant;
const pool: DieConstant = { label: 'пул', kind: 'die', dice: [{ count: 3, sides: 6 }], read: { kind: 'count', atLeast: 5 } } as unknown as DieConstant;

group('увидев кости: выпавшее остаётся', () => {
  test('докинуть одну и оставить лучшую — это преимущество задним числом', () => {
    const die = queue(7, 18);
    const first = rollLead(d20, die);
    const seen = seeRoll(first, { kind: 'add', count: 1, keep: 'best' }, die);
    deepEq(seen.rolls, [7, 18]);
    eq(seen.total, 18);
    eq(seen.kept, 18);
  });

  test('перебросить провалы пула: кости выше порога не трогаются', () => {
    const die = queue(2, 6, 4, 5, 3);
    const first = rollLead(pool, die);
    eq(first.total, 1, 'одна шестёрка — один успех');
    const seen = seeRoll(first, { kind: 'reroll', upTo: 4 }, die);
    deepEq(seen.rolls, [5, 6, 3]);
    eq(seen.total, 2);
  });

  test('прибавить число — итог растёт, натуральная кость нет', () => {
    const die = queue(12);
    const seen = seeRoll(rollLead(d20, die), { kind: 'plus', addend: { label: 'Вдохновение', value: 4, dice: [] } }, die);
    eq(seen.total, 16);
    deepEq(seen.raw, [12]);
  });
});

group('увидев кости: по ревью', () => {
  const adv = { label: 'Преимущество', ops: [{ op: 'addDie' }, { op: 'keepBest', n: 1 }] } as never;
  const apart = { label: 'Подрыв', ops: [{ op: 'explode', apart: true }] } as never;

  test('прибавка не делает натуральную кость натуральной двадцаткой', () => {
    const die = queue(17);
    const seen = seeRoll(rollLead(d20, die), { kind: 'plus', addend: { label: 'Вдохновение', value: 3, dice: [] } }, die);
    eq(seen.total, 20);
    eq(seen.natural, 17);
  });

  test('перебросить трогает только взятые кости: отброшенная преимуществом остаётся', () => {
    const die = queue(3, 15, 9);
    const first = rollLead(d20, die, [adv]);
    eq(first.total, 15);
    const seen = seeRoll(first, { kind: 'reroll', upTo: 5 }, die);
    deepEq(seen.rolls, [3, 15], 'тройка отброшена — не перебрасывается');
  });

  test('переброс единиц виден в счёте единиц, даже когда были взрывы', () => {
    const die = queue(6, 1, 2, 4, 5);
    const first = rollLead({ ...pool, dice: [{ count: 3, sides: 6 }] } as DieConstant, die, [apart]);
    eq(first.tally.atMin, 1);
    const seen = seeRoll(first, { kind: 'reroll', upTo: 1 }, die);
    eq(seen.tally.atMin, 0, 'единицу перебросили — сбоя по ней нет');
    eq(seen.rolls.length, 4, 'взорванная шестёрка со своим довеском на месте');
  });

  test('подрыв во всём наборе не взрывает второй раз уже взорванное', () => {
    const die = queue(6, 3, 2, 5, 4);
    const first = rollLead({ ...pool, dice: [{ count: 2, sides: 6 }] } as DieConstant, die, [apart]);
    eq(first.rolls.length, 3, 'шестёрка дала довесок');
    const seen = seeRoll(first, { kind: 'add', count: 1, explode: true }, die);
    eq(seen.rolls.length, 4, 'добавлена одна кость, старая шестёрка второй довесок не получила');
  });
});

group('увидев кости: докинуть и оставить — среди взятого и докинутого', () => {
  const dis = { label: 'Помеха', ops: [{ op: 'addDie' }, { op: 'keepWorst', n: 1 }] } as never;

  test('при помехе удача докидывает и оставляет лучшую из взятой и новой', () => {
    const die = queue(3, 15, 18);
    const first = rollLead(d20, die, [dis]);
    eq(first.total, 3);
    const seen = seeRoll(first, { kind: 'add', count: 1, keep: 'best' }, die);
    eq(seen.total, 18, 'лучшая из 3 и 18; выбывшая 15 не возвращается');
    deepEq(seen.rolls, [3, 15, 18]);
  });

  test('на 2к6 докинуть и оставить лучшие — две лучшие из трёх', () => {
    const die = queue(2, 5, 6);
    const two = { label: '2к6', kind: 'die', dice: [{ count: 2, sides: 6 }] } as DieConstant;
    const seen = seeRoll(rollLead(two, die), { kind: 'add', count: 1, keep: 'best' }, die);
    eq(seen.total, 11);
  });
});

group('увидев кости: перебросить одну меньшую — Героическое вдохновение 2024', () => {
  const adv = { label: 'Преимущество', ops: [{ op: 'addDie' }, { op: 'keepBest', n: 1 }] } as never;
  const dis = { label: 'Помеха', ops: [{ op: 'addDie' }, { op: 'keepWorst', n: 1 }] } as never;
  const lowest = { kind: 'reroll', which: 'lowest' } as const;

  test('одна к20: перебрасывается она, засчитывается новая', () => {
    const die = queue(4, 17);
    const seen = seeRoll(rollLead(d20, die), lowest, die);
    deepEq(seen.rolls, [17]);
    eq(seen.total, 17);
    eq(seen.natural, 17);
  });

  test('с преимуществом перебрасывается меньшая, не взятая в расчёт: итог не падает', () => {
    const die = queue(3, 15, 9);
    const seen = seeRoll(rollLead(d20, die, [adv]), lowest, die);
    deepEq(seen.rolls, [9, 15]);
    eq(seen.total, 15, 'выпало 9 — бо́льшая 15 осталась');
    const up = queue(3, 15, 18);
    eq(seeRoll(rollLead(d20, up, [adv]), lowest, up).total, 18);
  });

  test('с помехой перебрасывается взятая меньшая: итог — меньшая из новой и другой', () => {
    const die = queue(3, 15, 9);
    const seen = seeRoll(rollLead(d20, die, [dis]), lowest, die);
    deepEq(seen.rolls, [9, 15]);
    eq(seen.total, 9);
  });

  test('при равенстве перебрасывается первая', () => {
    const die = queue(5, 5, 12);
    deepEq(seeRoll(rollLead(d20, die, [adv]), lowest, die).rolls, [12, 5]);
  });

  test('правки результата действуют и на новую грань: Везучий перебрасывает новую единицу, Надёжный талант поднимает до 10', () => {
    const lucky = { label: 'Везучий', ops: [{ op: 'reroll', n: 1 }] } as never;
    const die = queue(2, 1, 14);
    deepEq(seeRoll(rollLead(d20, die, [lucky]), lowest, die).rolls, [14]);
    const reliable = { label: 'Надёжный талант', ops: [{ op: 'floorDie', least: 10 }] } as never;
    const low = queue(12, 4);
    eq(seeRoll(rollLead(d20, low, [reliable]), lowest, low).total, 10);
  });

  test('именованные части не кандидаты — перебрасывать нечего, бросок не меняется', () => {
    const duality = { label: 'двойственность', kind: 'die', dice: [{ count: 1, sides: 12, name: 'hope' }, { count: 1, sides: 12, name: 'fear' }] } as unknown as DieConstant;
    const die = queue(3, 9);
    const first = rollLead(duality, die);
    const seen = seeRoll(first, lowest, die);
    deepEq(seen.rolls, first.rolls);
    eq(seen.total, first.total);
  });
});

group('перебросить одну меньшую: кого не трогает', () => {
  const lowest = { kind: 'reroll', which: 'lowest' } as const;

  test('кость-вычитаемое и «кость сверх» не кандидаты — перебрасывается главная', () => {
    const mixed = { label: 'смесь', kind: 'die', dice: [{ count: 1, sides: 20 }, { count: 1, sides: 6, minus: true }, { count: 1, sides: 4, bonus: true }] } as unknown as DieConstant;
    const die = queue(12, 5, 1, 19);
    const first = rollLead(mixed, die);
    const seen = seeRoll(first, lowest, die);
    eq(seen.raw[0], 19, 'переброшена к20, хотя вычитаемое и «сверх» меньше');
    deepEq(seen.raw.slice(1), first.raw.slice(1));
  });

  test('кость, выкинутая вторым «докинуть и взять», не кандидат', () => {
    const die = queue(3, 15, 9, 20);
    const once = seeRoll(rollLead(d20, die), { kind: 'add', count: 1, keep: 'best' }, die);
    const twice = seeRoll(once, { kind: 'add', count: 1, keep: 'best' }, die);
    const seen = seeRoll(twice, lowest, die);
    deepEq(seen.rolls, [3, 15, 20], 'тройка выкинута — переброшена девятка');
    eq(seen.total, 20);
  });

  test('трасса: без кандидатов — «перебрасывать нечего», порог — по-старому', () => {
    eq(traceLine({ which: 'lowest', before: 7, after: 7, rolls: [3, 4] }), 'перебрасывать нечего — итог 7');
    eq(traceLine({ which: 'lowest', before: 12, after: 25, rolls: [18, 5], from: 3, to: 18 }), 'переброшено 3 → 18 — итог 12 → 25');
    eq(traceLine({ before: 1, after: 2, rolls: [5, 6, 3] }), 'переброшено: [5, 6, 3] — итог 1 → 2');
  });
});

group('перебросить весь набор — «Свирепый атакующий»', () => {
  const all = { kind: 'reroll', which: 'all' } as const;
  const d6x2: DieConstant = { label: '2к6', kind: 'die', dice: [{ count: 2, sides: 6 }] } as DieConstant;

  test('новый набор больше — остаётся новый целиком', () => {
    const die = queue(1, 2, 4, 5);
    const seen = seeRoll(rollLead(d6x2, die), all, die);
    deepEq(seen.rolls, [4, 5]);
    eq(seen.total, 9);
  });

  test('новый набор не больше — остаётся прежний', () => {
    const die = queue(5, 6, 6, 2);
    const seen = seeRoll(rollLead(d6x2, die), all, die);
    deepEq(seen.rolls, [5, 6]);
    eq(seen.total, 11);
  });

  test('правки результата действуют и на новый набор: «Бой большим оружием» поднимает 1 и 2 до 3', () => {
    const great = { label: 'Бой большим оружием', ops: [{ op: 'floorDie', least: 3 }] } as never;
    const die = queue(1, 1, 2, 6);
    const seen = seeRoll(rollLead(d6x2, die, [great]), all, die);
    eq(seen.total, 9, 'было 3 + 3, стало 3 + 6');
  });

  test('с «оставить лучшую» сравнивается итог, а не сумма граней', () => {
    const adv = { label: 'Преимущество', ops: [{ op: 'addDie' }, { op: 'keepBest', n: 1 }] } as never;
    const die = queue(18, 3, 12, 12);
    const seen = seeRoll(rollLead(d20, die, [adv]), all, die);
    eq(seen.total, 18, 'было 18 из [18, 3], новое 12 из [12, 12] — остаётся прежнее');
  });

  test('трасса', () => {
    eq(traceLine({ which: 'all', before: 3, after: 9, rolls: [4, 5] }), 'переброшен весь набор: [4, 5] — итог 3 → 9');
    eq(traceLine({ which: 'all', before: 11, after: 11, rolls: [5, 6] }), 'переброшен весь набор — прежний не меньше, итог 11');
  });
});
