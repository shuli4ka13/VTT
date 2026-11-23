// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { world as W } from '@vtt/schema';
import { spokenIn, mainLang } from '@vtt/engine';
import { LESSONS } from './lessons/index.ts';
import { areaOf, inLang, namesOf, offered } from './lazy.ts';
import { errorsOf } from './find.ts';
import type { Anchor, Lesson, Step } from './types.ts';

const RUSSIAN = /[А-Яа-яЁё]/u;
const DICTIONARIES = join(__dirname, '..', 'i18n', 'en');

const flat = (value: unknown, out: string[] = []): string[] => {
  if (typeof value === 'string') out.push(value);
  else if (value && typeof value === 'object') Object.values(value).forEach(inner => flat(inner, out));
  return out;
};

const screenWords: string[] = readdirSync(DICTIONARIES)
  .filter(name => name.endsWith('.json') && !name.startsWith('lesson'))
  .flatMap(name => flat(JSON.parse(readFileSync(join(DICTIONARIES, name), 'utf8'))));

const engineWords: string[] = spokenIn('en');

const anchorsOf = (at: Anchor | Anchor[] | undefined): Anchor[] => (at === undefined ? [] : Array.isArray(at) ? at : [at]);

const anchorTexts = (anchor: Anchor): string[] =>
  ('text' in anchor ? [anchor.text, ...(anchor.in ? [anchor.in] : [])] : 'input' in anchor ? [anchor.input] : 'field' in anchor ? [anchor.field] : []);

const stepAnchors = (step: Step): Anchor[] => [
  ...(Array.isArray(step.at) ? step.at.flatMap(move => anchorsOf(move.at)) : anchorsOf(step.at)),
  ...anchorsOf(step.via),
];

const proseOf = (lesson: Lesson, step: Step): string[] => [
  step.lead, step.say, step.hint, step.goal, ...(step.traps ?? []).map(trap => trap.say),
  ...(Array.isArray(step.at) ? step.at.flatMap(move => [move.say, move.hint]) : []),
  step.result?.({ system: lesson.seed, tab: lesson.tab, effect: null, record: null, sheetKind: null, block: null, field: null, opened: () => false }),
].filter((text): text is string => typeof text === 'string');

const lessonTexts = (lesson: Lesson): string[] => [
  lesson.title, lesson.sub, lesson.start ?? '', ...lesson.chapters.flatMap(chapter => [chapter.title, chapter.sum]),
  ...lesson.steps.flatMap(step => [step.chapter, step.panel ?? '', ...proseOf(lesson, step), ...stepAnchors(step).flatMap(anchorTexts)]),
];

const quoted = (text: string): string[] => [...text.matchAll(/“([^“”]+)”/g)].map(found => found[1]!.trim());

const typed = (phrase: string): boolean => /^[\d\s.,+\-*/()@<>=]*$/.test(phrase) || phrase.startsWith('@') || /[()]/.test(phrase) || phrase === 'Enter';

const escaped = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const within = (phrase: string, pool: readonly string[]): boolean => {
  const whole = new RegExp(`(^|[^\\p{L}\\p{N}])${escaped(phrase.toLowerCase())}($|[^\\p{L}\\p{N}])`, 'u');
  return pool.some(text => whole.test(text.toLowerCase()));
};

const translated = LESSONS.filter(lesson => inLang(lesson, 'en') !== lesson && offered(lesson, 'en'));

const ALLOWED: Record<string, readonly string[]> = {};

describe('уроки на английском', () => {
  it('все уроки строятся под язык; на английском не предлагается только урок о готовом из русских образцов', () => {
    expect(LESSONS.filter(lesson => inLang(lesson, 'en') === lesson).map(lesson => lesson.id)).toEqual([]);
    expect(LESSONS.filter(lesson => !offered(lesson, 'en')).map(lesson => lesson.id)).toEqual(['ready']);
    expect(LESSONS.filter(lesson => !offered(lesson, 'ru'))).toEqual([]);
  });

  for (const lesson of translated) {
    const english = inLang(lesson, 'en');
    const russian = inLang(lesson, 'ru');

    describe(lesson.id, () => {
      it('в текстах, якорях и итогах урока нет русских букв', () => {
        expect(lessonTexts(english).filter(text => RUSSIAN.test(text))).toEqual([]);
      });

      it('строение то же, что у русского: шаги, ходы, якоря', () => {
        expect(english.steps.map(step => [step.id, anchorsOf(Array.isArray(step.at) ? undefined : step.at).length, Array.isArray(step.at) ? step.at.length : 0]))
          .toEqual(russian.steps.map(step => [step.id, anchorsOf(Array.isArray(step.at) ? undefined : step.at).length, Array.isArray(step.at) ? step.at.length : 0]));
        expect(english.chapters.length).toBe(russian.chapters.length);
      });

      it('у каждого шага глава — одна из глав урока', () => {
        const titles = english.chapters.map(chapter => chapter.title);
        expect(english.steps.filter(step => !titles.includes(step.chapter)).map(step => step.id)).toEqual([]);
        const own = russian.chapters.map(chapter => chapter.title);
        expect(russian.steps.filter(step => !own.includes(step.chapter)).map(step => step.id)).toEqual([]);
      });

      it('заготовка на английском: основной язык — английский, русских букв нет, схема и «Проблемы» чисты', () => {
        expect(mainLang(english.seed)).toBe('en');
        expect(JSON.stringify(english.seed).match(/[А-Яа-яЁё][^"]{0,30}/gu)?.slice(0, 5) ?? []).toEqual([]);
        expect(W.system.safeParse(english.seed).success).toBe(true);
        expect(errorsOf(english.seed)).toBe(0);
        expect(mainLang(russian.seed)).toBe('ru');
      });

      it('то, что урок называет в кавычках, — слова английского экрана, слова движка или названия из урока', () => {
        const names = [...namesOf(lesson.id, 'en'), ...flat(english.seed)];
        const pool = [...screenWords, ...engineWords, ...names];
        const allowed = ALLOWED[lesson.id] ?? [];
        const strange = [...new Set(lessonTexts(english).flatMap(quoted))]
          .filter(phrase => !typed(phrase) && !allowed.includes(phrase) && !within(phrase, pool));
        expect(strange).toEqual([]);
      });

      it('названия вещей урока встречаются в его тексте — словарь названий не расходится с рассказом', () => {
        const told = lessonTexts(english).join(' \n ');
        expect(namesOf(lesson.id, 'en').filter(name => !told.includes(name))).toEqual([]);
        const own = lessonTexts(russian).join(' \n ').toLowerCase();
        expect(namesOf(lesson.id, 'ru').filter(name => !own.includes(name.toLowerCase().slice(0, Math.max(3, name.length - 2))))).toEqual([]);
      });

      it('название вещи из заготовки по-английски — ровно как в английской заготовке: иначе урок её не найдёт', () => {
        const ours = namesOf(lesson.id, 'ru');
        const theirs = namesOf(lesson.id, 'en');
        const before = new Set(flat(russian.seed));
        const after = new Set(flat(english.seed));
        const lost = ours.map((name, at) => [name, theirs[at] ?? '']).filter(([name, other]) => before.has(name!) && !after.has(other!));
        expect(lost).toEqual([]);
      });

      it(`словарь урока — область ${areaOf(lesson.id)}`, () => {
        expect(readdirSync(DICTIONARIES)).toContain(`${areaOf(lesson.id)}.json`);
      });
    });
  }
});
