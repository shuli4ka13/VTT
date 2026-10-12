// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import type { System } from '@vtt/schema';
import { ParamsEditor } from './params-editor.tsx';
import { roleOf } from './roles.ts';

const world = (effects: Record<string, unknown>): System =>
  ({ tables: {}, constants: {}, effects } as unknown as System);

const mount = (system: System, id: string) =>
  render(<ParamsEditor id={id} effect={system.effects[id]!} system={system} onEdit={() => {}} />);

const callers = (): HTMLElement | null => document.querySelector<HTMLElement>('.callers');

describe('строка «Вызывают» над входами', () => {
  afterEach(cleanup);

  it('у эффекта «кнопкой» без вызывающих написано «никто»', () => {
    mount(world({ удар: { label: 'Удар', activation: 'manual', steps: [] } }), 'удар');
    expect(callers()!.textContent).toBe('Вызываютникто');
  });

  it('у висящего и у срабатывающего сам без вызывающих строки нет', () => {
    const system = world({
      благословлён: { label: 'Благословлён', activation: 'passive', modifiers: [{ kind: 'value', target: 'x', op: 'add', value: { expr: '1' } }] },
      щит: { label: 'Щит', activation: 'passive', on: [{ on: 'before:удар', steps: [] }] },
    });
    expect([roleOf(system, null, 'благословлён'), roleOf(system, null, 'щит')]).toEqual(['passive', 'auto']);
    mount(system, 'благословлён');
    expect(callers()).toBeNull();
    cleanup();
    mount(system, 'щит');
    expect(callers()).toBeNull();
  });

  it('висящий эффект, которого зовёт шаг другого эффекта, показывает вызывающего как раньше', () => {
    const system = world({
      благословлён: { label: 'Благословлён', activation: 'passive', modifiers: [{ kind: 'value', target: 'x', op: 'add', value: { expr: '1' } }] },
      молитва: { label: 'Молитва', activation: 'manual', steps: [{ id: 'вызов', type: 'emit', effect: 'благословлён' }] },
    });
    mount(system, 'благословлён');
    expect(callers()!.textContent).toBe('ВызываютМолитва');
  });

  it('у «шага для других» и «платы» без вызывающих «никто» остаётся — это предупреждение, что их никто не зовёт', () => {
    const system = world({
      урон: { label: 'Урон', activation: 'manual', params: [{ key: 'amount', label: 'Сколько', kind: 'number', role: 'amount' }], steps: [] },
      трата: { label: 'Трата', group: 'Плата', activation: 'manual', steps: [] },
    });
    expect([roleOf(system, null, 'урон'), roleOf(system, null, 'трата')]).toEqual(['step', 'pay']);
    mount(system, 'урон');
    expect(callers()!.textContent).toBe('Вызываютникто');
    cleanup();
    mount(system, 'трата');
    expect(callers()!.textContent).toBe('Вызываютникто');
  });
});
