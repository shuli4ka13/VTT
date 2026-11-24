import { group, test, eq } from './harness.ts';
import { compile, UNKNOWN } from '../src/formula/index.ts';

const NAMES: Record<string, unknown> = { q: UNKNOWN, yes: true, no: false, none: null, five: 5, list: ['a', 'b'] };

const run = (expr: string): unknown => compile(expr).evaluate(name => NAMES[name] as never);

const lost = (expr: string): void => eq(run(expr) === UNKNOWN, true, expr);

group('формулы: «невыяснено» — третье значение', () => {
  test('«и»: нет побеждает, остальное с невыясненным — невыяснено', () => {
    eq(run('@no and @q'), false);
    eq(run('@q and @no'), false);
    eq(run('@q and @none'), null);
    lost('@yes and @q');
    lost('@q and @yes');
    lost('@q and @q');
  });

  test('«или»: да побеждает, остальное с невыясненным — невыяснено', () => {
    eq(run('@yes or @q'), true);
    eq(run('@q or @yes'), true);
    lost('@no or @q');
    lost('@q or @no');
    lost('@q or @q');
  });

  test('«не», сравнения, арифметика, «если», функции и колонка по невыясненному ключу — невыяснено', () => {
    for (const expr of ['not @q', '@q == 1', '@q != @q', '@q < 3', '@q + 1', '-@q', 'if(@q, 1, 2)', 'empty(@q)', 'has(@list, @q)', 'max(@five, @q)', 'floor(@q)', '@list.[@q].x']) lost(expr);
  });

  test('ветка «если», которую не взяли, невыясненного не трогает', () => {
    eq(run('if(@yes, 1, @q)'), 1);
    lost('if(@no, 1, @q)');
  });

  test('«известно» отвечает про само невыясненное; пусто — известное «ничего»', () => {
    eq(run('known(@q)'), false);
    eq(run('known(@five)'), true);
    eq(run('known(@none)'), true);
    eq(run('if(known(@q), @q, 7)'), 7);
    eq(run('empty(@none)'), true);
  });

  test('без невыясненного язык считает как раньше', () => {
    eq(run('@yes and @five'), 5);
    eq(run('@none or @five'), 5);
    eq(run('@no and @yes'), false);
  });
});
