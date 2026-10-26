// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { openAll } from '../../../testing/render-open.tsx';
import { HandlerCard } from './handler-card.tsx';
import { within } from '../../../testing/cards.ts';
import type { System, Handler } from '@vtt/schema';

const system = {
  id: 'x', name: 'x', tables: {}, constants: { d20: { kind: 'die', dice: [{ count: 1, sides: 20 }] } },
  effects: {
    удар: { label: 'Удар', activation: 'manual', params: [{ key: 'действующий', label: 'Кто действует', kind: 'sheet' }], steps: [
      { id: 'hit_бросок', type: 'roll', die: 'd20', by: { expr: '@действующий' } },
      { id: 'hit', type: 'check', value: { expr: '@hit_бросок' }, versus: { expr: '10' } },
    ] },
    r: { label: 'r', activation: 'passive', on: [] },
  },
} as unknown as System;

const eachEffect = {
  label: 'Каждому', activation: 'manual', params: [{ key: 'цели', label: 'Цели', kind: 'sheet', many: true, item: { key: 'цель', label: 'Цель' } }], steps: [
    { type: 'each', of: 'цели' },
    { id: 'спас_бросок', type: 'roll', die: 'd20', by: { expr: '@цель' } },
    { id: 'спас', type: 'check', value: { expr: '@спас_бросок' }, versus: { expr: '10' } },
  ],
};

const card = (handler: Handler, more: Record<string, unknown> = {}) => {
  let current = structuredClone(handler);
  const withHandler = { ...system, effects: { ...system.effects, ...more, r: { ...system.effects.r, on: [current] } } } as System;
  const view = render(<HandlerCard id="r" index={0} handler={current} system={withHandler} onRemove={() => {}}
    edit={change => { change(current); current = structuredClone(current); }} />);
  openAll();
  return { view, get: () => current };
};


describe('«когда»: исходы под момент', () => {
  afterEach(cleanup);

  it('«после» действия предлагает итог шага цели как есть', () => {
    const { get } = card({ on: 'after:удар', steps: [] });
    within(document.body).when('Проверка — пройдена');
    expect(get().if?.expr).toBe('@hit.success');
  });

  it('исходы названы шагом и исходом, без номера шага', () => {
    card({ on: 'after:удар', steps: [] });
    const labels = within(document.body).whenOptions();
    expect(labels).toContain('Проверка — пройдена');
    expect(labels.filter(one => /шаг \d/.test(one))).toEqual([]);
  });

  it('после «Для каждого из» исход — «хоть по одной цели»: в условие ложится счёт по итогам целей', () => {
    const { get } = card({ on: 'done:каждому', steps: [] }, { каждому: eachEffect });
    within(document.body).when('хоть по одной цели: Проверка — пройдена');
    expect(get().if?.expr).toBe('сколько(@итоги.спас.success, да) >= 1');
  });

  it('«завершено» не предлагает итог одной цели: условие — формулой, и она знает таблицу итогов по целям', () => {
    const { get } = card({ on: 'done:удар', steps: [] });
    expect(get().if).toBeUndefined();
    within(document.body).formula(document.querySelector<HTMLElement>('.cond__formula')!, 'сколько(@итоги.hit.success, да) >= 2');
    expect(get().if?.expr).toBe('сколько(@итоги.hit.success, да) >= 2');
  });

  it('у «завершено» нет выбора «Кому», зато есть «Кого касается»', () => {
    const { view } = card({ on: 'done:удар', steps: [] });
    expect(view.container.textContent).not.toContain('Кому');
    expect(view.container.textContent).toContain('Кого касается');
  });

  it('«Когда именно» пишет фазу в «что случилось»', () => {
    const { view, get } = card({ on: 'before:удар', steps: [] });
    const phase = view.getByDisplayValue('до') as HTMLSelectElement;
    fireEvent.change(phase, { target: { value: 'after' } });
    expect(get().on).toBe('after:удар');
  });
});

describe('«увидев кости»', () => {
  afterEach(cleanup);

  it('«Кого касается» называет бросающего и того, против кого бросают; выбор пишется условием про носителя', () => {
    const { view, get } = card({ on: 'seen', steps: [] });
    const whose = view.getByDisplayValue('всех — без условия') as HTMLSelectElement;
    expect([...whose.options].map(o => o.value)).toEqual(['', '@бросающий == @носитель', '@против == @носитель']);
    expect([...whose.options].map(o => o.textContent)).toEqual(['всех — без условия', '«кто бросает» — носитель', '«против кого бросок» — носитель']);
    fireEvent.change(whose, { target: { value: '@против == @носитель' } });
    expect(get().if?.expr).toBe('@против == @носитель');
  });

  it('уход с момента стирает условие про носителя', () => {
    const { view, get } = card({ on: 'seen', if: { expr: '@бросающий == @носитель' }, steps: [] });
    const moment = [...view.container.querySelectorAll('select')].find(el => [...el.options].some(o => o.value === 'seen'))!;
    fireEvent.change(moment, { target: { value: 'call' } });
    expect(get().if).toBeUndefined();
    expect(get().on).toBe('before:*');
  });
});

