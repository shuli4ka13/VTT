// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { RollBody } from './roll-body.tsx';
import { within } from '../../../../testing/cards.ts';
import type { System, Effect, Step } from '@vtt/schema';

const system = {
  tables: {
    skills: { label: 'Навыки', owner: 'sheet', columns: [{ key: 'total', label: 'Итог', kind: 'number' }], rows: [{ value: 'athletics', label: 'Атлетика' }] },
    stats: { label: 'Показатели', shape: 'single', columns: [{ key: 'initiative', label: 'Инициатива', kind: 'number' }] },
  },
  constants: { lead: { label: 'Ведущая кость', kind: 'die', dice: [{ sides: 20 }] } },
  effects: {},
  rolls: { r: { label: 'Проверка', die: 'lead', fields: [{ table: 'skills', column: 'total' }, { table: 'stats', column: 'initiative' }] } },
} as unknown as System;

const effect = {
  params: [
    { key: 'skill', label: 'Навык', kind: 'choice', from: 'skills' },
    { key: 'damage_dice', label: 'Кость урона', kind: 'dice' },
  ],
} as unknown as Effect;

const sheets = new Map([['действующий', 'Кто действует'], ['цель', 'цель']]);

const context = { system, effect, earlier: [], sheets };

const body = (step: unknown) => render(<RollBody step={step as Step} context={context} edit={() => {}} />);

const edited = (step: Record<string, unknown>) => {
  const draft = structuredClone(step);
  let calls = 0;
  const view = render(<RollBody step={step as unknown as Step} context={context} edit={(_, change) => { calls++; change(draft as never); }} />);
  return { draft, view, calls: () => calls };
};

const by = (view: ReturnType<typeof render>) => view.container.querySelector<HTMLSelectElement>('select.roll-by')!;
const what = (view: ReturnType<typeof render>) => view.container.querySelector<HTMLSelectElement>('[data-field="Что бросает"] select')!;
const has = (view: ReturnType<typeof render>, label: string) => view.container.querySelector(`[data-field="${label}"]`) !== null;

describe('форма «Бросок»: кто бросает', () => {
  afterEach(cleanup);

  it('у броска костью выбор — листы входа и последним «никто — кости ничьи»', () => {
    const view = body({ id: 'бросок', type: 'roll', die: 'lead', by: { expr: '@действующий' } });
    expect(by(view).selectedOptions[0]!.textContent).toBe('Кто действует');
    expect([...by(view).options].map(o => [o.value, o.textContent])).toEqual([
      ['@действующий', 'Кто действует'], ['@цель', 'цель'], ['', 'никто — кости ничьи'],
    ]);
  });

  it('другой бросающий меняет by, а метки остаются', () => {
    const { draft, view } = edited({ id: 'бросок', type: 'roll', die: 'lead', by: { expr: '@действующий' }, tags: ['атака'] });
    within(view.container).select('Кто бросает', '@цель');
    expect(draft).toEqual({ id: 'бросок', type: 'roll', die: 'lead', by: { expr: '@цель' }, tags: ['атака'] });
  });

  it('«никто — кости ничьи» снимает by и подписывает, что правки не действуют', () => {
    const { draft, view } = edited({ id: 'бросок', type: 'roll', die: 'lead', by: { expr: '@действующий' } });
    within(view.container).select('Кто бросает', '');
    expect(draft).toEqual({ id: 'бросок', type: 'roll', die: 'lead' });
    cleanup();
    const nobody = body({ id: 'бросок', type: 'roll', die: 'lead' });
    expect(by(nobody).value).toBe('');
    expect(nobody.container.textContent).toContain('кости ничьи');
  });

  it('тот же бросающий выбран снова — данные не трогаются', () => {
    const step = { id: 'бросок', type: 'roll', die: 'lead', by: { expr: '@действующий' } };
    const { draft, view, calls } = edited(step);
    within(view.container).select('Кто бросает', '@действующий');
    expect(draft).toEqual(step);
    expect(calls()).toBe(0);
  });

  it('бросающий не из списка листов остаётся пунктом с пометкой, а не подменяется первым листом', () => {
    const view = body({ id: 'бросок', type: 'roll', die: 'lead', by: { expr: 'первый(@цели)' } });
    expect(by(view).value).toBe('первый(@цели)');
    expect(by(view).selectedOptions[0]!.textContent).toBe('первый(@цели) — такого листа здесь нет');
  });
});

