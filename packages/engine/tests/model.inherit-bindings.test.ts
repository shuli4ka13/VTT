import { group, test, deepEq } from './harness.ts';
import { byEffect } from '../src/model/inherit.ts';
import type { Binding } from '../src/model/types.ts';

group('кнопки наследника типа — по эффекту', () => {
  test('та же кнопка дополняет основу на её месте, новая — в конец', () => {
    const base = [{ label: 'Стрелять', effect: 'shoot', args: { a: { expr: '1' } } }, { label: 'Перезарядить', effect: 'reload' }] as Binding[];
    const own = [{ effect: 'reload', args: { b: { expr: '2' } } }, { label: 'Запуск', effect: 'launch' }] as Binding[];
    deepEq(byEffect(base, own).map(one => [one.effect, one.label ?? '', Object.keys(one.args ?? {}).join()]), [
      ['shoot', 'Стрелять', 'a'], ['reload', 'Перезарядить', 'b'], ['launch', 'Запуск', ''],
    ]);
  });
});
