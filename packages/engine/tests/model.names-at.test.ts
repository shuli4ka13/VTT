import { describe, it, expect } from 'vitest';
import { namesAt, sheetNamesAt, stepSaid } from '../src/model/names-at.ts';
import { loopParam } from '../src/engine/steps/each.ts';
import { SAMPLE_SYSTEMS } from '../src/model/systems.ts';
import type { System } from '../src/model/types.ts';

const dnd = SAMPLE_SYSTEMS[0] as System;
const names = (list: { name: string }[]) => list.map(one => one.name);

describe('namesAt: что видно в каждом месте эффекта', () => {
  it('шаги кнопки: входы, переменная цикла после «для каждого», итоги шагов выше с путями внутрь', () => {
    const before = names(namesAt(dnd, 'strike', { part: 'steps', index: 0 }));
    expect(before).toContain('deystvuyuschiy');
    expect(before).not.toContain('brosok');
    expect(before).not.toContain('cel');
    const inside = namesAt(dnd, 'strike', { part: 'steps', index: 13 });
    expect(names(inside)).toContain('cel');
    expect(names(inside)).toContain('brosok');
    expect(inside.find(one => one.name === 'celi')?.many).toBe(true);
    expect(inside.find(one => one.name === 'brosok')?.children?.map(c => c.path)).toContain('.popal');
    expect(inside.find(one => one.name === 'brosok')?.label).toBe('Бросок атаки');
  });

  it('шаги подписки: носитель и слышимые входы вызова с подписями', () => {
    const list = namesAt(dnd, 'hellish_rebuke', { part: 'handler', handler: 0, index: 2 });
    expect(names(list)).toEqual(expect.arrayContaining(['holder', 'list', 'istochnik', 'amount', 'spas']));
    expect(list.find(one => one.name === 'istochnik')?.group).toBe('heard');
    expect(names(sheetNamesAt(dnd, 'concentration', { part: 'handler', handler: 0, index: 0 }))).toEqual(expect.arrayContaining(['holder', 'list']));
  });

  it('заклинание видит свои входы круга и ячейки', () => {
    const list = names(namesAt(dnd, 'spell_buff', { part: 'steps', index: 0 }));
    expect(list).toContain('slot');
  });

  it('наложение видит носителя', () => {
    const system = { ...dnd, effects: { ...dnd.effects, x: { label: 'x', activation: 'passive', params: [{ key: 'наложил', kind: 'sheet' }], attach: [] } } } as System;
    expect(names(namesAt(system, 'x', { part: 'attach', index: 0 }))).toEqual(expect.arrayContaining(['holder', 'наложил']));
  });

  it('«завершено» видит таблицу итогов с колонками шагов внутри цикла', () => {
    const system = { ...dnd, effects: { ...dnd.effects, x: { label: 'x', activation: 'passive', on: [{ on: 'done:strike', steps: [] }] } } } as System;
    const rows = namesAt(system, 'x', { part: 'handler', handler: 0, index: 0 }).find(one => one.name === 'results');
    expect(rows?.children?.map(c => c.path)).toContain('.brosok.popal');
  });

  it('подписка на метку слышит выходы договора с видом: у «Щита» «попал» — да/нет со словом договора, шагов чужого эффекта нет', () => {
    const inIf = namesAt(dnd, 'shield', { part: 'handler-if', handler: 0 });
    expect(inIf.find(one => one.name === 'popal')).toMatchObject({ label: 'попал', kind: 'boolean', group: 'heard' });
    expect(names(inIf)).not.toContain('brosok');
  });

  it('то же при подписке прямо на эффект, а не на метку', () => {
    const system = { ...dnd, effects: { ...dnd.effects, x: { label: 'x', activation: 'passive', on: [{ on: 'after:strike', steps: [] }] } } } as System;
    const hit = namesAt(system, 'x', { part: 'handler', handler: 0, index: 0 }).find(one => one.name === 'brosok');
    expect(hit?.children?.map(c => c.path)).toContain('.popal');
  });

  it('итоги вызова видны подпискам «после» и «до» отдельными именами с подписью и видом', () => {
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
    expect(namesAt(system, 'до', { part: 'handler-if', handler: 0 }).find(one => one.name === 'урон')).toMatchObject({ kind: 'number', group: 'heard' });
  });
});

describe('подпись шага и имени цикла', () => {
  it('шаг называется подписью, без неё — ключом с пробелами; имя в формуле остаётся ключом', () => {
    expect(stepSaid({ id: 'attack_roll' })).toBe('attack roll');
    expect(stepSaid({ id: 'attack_roll', label: 'Бросок атаки' })).toBe('Бросок атаки');
    const system = structuredClone(dnd) as System;
    const step = (system.effects.strike!.steps ?? []).find(one => one.id === 'brosok')! as { label?: string };
    step.label = 'Удар мечом';
    const seen = namesAt(system, 'strike', { part: 'steps', index: 13 }).find(one => one.name === 'brosok');
    expect(seen?.said).toBe('Удар мечом');
  });

  it('строка цикла подписана своей подписью, ключ прежний', () => {
    expect(loopParam({ type: 'each', rows: 'skills', as: 'skill' } as never)).toMatchObject({ key: 'skill', label: 'skill' });
    expect(loopParam({ type: 'each', rows: 'skills', as: 'skill', asLabel: 'навык' } as never)).toMatchObject({ key: 'skill', label: 'навык' });
  });
});
