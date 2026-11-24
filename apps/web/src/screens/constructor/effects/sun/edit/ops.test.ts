import { describe, it, expect, beforeEach } from 'vitest';
import { SAMPLE_WORLDS } from '@vtt/engine/samples';
import { sunOf } from '@vtt/engine';
import type { Effect, Step, System } from '@vtt/schema';
import { addArm, removeSteps, validFlow } from '../../../cards.ts';
import { withRole } from '../../roles.ts';
import { addHandler, canInsert, insertStep, moveAtom, placeFor, removeAtom, removeHandler, templateKey } from './ops.ts';
import type { Mode, Template } from './ops.ts';

const dnd = SAMPLE_WORLDS.find(world => world.system.name === 'D&D 5e')!;

let system: System;

const withEffect = (id: string, effect: Effect): System => ({ ...system, effects: { ...system.effects, [id]: effect } });

const sunIn = (id: string, effect: Effect) => sunOf(withEffect(id, effect), id)!;

const rayOf = (id: string, effect: Effect, key: string) => sunIn(id, effect).rays.find(ray => ray.key === key)!;

const keys = (id: string, effect: Effect): string[] => sunIn(id, effect).rays.map(ray => ray.key);

const brick = (key: string): Template => ({ kind: 'brick', key });

const put = (id: string, effect: Effect, rayKey: string | null, mode: Mode, template: Template): string | null => {
  const sys = withEffect(id, effect);
  const sun = sunOf(sys, id)!;
  const ray = rayKey ? sun.rays.find(one => one.key === rayKey)! : null;
  const spot = placeFor(effect, sun, ray, mode, template)!;
  return insertStep(effect, sys, id, spot, template);
};

const types = (steps: Step[] | undefined): string[] => (steps ?? []).map(step => step.type);

const blank = (): Effect => ({
  label: 'Новый', activation: 'manual', steps: [],
  params: [{ key: 'actor', label: 'Кто', kind: 'sheet' }],
} as unknown as Effect);

beforeEach(() => { system = structuredClone(dnd.system); });

describe('операции пузырей: сборка с нуля', () => {
  it('пустой эффект → «Если» → два шага внутрь → вложенное «Если» → «Иначе» → шаг в «Иначе»', () => {
    const effect = blank();
    expect(put('new', effect, null, 'inside', brick('branch'))).toBe('steps:0');
    expect(types(effect.steps)).toEqual(['branch', 'end']);

    expect(put('new', effect, 'steps:0', 'inside', brick('change'))).toBe('steps:0');
    expect(types(effect.steps)).toEqual(['branch', 'apply', 'end']);

    expect(put('new', effect, 'steps:0', 'inside', brick('stop'))).toBe('steps:2');
    expect(types(effect.steps)).toEqual(['branch', 'apply', 'stop', 'end']);

    expect(put('new', effect, 'steps:2', 'after', brick('branch'))).toBe('steps:3');
    expect(types(effect.steps)).toEqual(['branch', 'apply', 'stop', 'branch', 'end', 'end']);
    expect(validFlow(effect.steps!)).toBe(true);

    effect.steps = addArm(effect.steps!, 0, false);
    expect(types(effect.steps)).toEqual(['branch', 'apply', 'stop', 'branch', 'end', 'orElse', 'end']);
    expect(validFlow(effect.steps)).toBe(true);

    const elseKey = keys('new', effect).find(key => rayOf('new', effect, key).span?.from === 5)!;
    expect(put('new', effect, elseKey, 'inside', brick('number'))).toBe('steps:6');
    expect(types(effect.steps)).toEqual(['branch', 'apply', 'stop', 'branch', 'end', 'orElse', 'roll', 'end']);
    expect(validFlow(effect.steps)).toBe(true);
    expect(keys('new', effect)).toContain('steps:6');
  });

  it('«после блока» ставит шаг за «Конец», «внутрь» — в конец первой руки', () => {
    const effect = blank();
    put('new', effect, null, 'inside', brick('branch'));
    put('new', effect, 'steps:0', 'inside', brick('change'));
    put('new', effect, 'steps:0', 'inside', brick('stop'));
    effect.steps = addArm(effect.steps!, 0, false);
    expect(put('new', effect, 'steps:0', 'after', brick('number'))).not.toBeNull();
    expect(types(effect.steps)).toEqual(['branch', 'apply', 'stop', 'orElse', 'end', 'roll']);
  });
});

