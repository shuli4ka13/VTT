// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { NumberBody } from './number-body.tsx';
import { FormulaBar } from '../../../../ui/formula-bar.tsx';
import { useFormulaBar } from '../../../../store/formula-bar.ts';
import { within } from '../../../../testing/cards.ts';
import type { System, Effect, Step } from '@vtt/schema';

const system = {
  tables: {}, constants: { lead: { label: 'Ведущая кость', kind: 'die', dice: [{ sides: 20 }] } }, effects: {},
} as unknown as System;

const effect = {
  params: [
    { key: 'damage_dice', label: 'Кость урона', kind: 'dice' },
    { key: 'damage_with', label: 'Прибавка к урону', kind: 'number' },
  ],
} as unknown as Effect;

const sheets = new Map([['действующий', 'Кто действует'], ['цель', 'цель']]);

const context = { system, effect, earlier: [], sheets };

const body = (step: unknown, onAddParam?: (label: string, kind: never, want?: string) => string) =>
  render(<NumberBody step={step as Step} context={context} edit={() => {}} {...(onAddParam ? { onAddParam } : {})} />);

const edited = (step: Record<string, unknown>) => {
  const draft = structuredClone(step);
  const view = render(<NumberBody step={step as unknown as Step} context={context} edit={(_, change) => change(draft as never)} />);
  return { draft, view };
};

const pick = (view: ReturnType<typeof render>) => view.container.querySelector<HTMLSelectElement>('select.roll-by');

const COMPLEX = 'у сложной формулы кости ничьи — сначала выберите «просто кости»';

