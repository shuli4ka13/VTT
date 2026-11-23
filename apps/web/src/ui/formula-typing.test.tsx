// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import type { System } from '@vtt/schema';
import { FormulaChips } from './formula-chips.tsx';
import { FormulaField } from './formula-field.tsx';
import { FormulaInput } from './formula.tsx';
import { FormulaBar } from './formula-bar.tsx';
import { useFormulaBar } from '../store/formula-bar.ts';

const system = {
  tables: { лист: { shape: 'single', columns: [
    { key: 'сила', label: 'Сила', kind: 'number', default: 10 },
    { key: 'урон_оружия', label: 'Урон оружия', kind: 'number', default: 3 },
    { key: 'класс_брони', label: 'Класс брони', kind: 'number', default: 10 },
    { key: 'интеллект', label: 'Интеллект', kind: 'number', default: 10 },
  ] } },
  constants: {}, effects: {},
} as unknown as System;

const sheets = new Map([['цель', 'Цель'], ['действующий', 'Кто действует']]);
const steps = new Map([
  ['бросок', 'бросок'],
  ['бросок.total', 'бросок — сколько вышло всего, с прибавками'],
  ['бросок.natural', 'бросок — что выпало на костях, без прибавок'],
  ['бросок.rolled', 'бросок — сколько костей бросили'],
]);

const field = (): HTMLInputElement => {
  const now = document.activeElement;
  return (now instanceof HTMLInputElement && now.matches('input.chips__text') ? now : [...document.querySelectorAll('input.chips__text')].at(-1)) as HTMLInputElement;
};

const typeIn = (text: string) => {
  for (const ch of text) {
    const input = field();
    input.focus();
    fireEvent.focus(input);
    const at = input.selectionStart ?? input.value.length;
    const shown = input.value.slice(0, at) + ch + input.value.slice(at);
    fireEvent.change(input, { target: { value: shown, selectionStart: at + 1 } });
  }
};

const menu = () => [...document.querySelectorAll('.slot__option')].map(o => (o.textContent ?? '').trim());
const chips = () => [...document.querySelectorAll('.chips:not(.chips--read) .chips__chip')].map(c => c.querySelector('span:not(.chips__side)')?.textContent ?? '');
const note = () => document.querySelector('.chips__note')?.textContent ?? '';

function Host({ seen, extra, withSheets }: { seen: (value: string) => void; extra?: Map<string, string>; withSheets?: boolean }) {
  const [value, setValue] = useState('');
  seen(value);
  return <FormulaChips value={value} system={system} {...(extra ? { extraNames: extra } : {})} {...(withSheets ? { sheets } : {})} onChange={setValue} />;
}

