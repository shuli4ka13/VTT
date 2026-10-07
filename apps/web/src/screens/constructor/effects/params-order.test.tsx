// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import type { System, Effect } from '@vtt/schema';
import { ParamsEditor } from './params-editor.tsx';

describe('входы эффекта перетаскиваются', () => {
  it('схватил «Источник» и бросил над «Сколько» — он стал вторым', () => {
    const effect = { label: 'Потратить', params: [
      { key: 'лист', label: 'Чей', kind: 'sheet' },
      { key: 'amount', label: 'Сколько', kind: 'number' },
      { key: 'источник', label: 'Источник', kind: 'field' },
    ] } as unknown as Effect;
    const system = { tables: {}, effects: { spend: effect }, constants: {} } as unknown as System;
    render(<ParamsEditor id="spend" effect={effect} system={system} onEdit={change => change(effect)} />);
    const row = (label: string) => [...document.querySelectorAll('.drag-item')].find(el => (el.querySelector('input') as HTMLInputElement).value === label)! as HTMLElement;
    const dataTransfer = { setData: () => {}, effectAllowed: '' };
    fireEvent.dragStart(row('Источник'), { dataTransfer });
    fireEvent.dragOver(row('Сколько'), { dataTransfer, clientY: -10 });
    fireEvent.drop(row('Сколько'), { dataTransfer });
    expect(effect.params!.map(p => p.key)).toEqual(['лист', 'источник', 'amount']);
  });
});