describe('шаг «Число»: под полем нет второй копии формулы', () => {
  afterEach(cleanup);

  it('формула показана фишками один раз — серой строкой словами она не повторяется', () => {
    const view = body({ id: 'урон', type: 'roll', fixed: { expr: 'кинуть(@damage_dice, 2) + @damage_with' } });
    const chips = [...view.container.querySelectorAll('.chips__chip')].map(el => el.textContent);
    expect(chips).toEqual(expect.arrayContaining([expect.stringContaining('Кость урона'), expect.stringContaining('Прибавка к урону')]));
    expect(view.container.querySelector('.faint')).toBeNull();
    expect(view.container.textContent!.split('Прибавка к урону')).toHaveLength(2);
  });

  it('неизвестное имя по-прежнему предлагает «взять из записи»', () => {
    const taken: string[] = [];
    body({ id: 'урон', type: 'roll', fixed: { expr: '@нет_такого + 1' } }, (_label, _kind, want) => { taken.push(want ?? ''); return want ?? ''; });
    fireEvent.click(screen.getByText('взять «нет_такого» из записи'));
    expect(taken).toEqual(['нет_такого']);
  });

  it('ошибка разбора бросающего шага остаётся под полем', () => {
    const view = body({ id: 'бросок', type: 'roll', die: 'lead', by: { expr: '@действующий' } });
    expect(view.container.querySelector('.field__error')).toBeNull();
    within(view.container).formula('Формула', 'кинуть(@нет)');
    expect(view.container.querySelector('.field__error')).not.toBeNull();
  });

  it('имя правится в поле: ссылки переименовываются, пустое и занятое не принимаются с причиной', () => {
    const renames: Array<[string, string]> = [];
    const view = render(<NumberBody step={{ id: 'урон', type: 'roll', fixed: { expr: '1' } } as unknown as Step} context={{ ...context, earlier: [{ id: 'удар', type: 'roll' }] }}
      edit={() => {}} onRename={(from, to) => renames.push([from, to])} />);
    const name = view.container.querySelector('input.input') as HTMLInputElement;
    expect(name.value).toBe('урон');
    fireEvent.change(name, { target: { value: '' } });
    fireEvent.blur(name);
    expect(view.container.querySelector('.field__error')!.textContent).toContain('пустым');
    fireEvent.change(name, { target: { value: 'удар' } });
    fireEvent.blur(name);
    expect(view.container.querySelector('.field__error')!.textContent).toContain('занято');
    expect(renames).toEqual([]);
    fireEvent.change(name, { target: { value: 'ущерб' } });
    fireEvent.blur(name);
    expect(renames).toEqual([['урон', 'ущерб']]);
  });

  it('у сложной формулы без бросающего нет ни выбора, ни меток', () => {
    const view = body({ id: 'урон', type: 'roll', fixed: { expr: 'кинуть(@damage_dice, 2) + @damage_with' } });
    expect(pick(view)).toBeNull();
    expect(view.container.querySelector('.roll-formula')).toBeNull();
    expect(view.container.textContent).not.toContain('Метки');
    cleanup();
    const plain = body({ id: 'а', type: 'roll', fixed: { expr: '1 + 2' } });
    expect(pick(plain)).toBeNull();
  });

  it('у простой записи броска выбор есть: пусто — «просто кости», меток пока нет', () => {
    const view = body({ id: 'а', type: 'roll', fixed: { expr: 'кинуть(@lead) + @damage_with' } });
    const chip = pick(view)!;
    expect(chip).not.toBeNull();
    expect(chip.value).toBe('');
    expect(chip.selectedOptions[0]!.textContent).toBe('просто кости');
    expect([...chip.options].map(o => o.value)).toEqual(['', '@действующий', '@цель']);
    expect(view.container.querySelector('.number-line__formula')!.firstElementChild).toBe(chip);
    expect(view.container.textContent).not.toContain('Метки');
  });

  it('выбор бросающего у простой формулы раскладывает её в кость и прибавку', () => {
    const { draft, view } = edited({ id: 'а', type: 'roll', fixed: { expr: 'кинуть(@lead) + @damage_with' } });
    within(view.container).select('Кто бросает', '@действующий');
    expect(draft).toEqual({ id: 'а', type: 'roll', die: 'lead', bonus: { expr: '@damage_with' }, by: { expr: '@действующий' } });
  });

  it('бросающий назван листом, под строкой — «Метки»; «просто кости» снимает его и возвращает формулу строкой', () => {
    const { draft, view } = edited({ id: 'бросок', type: 'roll', die: 'lead', bonus: { expr: '@damage_with' }, by: { expr: '@действующий' }, tags: ['атака'] });
    const chip = pick(view)!;
    expect(chip.selectedOptions[0]!.textContent).toBe('Кто действует');
    expect(within(view.container).field('Метки')).toBeTruthy();
    within(view.container).select('Кто бросает', '');
    expect(draft).toEqual({ id: 'бросок', type: 'roll', fixed: { expr: 'кинуть(@lead) + @damage_with' }, tags: ['атака'] });
  });

  it('тот же бросающий выбран снова — данные не трогаются', () => {
    const step = { id: 'бросок', type: 'roll', die: 'lead', by: { expr: '@действующий' } };
    const { draft, view } = edited(step);
    within(view.container).select('Кто бросает', '@действующий');
    expect(draft).toEqual(step);
  });

  it('бросающий не из списка листов остаётся в выборе с пометкой, а не подменяется первым листом', () => {
    const view = body({ id: 'бросок', type: 'roll', die: 'lead', by: { expr: 'первый(@цели)' } });
    const chip = pick(view)!;
    expect(chip.value).toBe('первый(@цели)');
    expect(chip.selectedOptions[0]!.textContent).toBe('первый(@цели) — такого листа здесь нет');
  });

  it('при бросающем сложная формула не принимается, и причина названа', () => {
    const edits: string[] = [];
    const view = render(<NumberBody step={{ id: 'бросок', type: 'roll', die: 'lead', by: { expr: '@действующий' } } as unknown as Step}
      context={context} edit={() => { edits.push('edit'); }} />);
    within(view.container).formula('Формула', 'кинуть(@lead) * 2 + 1');
    expect(view.container.querySelector('.field__error')!.textContent).toBe(COMPLEX);
    expect(edits).toEqual([]);
  });

  it('отвергнутая сложная формула принимается, как только выбрано «просто кости»', () => {
    const step = { id: 'бросок', type: 'roll', die: 'lead', by: { expr: '@действующий' } } as Record<string, unknown>;
    const view = render(<NumberBody step={structuredClone(step) as unknown as Step} context={context} edit={(_, change) => change(step as never)} />);
    within(view.container).formula('Формула', 'кинуть(@lead) * 2 + 1');
    expect(view.container.querySelector('.field__error')!.textContent).toBe(COMPLEX);
    expect(step).toHaveProperty('die', 'lead');
    within(view.container).select('Кто бросает', '');
    expect(step).toEqual({ id: 'бросок', type: 'roll', fixed: { expr: 'кинуть(@lead) * 2 + 1' } });
    expect(view.container.querySelector('.field__error')).toBeNull();
  });

  it('выбор бросающего сначала завершает недописанную формулу в строке формул', () => {
    const step = { id: 'а', type: 'roll', fixed: { expr: 'кинуть(@lead) + 1' } } as Record<string, unknown>;
    const view = render(<><FormulaBar /><NumberBody step={step as unknown as Step} context={context} edit={(_, change) => change(step as never)} /></>);
    fireEvent.click(view.container.querySelector('.number-line__formula .formula-field')!);
    act(() => { useFormulaBar.getState().write('кинуть(@lead) + 5'); });
    expect(step.fixed).toEqual({ expr: 'кинуть(@lead) + 1' });
    fireEvent.focus(pick(view)!);
    expect(step.fixed).toEqual({ expr: 'кинуть(@lead) + 5' });
    expect(useFormulaBar.getState().target).toBeNull();
  });

  it('при бросающем простая запись принимается: кость, число костей и прибавка', () => {
    const { draft, view } = edited({ id: 'бросок', type: 'roll', die: 'lead', by: { expr: '@действующий' } });
    within(view.container).formula('Формула', 'кинуть(@lead, 2) + @damage_with');
    expect(view.container.querySelector('.field__error')).toBeNull();
    expect(draft).toMatchObject({ die: 'lead', count: { expr: '2' }, bonus: { expr: '@damage_with' }, by: { expr: '@действующий' } });
  });
});

