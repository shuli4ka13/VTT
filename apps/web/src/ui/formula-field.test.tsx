// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { FormulaField } from './formula-field.tsx';
import { FormulaBar } from './formula-bar.tsx';
import { useFormulaBar } from '../store/formula-bar.ts';
import { useLookup } from '../store/lookup.ts';
import type { System } from '@vtt/schema';

const system = {
  tables: { лист: { shape: 'single', columns: [{ key: 'сила', label: 'Сила', kind: 'number' }] } },
  effects: {}, constants: {},
} as unknown as System;

const barInput = () => [...document.querySelectorAll('.formula-bar input.chips__text')].at(-1) as HTMLInputElement;

describe('одно поле формулы на всё', () => {
  beforeEach(() => { useFormulaBar.getState().dismiss(); });
  afterEach(() => { cleanup(); });

  it('в форме — одна строка без ввода, щелчок открывает строку формул с подписью, Enter сохраняет один раз', () => {
    const commits: string[] = [];
    const live: string[] = [];
    render(<><FormulaBar /><FormulaField value="@сила + 2" system={system} where="Бонус атаки"
      onChange={text => live.push(text)} onCommit={text => commits.push(text)} /></>);

    const field = document.querySelector('.formula-field')!;
    expect(field.querySelector('input')).toBeNull();
    expect(field.textContent).toContain('Сила');
    expect(document.querySelector('.formula-bar')).toBeNull();

    fireEvent.click(field);
    expect(document.querySelector('.formula-bar')!.textContent).toContain('Бонус атаки');
    expect(document.querySelector('.formula-field--spot')).not.toBeNull();

    fireEvent.change(barInput(), { target: { value: ' + 3' } });
    expect(live.at(-1)).toBe('@сила + 3');
    fireEvent.keyDown(barInput(), { key: 'Enter' });
    expect(commits).toEqual(['@сила + 3']);
    expect(document.querySelector('.formula-bar')).toBeNull();
  });

  it('ничего не поменяли — сохранять нечего; Esc отменяет', () => {
    const commits: string[] = [];
    let cancelled = false;
    render(<><FormulaBar /><FormulaField value="@сила" system={system} where="А"
      onCommit={text => commits.push(text)} onCancel={() => { cancelled = true; }} /></>);
    fireEvent.click(document.querySelector('.formula-field')!);
    fireEvent.click(screen.getByText('готово'));
    expect(commits).toEqual([]);

    fireEvent.click(document.querySelector('.formula-field')!);
    fireEvent.change(barInput(), { target: { value: ' + 1' } });
    fireEvent.keyDown(barInput(), { key: 'Escape' });
    expect(commits).toEqual([]);
    expect(cancelled).toBe(true);
  });

  it('щелчок по другому полю сохраняет начатое в первом', () => {
    const first: string[] = [];
    render(<><FormulaBar />
      <FormulaField value="1" system={system} where="Первое" onCommit={text => first.push(text)} />
      <FormulaField value="2" system={system} where="Второе" onCommit={() => {}} />
    </>);
    const [a, b] = [...document.querySelectorAll('.formula-field')];
    fireEvent.click(a!);
    fireEvent.change(barInput(), { target: { value: '5' } });
    fireEvent.click(b!);
    expect(first).toEqual(['5']);
    expect(document.querySelector('.formula-bar')!.textContent).toContain('Второе');
  });

  it('без строки формул на экране поле правится на месте — тем же редактором', () => {
    const commits: string[] = [];
    render(<FormulaField value="" system={system} where="А" onCommit={text => commits.push(text)} />);
    const input = document.querySelector('input.chips__text') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '7' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(commits).toEqual(['7']);
  });

  it('значение-фишка во время правки не двоится: поле показывает то, что в строке формул', () => {
    render(<><FormulaBar /><FormulaField value="" barValue="@сила" system={system} where="А"
      prefix={<span className="chips__chip">Сила-фишка</span>} onCommit={() => {}} /></>);
    const field = document.querySelector('.formula-field')!;
    expect(field.textContent).toContain('Сила-фишка');
    fireEvent.click(field);
    expect(field.textContent).not.toContain('Сила-фишка');
    expect(field.querySelectorAll('.chips__chip')).toHaveLength(1);
  });

  it('щелчок по фишке открывает справку «откуда это», а не строку формул; в строке формул — тоже', () => {
    useLookup.getState().close();
    render(<><FormulaBar /><FormulaField value="@сила + 2" system={system} where="Бонус атаки" /></>);
    fireEvent.click(document.querySelector('.formula-field .chips__chip')!);
    expect(useLookup.getState().at).toEqual({ name: 'сила', label: 'Сила', where: 'Бонус атаки' });
    expect(document.querySelector('.formula-bar')).toBeNull();

    useLookup.getState().close();
    fireEvent.click(document.querySelector('.formula-field')!);
    fireEvent.mouseDown(document.querySelector('.formula-bar .chips__name--pick')!);
    expect(useLookup.getState().at?.name).toBe('сила');
    expect(document.querySelector('.formula-bar')).not.toBeNull();
    useLookup.getState().close();
  });
});
