// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, cleanup, act } from '@testing-library/react';
import { EffectEditor } from './effect-editor.tsx';
import { useWorld, emptySystem } from '../../../store/world.ts';
import { useOpened } from '../../../store/opened.ts';
import type { System } from '@vtt/schema';

const KEY = (at: number) => `step|Удар|steps|${at}`;

const start = () => {
  useWorld.setState(state => ({
    ...state,
    system: {
      ...emptySystem(),
      effects: { удар: { label: 'Удар', activation: 'manual', params: [{ key: 'действующий', label: 'Кто действует', kind: 'sheet' }], steps: [
        { type: 'apply', target: { expr: '@действующий.а' }, value: { expr: '1' } },
        { type: 'apply', target: { expr: '@действующий.б' }, value: { expr: '2' } },
        { type: 'apply', target: { expr: '@действующий.в' }, value: { expr: '3' } },
      ] } },
    } as unknown as System,
  }));
  function Live() {
    const system = useWorld(st => st.system);
    return <EffectEditor id="удар" effect={system.effects.удар!} system={system} />;
  }
  render(<Live />);
};

const press = (text: string, nth = 0) => {
  const found = [...document.querySelectorAll<HTMLElement>('.step-card button, .danger-confirm button')].filter(b => (b.textContent ?? '').trim() === text);
  act(() => { fireEvent.click(found[nth]!); });
};

describe('раскрытость шагов цепочки', () => {
  beforeEach(() => { cleanup(); localStorage.clear(); useOpened.setState({ opened: {} }); });

  it('удаление шага не сворачивает соседа: раскрытым остаётся тот же шаг, а не тот, что занял номер', () => {
    start();
    act(() => { useOpened.getState().setOpen([KEY(1)], true); });
    press('Удалить', 0);
    press('точно убрать');
    const steps = useWorld.getState().system.effects.удар!.steps as unknown as { target: { expr: string } }[];
    expect(steps.map(step => step.target.expr)).toEqual(['@действующий.б', '@действующий.в']);
    const opened = useOpened.getState().opened;
    expect(opened[KEY(0)]).toBe(true);
    expect(opened[KEY(1)]).toBeUndefined();
  });

  it('удаление выше раскрытого, когда в нём правили поле, тоже переносит раскрытость', () => {
    start();
    act(() => { useOpened.getState().setOpen([KEY(2)], true); });
    act(() => { useWorld.getState().editSystem(draft => { (draft.effects.удар!.steps![2] as unknown as { value: { expr: string } }).value = { expr: '30' }; }); });
    press('Удалить', 0);
    press('точно убрать');
    const opened = useOpened.getState().opened;
    expect(opened[KEY(1)]).toBe(true);
    expect(opened[KEY(2)]).toBeUndefined();
  });
});
