import { group, test, eq, deepEq } from './harness.ts';
import { exchange } from './play.ts';
import { rollLead } from './kit.ts';

const queue = (...values: number[]) => {
  const rest = [...values];
  return () => {
    if (!rest.length) throw new Error('кубик бросили больше раз, чем ожидал тест');
    return rest.shift()!;
  };
};

group('степени успеха', () => {

  const sys: any = {
    id: 'pbta',
    tables: { rolls: { label: 'Броски', key: 'word', rows: [{ value: 'ход' }] } },
    constants: { пара: { label: 'Две шестёрки', kind: 'die', dice: [{ count: 2, sides: 6 }] } },
    tables: {
      исходы: {
        label: 'Исход хода', key: 'range', columns: [{ key: 'value', label: 'исход', kind: 'text' }],
        rows: [
          { from: -99, to: 6, cells: { value: 'провал' } },
          { from: 7, to: 9, cells: { value: 'успех с ценой' } },
          { from: 10, to: 99, cells: { value: 'полный успех' } },
        ],
      },
    },
    roll_edits: {
      кураж: { label: 'Кураж', ops: [{ op: 'shiftDegree', by: 1 }] },
      усталость: { label: 'Усталость', ops: [{ op: 'shiftDegree', by: -1 }] },
    },
    effects: {},
  };

  const withEffect = (id: string, edit: string) => ({
    ...sys,
    effects: {
      ...sys.effects,
      [id]: {
        label: id, activation: 'passive', duration: { kind: 'permanent' },
        modifiers: [{ kind: 'edit', call: 'roll', param: 'edits', tags: ['ход'], edit }],
      },
    },
  });

  const rule: any = {
    steps: [{
      id: 'move', type: 'threshold',
      roll: { die: { constant: 'пара' }, bonus: { expr: '0' }, tags: ['ход'] },
      versus: { expr: '7' },
      degrees: { table: 'исходы', of: 'total' },
    }],
  };

  const runRule = (sys: any, rule: any, sender: any, target: any, die: () => number, base: any = { records: [] }) => {
    const full: any = {
      ...sys, tables: { ...sys.tables, приём: { shape: 'book', use: 'action', label: 'Приём' } },
      effects: { ...sys.effects, 'правило': { label: 'правило', activation: 'manual', ...rule } },
    };
    const book: any = { ...base, records: [...base.records, { id: 'правило', table: 'приём', label: 'правило', bindings: [{ label: 'правило', effect: 'правило', args: {} }] }] };
    const from = { ...sender, id: 'отправитель-теста', has: [...(sender.has ?? []), { of: 'правило' }], effects: sender.effects ?? [] };
    const out = exchange({ system: full, compendium: book, die, sheets: [from, target], actionId: 'правило:0', fromId: from.id, toId: target.id });
    const report = out.reports[0]!.report;
    return { sheet: out.sheets.find((s: any) => s.id === target.id)!, trace: report.trace as any[], stopped: report.stopped as any };
  };

  const play = (world: any, effects: string[], die: () => number, ruleOf: any = rule) => {
    const sheet = { id: 'герой', values: {}, effects: effects.map(effectId => ({ effectId })) };
    const out = runRule(world, ruleOf, sheet, { id: 'цель-теста', values: {}, effects: [] }, die);
    const t = out.trace[0]!;
    return { results: { move: { ...(('degree' in t) ? { degree: t.degree } : {}), success: t.success } } as any };
  };
  const run = (world: any, effects: string[], ...dice: number[]) => play(world, effects, queue(...dice));

  test('исход читается словом автора, а не «да/нет»', () => {
    eq(run(sys, [], 3, 4).results.move.degree, 'успех с ценой', '7 — середина шкалы');
    eq(run(sys, [], 1, 2).results.move.degree, 'провал');
    eq(run(sys, [], 6, 5).results.move.degree, 'полный успех');
  });

  test('эффект сдвигает степень на ступень вверх', () => {
    const world = withEffect('кураж', 'кураж');
    eq(run(world, ['кураж'], 3, 4).results.move.degree, 'полный успех',
      'та же семёрка, но ступенью выше');
  });

  test('и вниз — тем же примитивом с другим знаком', () => {
    const world = withEffect('усталость', 'усталость');
    eq(run(world, ['усталость'], 3, 4).results.move.degree, 'провал');
  });

  test('за краями шкалы — крайняя ступень, а не ошибка', () => {
    const world = withEffect('кураж', 'кураж');
    eq(run(world, ['кураж'], 6, 6).results.move.degree, 'полный успех',
      'выше верхней ступени подниматься некуда');
  });

  test('мир без объявленной шкалы живёт как раньше: степени нет вовсе', () => {
    const plain: any = { steps: [{ ...rule.steps[0], degrees: undefined }] };
    const r = play(sys, [], queue(3, 4), plain);
    eq('degree' in (r.results.move as object), false, 'ключа нет — старые правила не изменились');
    eq(r.results.move.success, true);
  });
});

