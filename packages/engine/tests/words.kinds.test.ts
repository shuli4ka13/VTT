import { group, test, eq, ok } from './harness.ts';
import { kindsFor, KIND_LABEL, isReference } from '../src/words/kinds.ts';

group('один словарь видов на таблицы, свойства записей и входы эффекта', () => {
  test('у одного вида одна подпись везде', () => {
    for (const place of ['table', 'prop', 'param'] as const) {
      for (const [kind, label] of kindsFor(place)) eq(label, KIND_LABEL[kind], `${place}: ${kind}`);
    }
  });

  test('ссылка на запись книги есть у типа записи, но не у таблицы системы', () => {
    ok(kindsFor('prop').some(([kind]) => kind === 'record'));
    ok(!kindsFor('table').some(([kind]) => kind === 'record'), 'система не ссылается на книгу');
  });

  test('ссылки — это внешние ключи: таблица, эффект, запись, поле', () => {
    for (const kind of ['choice', 'effect', 'record', 'tag']) ok(isReference(kind), kind);
    for (const kind of ['number', 'text', 'expr', 'dice']) ok(!isReference(kind), kind);
  });
});