describe('операции пузырей: вставка', () => {
  it('после выбранного луча в середине цепочки «Атаки»', () => {
    const effect = structuredClone(system.effects.strike!);
    const before = effect.steps!.length;
    const key = put('strike', effect, 'steps:10', 'after', brick('stop'));
    expect(effect.steps!.length).toBe(before + 1);
    expect(effect.steps![11]!.type).toBe('stop');
    expect(key).not.toBeNull();
    expect(keys('strike', effect)).toContain(key);
  });

  it('вызов эффекта встаёт после выбранного и получает свои входы', () => {
    const effect = structuredClone(system.effects.strike!);
    const key = put('strike', effect, 'steps:13', 'after', { kind: 'call', effect: 'damage' });
    expect(effect.steps![14]).toMatchObject({ type: 'emit', effect: 'damage' });
    expect(keys('strike', effect)).toContain(key);
  });

  it('без выбора шаг уходит в конец цепочки эффекта кнопкой', () => {
    const effect = structuredClone(system.effects.strike!);
    const before = effect.steps!.length;
    put('strike', effect, null, 'after', brick('stop'));
    expect(effect.steps!.length).toBe(before + 1);
    expect(effect.steps![before]!.type).toBe('stop');
  });

  it('плата встаёт в конец платы', () => {
    const effect = structuredClone(system.effects.strike!);
    const pay = withRole(system, dnd.compendium, 'pay', 'strike')[0]![0];
    const before = effect.cost!.length;
    const key = put('strike', effect, 'steps:10', 'after', { kind: 'pay', effect: pay });
    expect(effect.cost!.length).toBe(before + 1);
    expect(effect.cost![before]).toMatchObject({ type: 'emit', effect: pay });
    expect(key).toBe('cost:cost');
    expect(keys('strike', effect)).toContain(key);
  });

  it('при выбранном луче платы обычный шаг встаёт в конец шагов, а не в плату', () => {
    const effect = structuredClone(system.effects.strike!);
    const steps = effect.steps!.length;
    const cost = effect.cost!.length;
    const sys = withEffect('strike', effect);
    const spot = placeFor(effect, sunOf(sys, 'strike')!, rayOf('strike', effect, 'cost:cost'), 'after', brick('stop'));
    expect(canInsert(effect, sys, 'strike', spot, brick('stop'))).toBe(true);
    put('strike', effect, 'cost:cost', 'after', brick('stop'));
    expect(effect.steps!.length).toBe(steps + 1);
    expect(effect.cost!.length).toBe(cost);
  });

  it('у висящего без выбора шаг идёт в шаги первой подписки', () => {
    const effect = structuredClone(system.effects.shield!);
    const before = effect.on![0]!.steps!.length;
    const key = put('shield', effect, null, 'after', brick('stop'));
    expect(effect.on![0]!.steps!.length).toBe(before + 1);
    expect(key).toBe(`on0:steps:${before}`);
    expect(keys('shield', effect)).toContain(key);
  });

  it('вставка после шага подписки и перед «когда» — в начало шагов', () => {
    const effect = structuredClone(system.effects.shield!);
    put('shield', effect, 'on0:steps:0', 'after', brick('stop'));
    expect(effect.on![0]!.steps![1]!.type).toBe('stop');
    put('shield', effect, 'on1:when', 'after', brick('stop'));
    expect(effect.on![1]!.steps![0]!.type).toBe('stop');
  });
});

describe('операции пузырей: запреты формы', () => {
  it('«для каждого» внутрь «Если» нельзя, после блока можно', () => {
    const effect = blank();
    put('new', effect, null, 'inside', brick('branch'));
    const sun = sunIn('new', effect);
    const ray = sun.rays[0]!;
    const inside = placeFor(effect, sun, ray, 'inside', brick('each'));
    expect(canInsert(effect, system, 'new', inside, brick('each'))).toBe('reason.eachInside');
    const after = placeFor(effect, sun, ray, 'after', brick('each'));
    expect(canInsert(effect, system, 'new', after, brick('each'))).toBe(true);
  });

  it('шаги «увидев кости» только в подписке на бросок', () => {
    const seen: Template = { kind: 'seen', key: 'roll-add' };
    const plain = structuredClone(system.effects.strike!);
    const spot = placeFor(plain, sunIn('strike', plain), null, 'after', seen);
    expect(canInsert(plain, system, 'strike', spot, seen)).toBe('reason.seen');
    const shield = structuredClone(system.effects.shield!);
    expect(canInsert(shield, system, 'shield', placeFor(shield, sunIn('shield', shield), null, 'after', seen), seen)).toBe('reason.seen');
    shield.on![0]!.on = 'seen';
    expect(canInsert(shield, system, 'shield', placeFor(shield, sunIn('shield', shield), null, 'after', seen), seen)).toBe(true);
    const key = put('shield', shield, null, 'after', seen);
    expect(shield.on![0]!.steps!.at(-1)!.type).toBe('roll-add');
    expect(keys('shield', shield)).toContain(key);
  });

  it('вызывать нельзя себя и висящее, накладывать — не висящее, платы — только в плату, в плату — только платы', () => {
    const effect = structuredClone(system.effects.strike!);
    const sun = sunIn('strike', effect);
    const check = (template: Template): string | true => canInsert(effect, system, 'strike', placeFor(effect, sun, null, 'after', template), template);
    expect(check({ kind: 'call', effect: 'strike' })).toBe('reason.callSelf');
    expect(check({ kind: 'call', effect: 'shield' })).toBe('reason.callPassive');
    expect(check({ kind: 'status', effect: 'damage' })).toBe('reason.statusManual');
    expect(check({ kind: 'status', effect: 'shield' })).toBe(true);
    const intoCost = { part: 'cost' as const, index: 0 };
    expect(canInsert(effect, system, 'strike', intoCost, brick('stop'))).toBe('reason.costOnly');
    expect(canInsert(effect, system, 'strike', { part: 'steps', index: 0 }, { kind: 'pay', effect: 'x' })).toBe('reason.payHere');
  });

  it('шаблоны имеют ключи для палитры', () => {
    expect(templateKey(brick('roll'))).toBe('brick:roll');
    expect(templateKey({ kind: 'call', effect: 'damage' })).toBe('call:damage');
  });
});

