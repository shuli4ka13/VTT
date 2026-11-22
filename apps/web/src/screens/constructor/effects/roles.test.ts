import { describe, it, expect } from 'vitest';
import { SAMPLE_WORLDS, LITE_WORLDS } from '@vtt/engine/samples';
import { launchOf } from '@vtt/engine';
import type { System, Compendium, Effect } from '@vtt/schema';
import { rolesOf, roleOf, roleWords, withRole, ROLE_GROUPS } from './roles.ts';

const act = (extra: Partial<Effect> = {}): Effect => ({ label: 'Удар', steps: [], ...extra }) as Effect;
const edit = { kind: 'value', target: 'сила', op: '+', value: { expr: '1' } };
const hear = { on: 'удар', steps: [] };
const sys = (extra: Record<string, unknown> = {}, effects: Record<string, Effect> = {}): System =>
  ({ effects: { удар: act(), ...effects }, ...extra }) as unknown as System;
const book = (extra: Record<string, unknown> = {}) => ({ shape: 'book', columns: [], ...extra });
const none: Compendium = {};

describe('роль эффекта-кнопки', () => {
  it('кнопка у типа записи — «кнопкой»', () => {
    expect(roleWords(sys({ tables: { оружие: book({ bindings: [{ effect: 'удар' }] }) } }), none, 'удар')).toBe('кнопкой');
  });

  it('кнопка у записи компендиума и у встроенной записи — «кнопкой»', () => {
    const record = { id: 'меч', table: 'оружие', bindings: [{ effect: 'удар' }] };
    const system = sys({ tables: { оружие: book() } });
    expect(roleOf(system, { records: [record] } as Compendium, 'удар')).toBe('button');
    expect(roleOf(sys({ tables: { оружие: book() }, library: [record] }), none, 'удар')).toBe('button');
  });

  it.each([
    ['типом листа', { sheets: { герой: { grants: ['удар'] } } }],
    ['системой всем', { grants: ['удар'] }],
    ['типом записи', { tables: { черты: book({ grants: ['удар'] }) } }],
    ['встроенной записью', { library: [{ id: 'черта', grants: ['удар'] }] }],
  ])('выданное %s — «кнопкой»', (_, extra) => {
    expect(roleWords(sys(extra), none, 'удар')).toBe('кнопкой');
  });

  it('выданное другим эффектом — «кнопкой»', () => {
    const system = sys({}, { ярость: act({ activation: 'passive', grants: ['удар'] }) });
    expect(roleOf(system, none, 'удар')).toBe('button');
  });

  it('без кнопки и без вызова — «не подключён», в группе «Не подключены»', () => {
    const system = sys({ tables: { список: { shape: 'rows', bindings: [{ effect: 'удар' }] } } });
    expect(roleWords(system, none, 'удар')).toBe('не подключён');
    expect(ROLE_GROUPS[roleOf(system, none, 'удар')]).toBe('Не подключены');
  });

  it('компендий неизвестен — «не подключён» не выдаётся', () => {
    expect(roleWords(sys(), null, 'удар')).toBe('кнопкой');
  });

  it('вызываемое другим эффектом — «вызывается»', () => {
    const system = sys({}, { атака: act({ steps: [{ type: 'emit', effect: 'удар' }] }) });
    expect(roleWords(system, none, 'удар')).toBe('вызывается');
  });

  it('вызываемое через вход, который выбран в записи, — «вызывается»', () => {
    const атака = act({ params: [{ key: 'приём', kind: 'effect' }], steps: [{ type: 'emit', effect: { expr: '@приём' } }] } as Partial<Effect>);
    const system = sys({ tables: { оружие: book({ bindings: [{ effect: 'атака' }] }) } }, { атака });
    const compendium = { records: [{ id: 'меч', table: 'оружие', cells: { приём: { expr: '"удар"' } } }] } as Compendium;
    expect(roleOf(system, compendium, 'удар')).toBe('step');
  });

  it('зовётся в цене — «плата»', () => {
    const system = sys({ grants: ['атака'] }, { атака: act({ cost: [{ type: 'emit', effect: 'удар' }] }) });
    expect(roleWords(system, none, 'удар')).toBe('плата');
  });

  it('«+ плата» по-прежнему предлагает и неподключённые', () => {
    expect(withRole(sys(), none, 'button').map(([id]) => id)).toEqual(['удар']);
    expect(withRole(sys(), none, 'unbound').map(([id]) => id)).toEqual(['удар']);
  });
});

describe('подпись висящего', () => {
  const words = (effect: Partial<Effect>) => roleWords(sys({}, { знак: act({ activation: 'passive', ...effect }) }), none, 'знак');

  it('правит', () => expect(words({ modifiers: [edit] } as Partial<Effect>)).toBe('висит · правит'));
  it('срабатывает сам', () => expect(words({ on: [hear] })).toBe('висит · срабатывает сам'));
  it('правит и срабатывает сам', () => expect(words({ modifiers: [edit], on: [hear] } as Partial<Effect>)).toBe('висит · правит и срабатывает сам'));
  it('пустой — просто «висит»', () => expect(words({})).toBe('висит'));
});

describe('образцы', () => {
  const worlds = [...SAMPLE_WORLDS, ...LITE_WORLDS];

  it.each(worlds.map(world => [String(world.system.name), world] as const))('%s: «не подключён» — только у эффектов, на которые никто не ссылается', (_, world) => {
    const system = world.system as System;
    const roles = rolesOf(system, world.compendium as Compendium);
    for (const [id, role] of roles) {
      if (role !== 'unbound') continue;
      const rest = { ...world, system: { ...system, effects: Object.fromEntries(Object.entries(system.effects).filter(([key]) => key !== id)) } };
      expect(JSON.stringify(rest), id).not.toContain(`"${id}"`);
    }
  });

  it.each(worlds.map(world => [String(world.system.name), world] as const))('%s: «+ плата» видит все эффекты-кнопки', (_, world) => {
    const system = world.system as System;
    const compendium = world.compendium as Compendium;
    const offered = new Set((['pay', 'step', 'button'] as const).flatMap(role => withRole(system, compendium, role).map(([id]) => id)));
    const manual = Object.entries(system.effects).filter(([, effect]) => launchOf(effect).kind === 'manual').map(([id]) => id);
    expect([...offered].sort()).toEqual(manual.sort());
  });
});