describe('форма «Бросок»: что бросает', () => {
  afterEach(cleanup);

  it('список состоит из групп: по входу эффекта, поля листа, кости, строки таблицы, другое', () => {
    const view = body({ id: 'бросок', type: 'roll', die: 'lead', by: { expr: '@действующий' } });
    const groups = [...what(view).querySelectorAll('optgroup')].map(group => [group.label, [...group.querySelectorAll('option')].map(o => o.value)]);
    expect(groups).toEqual([
      ['По входу эффекта', ['field:skill.total']],
      ['Поля листа', ['field:initiative']],
      ['Кости', ['die:lead']],
      ['Кость из входа', ['expr:@damage_dice']],
      ['Навыки', ['field:skills.athletics.total']],
      ['Другое', ['own-die', 'own-field']],
    ]);
    expect(what(view).value).toBe('die:lead');
  });

  it('выбор кости пишет die', () => {
    const { draft, view } = edited({ id: 'бросок', type: 'roll', by: { expr: '@действующий' } });
    within(view.container).select('Что бросает', 'die:lead');
    expect(draft).toEqual({ id: 'бросок', type: 'roll', die: 'lead', by: { expr: '@действующий' } });
  });

  it('кость из входа эффекта пишется формулой', () => {
    const { draft, view } = edited({ id: 'бросок', type: 'roll', die: 'lead', by: { expr: '@действующий' } });
    within(view.container).select('Что бросает', 'expr:@damage_dice');
    expect(draft).toEqual({ id: 'бросок', type: 'roll', die: { expr: '@damage_dice' }, by: { expr: '@действующий' } });
  });

  it('из кости в поле: die, count, bonus и by снимаются, field получает голову прежнего бросающего', () => {
    const { draft, view } = edited({
      id: 'бросок', type: 'roll', die: 'lead', count: { expr: '2' }, bonus: { expr: '1' }, by: { expr: '@цель' }, tags: ['атака'], if: { expr: 'да' },
    });
    within(view.container).select('Что бросает', 'field:skills.athletics.total');
    expect(draft).toEqual({ id: 'бросок', type: 'roll', field: { expr: '@цель.skills.athletics.total' }, tags: ['атака'], if: { expr: 'да' } });
  });

  it('из кости в поле без бросающего голова — первый лист', () => {
    const { draft, view } = edited({ id: 'бросок', type: 'roll', die: 'lead' });
    within(view.container).select('Что бросает', 'field:skill.total');
    expect(draft).toEqual({ id: 'бросок', type: 'roll', field: { expr: '@действующий.skill.total' } });
  });

  it('из поля в кость: field и shift снимаются, by — прежняя голова адреса', () => {
    const { draft, view } = edited({ id: 'бросок', type: 'roll', field: { expr: '@цель.skills.athletics.total' }, shift: { expr: '1' }, tags: ['атака'] });
    within(view.container).select('Что бросает', 'die:lead');
    expect(draft).toEqual({ id: 'бросок', type: 'roll', die: 'lead', by: { expr: '@цель' }, tags: ['атака'] });
  });

  it('у броска поля бросающий — голова адреса; смена листа меняет голову, хвост остаётся', () => {
    const { draft, view } = edited({ id: 'бросок', type: 'roll', field: { expr: '@действующий.skills.athletics.total' } });
    expect(by(view).value).toBe('@действующий');
    expect([...by(view).options].map(o => o.value)).toEqual(['@действующий', '@цель']);
    expect(what(view).value).toBe('field:skills.athletics.total');
    within(view.container).select('Кто бросает', '@цель');
    expect(draft).toEqual({ id: 'бросок', type: 'roll', field: { expr: '@цель.skills.athletics.total' } });
  });
});

