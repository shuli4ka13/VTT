// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { SheetView } from '../sheet-view.tsx';
import { CONTROLS, CONTROL_VIEWS } from './index.tsx';
import type { System, Sheet } from '@vtt/schema';
import type { Reader } from '../../engine/use-calc.ts';

const system = {
  fields: [
    { tag: 'хиты', label: 'Хиты', group: 'Состояние', control: 'bar',
      value: { kind: 'stored', type: 'number', default: 10, min: 0, max: '#максимум' } },
    { tag: 'максимум', label: 'Максимум', group: 'Состояние', value: { kind: 'formula', expr: '20' } },
    { tag: 'провалы', label: 'Провалы', group: 'Состояние', control: 'pips',
      value: { kind: 'stored', type: 'number', default: 0, min: 0, max: 3 } },
    { tag: 'броня', label: 'Броня', group: 'Состояние', control: 'stepper',
      value: { kind: 'stored', type: 'number', default: 2, min: 0, max: 5 } },
    { tag: 'тяжёлый', label: 'Тяжёлый доспех', group: 'Состояние', control: 'toggle',
      value: { kind: 'stored', type: 'boolean', default: false } },
    { tag: 'огонь', label: 'Огонь доходит', group: 'Состояние', control: 'choice',
      options: [{ value: 0, label: 'иммунитет' }, { value: 0.5, label: 'половина' },
        { value: 1, label: 'полностью' }, { value: 2, label: 'вдвое' }],
      value: { kind: 'stored', type: 'number', default: 1 } },
    { tag: 'атлетика', label: 'Атлетика', group: 'Состояние', control: 'ring',
      options: [{ value: 0, label: 'нет' }, { value: 1, label: 'владение' }],
      value: { kind: 'stored', type: 'number', default: 0 } },
  ],
} as unknown as System;

const sheet = { id: 'а', name: 'Арвен', values: { хиты: 7, провалы: 1, броня: 2, тяжёлый: false, огонь: 0.5, атлетика: 0 } } as unknown as Sheet;
const reader: Reader = { valueOf: () => ({ ok: true, value: 20 }), rollOf: () => null };

const draw = (onChange: (tag: string, value: unknown) => void) =>
  render(<SheetView system={system} sheet={sheet} reader={reader} onChange={onChange as never} />);

describe('контролы листа', () => {
  afterEach(() => { cleanup(); });

  it('у каждого вида контрола есть вид и подпись', () => {
    for (const key of Object.keys(CONTROLS)) {
      expect(CONTROL_VIEWS[key as keyof typeof CONTROL_VIEWS], key).toBeTruthy();
      expect(CONTROLS[key as keyof typeof CONTROLS].length).toBeGreaterThan(3);
    }
  });

  it('выбор показывает свои варианты и кладёт в поле их значение', () => {
    const edits: [string, unknown][] = [];
    draw((tag, value) => { edits.push([tag, value]); });

    expect(screen.getByText('половина')).toBeTruthy();
    expect(screen.getByText('иммунитет')).toBeTruthy();
    fireEvent.click(screen.getByText('вдвое'));
    expect(edits).toEqual([['огонь', 2]]);
  });

  it('кружок владения берёт ступени из поля, а не из зашитых слов', () => {
    const edits: [string, unknown][] = [];
    draw((tag, value) => { edits.push([tag, value]); });

    expect(screen.queryByText(/мастерство/)).toBeNull();
    fireEvent.click(screen.getByTitle(/^Атлетика:/));
    expect(edits).toEqual([['атлетика', 1]]);
  });

  it('полоса запаса берёт верх из формулы поля и показывает «7 / 20»', () => {
    draw(() => {});
    expect(screen.getByText('7 / 20')).toBeTruthy();
  });

  it('кружки показывают, сколько отмечено, и клик ставит нужное число', () => {
    const edits: [string, unknown][] = [];
    draw((tag, value) => edits.push([tag, value]));

    expect(screen.getByText('1 из 3')).toBeTruthy();
    const pips = document.querySelectorAll('.pip');
    expect(pips).toHaveLength(3);

    fireEvent.click(pips[2]!);
    expect(edits).toEqual([['провалы', 3]]);
  });

  it('повторный клик по отмеченному кружку снимает его', () => {
    const edits: [string, unknown][] = [];
    draw((tag, value) => edits.push([tag, value]));
    fireEvent.click(document.querySelectorAll('.pip')[0]!);
    expect(edits).toEqual([['провалы', 0]]);
  });

  it('степпер не даёт выйти за границы поля', () => {
    const edits: [string, unknown][] = [];
    draw((tag, value) => edits.push([tag, value]));
    const minus = screen.getAllByTitle('минус');
    fireEvent.click(minus[minus.length - 1]!);
    expect(edits).toEqual([['броня', 1]]);
  });

  it('тоггл переключает да и нет', () => {
    const edits: [string, unknown][] = [];
    draw((tag, value) => edits.push([tag, value]));
    fireEvent.click(screen.getByTitle('Тяжёлый доспех'));
    expect(edits).toEqual([['тяжёлый', true]]);
  });
});
