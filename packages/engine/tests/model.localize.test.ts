import { describe, it, expect } from 'vitest';
import { world as W } from '@vtt/schema';
import { dropLang, hasLang, langsOf, localized, localizedBook, setLangs, translatable, translate, untranslated } from '../src/model/localize.ts';
import { lintSystem } from '../src/model/lint.ts';
import { LITE_WORLDS } from '../src/model/systems.ts';
import { flattenSystem } from '../src/model/inherit.ts';
import { availableActions } from '../src/events/actions.ts';
import { asksOf, choicesOf, askKindOf, isPerTarget } from '../src/model/asks.ts';
import { act } from '../src/core/act.ts';
import { emptyJournal } from '../src/core/external.ts';
import type { System, Compendium } from '../src/model/types.ts';

type Any = Record<string, any>;

const small = (): System => ({
  langs: ['ru', 'en'],
  tables: {
    list: { shape: 'single', owner: 'sheet', label: 'Лист', columns: [
      { key: 'hp', label: 'Хиты', hint: 'сколько осталось', kind: 'number', i18n: { en: { label: 'Hit points' } } },
      { key: 'ac', label: 'Класс брони', kind: 'number' },
    ] },
  },
  effects: {},
} as unknown as System);

describe('переводы подписей', () => {
  it('система на языке зрителя: перевод встаёт на место подписи, исходная система не меняется', () => {
    const system = small();
    const shown = localized(system, 'en') as Any;
    expect(shown.tables.list.columns.map((column: Any) => column.label)).toEqual(['Hit points', 'Класс брони']);
    expect(shown.tables.list.columns[0].i18n).toBeUndefined();
    expect((system as Any).tables.list.columns[0].label).toBe('Хиты');
    expect(localized(system, 'en')).toBe(shown);
  });

  it('основной язык, необъявленный язык и система без языков — та же система, без копии', () => {
    const system = small();
    expect(localized(system, 'ru')).toBe(system);
    expect(localized(system, 'de')).toBe(system);
    expect(localized(system, undefined)).toBe(system);
    expect(hasLang({ effects: {} } as unknown as System, 'en')).toBe(false);
  });

  it('перевод пишется рядом с подписью; пустой перевод и пустой язык не хранятся', () => {
    const system = small();
    const ac = translatable(system).find(entry => entry.text === 'Класс брони')!;
    translate(system, ac.path, 'en', ac.field, '  Armor class ');
    expect((system as Any).tables.list.columns[1].i18n).toEqual({ en: { label: 'Armor class' } });
    translate(system, ac.path, 'en', ac.field, '');
    expect((system as Any).tables.list.columns[1].i18n).toBeUndefined();
  });

  it('язык убирается вместе со своими переводами; один основной русский язык в данных не пишется', () => {
    const system = small();
    dropLang(system, 'en');
    expect((system as Any).langs).toBeUndefined();
    expect(JSON.stringify(system)).not.toContain('i18n');
    setLangs(system, ['en', 'ru', 'en']);
    expect(langsOf(system)).toEqual(['en', 'ru']);
  });

  it('«Проблемы»: на каждый язык, кроме основного, — одно предупреждение со счётом подписей без перевода', () => {
    const system = small();
    expect([...untranslated(system)].map(([lang, missing]) => [lang, missing.map(entry => entry.text)])).toEqual([['en', ['Лист', 'Класс брони']]]);
    const told = lintSystem(system).filter(problem => problem.where.section === 'langs');
    expect(told.map(problem => [problem.level, problem.text])).toEqual([['warn', 'перевод на английский: без перевода подписей — 2 (например «Лист», «Класс брони»)']]);
    const { langs: _none, ...plain } = system as System & { langs?: string[] };
    expect(lintSystem(plain as System).filter(problem => problem.where.section === 'langs')).toEqual([]);
  });
});

const MARK = '⟦';