describe('«бросок окончен»', () => {
  afterEach(cleanup);

  it('вид подписки без предмета: выбор пишет «rolled», а список называет его словами', () => {
    const { view, get } = card({ on: 'before:*', steps: [] });
    const moment = [...view.container.querySelectorAll('select')].find(el => [...el.options].some(o => o.value === 'rolled'))!;
    expect([...moment.options].find(o => o.value === 'rolled')!.textContent).toBe('бросок окончен');
    fireEvent.change(moment, { target: { value: 'rolled' } });
    expect(get().on).toBe('rolled');
  });

  it('открытая подписка «rolled» не притворяется действием', () => {
    const { view } = card({ on: 'rolled', steps: [] });
    expect(view.getByDisplayValue('бросок окончен')).toBeTruthy();
    expect(view.queryByDisplayValue('действие или вызов')).toBeNull();
    expect(view.getByDisplayValue('всех — без условия')).toBeTruthy();
  });
});

describe('«увидев кости»: заголовок и условие', () => {
  afterEach(cleanup);

  it('заголовок называет фильтр меток, а условие — выходы броска словами', () => {
    card({ on: 'seen', notTags: ['инициатива'], tags: ['огонь'], if: { expr: '@roll.rolled > 2' }, steps: [] });
    const text = document.body.textContent!;
    expect(text).toContain('только с метками «огонь», кроме бросков с метками «инициатива»');
    expect(text).toContain('сколько костей бросили');
    expect(text).not.toContain('roll.rolled');
  });

  it('фильтры меток стоят в одном ряду, пояснения — в подсказке при наведении', () => {
    const { view } = card({ on: 'seen', steps: [] });
    expect(view.container.querySelectorAll('.tagbox').length).toBe(3);
    expect(view.container.querySelector('.field__hint')).toBeNull();
  });
});

describe('«когда»: фраза называет итог вызова словами', () => {
  afterEach(cleanup);

  it('«попадание.попал» читается как «попадание», а не путём', () => {
    const called = {
      ...system,
      effects: {
        ...system.effects,
        бросок: { label: 'Бросок атаки', returns: [{ key: 'попал', label: 'попадание', kind: 'boolean', no: 'промах' }], steps: [] },
        удар: { ...system.effects.удар, steps: [...(system.effects.удар as { steps: unknown[] }).steps, { id: 'попадание', type: 'emit', effect: 'бросок' }] },
      },
    } as unknown as System;
    const handler = { on: 'before:удар', if: { expr: '@попадание.попал' }, confirm: true, steps: [] } as Handler;
    const withHandler = { ...called, effects: { ...called.effects, r: { ...called.effects.r, on: [handler] } } } as System;
    render(<HandlerCard id="r" index={0} handler={handler} system={withHandler} onRemove={() => {}} edit={() => {}} />);
    openAll();
    const title = document.body.textContent!;
    expect(title).toContain('если «попадание» — решает игрок носителя');
    expect(title).not.toContain('попадание.попал');
  });
});

describe('«когда»: фраза по-русски', () => {
  afterEach(cleanup);

  const tagged = { ...system, tags: { атака: { label: 'Атака' } } } as unknown as System;

  const phrase = (on: string): string => {
    const handler = { on, steps: [] } as Handler;
    const withHandler = { ...tagged, effects: { ...tagged.effects, r: { ...tagged.effects.r, on: [handler] } } } as System;
    const view = render(<HandlerCard id="r" index={0} handler={handler} system={withHandler} onRemove={() => {}} edit={() => {}} />);
    const text = view.container.querySelector('.mod-row__text')!.textContent!.replace(/^когда/, '');
    view.unmount();
    return text;
  };

  it('«до» и «после» — родительный падеж: «до всего с меткой», «после любого действия»', () => {
    expect(phrase('before:атака')).toBe('до всего с меткой «Атака»');
    expect(phrase('after:атака')).toBe('после всего с меткой «Атака»');
    expect(phrase('before:*')).toBe('до любого действия кнопкой');
    expect(phrase('after:удар')).toBe('после «Удар»');
  });

  it('«завершено» и пункты списка остаются в именительном', () => {
    expect(phrase('done:атака')).toBe('завершено всё с меткой «Атака»');
    expect(phrase('done:*')).toBe('завершено любое действие кнопкой');
    const handler = { on: 'before:*', steps: [] } as Handler;
    const withHandler = { ...tagged, effects: { ...tagged.effects, r: { ...tagged.effects.r, on: [handler] } } } as System;
    render(<HandlerCard id="r" index={0} handler={handler} system={withHandler} onRemove={() => {}} edit={() => {}} />);
    openAll();
    const subjects = [...document.querySelectorAll('select')].find(el => [...el.options].some(o => o.value === '*'))!;
    expect([...subjects.options].map(o => o.textContent)).toEqual(['любое действие кнопкой', 'всё с меткой «Атака»', '«Удар»']);
  });
});
