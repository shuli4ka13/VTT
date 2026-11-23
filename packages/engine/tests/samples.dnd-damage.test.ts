import { group, test, eq, ok, deepEq } from './harness.ts';
import { PLAYABLE_WORLDS } from '../src/model/systems.ts';
import { exchange, fight } from './play.ts';
import { perform } from '../src/core/perform.ts';
import { emptyJournal } from '../src/core/external.ts';
import type { Question } from '../src/core/external.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const dnd = PLAYABLE_WORLDS.find(w => (w.system as System).id === 'dnd5e')!;
const system = dnd.system as System;
const compendium = dnd.compendium as Compendium;
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

const queue = (...values: number[]) => {
  const rest = [...values];
  return () => {
    if (!rest.length) throw new Error('кость бросили больше раз, чем ожидал тест');
    return rest.shift()!;
  };
};

const sheetsWith = (items: string[], effects: string[] = []): Sheet[] => {
  const sheets = clone(dnd.sheets as Sheet[]);
  const arven = sheets.find(s => s.id === 'arven')!;
  arven.has = [...(arven.has ?? []).filter(h => h.of !== 'longsword'), ...items.map(of => ({ of }))];
  arven.effects = [...(arven.effects ?? []), ...effects.map(effectId => ({ effectId }))];
  const goblin = sheets.find(s => s.id === 'goblin')!;
  goblin.values = { ...goblin.values, hp_current: 500, hp_max: 500 };
  return sheets;
};

const strike = (sheets: Sheet[], actionId: string, dice: number[], answer?: (q: Question) => string[], battle = false, inputs?: Record<string, string>) =>
  exchange({
    system, compendium, die: queue(...dice), sheets, actionId, fromId: 'arven', toId: 'goblin',
    ...(answer ? { answer } : {}), ...(inputs ? { inputs } : {}), ...(battle ? { clock: fight('arven', 'goblin') } : {}),
  });

const damage = (played: ReturnType<typeof exchange>): any =>
  played.reports.flatMap(x => x.report.trace).find(t => t.step === 'uron');
const offers = (q: Question) => q.offers.map(o => o.id);

const withLuck = (sheets: Sheet[]): Sheet[] => sheets.map(sh => (sh.id === 'arven'
  ? { ...sh, values: { ...sh.values, 'resources.luck.max': 3, 'resources.luck.left': 3 } } : sh));
const seen = (played: ReturnType<typeof exchange>): string[][] => played.questions.filter(q => q.window === 'seen').map(offers);
const decline = (): string[] => [];
const only = (id: string) => (q: Question): string[] => (offers(q).includes(id) && q.window === 'seen' ? [id] : []);

group('урон — бросок с хозяином: кости оружия', () => {
  test('двуручный меч: без крита две кости к6, на крите четыре', () => {
    const plain = strike(sheetsWith(['greatsword']), 'greatsword:0', [10, 4, 5]);
    deepEq(damage(plain).rolls, [4, 5]);
    const crit = strike(sheetsWith(['greatsword']), 'greatsword:0', [20, 1, 2, 3, 4]);
    deepEq(damage(crit).rolls, [1, 2, 3, 4]);
  });

  test('урон несёт метки оружия, дальности и свойств и хозяина', () => {
    const t = damage(strike(sheetsWith(['greatsword']), 'greatsword:0', [10, 4, 5]));
    eq(t.by, 'arven');
    for (const tag of ['uron', 'oruzhie', 'blizhniy', 'tyazheloe', 'dvuruchnoe']) ok(t.tags.includes(tag), tag);
  });
});

group('«Бой большим оружием»', () => {
  test('двуручный меч: 1 и 2 засчитаны как 3', () => {
    const t = damage(strike(sheetsWith(['greatsword', 'trait_style_great_weapon']), 'greatsword:0', [10, 1, 2]));
    deepEq(t.rolls, [3, 3]);
    deepEq(t.edits, ['Бой большим оружием']);
  });

  test('кости выше двух не трогаются, без черты 1 и 2 остаются', () => {
    deepEq(damage(strike(sheetsWith(['greatsword', 'trait_style_great_weapon']), 'greatsword:0', [10, 1, 5])).rolls, [3, 5]);
    deepEq(damage(strike(sheetsWith(['greatsword']), 'greatsword:0', [10, 1, 2])).rolls, [1, 2]);
  });

  test('длинный меч (универсальное) не трогается: хват таблица не знает', () => {
    const t = damage(strike(sheetsWith(['longsword', 'trait_style_great_weapon']), 'longsword:0', [10, 1]));
    deepEq(t.rolls, [1]);
    eq(t.edits, undefined);
  });
});

