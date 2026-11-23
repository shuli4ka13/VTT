import { writeFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { PLAYABLE_WORLDS } from '../src/model/systems.ts';
import { exchange } from './play.ts';
import { calc, newPass } from '../src/engine/calc.ts';
import { resolveAttack } from './sr6-book-calc.ts';
import type { Mode, Range, Fighter, Weapon, Outcome } from './sr6-book-calc.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const sr = PLAYABLE_WORLDS.find(w => (w.system as System).id === 'shadowrun6')!;
const system = sr.system as System;
const CASES = Number(process.env.SR_BOOK ?? 0);

const RANGES: Range[] = ['vplotnuyu', 'blizkaya', 'srednyaya', 'dalnyaya', 'ekstremalnaya'];
const MODE_NAME: Record<Mode, string> = { 'ОВ': 'odinochnyy_vystrel', 'КО': 'korotkaya_ochered', 'ДО': 'dlinnaya_ochered', 'НО': 'nepreryvnyy_ogon' };

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

interface Case { attacker: Fighter; defender: Fighter; weapon: Weapon; mode: Mode; range: Range }

function generate(random: () => number): Case {
  const int = (lo: number, hi: number) => lo + Math.floor(random() * (hi - lo + 1));
  const fighter = (): Fighter => ({
    body: int(1, 6), agility: int(1, 7), reaction: int(1, 6), intuition: int(1, 6), willpower: int(1, 6), skill: int(1, 7),
    armor: int(0, 6), physical: int(0, 6), stun: int(0, 9), edge: 3,
  });
  const range = RANGES[int(0, 4)]!;
  const ar = Object.fromEntries(RANGES.map(r => [r, r === range ? (random() < 0.1 ? null : int(1, 14)) : (random() < 0.3 ? null : int(1, 14))])) as Record<Range, number | null>;
  const modes = (['КО', 'ДО', 'НО'] as Mode[]).filter(() => random() < 0.5);
  const all: Mode[] = ['ОВ', 'КО', 'ДО', 'НО'];
  const mode = random() < 0.85 ? (['ОВ', ...modes] as Mode[])[int(0, modes.length)]! : all[int(0, 3)]!;
  return { attacker: fighter(), defender: fighter(), weapon: { ar, dv: int(2, 6), stun: random() < 0.3, modes, ammo: int(0, 12), melee: false }, mode, range };
}

const sheetOf = (id: string, f: Fighter, gun?: Weapon): Sheet => ({
  id, systemId: 'shadowrun6', of: 'runner', name: id,
  values: {
    metatype: 'chelovek', body: f.body, agility: f.agility, reaction: f.reaction, strength: 3, willpower: f.willpower, logic: 3,
    intuition: f.intuition, charisma: 3, edge: f.edge, edge_left: 0, edge_gained: 0, armor_worn: f.armor, physical: f.physical, stun: f.stun,
    'skills.strelba.rank': f.skill,
  },
  has: gun ? [{ of: 'испытательный_ствол', values: { ammo: gun.ammo } }] : [], effects: [],
}) as unknown as Sheet;

const recordOf = (w: Weapon) => ({
  id: 'испытательный_ствол', table: 'firearm', label: 'Испытательный ствол',
  cells: {
    dv: w.dv, damage_kind: w.stun ? 'оглушающий' : 'физический', skill: 'strelba', class: 'tyazhelyy_pistolet',
    modes: w.modes.map(m => MODE_NAME[m]), ammo_max: 30, reload: 'oboyma',
    ...Object.fromEntries(RANGES.flatMap((r, i) => (w.ar[r] === null ? [] : [[`ar${i + 1}`, w.ar[r]]]))),
  },
});

interface Seen { why?: string; refused: boolean; ar: number; hit: boolean; damage: number; physical: number; stun: number; prone: boolean; edgeTo: string | null; ammoLeft: number; glitch: boolean; dice: { attack: number[]; defense: number[]; resist: number[] } }

function engine(one: Case, random: () => number): Seen | { error: string } {
  const compendium = { ...(sr.compendium as Compendium), records: [...(sr.compendium as Compendium).records, recordOf(one.weapon)] } as Compendium;
  const a = sheetOf('стрелок', one.attacker, one.weapon);
  const d = sheetOf('цель', one.defender);
  let out;
  try {
    out = exchange({
      system, compendium, die: () => 1 + Math.floor(random() * 6), sheets: [a, d], actionId: 'испытательный_ствол:0', fromId: 'стрелок', toId: 'цель',
      inputs: { distanciya: one.range, rezhim: MODE_NAME[one.mode] },
    });
  } catch (err) {
    const text = (err as Error).message;
    return /нельзя|не бьёт|нет патрон|перезаряд|режим/.test(text) ? { why: text, refused: true, ar: 0, hit: false, damage: 0, physical: 0, stun: 0, prone: false, edgeTo: null, ammoLeft: one.weapon.ammo, glitch: false, dice: { attack: [], defense: [], resist: [] } } : { error: text };
  }
  const trace = out.reports.flatMap(r => (r.report.trace ?? []) as { step: unknown; rolls?: number[]; total?: number }[]);
  const rolls = (step: string) => trace.find(t => t.step === step)?.rolls ?? [];
  const after = (id: string) => out.sheets.find(s => s.id === id)!;
  const target = after('цель');
  const at = (tag: string) => calc(system, target, tag, newPass(system, target, { compendium })) as number;
  const physicalMax = at('physical_max');
  const stunMax = at('stun_max');
  const before = sheetOf('цель', one.defender);
  const atBefore = (tag: string) => calc(system, before, tag, newPass(system, before, { compendium })) as number;
  const edgeA = Number(after('стрелок').values.edge_left ?? 0);
  const edgeD = Number(target.values.edge_left ?? 0);
  const physical = Math.min(at('physical_total'), physicalMax);
  const stun = Math.min(Number(target.values.stun ?? 0), stunMax);
  const damage = (Number(target.values.physical ?? 0) - one.defender.physical) + (Number(target.values.stun ?? 0) - one.defender.stun);
  void atBefore;
  return {
    refused: false, ar: Number(trace.find(t => t.step === 'atk')?.total ?? NaN), hit: Boolean(trace.find(t => t.step === 'soprotivlenie_brosok')),
    damage, physical, stun, prone: target.effects.some(e => e.effectId === 'prone'),
    edgeTo: edgeA > 0 ? 'attacker' : edgeD > 0 ? 'defender' : null,
    ammoLeft: Number(after('стрелок').has.find(h => h.of === 'испытательный_ствол')?.values?.ammo ?? NaN),
    glitch: out.log.some(line => line.startsWith('стрелок применяет «Сбой»') || line.startsWith('стрелок применяет «Критический сбой»')),
    dice: { attack: rolls('ataka_brosok'), defense: rolls('zaschita'), resist: rolls('soprotivlenie_brosok') },
  };
}

function compare(book: Outcome, seen: Seen): string[] {
  if (book.refused || seen.refused) return book.refused && seen.refused ? [] : [`отказ: книга ${book.refused ?? 'нет'}, движок ${seen.refused ? 'да' : 'нет'}`];
  const out: string[] = [];
  const check = (name: string, b: unknown, e: unknown) => { if (b !== e) out.push(`${name}: книга ${String(b)}, движок ${String(e)}`); };
  check('ЗА', book.ar, seen.ar);
  check('попадание', book.hit, seen.hit);
  check('урон', book.damage, seen.damage);
  check('физический', book.physical, seen.physical);
  check('оглушение', book.stun, seen.stun);
  check('Распластан', book.prone, seen.prone);
  check('Преимущество', book.edgeTo, seen.edgeTo);
  check('патронов', book.ammoLeft, seen.ammoLeft);
  check('сбой', book.glitch, seen.glitch);
  return out;
}

describe.skipIf(!CASES)('Shadowrun 6: движок против книжного калькулятора', () => {
  it(`${CASES} случайных атак, зерно 2410`, () => {
    const random = rng(2410);
    const bad: { n: number; one: Case; diff: string[]; dice: Seen['dice'] }[] = [];
    const errors: string[] = [];
    const reasons = new Map<string, number>();
    for (let n = 0; n < CASES; n++) {
      const one = generate(random);
      const seen = engine(one, random);
      if ('error' in seen) { errors.push(`№${n}: ${seen.error}`); continue; }
      if (seen.why) reasons.set(seen.why.replace(/^.*: /, ''), (reasons.get(seen.why.replace(/^.*: /, '')) ?? 0) + 1);
      const book = resolveAttack({ ...one, weapon: one.weapon, dice: seen.dice });
      const diff = compare(book, seen);
      if (diff.length) bad.push({ n, one, diff, dice: seen.dice });
    }
    const kinds = new Map<string, number>();
    for (const b of bad) for (const d of b.diff) { const k = d.split(':')[0]!; kinds.set(k, (kinds.get(k) ?? 0) + 1); }
    if (process.env.SR_BOOK_OUT) writeFileSync(process.env.SR_BOOK_OUT, JSON.stringify({ cases: CASES, bad: bad.length, errors, reasons: Object.fromEntries(reasons), kinds: Object.fromEntries(kinds), samples: bad.slice(0, 60) }, null, 1));
    expect(errors, errors.slice(0, 5).join('\n')).toEqual([]);
    expect(bad.length, [...kinds].map(([k, v]) => `${k}: ${v}`).join(', ')).toBe(0);
  }, 600_000);
});
