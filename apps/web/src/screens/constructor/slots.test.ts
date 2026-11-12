import { describe, it, expect } from 'vitest';
import { formulaName, outputRefs, outcomeRefs, outputLabel } from './slots.tsx';
import type { EarlierStep } from './slots.tsx';

const call: EarlierStep = {
  id: 'попадание', type: 'emit', title: 'Бросок атаки',
  outputs: [
    { path: '.попал', label: 'попадание', kind: 'boolean', no: 'промах' },
    { path: '.крит', label: 'крит', kind: 'boolean' },
    { path: '.на_костях', label: 'на костях', kind: 'number' },
  ],
};

describe('ссылка на шаг — по имени, без номера', () => {
  it('в формулах и выборах значения: имя шага и что это', () => {
    const earlier: EarlierStep[] = [{ id: 'урон_всего', type: 'roll', title: 'Число «урон всего»' }];
    expect(outputRefs(earlier)[0]).toMatchObject({ ref: 'урон_всего', label: 'урон всего', kind: 'roll' });
    expect(outputRefs(earlier)[1]).toMatchObject({ ref: 'урон_всего.total', label: 'урон всего — сколько вышло всего, с прибавками', kind: 'number' });
    expect(outputRefs(earlier).every(one => !/шаг \d/.test(one.label))).toBe(true);
  });

  it('имя и подпись итога совпали — пишется один раз', () => {
    expect(outputRefs([call]).map(one => one.label).slice(0, 3)).toEqual(['попадание', 'попадание — крит', 'попадание — на костях']);
  });

  it('перебор по списку зовётся подписью списка, шаг без имени — своим названием', () => {
    expect(formulaName({ id: 'цель', type: 'each', title: 'Цель' })).toBe('Цель');
    expect(formulaName({ id: 'цель', type: 'each' })).toBe('цель');
    expect(formulaName({ id: '', type: 'check', title: 'Проверка' })).toBe('Проверка');
  });

  it('справка называет результат шага по имени', () => {
    const earlier: EarlierStep[] = [{ id: 'урон', type: 'roll', title: 'Число «урон»' }];
    expect(outputLabel('урон', earlier)).toBe('урон');
    expect(outputLabel('урон.total', earlier)).toBe('урон — сколько вышло всего, с прибавками');
    expect(outputLabel('нет.итог', earlier)).toBe('шаг «нет» — итог');
  });
});

describe('списки исходов — название шага и исход', () => {
  it('«Бросок атаки — попадание» и «Бросок атаки — промах», а не «попадание — не попадание»', () => {
    const [hit, crit, rolled] = outcomeRefs([call]);
    expect(hit).toEqual({ ref: 'попадание.попал', label: 'Бросок атаки — попадание', kind: 'boolean', no: 'Бросок атаки — промах' });
    expect(crit).toEqual({ ref: 'попадание.крит', label: 'Бросок атаки — крит', kind: 'boolean', no: 'Бросок атаки — не крит' });
    expect(rolled).toEqual({ ref: 'попадание.на_костях', label: 'Бросок атаки — на костях', kind: 'number' });
  });

  it('проверка: «пройдена» и «не пройдена», слова берутся у самого шага', () => {
    const [passed] = outcomeRefs([{ id: 'hit', type: 'check', title: 'Проверка' }]);
    expect(passed).toMatchObject({ ref: 'hit.success', label: 'Проверка — пройдена', no: 'Проверка — не пройдена' });
  });

  it('одинаковые названия различает имя шага в формулах, одиночные остаются как есть', () => {
    const two = outcomeRefs([
      { id: 'сквозь_броню', type: 'check', title: 'Проверка' },
      { id: 'сквозь_шлем', type: 'check', title: 'Проверка' },
    ]).filter(one => one.ref.endsWith('.success'));
    expect(two.map(one => one.label)).toEqual(['Проверка «сквозь броню» — пройдена', 'Проверка «сквозь шлем» — пройдена']);
    expect(two.map(one => one.no)).toEqual(['Проверка «сквозь броню» — не пройдена', 'Проверка «сквозь шлем» — не пройдена']);
    const mixed = outcomeRefs([{ id: 'a', type: 'check', title: 'Проверка' }, { id: 'x', type: 'roll', title: 'Число «x»' }]);
    expect(mixed.find(one => one.ref === 'a.success')!.label).toBe('Проверка — пройдена');
  });

  it('у перебора исходов нет', () => {
    expect(outcomeRefs([{ id: 'цель', type: 'each', title: 'Цель' }])).toEqual([]);
  });
});