describe('операции пузырей: перенос и удаление', () => {
  it('шаг и целый блок идут вверх и вниз, порядок возвращается, поток шагов остаётся верным', () => {
    const effect = structuredClone(system.effects.strike!);
    const original = structuredClone(effect.steps);
    const sys = withEffect('strike', effect);
    const down = moveAtom(effect, sys, 'strike', rayOf('strike', effect, 'steps:13').span!, 1);
    expect(down).not.toBeNull();
    expect(validFlow(effect.steps!)).toBe(true);
    expect(keys('strike', effect)).toContain(down);
    const up = moveAtom(effect, sys, 'strike', rayOf('strike', effect, down!).span!, -1);
    expect(effect.steps).toEqual(original);
    expect(up).toBe('steps:13');

    const blockUp = moveAtom(effect, sys, 'strike', rayOf('strike', effect, 'steps:11').span!, -1);
    expect(blockUp).toBe('steps:10');
    expect(effect.steps![10]!.type).toBe('branch');
    expect(effect.steps![17]!.type).toBe('emit');
    expect(validFlow(effect.steps!)).toBe(true);
    const blockDown = moveAtom(effect, sys, 'strike', rayOf('strike', effect, 'steps:10').span!, 1);
    expect(blockDown).toBe('steps:11');
    expect(effect.steps).toEqual(original);
  });

  it('первый шаг вверх не сдвигается, голова «Иначе» не переносится', () => {
    const effect = blank();
    put('new', effect, null, 'inside', brick('branch'));
    put('new', effect, 'steps:0', 'inside', brick('stop'));
    effect.steps = addArm(effect.steps!, 0, false);
    const sys = withEffect('new', effect);
    const elseSpan = sunIn('new', effect).rays.find(ray => ray.span?.from === 2)!.span!;
    expect(moveAtom(effect, sys, 'new', elseSpan, -1)).toBeNull();
    const first = sunIn('new', effect).rays[0]!.span!;
    const before = structuredClone(effect.steps);
    expect(moveAtom(effect, sys, 'new', first, -1)).toBeNull();
    expect(effect.steps).toEqual(before);
  });

  it('удаление чистит ссылки так же, как форма', () => {
    const effect = structuredClone(system.effects.strike!);
    const expected = removeSteps(structuredClone(effect.steps!), [12]).steps;
    expect(removeAtom(effect, rayOf('strike', effect, 'steps:12').span!)).toBeNull();
    expect(effect.steps).toEqual(expected);
  });

  it('удаление «Если» убирает блок целиком, удаление «Иначе» — только руку', () => {
    const effect = structuredClone(system.effects.strike!);
    const expected = removeSteps(structuredClone(effect.steps!), [11, 12, 13, 14, 15, 16, 17]).steps;
    removeAtom(effect, rayOf('strike', effect, 'steps:11').span!);
    expect(effect.steps).toEqual(expected);

    const small = blank();
    put('new', small, null, 'inside', brick('branch'));
    put('new', small, 'steps:0', 'inside', brick('stop'));
    small.steps = addArm(small.steps!, 0, false);
    put('new', small, sunIn('new', small).rays.find(ray => ray.span?.from === 2)!.key, 'inside', brick('number'));
    removeAtom(small, sunIn('new', small).rays.find(ray => ray.span?.from === 2)!.span!);
    expect(types(small.steps)).toEqual(['branch', 'stop', 'end']);
  });
});

describe('операции пузырей: подписки', () => {
  it('добавить подписку и убрать подписку', () => {
    const effect = structuredClone(system.effects.shield!);
    const key = addHandler(effect, 'seen');
    expect(key).toBe('on2:when');
    expect(effect.on![2]).toMatchObject({ on: 'seen', steps: [] });
    expect(keys('shield', effect)).toContain(key);
    removeHandler(effect, 0);
    expect(effect.on).toHaveLength(2);
    removeHandler(effect, 0);
    removeHandler(effect, 0);
    expect(effect.on).toBeUndefined();
  });
});