describe('набор формулы по одной букве', () => {
  beforeEach(() => { useFormulaBar.getState().dismiss(); });
  afterEach(() => { cleanup(); });

  it('(а) «сила +» — значение с именем и фишка «Сила»', () => {
    let value = '';
    render(<Host seen={v => { value = v; }} />);
    typeIn('сила +');
    expect(value).toBe('@сила +');
    expect(chips()).toEqual(['Сила']);
  });

  it('(и) «2к6 + сила» — кость не имя, сила узнаётся', () => {
    let value = '';
    render(<Host seen={v => { value = v; }} />);
    typeIn('2к6 + сила +');
    expect(value).toBe('2d6 + @сила +');
  });

  it('(б) «урон оружия» без разделителя сохраняется как имя — кнопкой «готово» строки формул', () => {
    const commits: string[] = [];
    render(<><FormulaBar /><FormulaField value="" system={system} where="Урон" onCommit={t => commits.push(t)} /></>);
    fireEvent.click(document.querySelector('.formula-field')!);
    typeIn('урон оружия');
    expect(field().value).toBe('урон оружия');
    fireEvent.click(screen.getByText('готово'));
    expect(commits).toEqual(['@урон_оружия']);
  });

  it('(б) то же по Enter: первый Enter принимает подсказку, второй сохраняет', () => {
    const commits: string[] = [];
    render(<><FormulaBar /><FormulaField value="" system={system} where="Урон" onCommit={t => commits.push(t)} /></>);
    fireEvent.click(document.querySelector('.formula-field')!);
    typeIn('урон оружия');
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(chips()).toEqual(['Урон оружия']);
    expect(commits).toEqual([]);
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(commits).toEqual(['@урон_оружия']);
  });

  it('(б) закрыли список клавишей Esc и нажали Enter — сохранено имя', () => {
    const commits: string[] = [];
    render(<><FormulaBar /><FormulaField value="" system={system} where="Урон" onCommit={t => commits.push(t)} /></>);
    fireEvent.click(document.querySelector('.formula-field')!);
    typeIn('урон оружия');
    fireEvent.keyDown(field(), { key: 'Escape' });
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(commits).toEqual(['@урон_оружия']);
  });

  it('(б) то же во встроенном поле: уход из поля сохраняет имя', async () => {
    const commits: string[] = [];
    render(<FormulaField value="" system={system} where="Урон" onCommit={t => commits.push(t)} />);
    typeIn('урон оружия');
    await act(async () => { field().blur(); await new Promise(done => setTimeout(done, 200)); });
    expect(commits).toEqual(['@урон_оружия']);
  });

  it('(б) то же в обёртке FormulaInput', async () => {
    let value = '';
    function Wrap() {
      const [text, setText] = useState('');
      value = text;
      return <FormulaInput system={system} value={text} onChange={setText} />;
    }
    render(<Wrap />);
    typeIn('урон оружия');
    await act(async () => { field().blur(); await new Promise(done => setTimeout(done, 200)); });
    expect(value).toBe('@урон_оружия');
  });

  it('(в) «цель.» — фишка «Цель» и список её полей; «кл» и Enter — одна фишка с путём', () => {
    let value = '';
    render(<Host withSheets seen={v => { value = v; }} />);
    typeIn('цель.');
    expect(chips()).toEqual(['Цель']);
    expect(menu().some(row => row.includes('Класс брони'))).toBe(true);
    expect(menu().some(row => row.includes('Сила'))).toBe(true);
    typeIn('кл');
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(value).toBe('@цель.класс_брони');
    expect(chips()).toEqual(['Класс брони']);
  });

  it('(г) выбор имени шага щелчком открывает список его итогов', () => {
    render(<Host extra={steps} seen={() => {}} />);
    typeIn('брос');
    fireEvent.mouseDown([...document.querySelectorAll('.slot__option')].find(o => o.textContent?.includes('бросок'))!);
    expect(menu().map(row => row.replace('в этом эффекте', ''))).toEqual([
      'бросок целиком', 'сколько вышло всего, с прибавками', 'что выпало на костях, без прибавок', 'сколько костей бросили',
    ]);
  });

  it('(д) «и» — первым имя на «и», слово формулы ниже; «если» — слово есть в списке', () => {
    render(<Host seen={() => {}} />);
    typeIn('и');
    const rows = menu();
    expect(rows[0]).toContain('Интеллект');
    expect(rows.findIndex(row => row.includes('формула') && row.endsWith('и'))).toBeGreaterThan(0);
    cleanup();
    render(<Host seen={() => {}} />);
    typeIn('если');
    expect(menu().some(row => row.includes('формула') && row.endsWith('если'))).toBe(true);
  });

  it('(е) название у двух листов не становится фишкой, строка просит выбрать', () => {
    let value = '';
    render(<Host withSheets seen={v => { value = v; }} />);
    typeIn('класс брони +');
    expect(chips()).toEqual([]);
    expect(value).toBe('класс брони +');
    expect(note()).toBe('«класс брони» есть у нескольких — выберите в списке, чьё');
  });

  it('(ж) неизвестное слово и разделитель — строка с ближайшим именем', () => {
    render(<Host seen={() => {}} />);
    typeIn('интел +');
    expect(note()).toBe('нет имени «интел» — ближайшее: «Интеллект»');
  });

  it('(ж) слово, которое ещё набирают, строки не вызывает', () => {
    render(<Host seen={() => {}} />);
    typeIn('интел');
    expect(note()).toBe('');
  });

  it('под полем вместо ошибки движка — строка про неузнанное слово', () => {
    render(<FormulaInput system={system} value="интел + 1" onChange={() => {}} />);
    expect(document.querySelector('.verdict')!.textContent).toContain('нет имени «интел» — ближайшее: «Интеллект»');
    expect(document.querySelector('.verdict')!.textContent).not.toContain('ожидается');
  });

  it('пока имя дописано целиком по буквам, под полем нет ошибки', () => {
    function Wrap() {
      const [text, setText] = useState('');
      return <FormulaInput system={system} value={text} onChange={setText} />;
    }
    render(<Wrap />);
    typeIn('урон оружия');
    expect(document.querySelector('.verdict')?.textContent ?? '').not.toContain('ожидается');
    expect(document.querySelector('.verdict')?.textContent ?? '').not.toContain('нет имени');
  });

  it('(з) внутри кавычек ничего не узнаётся и список не открывается', () => {
    let value = '';
    render(<Host seen={v => { value = v; }} />);
    typeIn('"сила +');
    expect(value).toBe('"сила +');
    expect(chips()).toEqual([]);
    expect(menu()).toEqual([]);
  });

  it('буква после имени шага, выбранного из списка, закрывает список и не отбирает итоги', () => {
    let value = '';
    render(<Host extra={steps} seen={v => { value = v; }} />);
    typeIn('брос');
    fireEvent.mouseDown([...document.querySelectorAll('.slot__option')].find(o => o.textContent?.includes('бросок'))!);
    expect(menu().some(row => row.includes('целиком'))).toBe(true);
    typeIn('а');
    expect(value).toBe('@бросок а');
    expect(menu().some(row => row.includes('целиком'))).toBe(false);
  });

  it('(к) backspace сразу после фишки убирает фишку целиком, текст после неё остаётся', () => {
    let value = '';
    render(<Host seen={v => { value = v; }} />);
    typeIn('сила +');
    expect(value).toBe('@сила +');
    const tail = document.querySelectorAll('input.chips__text')[1] as HTMLInputElement;
    tail.focus();
    fireEvent.focus(tail);
    tail.setSelectionRange(0, 0);
    fireEvent.keyDown(tail, { key: 'Backspace' });
    expect(value).toBe(' +');
  });

  it('(к) Tab принимает подсвеченное', () => {
    let value = '';
    render(<Host seen={v => { value = v; }} />);
    typeIn('урон');
    fireEvent.keyDown(field(), { key: 'Tab' });
    expect(value).toBe('@урон_оружия');
  });

  it('(л) набор с «@» работает как раньше', () => {
    let value = '';
    render(<Host seen={v => { value = v; }} />);
    typeIn('@сил');
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(value).toBe('@сила');
    expect(chips()).toEqual(['Сила']);
  });
});
