// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { pickCombo, comboOptions } from '../../../testing/cards.ts';
import { RollsSection } from './rolls-section.tsx';
import { DiceSection } from './dice-section.tsx';
import { RollEditsSection } from './roll-edits-section.tsx';
import type { System } from '@vtt/schema';

const hits = { label: 'Набор', kind: 'die', dice: [{ sides: 6, count: 3 }], read: { kind: 'count', atLeast: 5 } };
const d20 = { label: 'К20', kind: 'die', dice: [{ sides: 20 }] };

const make = (constants: Record<string, unknown>, rolls: Record<string, unknown> = {}, edits: Record<string, unknown> = {}) =>
  ({ tables: {}, effects: {}, constants, rolls, roll_edits: edits }) as unknown as System;

const options = (combo: HTMLElement): string[] => {
  const lines: { group: string; labels: string[] }[] = [];
  for (const item of comboOptions(combo)) {
    const last = lines[lines.length - 1];
    if (last && item.group && last.group === item.group) last.labels.push(item.label);
    else lines.push({ group: item.group, labels: [item.label] });
  }
  return lines.map(line => (line.group ? `${line.group}: ${line.labels.join(' | ')}` : line.labels[0]!));
};

describe('виды костей на экране правил', () => {
  afterEach(cleanup);

  it('у набора успехов в «Число поля — это» нет граней и «не больше»; чужое значение видно с пометкой', () => {
    const system = make({ h: hits }, { r: { die: 'h', fields: [], number: 'under' } });
    const view = render(<RollsSection system={system} editSystem={change => change(system as never)} />);
    const select = view.container.querySelector<HTMLElement>('[role="combobox"][aria-label="Число поля — это"]')!;
    expect([...options(select)].sort()).toEqual(['порог: выпало не больше — не подходит этой кости', 'порог: выпало не меньше', 'прибавка к выпавшему', 'сколько костей бросить'].sort());
    cleanup();
    const sound = make({ h: hits }, { r: { die: 'h', fields: [], number: 'count' } });
    const again = render(<RollsSection system={sound} editSystem={change => change(sound as never)} />);
    expect(options(again.container.querySelector<HTMLElement>('[role="combobox"][aria-label="Число поля — это"]')!)).toEqual(['прибавка к выпавшему', 'сколько костей бросить', 'порог: выпало не меньше']);
  });

  it('у кости, число которой задаёт бросок, есть подпись, и вид назван словом', () => {
    const system = make({ h: hits }, { r: { die: 'h', fields: [], number: 'count', label: 'Проверка' } });
    const view = render(<DiceSection system={system} editSystem={() => {}} usage={new Map()} />);
    expect(view.container.textContent).toContain('в броске «Проверка» число костей задаёт поле');
    expect(view.container.textContent).toContain('набор: считаем успехи');
  });

  it('у кости нет «ещё» у части и строки «Если костей ноль»', () => {
    const system = make({ h: hits, d: d20 });
    const view = render(<DiceSection system={system} editSystem={() => {}} usage={new Map()} />);
    expect(view.container.textContent).not.toContain('Если костей ноль');
    expect(view.container.querySelector('.dice-term .fold')).toBeNull();
    expect(view.container.textContent).not.toContain('сверх');
  });

  const zeroRow = (root: HTMLElement) => root.querySelector<HTMLElement>('[role="combobox"][aria-label="Если костей ноль"]');
  const numberSelect = (root: HTMLElement) => root.querySelector<HTMLElement>('[role="combobox"][aria-label="Число поля — это"]')!;

  it('у броска «сколько костей бросить» есть «Если костей ноль»: пишется и снимается', () => {
    const system = make({ h: hits }, { r: { die: 'h', fields: [], number: 'count' } });
    const view = render(<RollsSection system={system} editSystem={change => change(system as never)} />);
    pickCombo(zeroRow(view.container)!, 'worst');
    expect(system.rolls!.r!.zero).toEqual({ count: 2 });
    pickCombo(zeroRow(view.container)!, 'best');
    expect(system.rolls!.r!.zero).toEqual({ count: 2, keep: 'best' });
    cleanup();
    const set = make({ h: hits }, { r: { die: 'h', fields: [], number: 'count', zero: { count: 2 } } });
    const again = render(<RollsSection system={set} editSystem={change => change(set as never)} />);
    pickCombo(zeroRow(again.container)!, '');
    expect(set.rolls!.r).not.toHaveProperty('zero');
  });

  it('при «прибавка к выпавшему» строки «Если костей ноль» нет; смена числа поля снимает zero и keep', () => {
    const plain = make({ h: hits }, { r: { die: 'h', fields: [] } });
    const first = render(<RollsSection system={plain} editSystem={change => change(plain as never)} />);
    expect(zeroRow(first.container)).toBeNull();
    cleanup();
    const system = make({ h: hits }, { r: { die: 'h', fields: [], number: 'count', zero: { count: 2 }, keep: { expr: '2' } } });
    const view = render(<RollsSection system={system} editSystem={change => change(system as never)} />);
    pickCombo(numberSelect(view.container), 'over');
    expect(system.rolls!.r).not.toHaveProperty('zero');
    expect(system.rolls!.r).not.toHaveProperty('keep');
  });

  const palette = (system: System) => {
    const system2 = system;
    const view = render(<RollEditsSection system={system2} editSystem={change => change(system2 as never)} usage={new Map()} />);
    const select = [...view.container.querySelectorAll<HTMLElement>('[role="combobox"]')].find(one => (one as HTMLInputElement).placeholder === '+ добавить…')!;
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
    pickCombo(select, 'hits:addDie');
    expect((system.roll_edits as Record<string, { ops: unknown[] }>).e!.ops).toEqual([{ op: 'addDie' }]);
  });
});
