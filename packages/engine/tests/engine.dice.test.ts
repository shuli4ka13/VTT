import { group, test, eq, throws } from './harness.ts';
import { rollNotation } from './legacy.ts';
group('запись кости: как обещает ошибка, так и принимается', () => {
  test('«1к6», «к6», «2d6» и «2К6» читаются одинаково', () => {
    const one = () => 3;
    eq(rollNotation('1к6', one).total, 3);
    eq(rollNotation('к6', one).total, 3);
    eq(rollNotation('2d6', one).total, 6);
    eq(rollNotation('2К6', one).total, 6);
    eq(rollNotation('2д6', one).total, 6);
  });

  test('чужая запись — прежняя внятная ошибка', () => {
    throws(() => rollNotation('шесть', () => 1), 'не понимаю запись кубиков');
  });
});