describe('шаг «Бросок»: поле листа', () => {
  afterEach(cleanup);
  const rolled = { ...context, system: { ...system, rolls: { r: { die: 'lead', fields: [] } } } as unknown as System };
  const editedIn = (step: Record<string, unknown>) => {
    const draft = structuredClone(step);
    const view = render(<NumberBody step={step as unknown as Step} context={rolled} edit={(_, change) => change(draft as never)} />);
    return { draft, view };
  };

  it('без бросков в системе кнопки нет', () => {
    const view = body({ id: 'а', type: 'roll', die: 'lead' });
    expect(view.container.textContent).not.toContain('бросить поле листа');
  });

  it('в поле: кость, число, прибавка и бросающий снимаются, голова — прежний бросающий', () => {
    const { draft, view } = editedIn({ id: 'а', type: 'roll', die: 'lead', count: { expr: '2' }, bonus: { expr: '1' }, by: { expr: '@цель' }, tags: ['атака'] });
    fireEvent.click(screen.getByText('бросить поле листа'));
    expect(draft).toEqual({ id: 'а', type: 'roll', field: { expr: '@цель' }, tags: ['атака'] });
    expect(view.container).toBeTruthy();
  });

  it('в поле без бросающего голова — первый лист', () => {
    const { draft } = editedIn({ id: 'а', type: 'roll', fixed: { expr: '1' } });
    fireEvent.click(screen.getByText('бросить поле листа'));
    expect(draft).toEqual({ id: 'а', type: 'roll', field: { expr: '@действующий' } });
  });

  it('смена фишки переписывает голову адреса, хвост сохраняется', () => {
    const { draft, view } = editedIn({ id: 'а', type: 'roll', field: { expr: '@действующий.навык.итог' } });
    within(view.container).select('Кто бросает', '@цель');
    expect(draft).toEqual({ id: 'а', type: 'roll', field: { expr: '@цель.навык.итог' } });
    expect(view.container.textContent).toContain('Ещё метки');
  });

  it('поправка пишется и снимается пустой', () => {
    const { draft, view } = editedIn({ id: 'а', type: 'roll', field: { expr: '@действующий.х' } });
    within(view.container).formula('Поправка', '20');
    expect(draft).toEqual({ id: 'а', type: 'roll', field: { expr: '@действующий.х' }, shift: { expr: '20' } });
    cleanup();
    const again = editedIn({ id: 'а', type: 'roll', field: { expr: '@действующий.х' }, shift: { expr: '20' } });
    within(again.view.container).formula('Поправка', '');
    expect(again.draft).toEqual({ id: 'а', type: 'roll', field: { expr: '@действующий.х' } });
  });

  it('«← кости» снимает поле и поправку, ставит бросающего', () => {
    const { draft } = editedIn({ id: 'а', type: 'roll', field: { expr: '@цель.х' }, shift: { expr: '1' } });
    fireEvent.click(screen.getByText('← кости'));
    expect(draft).toEqual({ id: 'а', type: 'roll', by: { expr: '@цель' } });
  });
});
