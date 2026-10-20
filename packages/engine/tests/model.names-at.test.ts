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
    expect(before).not.toContain('бросок');
    expect(before).not.toContain('цель');
    const inside = namesAt(dnd, 'strike', { part: 'steps', index: 4 });
    expect(names(inside)).toContain('цель');
    expect(names(inside)).toContain('бросок');
    expect(inside.find(one => one.name === 'цели')?.many).toBe(true);
    expect(inside.find(one => one.name === 'бросок')?.children?.map(c => c.path)).toContain('.попал');
    expect(inside.find(one => one.name === 'бросок')?.label).toBe('Бросок атаки');
  });

  it('шаги подписки: носитель и слышимые входы вызова с подписями', () => {
    const list = namesAt(dnd, 'hellish_rebuke', { part: 'handler', handler: 0, index: 2 });
    expect(names(list)).toEqual(expect.arrayContaining(['носитель', 'лист', 'источник', 'amount', 'спас']));
    expect(list.find(one => one.name === 'источник')?.group).toBe('heard');
    expect(names(sheetNamesAt(dnd, 'concentration', { part: 'handler', handler: 0, index: 0 }))).toEqual(expect.arrayContaining(['носитель', 'лист']));
  });

  it('заклинание видит свои входы круга и ячейки', () => {
    const list = names(namesAt(dnd, 'spell_buff', { part: 'steps', index: 0 }));
    expect(list).toContain('slot');
  });

  it('наложение видит носителя', () => {
    const system = { ...dnd, effects: { ...dnd.effects, x: { label: 'x', activation: 'passive', params: [{ key: 'наложил', kind: 'sheet' }], attach: [] } } } as System;
    expect(names(namesAt(system, 'x', { part: 'attach', index: 0 }))).toEqual(expect.arrayContaining(['носитель', 'наложил']));
  });

  it('«завершено» видит таблицу итогов с колонками шагов внутри цикла', () => {
    const system = { ...dnd, effects: { ...dnd.effects, x: { label: 'x', activation: 'passive', on: [{ on: 'done:strike', steps: [] }] } } } as System;
    const rows = namesAt(system, 'x', { part: 'handler', handler: 0, index: 0 }).find(one => one.name === 'итоги');
    expect(rows?.children?.map(c => c.path)).toContain('.бросок.попал');
  });

  it('услышанный шаг-вызов даёт итоги вызываемого эффекта: у «Щита» @бросок.попал — фишка, а не сырой текст', () => {
    const inIf = namesAt(dnd, 'shield', { part: 'handler-if', handler: 0 });
    const hit = inIf.find(one => one.name === 'бросок');
    expect(hit?.group).toBe('heard');
    expect(hit?.children?.map(c => c.path)).toEqual(expect.arrayContaining(['.попал', '.крит', '.на_костях']));
    expect(hit?.children?.find(c => c.path === '.попал')).toMatchObject({ label: 'попадание', kind: 'boolean' });
  });

  it('то же при подписке прямо на эффект, а не на метку', () => {
    const system = { ...dnd, effects: { ...dnd.effects, x: { label: 'x', activation: 'passive', on: [{ on: 'after:strike', steps: [] }] } } } as System;
    const hit = namesAt(system, 'x', { part: 'handler', handler: 0, index: 0 }).find(one => one.name === 'бросок');
    expect(hit?.children?.map(c => c.path)).toContain('.попал');
  });

  it('итоги вызова видны подписке «после» отдельными именами с подписью и видом, в «до» их нет', () => {
    const system = {
      ...dnd,
      effects: {
        ...dnd.effects,
        удар: { label: 'Удар', params: [], returns: [{ key: 'урон', label: 'Урон', kind: 'number', expr: { expr: '3' } }], steps: [] },
        после: { label: 'После', activation: 'passive', on: [{ on: 'after:удар', steps: [] }] },
        до: { label: 'До', activation: 'passive', on: [{ on: 'before:удар', steps: [] }] },
      },
    } as unknown as System;
    const after = namesAt(system, 'после', { part: 'handler-if', handler: 0 }).find(one => one.name === 'урон');
    expect(after).toMatchObject({ name: 'урон', label: 'Урон', kind: 'number', group: 'heard' });
    expect(names(namesAt(system, 'до', { part: 'handler-if', handler: 0 }))).not.toContain('урон');
  });
});
