// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { SheetView } from '../sheet-view.tsx';
import { VIEWS, VIEW_KEYS, viewsFor } from './index.tsx';
import type { System, Sheet } from '@vtt/schema';
import type { Reader } from '../../engine/use-calc.ts';

const system = {
  tables: { лист: { shape: 'single', columns: [
    { key: 'хиты', label: 'Хиты', kind: 'number', default: 10, min: 0, max: { expr: '#максимум' }, control: { kind: 'bar' }, block: 'Состояние' },
    { key: 'максимум', label: 'Максимум', expr: { expr: '20' }, block: 'Состояние' },
    { key: 'провалы', label: 'Провалы', kind: 'number', min: 0, max: 3, control: { kind: 'pips' }, block: 'Состояние' },
    { key: 'броня', label: 'Броня', kind: 'number', default: 2, min: 0, max: 5, control: { kind: 'stepper' }, block: 'Состояние' },
    { key: 'тяжёлый', label: 'Тяжёлый доспех', kind: 'boolean', control: { kind: 'toggle' }, block: 'Состояние' },
    { key: 'огонь', label: 'Огонь доходит', kind: 'choice', from: 'доля', default: 1, control: { kind: 'choice' }, block: 'Состояние' },
    { key: 'атлетика', label: 'Атлетика', kind: 'choice', from: 'владение', default: 0, control: { kind: 'ring' }, block: 'Состояние' },
    { key: 'сила', label: 'Сила', kind: 'number', control: { kind: 'pips' }, block: 'Состояние' },
    { key: 'груз', label: 'Груз', kind: 'number', min: 0, max: 10, control: { kind: 'bar', worse: 'high' }, block: 'Состояние' },
    { key: 'шум', label: 'Шум', kind: 'number', min: 0, max: 20, control: { kind: 'stepper', step: 5 }, block: 'Состояние' },
    { key: 'тайна', label: 'Тайна', kind: 'boolean', control: { kind: 'toggle', yes: 'раскрыта', no: 'скрыта' }, block: 'Состояние' },
    { key: 'сопр', label: 'Сопротивления', kind: 'choice', from: 'урон', many: true, control: { kind: 'chips' }, block: 'Состояние' },
    { key: 'заряды', label: 'Заряды', kind: 'number', min: 0, max: 4, control: { kind: 'charges' }, block: 'Состояние' },
    { key: 'мод', label: 'Модификатор', expr: { expr: '3' }, control: { kind: 'signed' }, block: 'Состояние' },
    { key: 'кд', label: 'КД', expr: { expr: '15' }, control: { kind: 'big' }, block: 'Состояние' },
    { key: 'шаг', label: 'Шаг', kind: 'number', min: 1, max: 9, default: 3, control: { kind: 'slider' }, block: 'Состояние' },
  ] },
    доля: { key: 'number', rows: [{ value: 0, label: 'иммунитет' }, { value: 0.5, label: 'половина' }, { value: 1, label: 'полностью' }, { value: 2, label: 'вдвое' }] },
    владение: { key: 'number', rows: [{ value: 0, label: 'нет' }, { value: 1, label: 'владение' }] },
    урон: { key: 'word', rows: [{ value: 'огонь', label: 'огонь' }, { value: 'холод', label: 'холод' }, { value: 'яд', label: 'яд' }] },
  },
} as unknown as System;

const values = { груз: 9, шум: 5, хиты: 7, провалы: 1, броня: 2, тяжёлый: false, огонь: 0.5, атлетика: 0, сопр: ['яд'], заряды: 2, шаг: 3 };
const sheet = { id: 'а', name: 'Арвен', values } as unknown as Sheet;
const computed: Record<string, unknown> = { максимум: 20, мод: 3, кд: 15 };
const reader: Reader = {
  valueOf: tag => ({ ok: true, value: computed[tag] ?? (values as Record<string, unknown>)[tag] }),
  rollOf: () => null,
  measure: expr => ({ ok: true, value: expr.trim() === '#максимум' ? 20 : Number(expr) }),
};

const draw = (onChange?: (tag: string, value: unknown) => void) =>
  render(<SheetView system={system} sheet={sheet} reader={reader} {...(onChange ? { onChange: onChange as never } : {})} />);

