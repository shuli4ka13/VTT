import { describe, it, expect } from 'vitest';
import { namesAt, sheetNamesAt } from '../src/model/names-at.ts';
import { SAMPLE_SYSTEMS } from '../src/model/systems.ts';
import type { System } from '../src/model/types.ts';

const dnd = SAMPLE_SYSTEMS[0] as System;
const names = (list: { name: string }[]) => list.map(one => one.name);

describe('namesAt: что видно в каждом месте эффекта', () => {
  it('шаги кнопки: входы, переменная цикла после «для каждого», итоги шагов выше с путями внутрь', () => {
    const before = names(namesAt(dnd, 'strike', { part: 'steps', index: 0 }));
    expect(before).toContain('действующий');
    expect(before).not.toContain('hit_бросок');
    expect(before).not.toContain('цель');
    const inside = namesAt(dnd, 'strike', { part: 'steps', index: 4 });
    expect(names(inside)).toContain('цель');
    expect(names(inside)).toContain('hit_бросок');
    expect(inside.find(one => one.name === 'цели')?.many).toBe(true);
    expect(inside.find(one => one.name === 'hit')?.children?.map(c => c.path)).toContain('.success');
  });

  it('шаги подписки: носитель и слышимые входы вызова с подписями', () => {
    const list = namesAt(dnd, 'hellish_rebuke', { part: 'handler', handler: 0, index: 2 });
    expect(names(list)).toEqual(expect.arrayContaining(['носитель', 'лист', 'источник', 'amount', 'save_бросок', 'save']));
    expect(list.find(one => one.name === 'источник')?.group).toBe('heard');
    expect(names(sheetNamesAt(dnd, 'concentration', { part: 'handler', handler: 0, index: 0 }))).toEqual(expect.arrayContaining(['носитель', 'лист']));
  });

  it('потомок видит входы основы', () => {
    const list = names(namesAt(dnd, 'spell_buff_held', { part: 'steps', index: 0 }));
    expect(list).toContain('slot');
  });

  it('наложение видит носителя', () => {
    const system = { ...dnd, effects: { ...dnd.effects, x: { label: 'x', activation: 'passive', params: [{ key: 'наложил', kind: 'sheet' }], attach: [] } } } as System;
    expect(names(namesAt(system, 'x', { part: 'attach', index: 0 }))).toEqual(expect.arrayContaining(['носитель', 'наложил']));
  });

  it('«завершено» видит таблицу итогов с колонками шагов внутри цикла', () => {
    const system = { ...dnd, effects: { ...dnd.effects, x: { label: 'x', activation: 'passive', on: [{ on: 'done:strike', steps: [] }] } } } as System;
    const rows = namesAt(system, 'x', { part: 'handler', handler: 0, index: 0 }).find(one => one.name === 'итоги');
    expect(rows?.children?.map(c => c.path)).toContain('.hit.success');
  });
});
