import { group, test, eq, ok } from './harness.ts';
import { PLAYABLE_WORLDS } from '../src/model/systems.ts';
import { perform } from '../src/core/perform.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const world = PLAYABLE_WORLDS.find(one => one.system.name === 'D&D 5e')!;
const arven = world.sheets.find(sheet => sheet.id === 'arven')!;

const roll = (effects: string[], stacks = false): string => {
  const system = structuredClone(world.system) as System;
  if (stacks) for (const key of ['advantage', 'disadvantage']) system.roll_edits![key]!.stacks = true;
  const faces = [15, 4];
  let at = 0;
  const sheet = { ...arven, has: [], effects: effects.map(effectId => ({ effectId })) } as unknown as Sheet;
  const out = perform({ system, compendium: world.compendium as Compendium, clock: null, sheets: [sheet], die: () => faces[at++ % faces.length]! }, { op: 'roll', sheetId: 'arven', tag: 'abilities.strength.mod' } as never);
  if (out.kind !== 'done') throw new Error(out.kind);
  return out.log.join('\n');
};

group('журнал броска говорит, какие слова погасили друг друга', () => {
  test('Преимущество и Помеха гасятся — строка это называет, кость одна', () => {
    const line = roll(['helped', 'poisoned']);
    ok(line.includes('[15] + 4 = 19'), line);
    ok(line.includes('погасили друг друга: Преимущество, Помеха'), line);
  });

  test('одна помеха без пары — про гашение ни слова', () => {
    const line = roll(['poisoned', 'frightened']);
    ok(line.includes('(Помеха)'), line);
    eq(line.includes('погасили'), false);
  });

  test('вопрос «кости выпали» показывает бросок с тем же гашением', () => {
    const system = structuredClone(world.system) as System;
    const faces = [15, 4];
    let at = 0;
    const sheet = { ...arven, effects: [{ effectId: 'helped' }, { effectId: 'poisoned' }] } as unknown as Sheet;
    const out = perform({ system, compendium: world.compendium as Compendium, clock: null, sheets: [sheet], die: () => faces[at++ % faces.length]! }, { op: 'roll', sheetId: 'arven', tag: 'abilities.strength.mod' } as never);
    eq(out.kind, 'paused');
    if (out.kind !== 'paused') return;
    eq(out.question.window, 'seen');
    ok(out.question.preview[0]!.includes('погасили друг друга: Преимущество, Помеха'), out.question.preview.join(' | '));
    ok(out.question.preview[0]!.startsWith('Бросок (Проверка, '), out.question.preview.join(' | '));
  });

  test('по разу от каждого эффекта: две помехи против одного преимущества — одна помеха остаётся, гашение названо', () => {
    const line = roll(['helped', 'poisoned', 'frightened'], true);
    ok(line.includes('(Помеха)'), line);
    ok(line.includes('погасили друг друга: Преимущество, Помеха'), line);
  });
});
