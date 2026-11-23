import { group, test, eq, ok } from './harness.ts';
import { PLAYABLE_WORLDS } from '../src/model/systems.ts';
import { perform } from '../src/core/perform.ts';
import { emptyJournal } from '../src/core/external.ts';
import type { Journal, Question } from '../src/core/external.ts';
import { exchange, fight } from './play.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const sr = PLAYABLE_WORLDS.find(w => (w.system as System).id === 'shadowrun6')!;
const system = sr.system as System;
const compendium = sr.compendium as Compendium;

const runner = (values: Record<string, unknown>): Sheet => ({
  id: 'бег', systemId: 'shadowrun6', of: 'runner', name: 'Бегущий',
  values: { metatype: 'chelovek', body: 3, agility: 3, reaction: 3, strength: 3, willpower: 3, logic: 3, intuition: 3, charisma: 3, edge: 3, edge_left: 0, ...values },
  has: [], effects: [],
}) as unknown as Sheet;

const tape = (...faces: number[]) => { const rest = [...faces]; return () => rest.shift() ?? 2; };

const rollField = (sheet: Sheet, tag: string, faces: number[], pick: (q: Question) => string[] = () => [], claims?: string[]) => {
  let journal: Journal = emptyJournal();
  const die = tape(...faces);
  const asked: Question[] = [];
  for (let round = 0; round < 16; round++) {
    const out = perform({ system, compendium, clock: null, sheets: [sheet], die, journal }, { op: 'roll', sheetId: sheet.id, tag, ...(claims ? { claims } : {}) } as never);
    if (out.kind === 'done') return { log: out.log.join('\n'), sheet: out.sheets.find(s => s.id === sheet.id)!, asked };
    asked.push(out.question);
    journal = { ...out.journal, answers: { ...out.journal.answers, [out.question.key]: pick(out.question) } };
  }
  throw new Error('вопросы без конца');
};
const hits = (log: string) => Number([...log.matchAll(/успехов:? (\d+)/g)].pop()?.[1]);
const glitch = (log: string) => /применяет «Сбой»/.test(log);
const critical = (log: string) => /применяет «Критический сбой»/.test(log);

