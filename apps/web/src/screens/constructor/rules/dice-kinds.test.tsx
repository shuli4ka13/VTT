// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { RollsSection } from './rolls-section.tsx';
import { DiceSection } from './dice-section.tsx';
import { RollEditsSection } from './roll-edits-section.tsx';
import type { System } from '@vtt/schema';

const hits = { label: 'Набор', kind: 'die', dice: [{ sides: 6, count: 3 }], read: { kind: 'count', atLeast: 5 } };
const d20 = { label: 'К20', kind: 'die', dice: [{ sides: 20 }] };

const make = (constants: Record<string, unknown>, rolls: Record<string, unknown> = {}, edits: Record<string, unknown> = {}) =>
  ({ tables: {}, effects: {}, constants, rolls, roll_edits: edits }) as unknown as System;

const options = (select: HTMLSelectElement) => [...select.children].map(node => (node instanceof HTMLOptGroupElement
  ? `${node.label}: ${[...node.children].map(option => option.textContent).join(' | ')}` : node.textContent));

describe('виды костей на экране правил', () => {
  afterEach(cleanup);

  it('у набора успехов в «Число поля — это» нет граней и «не больше»; чужое значение видно с пометкой', () => {
    const system = make({ h: hits }, { r: { die: 'h', fields: [], number: 'under' } });
    const view = render(<RollsSection system={system} editSystem={change => change(system as never)} />);
    const select = view.container.querySelector<HTMLSelectElement>('select[aria-label="Число поля — это"]')!;
    expect([...options(select)].sort()).toEqual(['порог: выпало не больше — не подходит этой кости', 'порог: выпало не меньше', 'прибавка к выпавшему', 'сколько костей бросить'].sort());
    cleanup();
    const sound = make({ h: hits }, { r: { die: 'h', fields: [], number: 'count' } });
    const again = render(<RollsSection system={sound} editSystem={change => change(sound as never)} />);
    expect(options(again.container.querySelector<HTMLSelectElement>('select[aria-label="Число поля — это"]')!)).toEqual(['прибавка к выпавшему', 'сколько костей бросить', 'порог: выпало не меньше']);
  });

  it('у кости, число которой задаёт бросок, есть подпись, и вид назван словом', () => {
    const system = make({ h: hits }, { r: { die: 'h', fields: [], number: 'count', label: 'Проверка' } });
    const view = render(<DiceSection system={system} editSystem={() => {}} usage={new Map()} />);
    expect(view.container.textContent).toContain('в броске «Проверка» число костей задаёт поле');
    expect(view.container.textContent).toContain('набор: считаем успехи');
  });

  const palette = (system: System) => {
    const system2 = system;
    const view = render(<RollEditsSection system={system2} editSystem={change => change(system2 as never)} usage={new Map()} />);
    const select = [...view.container.querySelectorAll<HTMLSelectElement>('select')].find(one => one.textContent!.includes('+ добавить…'))!;
    return { select, system: system2 };
  };
  const edit = { label: 'Правка', ops: [] };

  it('в системе с одной к20: одна группа «одна кость», дикий кубик — в «остальные»', () => {
    const { select } = palette(make({ d: d20 }, { r: { die: 'd', fields: [] } }, { e: edit }));
    const groups = options(select);
    expect(groups.filter(line => line.includes(': '))).toHaveLength(2);
    const one = groups.find(line => line.startsWith('одна кость: '))!;
    const other = groups.find(line => line.startsWith('остальные: '))!;
    expect(one).not.toContain('дикий кубик');
    expect(other).toContain('дикий кубик');
  });

  it('с набором успехов и к20 — две группы, «добавить кость в набор» в обеих; выбор добавляет действие', () => {
    const { select, system } = palette(make({ d: d20, h: hits }, { r: { die: 'd', fields: [] }, s: { die: 'h', fields: [], number: 'count' } }, { e: edit }));
    const groups = options(select);
    const one = groups.find(line => line.startsWith('одна кость: '))!;
    const set = groups.find(line => line.startsWith('набор: считаем успехи: '))!;
    expect(one).toContain('добавить кость в набор');
    expect(set).toContain('добавить кость в набор');
    expect(set).toContain('дикий кубик');
    fireEvent.change(select, { target: { value: 'hits:addDie' } });
    expect((system.roll_edits as Record<string, { ops: unknown[] }>).e!.ops).toEqual([{ op: 'addDie' }]);
  });
});