describe('форма «Бросок»: редкие строки', () => {
  afterEach(cleanup);

  it('«+ сколько костей» и «+ прибавка» пишут count и bonus, пустое значение снимает ключ', () => {
    const { draft, view } = edited({ id: 'бросок', type: 'roll', die: 'lead', by: { expr: '@действующий' } });
    expect(has(view, 'Сколько костей')).toBe(false);
    fireEvent.click(screen.getByText('+ сколько костей'));
    within(view.container).formula('Сколько костей', '2');
    expect(draft).toMatchObject({ count: { expr: '2' } });
    fireEvent.click(screen.getByText('+ прибавка'));
    within(view.container).formula('Прибавка', '@бонус');
    expect(draft).toEqual({ id: 'бросок', type: 'roll', die: 'lead', by: { expr: '@действующий' }, count: { expr: '2' }, bonus: { expr: '@бонус' } });
    cleanup();
    const again = edited({ id: 'бросок', type: 'roll', die: 'lead', by: { expr: '@действующий' }, count: { expr: '2' }, bonus: { expr: '@бонус' } });
    within(again.view.container).formula('Прибавка', '');
    within(again.view.container).formula('Сколько костей', '');
    expect(again.draft).toEqual({ id: 'бросок', type: 'roll', die: 'lead', by: { expr: '@действующий' } });
  });

  it('записанные счёт и прибавка видны сразу, без нажатия «+»', () => {
    const view = body({ id: 'бросок', type: 'roll', die: 'lead', count: { expr: '2' }, bonus: { expr: '1' }, by: { expr: '@действующий' } });
    expect(has(view, 'Сколько костей')).toBe(true);
    expect(has(view, 'Прибавка')).toBe(true);
    expect(screen.queryByText('+ сколько костей')).toBeNull();
  });

  it('у поля — «+ поправка к числу поля» пишет shift и пустое значение его снимает', () => {
    const { draft, view } = edited({ id: 'бросок', type: 'roll', field: { expr: '@действующий.skills.athletics.total' } });
    expect(screen.queryByText('+ сколько костей')).toBeNull();
    fireEvent.click(screen.getByText('+ поправка к числу поля'));
    within(view.container).formula('Поправка к числу поля', '20');
    expect(draft).toEqual({ id: 'бросок', type: 'roll', field: { expr: '@действующий.skills.athletics.total' }, shift: { expr: '20' } });
    cleanup();
    const again = edited({ id: 'бросок', type: 'roll', field: { expr: '@действующий.skills.athletics.total' }, shift: { expr: '20' } });
    within(again.view.container).formula('Поправка к числу поля', '');
    expect(again.draft).toEqual({ id: 'бросок', type: 'roll', field: { expr: '@действующий.skills.athletics.total' } });
  });

  it('прибавка к итогу у поля показана, только если уже записана', () => {
    const plain = body({ id: 'бросок', type: 'roll', field: { expr: '@действующий.skills.athletics.total' } });
    expect(has(plain, 'Прибавка к итогу')).toBe(false);
    cleanup();
    const bonused = body({ id: 'бросок', type: 'roll', field: { expr: '@действующий.skills.athletics.total' }, bonus: { expr: '1' } });
    expect(has(bonused, 'Прибавка к итогу')).toBe(true);
  });
});

describe('форма «Бросок»: свои значения и сохранность данных', () => {
  afterEach(cleanup);

  it('адрес поля не из списка — поле «Адрес поля», и холостое открытие ничего не меняет', () => {
    const step = { id: 'бросок', type: 'roll', field: { expr: '@действующий.х' } };
    const { draft, view, calls } = edited(step);
    expect(what(view).value).toBe('own-field');
    expect(has(view, 'Адрес поля')).toBe(true);
    expect(has(view, 'Своя кость')).toBe(false);
    expect(draft).toEqual(step);
    expect(calls()).toBe(0);
  });

  it('кость формулой — поле «Своя кость», и холостое открытие ничего не меняет', () => {
    const step = { id: 'бросок', type: 'roll', die: { expr: '"2к6"' }, by: { expr: '@действующий' } };
    const { draft, view, calls } = edited(step);
    expect(what(view).value).toBe('own-die');
    expect(has(view, 'Своя кость')).toBe(true);
    expect(has(view, 'Адрес поля')).toBe(false);
    expect(draft).toEqual(step);
    expect(calls()).toBe(0);
  });

  it('«своя кость…» открывает поле формулы, а вписанная кость пишется в die', () => {
    const { draft, view } = edited({ id: 'бросок', type: 'roll', die: 'lead', by: { expr: '@действующий' } });
    within(view.container).select('Что бросает', 'own-die');
    expect(has(view, 'Своя кость')).toBe(true);
    within(view.container).formula('Своя кость', '"2к6"');
    expect(draft).toEqual({ id: 'бросок', type: 'roll', die: { expr: '"2к6"' }, by: { expr: '@действующий' } });
  });

  it('ключи, которых форма не показывает, остаются на месте после любой правки', () => {
    const keep = { if: { expr: '@действующий.х' }, tags: ['атака'] };
    const dice = edited({ id: 'бросок', type: 'roll', die: 'lead', by: { expr: '@действующий' }, ...keep });
    within(dice.view.container).select('Кто бросает', '@цель');
    within(dice.view.container).select('Что бросает', 'expr:@damage_dice');
    within(dice.view.container).select('Что бросает', 'field:skill.total');
    expect(dice.draft).toMatchObject(keep);
    cleanup();
    const fielded = edited({ id: 'бросок', type: 'roll', field: { expr: '@действующий.skills.athletics.total' }, ...keep });
    within(fielded.view.container).select('Кто бросает', '@цель');
    within(fielded.view.container).select('Что бросает', 'die:lead');
    expect(fielded.draft).toMatchObject(keep);
  });
});
