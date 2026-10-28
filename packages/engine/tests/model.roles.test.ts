import { group, test, deepEq, eq } from './harness.ts';
import { rolesOf, tableOf } from '../src/model/buttons.ts';
import { actorOf } from '../src/model/implicit.ts';
import { sheetInputOf } from '../src/model/toggles.ts';
import type { Effect } from '../src/model/types.ts';

const pair = {
  params: [
    { key: 'лист', kind: 'sheet', role: 'target' },
    { key: 'источник', kind: 'sheet', role: 'actor' },
  ],
} as unknown as Effect;

const list = {
  params: [
    { key: 'кто', kind: 'sheet' },
    { key: 'цели', kind: 'sheet', many: true },
  ],
} as unknown as Effect;

group('кто действует и цели выводятся одним правилом', () => {
  test('роль «Приходит сам» у одиночного листа: лист с ролью цели не становится тем, кто действует', () => {
    deepEq(rolesOf(pair), { actor: 'источник', targets: 'лист' }, 'действующий — источник, цель — лист');
    deepEq(tableOf({}, pair), { источник: 'actor', лист: 'targets' }, 'кнопка ставит действующего и цель туда же');
    eq(actorOf({ ...pair, activation: 'manual' }), 'источник', 'вызов из эффекта берёт того же действующего');
  });

  test('без роли: первый одиночный лист — действующий, список — цели', () => {
    deepEq(rolesOf(list), { actor: 'кто', targets: 'цели' }, 'список — цели');
    deepEq(tableOf({}, list), { кто: 'actor', цели: 'targets' }, 'таблица кнопки');
  });

  test('связанный вход урона: читается лист, который получает урон, а не источник', () => {
    eq(sheetInputOf(pair), 'лист', 'броня и хиты — у получателя');
  });

  test('явная таблица кнопки перекрывает вывод', () => {
    deepEq(tableOf({ table: { лист: 'actor' } }, pair), { лист: 'actor' }, 'таблица из записи');
  });
});
