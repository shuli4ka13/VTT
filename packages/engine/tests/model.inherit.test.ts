import { group, test, eq, deepEq, ok, throws } from './harness.ts';
import { flattenSystem, hasBases } from '../src/model/inherit.ts';
import type { System } from '../src/model/types.ts';

const sys = (effects: Record<string, unknown>, records: Record<string, unknown> = {}): System => ({
  id: 'о', name: 'о', fields: [], effects, records,
} as unknown as System);

group('основа: эффект берёт у основы и дописывает своё', () => {
  test('дорожка «со мной» написана один раз, а достаётся всем наследникам', () => {
    const flat = flattenSystem(sys({
      заклинание: {
        label: 'Заклинание',
        params: [{ key: 'круг', label: 'Каким кругом', kind: 'number' }],
        self: [{ type: 'emit', event: 'ячейка', args: { круг: { param: 'круг' } }, strict: true }],
      },
      огненный_шар: {
        extends: 'заклинание', label: 'Огненный шар', activation: 'manual',
        steps: [{ type: 'emit', event: 'урон', args: { сколько: { const: 28 } } }],
      },
    }));

    const шар = flat.effects.огненный_шар!;
    eq(шар.label, 'Огненный шар', 'своё имя побеждает');
    eq(шар.self?.length, 1, 'дорожка досталась от основы');
    eq(шар.params?.[0]?.key, 'круг', 'и потребность тоже');
    eq(шар.steps?.length, 1, 'свои шаги на месте');
    eq((шар as Record<string, unknown>).extends, 'заклинание', 'откуда взялось — видно и после разворачивания');
  });

  test('шаги основы идут первыми, свои — следом', () => {
    const flat = flattenSystem(sys({
      основа: { label: 'Основа', steps: [{ id: 'а', type: 'amount' }] },
      своё: { extends: 'основа', steps: [{ id: 'б', type: 'amount' }] },
    }));
    deepEq(flat.effects.своё!.steps?.map(s => (s as { id: string }).id), ['а', 'б']);
  });

  test('потребность с тем же именем переопределяется, остальные копятся', () => {
    const flat = flattenSystem(sys({
      основа: {
        label: 'Основа',
        params: [{ key: 'к', label: 'Кость', kind: 'dice' }, { key: 'т', label: 'Тип', kind: 'text' }],
      },
      своё: { extends: 'основа', params: [{ key: 'к', label: 'Кость урона' }, { key: 'н', label: 'Новое' }] },
    }));
    deepEq(flat.effects.своё!.params, [
      { key: 'к', label: 'Кость урона', kind: 'dice' },
      { key: 'т', label: 'Тип', kind: 'text' },
      { key: 'н', label: 'Новое' },
    ]);
  });

  test('основа основы тоже считается', () => {
    const flat = flattenSystem(sys({
      а: { label: 'А', steps: [{ id: '1', type: 'amount' }] },
      б: { extends: 'а', steps: [{ id: '2', type: 'amount' }] },
      в: { extends: 'б', steps: [{ id: '3', type: 'amount' }] },
    }));
    deepEq(flat.effects.в!.steps?.map(s => (s as { id: string }).id), ['1', '2', '3']);
  });

  test('круг основ — внятная ошибка, а не зависание', () => {
    const беда = throws(() => flattenSystem(sys({
      а: { extends: 'б', label: 'А' },
      б: { extends: 'а', label: 'Б' },
    })));
    ok(String(беда.message).includes('по кругу'), String(беда.message));
  });

  test('основы нет — ошибка называет обе стороны', () => {
    const беда = throws(() => flattenSystem(sys({ а: { extends: 'нету', label: 'А' } })));
    ok(String(беда.message).includes('«а»') && String(беда.message).includes('«нету»'), String(беда.message));
  });
});

group('основа: тип записи', () => {
  test('свойства копятся, привязка по счёту доправляет аргументы и может смениться именем', () => {
    const flat = flattenSystem(sys({ удар: { label: 'Удар' } }, {
      оружие: {
        kind: 'item', label: 'Оружие',
        props: [{ key: 'кость', label: 'Кость урона' }, { key: 'тип', label: 'Тип урона' }],
        bindings: [{ label: 'Удар', effect: 'удар', args: { чем: '#сила', кость: { prop: 'кость' } } }],
      },
      фехтовальное: {
        kind: 'item', extends: 'оружие', label: 'Оружие фехтовальное',
        bindings: [{ label: 'Выстрел', effect: 'удар', args: { чем: '#ловкость' } }],
      },
    }));

    const ф = flat.records!.фехтовальное!;
    eq(ф.label, 'Оружие фехтовальное');
    eq(ф.props?.length, 2, 'оба свойства достались от основы');
    eq(ф.bindings?.length, 1, 'привязка не задвоилась');
    eq(ф.bindings?.[0]?.label, 'Выстрел', 'кнопку можно переназвать');
    deepEq(ф.bindings?.[0]?.args, { чем: '#ловкость', кость: { prop: 'кость' } });
  });
});

group('основ нет — система не трогается', () => {
  test('без «на основе» возвращается тот же объект', () => {
    const плоская = sys({ а: { label: 'А' } });
    eq(hasBases(плоская), false);
    eq(flattenSystem(плоская), плоская);
  });
});