group('Shadowrun 6, глава «Проверки и Преимущество»: ситуации книжника (стр. 36–50)', () => {
  test('SR-CH-01 (стр. 36): успехов ровно порог — 5 и 6 считаются, сбоя нет', () => {
    const out = rollField(runner({ intuition: 4, 'skills.orientirovanie.rank': 3 }), 'skills.orientirovanie.pool', [6, 5, 5, 4, 3, 2, 2]);
    eq(hits(out.log), 3);
    ok(!glitch(out.log) && !critical(out.log), out.log);
  });

  test('SR-CH-02 (стр. 45): 3 единицы из 5 — сбой, но успех есть — не критический', () => {
    const out = rollField(runner({ agility: 3, strength: 3, 'skills.atletika.rank': 2 }), 'skills.atletika.pool', [6, 1, 1, 1, 3]);
    eq(hits(out.log), 1);
    ok(glitch(out.log), out.log);
    ok(!critical(out.log), out.log);
  });

  test('SR-CH-03 (стр. 45): сбой без успехов — критический сбой', () => {
    const out = rollField(runner({ intuition: 2, 'skills.orientirovanie.rank': 2 }), 'skills.orientirovanie.pool', [1, 1, 3, 1]);
    eq(hits(out.log), 0);
    ok(critical(out.log), out.log);
    ok(!glitch(out.log), 'сбой и критический сбой — разные строки');
  });

  test('SR-CH-05 (стр. 46): ЗА 10 против ЗЩ 6 — очко Преимущества; второе за раунд — последнее; третьего нет', () => {
    const shooter = { ...runner({ agility: 3, 'skills.strelba.rank': 3, edge_left: 6, edge_gained: 1, complex_left: 1 }), has: [{ of: 'predator_vi' }] } as Sheet;
    const target = (armor: number) => ({ ...runner({ body: 2, armor_worn: armor }), id: 'цель' }) as Sheet;
    const desk = { id: 'desk', systemId: 'shadowrun6', name: 'Стол', values: {}, has: [], effects: [] } as unknown as Sheet;
    const first = exchange({ system, compendium, die: tape(), sheets: [shooter, target(4), desk], clock: fight('бег', 'цель'), actionId: 'predator_vi:0', fromId: 'бег', toId: 'цель', inputs: { distanciya_2: 'blizkaya' } });
    const after = first.sheets.find(s => s.id === 'бег')!;
    eq(after.values.edge_left, 7);
    eq(after.values.edge_gained, 2);
    const second = exchange({ system, compendium, die: tape(), sheets: [{ ...after, values: { ...after.values, complex_left: 1 } } as Sheet, target(3), desk], clock: fight('бег', 'цель'), actionId: 'predator_vi:0', fromId: 'бег', toId: 'цель', inputs: { distanciya_2: 'blizkaya' } });
    eq(second.sheets.find(s => s.id === 'бег')!.values.edge_left, 7);
    const three = exchange({ system, compendium, die: tape(), sheets: [{ ...shooter, values: { ...shooter.values, edge_left: 2, edge_gained: 0, complex_left: 1 } } as Sheet, target(5), desk], clock: fight('бег', 'цель'), actionId: 'predator_vi:0', fromId: 'бег', toId: 'цель', inputs: { distanciya_2: 'blizkaya' } });
    eq(three.sheets.find(s => s.id === 'бег')!.values.edge_left, 2, 'разница 3 — очка нет');
  });

  test('SR-CH-05б (стр. 46): вне боя предела в 2 очка за раунд нет, предел 7 держится', () => {
    const shooter = { ...runner({ agility: 3, 'skills.strelba.rank': 3, edge_left: 6, edge_gained: 2 }), has: [{ of: 'predator_vi' }] } as Sheet;
    const target = { ...runner({ body: 2, armor_worn: 4 }), id: 'цель' } as Sheet;
    const out = exchange({ system, compendium, die: tape(), sheets: [shooter, target], actionId: 'predator_vi:0', fromId: 'бег', toId: 'цель', inputs: { distanciya_2: 'blizkaya' } });
    const sheet = out.sheets.find(s => s.id === 'бег')!;
    eq(sheet.values.edge_left, 7);
    eq(sheet.values.edge_gained, 2);
  });

  test('SR-CH-06 (стр. 47): +1 к единице за 2 очка — сбоя больше нет, запас 3 → 1', () => {
    const out = rollField(runner({ logic: 3, edge_left: 3, 'skills.inzhenernoe_delo.rank': 3 }), 'skills.inzhenernoe_delo.pool', [5, 1, 1, 1, 1, 3],
      q => (q.offers.some(o => o.id === 'edge_bump') ? ['edge_bump'] : []));
    eq(out.sheet.values.edge_left, 1);
    ok(!glitch(out.log) && !critical(out.log), out.log);
    ok(out.log.includes('кость поднята'), out.log);
  });

  test('SR-CH-06а (стр. 47): +1 к четвёрке — успех', () => {
    const out = rollField(runner({ logic: 3, edge_left: 3, 'skills.inzhenernoe_delo.rank': 3 }), 'skills.inzhenernoe_delo.pool', [5, 4, 3, 2, 2, 2],
      q => (q.offers.some(o => o.id === 'edge_bump') ? ['edge_bump'] : []));
    ok(/итог 1 → 2/.test(out.log), out.log);
  });

  test('SR-CH-07 (стр. 48): «Перебросить все неуспехи» после сбоя не предлагается', () => {
    const out = rollField(runner({ agility: 3, edge_left: 4, 'skills.strelba.rank': 3 }), 'skills.strelba.pool', [5, 1, 1, 1, 1, 4]);
    const offered = out.asked.flatMap(q => q.offers.map(o => o.id));
    ok(!offered.includes('reroll_failures'), offered.join(','));
    ok(offered.includes('edge_reroll_one'), 'другие траты есть');
    ok(glitch(out.log), out.log);
    eq(out.sheet.values.edge_left, 4);
  });

  test('SR-CH-07а (стр. 48): без сбоя «Перебросить все неуспехи» предлагается и тратит 4', () => {
    const out = rollField(runner({ agility: 3, edge_left: 4, 'skills.strelba.rank': 3 }), 'skills.strelba.pool', [5, 1, 4, 3, 2, 2, 6, 6, 5, 1, 1],
      q => (q.offers.some(o => o.id === 'reroll_failures') ? ['reroll_failures'] : []));
    eq(out.sheet.values.edge_left, 0);
    ok(/итог 1 → 4/.test(out.log) || hits(out.log.split('\n').pop()!) === 4, out.log);
  });

  test('SR-CH-09 (стр. 50): дикий кубик — 6 даёт 3 успеха, единица гасит пятёрки', () => {
    const sheet = runner({ agility: 3, 'skills.strelba.rank': 4 });
    const lucky = rollField(sheet, 'skills.strelba.pool', [6, 6, 5, 5, 3, 2, 2], () => [], ['wild_die']);
    eq(hits(lucky.log), 6, lucky.log);
    const cursed = rollField(sheet, 'skills.strelba.pool', [1, 6, 5, 5, 3, 2, 2], () => [], ['wild_die']);
    eq(hits(cursed.log), 1, cursed.log);
  });

  test('«+1 успех» за 3 очка доходит до урона атаки (стр. 48)', () => {
    const shooter = { ...runner({ agility: 3, 'skills.strelba.rank': 3, edge_left: 3 }), has: [{ of: 'predator_vi' }] } as Sheet;
    const target = { ...runner({ body: 2, armor_worn: 5 }), id: 'цель' } as Sheet;
    const plain = exchange({ system, compendium, die: tape(5, 5, 2, 2, 2, 2, 5, 2, 2, 2, 2, 2, 2, 2, 2), sheets: [shooter, target], actionId: 'predator_vi:0', fromId: 'бег', toId: 'цель', inputs: { distanciya_2: 'blizkaya' } });
    const bought = exchange({ system, compendium, die: tape(5, 5, 2, 2, 2, 2, 5, 2, 2, 2, 2, 2, 2, 2, 2), sheets: [shooter, target], actionId: 'predator_vi:0', fromId: 'бег', toId: 'цель', inputs: { distanciya_2: 'blizkaya' },
      answer: q => (q.offers.some(o => o.id === 'edge_plus_hit') ? ['edge_plus_hit'] : []) });
    eq(plain.sheets.find(s => s.id === 'цель')!.values.physical, 3 + 1);
    eq(bought.sheets.find(s => s.id === 'цель')!.values.physical, 3 + 2);
    eq(bought.sheets.find(s => s.id === 'бег')!.values.edge_left, 0);
  });
});