group('реакции к20 не касаются урона', () => {
  test('«Везунчик»: атаку предложено перебросить, урон — нет', () => {
    const base = withLuck(sheetsWith(['greatsword', 'feat_lucky']));
    const r = strike(base, 'greatsword:0', [10, 4, 5], decline);
    eq(seen(r).filter(o => o.includes('lucky_point')).length, 1, 'вопрос только на атаку');
    const miss = strike(base, 'greatsword:0', [10, 15, 4, 5], only('lucky_point'));
    ok(miss.questions.length >= 1);
    eq(miss.sheets.find(x => x.id === 'arven')!.values['resources.luck.left'], 2, 'потрачено одно очко');
  });

  test('«Героическое вдохновение» урон по-прежнему может перебросить', () => {
    const r = strike(sheetsWith(['greatsword']), 'greatsword:0', [10, 4, 5], decline);
    eq(seen(r).filter(o => o.includes('inspire')).length, 2, 'атака и урон');
  });
});

group('«Свирепый атакующий»', () => {
  const sheets = () => sheetsWith(['greatsword', 'feat_savage']);

  test('на уроне оружием вопрос есть, на броске атаки — нет', () => {
    const r = strike(sheets(), 'greatsword:0', [10, 4, 5], decline, true);
    eq(seen(r).filter(o => o.includes('savage_attacker')).length, 1);
    eq(seen(r)[0]!.includes('savage_attacker'), false, 'первое окно — атака');
  });

  test('согласие: второй набор целиком, остаётся больший', () => {
    const better = strike(sheets(), 'greatsword:0', [10, 2, 3, 5, 6], only('savage_attacker'), true);
    deepEq(damage(better).rolls, [5, 6]);
    const worse = strike(sheets(), 'greatsword:0', [10, 5, 6, 1, 2], only('savage_attacker'), true);
    deepEq(damage(worse).rolls, [5, 6]);
  });

  test('отказ — набор прежний', () => {
    deepEq(damage(strike(sheets(), 'greatsword:0', [10, 2, 3], undefined, true)).rolls, [2, 3]);
  });

  test('второй урон оружием в тот же ход — плата не проходит, вопроса нет', () => {
    const first = strike(sheets(), 'greatsword:0', [10, 2, 3, 5, 6], only('savage_attacker'), true);
    eq(first.sheets.find(x => x.id === 'arven')!.values['turn.svirepyy.left'], 0);
    const second = strike(first.sheets, 'greatsword:0', [10, 2, 3], decline, true);
    eq(seen(second).filter(o => o.includes('savage_attacker')).length, 0);
    deepEq(damage(second).rolls, [2, 3]);
  });

  test('«Скрытая атака» — не кости оружия, вопроса «Свирепого» нет', () => {
    const r = strike(sheetsWith(['feature_sneak', 'feat_savage']), 'feature_sneak:0', [3, 4, 5], decline, true, { damage_type: 'kolyuschiy' });
    eq(seen(r).filter(o => o.includes('savage_attacker')).length, 0);
  });
});

group('D&D: слово правки, заявленное к удару, ложится только на свои броски', () => {
  const swing = (claims: string[], dice: number[]) => exchange({
    system, compendium, die: queue(...dice), sheets: sheetsWith(['longsword']), actionId: 'longsword:0', fromId: 'arven', toId: 'goblin', claims: { source: claims },
  }).log.join(' · ');

  test('«Преимущество» — две кости у атаки, урон одной костью', () => {
    const log = swing(['advantage'], [15, 1, 1]);
    ok(/Бросок \(Атака\): \[15, 1\] → 15 \(Преимущество\)/.test(log), log);
    ok(/урон[^\]]*\): \[1\] \+/.test(log), log);
  });

  test('«Бой большим оружием» — 1 на кости урона становится 3, кость атаки не трогает', () => {
    const log = swing(['great_weapon'], [15, 1]);
    ok(/Бросок \(Атака\): \[15\] \+/.test(log), log);
    ok(/\[3\] \(Бой большим оружием\)/.test(log), log);
    ok(/Бросок \(Атака\): \[2\] \+/.test(swing(['great_weapon'], [2, 1])));
  });

  test('«Надёжный талант» — проверка навыка 3 → 10, удар не трогает: кость урона к8 остаётся 1', () => {
    const check = (claims: string[]) => {
      let journal = emptyJournal();
      for (let round = 0; round < 8; round++) {
        const out = perform({ system, compendium, clock: null, sheets: sheetsWith(['longsword']), die: () => 3, journal }, { op: 'roll', sheetId: 'arven', tag: 'skills.atletika.total', claims });
        if (out.kind === 'done') return out.log.join(' · ');
        journal = { ...out.journal, answers: { ...out.journal.answers, [out.question.key]: [] } };
      }
      throw new Error('вопросы без конца');
    };
    ok(/\[10\] \(Надёжный талант\)/.test(check(['reliable'])), check(['reliable']));
    ok(/\[3\]/.test(check([])), check([]));
    const log = swing(['reliable'], [15, 1]);
    ok(/урон[^\]]*\): \[1\] \+/.test(log), log);
  });

  test('«Везучий» — единица на атаке перебрасывается, на кости урона — нет', () => {
    const log = swing(['lucky'], [1, 15, 1]);
    ok(/урон[^\]]*\): \[1\] \+/.test(log), log);
  });
});