function pseudo<T extends System | Compendium>(root: T): T {
  const copy = structuredClone(root);
  for (const entry of translatable(copy)) translate(copy, entry.path, 'xx', entry.field, `${MARK}${entry.text}⟧`);
  return copy;
}

const rng = (seed: number) => { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 0x100000000; }; };

function played(world: { system: System; compendium: Compendium; sheets: Any[] }): string[] {
  const system = flattenSystem(world.system);
  const table = { system, compendium: world.compendium, sheets: world.sheets } as Any;
  const players = world.sheets.filter(sheet => sheet.id !== 'desk');
  const out: string[] = [];
  for (const from of players) {
    const to = players.find(sheet => sheet.id !== from.id)?.id ?? from.id;
    for (const action of availableActions(from as never, table)) {
      const inputs: Record<string, unknown> = {};
      for (const param of asksOf(action.id, table)) {
        const kind = askKindOf(param);
        const options = kind === 'choice' ? choicesOf(system, param) : [];
        const value = kind === 'choice' ? options[1 % Math.max(1, options.length)] : kind === 'number' ? 1 : kind === 'boolean' ? 'no' : 'x';
        if (value === undefined) continue;
        inputs[param.key] = isPerTarget(param) ? { [to]: value } : value;
      }
      const random = rng(7919);
      const die = (sides: number) => 1 + Math.floor(random() * sides);
      let journal: Any = emptyJournal();
      let line = `${from.id} ${action.id}: `;
      try {
        for (let round = 0; round < 64; round++) {
          const got: Any = act({ ...table, clock: null, die, journal }, { actionId: action.id, fromId: from.id, toIds: [to], inputs } as never);
          if (got.kind === 'done') {
            line += got.sheets.map((sheet: Any) => `${sheet.id}=${JSON.stringify(Object.entries(sheet.values ?? {}).sort())}+${JSON.stringify((sheet.effects ?? []).map((one: Any) => one.effectId).sort())}`).join(' ');
            break;
          }
          const first = got.question.offers[0];
          line += `Q${got.question.offers.length} `;
          journal = { ...got.journal, answers: { ...got.journal.answers, [got.question.key]: first ? [first.id] : [] } };
        }
      } catch { line += 'отказ'; }
      out.push(line);
    }
  }
  return out;
}

describe('переводы: образцы с подставным переводом всех текстов', () => {
  for (const world of LITE_WORLDS) {
    const name = String((world.system as System).name);
    const system = { ...pseudo(world.system as System), langs: ['ru', 'xx'] } as System;
    const book = pseudo(world.compendium as Compendium);

    it(`${name}: каждый объект с переводом проходит схему`, () => {
      const parsed = W.system.safeParse(system);
      expect(parsed.success ? [] : parsed.error.issues.slice(0, 5).map(issue => `${issue.path.join('.')}: ${issue.message}`)).toEqual([]);
      const records = W.compendium.safeParse(book);
      expect(records.success ? [] : records.error.issues.slice(0, 5).map(issue => `${issue.path.join('.')}: ${issue.message}`)).toEqual([]);
    });

    it(`${name}: на языке зрителя переведён каждый текст, а без перевода ничего не осталось`, () => {
      const shown = localized(system, 'xx');
      expect(translatable(shown).filter(entry => !entry.text.startsWith(MARK)).map(entry => `${entry.path.join('.')}.${entry.field}`)).toEqual([]);
      expect(untranslated(system).get('xx')).toEqual([]);
    });

    it(`${name}: перевод меняет только слова — все действия листов дают те же значения`, () => {
      const base = played({ system, compendium: book, sheets: world.sheets as Any[] });
      const shown = played({ system: localized(system, 'xx'), compendium: localizedBook(book, system, 'xx'), sheets: world.sheets as Any[] });
      expect(base.length).toBeGreaterThan(0);
      expect(shown).toEqual(base);
    }, 120000);
  }
});
