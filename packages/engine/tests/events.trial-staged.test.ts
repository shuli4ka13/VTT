import { describe, expect, it } from 'vitest';
import { trial, sampleHeard, mannequin } from '../src/events/trial.ts';
import { litOf, sunOf } from '../src/model/sun.ts';
import { SAMPLE_WORLDS } from '../src/model/systems.ts';
import type { Compendium, Sheet, System } from '../src/model/types.ts';

const world = SAMPLE_WORLDS[0] as { system: System; compendium: Compendium; sheets: Sheet[] };
const { system, compendium } = world;
const who = (id: string): Sheet => world.sheets.find(sheet => sheet.id === id)!;
const reportsOf = (out: ReturnType<typeof trial>) => out.reports.map(entry => entry.report);

describe('проба висящего эффекта: подставное «что случилось»', () => {
  it('значения по умолчанию: сравниваемое с носителем — носитель, остальные листы — другой, «да / нет» — да, списки — списком', () => {
    expect(sampleHeard(system, 'shield', 0, 'a', 'b')).toMatchObject({ cel: 'a', deystvuyuschiy: 'b', celi: ['a'], popal: true });
    expect(sampleHeard(system, 'sneak_attack', 0, 'a', 'b')).toMatchObject({ deystvuyuschiy: 'a', cel: 'b', celi: ['b'], popal: true, preimuschestvo: true });
    expect(sampleHeard(system, 'dying', 0, 'a', 'b')).toEqual({ mover: 'a' });
  });

  it('Щит на Мирре: списана реакция и ячейка, повешено «Под щитом», листы до пробы не тронуты', () => {
    const mirra = who('mirra');
    const before = JSON.stringify(mirra);
    const out = trial({ system, compendium, effectId: 'shield', from: mirra, to: who('goblin'), handler: 0 });
    const after = out.sheets.find(sheet => sheet.id === 'mirra')!;
    expect((after.effects ?? []).map(entry => entry.effectId)).toEqual(expect.arrayContaining(['shield', 'shield_up']));
    expect(out.lines.join(' ')).toContain('Ячейка заклинания');
    expect(JSON.stringify(mirra)).toBe(before);
  });

  it('Скрытая атака на Силь с дальнобойным оружием: бросок урона и вызов «Урон» по цели', () => {
    const sil = who('sil');
    const heard = { ...sampleHeard(system, 'sneak_attack', 0, 'sil', 'goblin'), dalnost: 'dalniy' };
    const out = trial({ system, compendium, effectId: 'sneak_attack', from: sil, to: who('goblin'), handler: 0, heard, dice: 'max' });
    const goblin = out.sheets.find(sheet => sheet.id === 'goblin')!;
    expect(Number(goblin.values.hp_current)).toBeLessThan(Number(who('goblin').values.hp_current));
    expect(out.lines.join(' ')).toContain('Урон');
  });

  it('условие не выполняется или нет платы — проба говорит почему, а не молчит', () => {
    expect(() => trial({ system, compendium, effectId: 'sneak_attack', from: who('arven'), to: who('goblin'), handler: 0 })).toThrow(/условие сейчас не выполняется/);
    expect(() => trial({ system, compendium, effectId: 'shield', from: who('arven'), to: who('goblin'), handler: 0 })).toThrow(/нет ячейки/);
    expect(() => trial({ system, compendium, effectId: 'prone', from: mannequin(system, 'a', 'А'), to: mannequin(system, 'b', 'Б') })).toThrow(/нет подписки/);
  });

  it('подписка на момент хода прогоняется без листов образца', () => {
    const a = mannequin(system, 'a', 'А');
    const out = trial({ system, compendium, effectId: 'dying', from: a, to: mannequin(system, 'b', 'Б'), handler: 0, dice: 'max' });
    expect(reportsOf(out).some(report => report.effect === 'dying')).toBe(true);
  });
});

describe('подсветка пузырей по прогону', () => {
  it('Атака на «макс»: горят плата, цикл, бросок и шаги после попадания; сработавшая привязка названа', () => {
    const sun = sunOf(system, 'strike', compendium)!;
    const out = trial({ system, compendium, effectId: 'strike', from: who('arven'), to: who('goblin'), dice: 'max' });
    const lit = litOf(sun, system.effects.strike!, reportsOf(out));
    const label = (key: string): string => sun.rays.find(ray => ray.key === key)!.label;
    expect(lit.rays.map(label)).toEqual(expect.arrayContaining(['бросок', 'урон', 'Урон']));
    expect(lit.rays).toContain('cost:cost');
    expect(lit.rays.every(key => sun.rays.some(ray => ray.key === key))).toBe(true);
    expect(lit.stopped).toBeNull();
  });

  it('Атака на «мин»: промах — шаги под «попал?» не горят', () => {
    const sun = sunOf(system, 'strike', compendium)!;
    const out = trial({ system, compendium, effectId: 'strike', from: who('arven'), to: who('goblin'), dice: 'min' });
    const lit = litOf(sun, system.effects.strike!, reportsOf(out));
    const hit = sun.rays.find(ray => ray.label === 'попал?')!;
    const under = sun.rays.filter(ray => ray.under === hit.key).map(ray => ray.key);
    expect(under.some(key => lit.rays.includes(key))).toBe(false);
    expect(lit.rays).toContain(sun.rays.find(ray => ray.label === 'бросок')!.key);
  });

  it('Щит: горят «когда», «только если», «решает», плата и шаг подписки — только у прогнанной подписки', () => {
    const sun = sunOf(system, 'shield', compendium)!;
    const out = trial({ system, compendium, effectId: 'shield', from: who('mirra'), to: who('goblin'), handler: 0 });
    const lit = litOf(sun, system.effects.shield!, reportsOf(out), 0);
    expect(lit.rays).toEqual(expect.arrayContaining(['on0:when', 'on0:if', 'on0:confirm', 'on0:cost', 'on0:steps:0']));
    expect(lit.rays.some(key => key.startsWith('on1:'))).toBe(false);
  });

  it('у каждого действия каждого листа образцов подсветка называет только существующие лучи', () => {
    for (const sample of SAMPLE_WORLDS as { system: System; compendium: Compendium; sheets: Sheet[] }[]) {
      const people = sample.sheets.filter(sheet => (sheet.has ?? []).length);
      for (const id of Object.keys(sample.system.effects).slice(0, 40)) {
        const sun = sunOf(sample.system, id, sample.compendium)!;
        const from = people[0] ?? mannequin(sample.system, 'a', 'А');
        const to = people[1] ?? mannequin(sample.system, 'b', 'Б');
        let reports: ReturnType<typeof reportsOf> = [];
        try { reports = reportsOf(trial({ system: sample.system, compendium: sample.compendium, effectId: id, from, to, dice: 'avg' })); } catch { continue; }
        const lit = litOf(sun, sample.system.effects[id]!, reports, sun.launch === 'manual' ? undefined : 0);
        const keys = new Set(sun.rays.map(ray => ray.key));
        expect([id, [...lit.rays, ...lit.skipped].filter(key => !keys.has(key))]).toEqual([id, []]);
      }
    }
  });
});