const edits = () => {
  const out: [string, unknown][] = [];
  draw((tag, value) => { out.push([tag, value]); });
  return out;
};

describe('виды полей листа', () => {
  afterEach(() => { cleanup(); });

  it('без верха точки не придумывают пятёрку — «—» и подсказка', () => {
    draw(() => {});
    const missing = screen.getByLabelText('Сила');
    expect(missing.textContent).toBe('—');
    expect(missing.getAttribute('title')).toMatch(/верх/);
  });

  it('полоса «красная, когда много» краснеет у верха', () => {
    draw(() => {});
    expect(screen.getByText('9 / 10').closest('.v-bar__track')!.className).toContain('v-bar__track--danger');
  });

  it('шаг: минус и плюс ходят на шаг', () => {
    const out = edits();
    const plus = screen.getAllByTitle('плюс');
    fireEvent.click(plus.find(button => button.closest('[aria-label="Шум"]'))!);
    expect(out).toEqual([['шум', 10]]);
  });

  it('переключатель с подписями автора', () => {
    draw(() => {});
    expect(screen.getByRole('switch', { name: 'Тайна' }).textContent).toBe('скрыта');
  });

  it('кружок без вариантов не выдумывает ступени', () => {
    const Ring = VIEWS.ring.draw;
    render(<Ring value={1} label="Ступень" onChange={() => {}} />);
    expect(screen.getByText('вариантов ещё нет')).toBeTruthy();
    expect(screen.queryByText(/владение|мастерство/)).toBeNull();
  });

  it('кружок у «да/нет» — две ступени с подписями автора, у числа — цифры от низа до верха, у посчитанного — только показ', () => {
    const out: [string, unknown][] = [];
    const local = { tables: { лист: { shape: 'single', columns: [
      { key: 'спас', label: 'Спас', kind: 'boolean', control: { kind: 'ring', yes: 'владеет', no: 'не владеет' } },
      { key: 'ранг', label: 'Ранг', kind: 'number', min: 1, max: 3, control: { kind: 'choice' } },
      { key: 'итог', label: 'Итог', expr: { expr: '2' }, min: 0, max: 2, control: { kind: 'ring' } },
    ] } } } as unknown as System;
    const values: Record<string, unknown> = { спас: false, ранг: 1 };
    render(<SheetView system={local} sheet={{ id: 'в', values } as unknown as Sheet}
      reader={{ valueOf: tag => ({ ok: true, value: tag === 'итог' ? 2 : values[tag] }), rollOf: () => null, storedOf: tag => values[tag], measure: expr => ({ ok: true, value: Number(expr) }) }}
      onChange={(tag, value) => { out.push([tag, value]); }} />);
    fireEvent.click(screen.getByTitle(/^Спас: не владеет/));
    fireEvent.click(screen.getByRole('radio', { name: '3' }));
    expect(out).toEqual([['спас', true], ['ранг', 3]]);
    const shown = screen.getByTitle(/^Итог: 2/) as HTMLButtonElement;
    expect(shown.disabled).toBe(true);
  });

  it('пусто — не ноль', () => {
    const Bar = VIEWS.bar.draw;
    render(<Bar value={null} label="Хиты" max={10} />);
    expect(screen.getByText('— / 10')).toBeTruthy();
  });

  it('видов двенадцать, у каждого подпись, подсказка и образец', () => {
    expect(VIEW_KEYS).toHaveLength(12);
    for (const key of VIEW_KEYS) {
      expect(VIEWS[key].label.length, key).toBeGreaterThan(3);
      expect(VIEWS[key].hint.length, key).toBeGreaterThan(3);
      const Draw = VIEWS[key].draw;
      render(<Draw {...VIEWS[key].sample} label={key} />);
      cleanup();
    }
  });

  it('галерея предлагает виды по типу, а посчитанному — только показ', () => {
    expect(viewsFor('number', false)).toContain('stepper');
    expect(viewsFor('number', true)).not.toContain('stepper');
    expect(viewsFor('number', true)).toEqual(expect.arrayContaining(['signed', 'big', 'pips', 'bar']));
    expect(viewsFor('many', false)).toEqual(['chips']);
    expect(viewsFor('boolean', false)).toEqual(['toggle', 'ring', 'choice']);
    expect(viewsFor(null, true).every(key => VIEWS[key].shows)).toBe(true);
  });

  it('выбор показывает свои варианты и кладёт в поле их значение', () => {
    const out = edits();
    expect(screen.getByText('половина')).toBeTruthy();
    fireEvent.click(screen.getByText('вдвое'));
    expect(out).toEqual([['огонь', 2]]);
  });

  it('кружок ступеней берёт ступени из поля', () => {
    const out = edits();
    fireEvent.click(screen.getByTitle(/^Атлетика:/));
    expect(out).toEqual([['атлетика', 1]]);
  });

  it('полоса берёт верх из формулы и красится по остатку', () => {
    draw(() => {});
    expect(screen.getByText('7 / 20')).toBeTruthy();
    expect(document.querySelector('.v-bar__track--warn')).toBeTruthy();
  });

  it('точки: клик ставит число, повторный снимает', () => {
    const out = edits();
    const pips = screen.getAllByRole('button', { name: /из 3$/ });
    expect(pips).toHaveLength(3);
    fireEvent.click(pips[2]!);
    fireEvent.click(pips[0]!);
    expect(out).toEqual([['провалы', 3], ['провалы', 0]]);
  });

  it('круг зарядов: клик по сектору ставит число', () => {
    const out = edits();
    fireEvent.click(screen.getAllByRole('button', { name: /из 4$/ })[3]!);
    expect(out).toEqual([['заряды', 4]]);
  });

  it('минус и плюс не выходят за границы', () => {
    const out = edits();
    const minus = screen.getAllByTitle('минус');
    fireEvent.click(minus.find(button => button.closest('[aria-label="Броня"]'))!);
    expect(out).toEqual([['броня', 1]]);
  });

  it('переключатель меняет да и нет', () => {
    const out = edits();
    fireEvent.click(screen.getByRole('switch', { name: 'Тяжёлый доспех' }));
    expect(out).toEqual([['тяжёлый', true]]);
  });

  it('метки пишут список в порядке вариантов', () => {
    const out = edits();
    fireEvent.click(screen.getByRole('button', { name: 'огонь' }));
    fireEvent.click(screen.getByRole('button', { name: 'яд' }));
    expect(out).toEqual([['сопр', ['огонь', 'яд']], ['сопр', []]]);
  });

  it('ползунок пишет число', () => {
    const out = edits();
    fireEvent.change(screen.getByRole('slider', { name: 'Шаг' }), { target: { value: '7' } });
    expect(out).toEqual([['шаг', 7]]);
  });

  it('посчитанное показано своим видом: со знаком и крупно', () => {
    draw(() => {});
    expect(screen.getByLabelText('Модификатор').textContent).toBe('+3');
    expect(screen.getByLabelText('КД').textContent).toBe('15');
  });

  it('без права правки виды показывают, но не меняют', () => {
    draw();
    expect(screen.getByText('7 / 20')).toBeTruthy();
    expect(screen.queryAllByTitle('минус')).toHaveLength(0);
    expect(screen.getByText('яд')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'огонь' })).toBeNull();
  });

  it('со знаком: ввод «+5» пишет число по уходу из поля', () => {
    const out: [string, unknown][] = [];
    const local = { ...system, tables: { лист: { shape: 'single', columns: [
      { key: 'бонус', label: 'Бонус', kind: 'number', control: { kind: 'signed' } },
    ] } } } as unknown as System;
    render(<SheetView system={local} sheet={{ id: 'б', values: { бонус: 1 } } as unknown as Sheet}
      reader={{ valueOf: () => ({ ok: true, value: 1 }), rollOf: () => null, storedOf: () => 1 }}
      onChange={(tag, value) => { out.push([tag, value]); }} />);
    const input = screen.getByLabelText('Бонус') as HTMLInputElement;
    expect(input.value).toBe('+1');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '+5' } });
    fireEvent.blur(input);
    expect(out).toEqual([['бонус', 5]]);
  });
});