group('взрыв вниз — единица Cyberpunk RED', () => {
  const d10: any = { kind: 'die', dice: [{ count: 1, sides: 10 }] };

  test('на единице кидается ещё раз и ВЫЧИТАЕТСЯ', () => {
    const r = rollLead(d10, queue(1, 4), [{ label: 'Провал', ops: [{ op: 'explode', at: 'min' }] }] as any);
    eq(r.total, -3, '1 минус 4');
  });

  test('взрыв вверх и вниз — один примитив, разные пункты для автора', () => {
    const up = rollLead(d10, queue(10, 7), [{ label: 'Удача', ops: [{ op: 'explode' }] }] as any);
    eq(up.total, 17, '10 плюс 7');
    const nothing = rollLead(d10, queue(5), [{ label: 'Удача', ops: [{ op: 'explode' }] }] as any);
    eq(nothing.total, 5, 'не максимум — ничего не происходит');
  });
});

group('правка одной части составного броска', () => {
  const duality: any = {
    label: 'Кости дуальности', kind: 'die',
    dice: [
      { count: 1, sides: 12, name: 'hope', label: 'Надежда' },
      { count: 1, sides: 12, name: 'fear', label: 'Страх' },
    ],
  };

  test('преимущество только на Надежду: лишняя кость приходит в неё', () => {
    const edit: any = {
      label: 'Вдохновение',
      ops: [{ op: 'addDie', part: 'hope' }, { op: 'keepBest', n: 1, part: 'hope' }],
    };
    const r = rollLead(duality, queue(3, 11, 5), [edit]);
    deepEq(r.parts, { hope: 11, fear: 5 }, 'Надежд было две, осталась лучшая; Страх не тронут');
    eq(r.total, 16, 'в сумму пошли оставленная Надежда и Страх');
  });

  test('чужая часть не задета: худшая Надежда не выкидывает Страх из броска', () => {
    const edit: any = {
      label: 'Тень',
      ops: [{ op: 'addDie', part: 'hope' }, { op: 'keepWorst', n: 1, part: 'hope' }],
    };
    const r = rollLead(duality, queue(3, 11, 5), [edit]);
    deepEq(r.parts, { hope: 3, fear: 5 });
  });

  test('взрыв можно адресовать одной части', () => {
    const edit: any = { label: 'Пылкая надежда', ops: [{ op: 'explode', part: 'hope' }] };
    const r = rollLead(duality, queue(12, 6, 12, 4), [edit]);
    deepEq(r.parts, { hope: 28, fear: 6 }, '12 + 12 + 4 у Надежды; Страх выпал 6 и не взрывался');
  });

  test('часть, которой в броске нет, — внятная ошибка, а не тихий промах', () => {
    let message = '';
    try {
      rollLead(duality, queue(1, 1), [{ label: 'Чужое', ops: [{ op: 'addDie', part: 'котик' }] }] as any);
    } catch (err) { message = (err as Error).message; }
    eq(message.includes('котик'), true, message);
  });
});
