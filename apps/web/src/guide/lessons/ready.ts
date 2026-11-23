import type { Lesson, View } from '../types.ts';
import { tableBy, rowIs, fieldBy, effectBy, errorsOf, same, problemsClean } from '../find.ts';
import { lazyLesson, blankSeed } from '../lazy.ts';
import { visible } from '../anchor.ts';

const foldOpen = (title: string): boolean =>
  [...document.querySelectorAll<HTMLDetailsElement>('details.fold')].some(fold => fold.open && same(fold.querySelector('.fold__title')?.textContent, title));

export const ready: Lesson = lazyLesson('ready', words => {
  const { t } = words;
  const STATS = t('lessonReady:name.stats');
  const CHARISMA = t('lessonReady:name.charisma');
  const INSPIRATION = t('lessonReady:name.inspiration');
  const CLASS = t('lessonReady:name.class');
  const DISENGAGE = t('lessonReady:name.disengage');
  const PHYSICAL = t('lessonReady:name.physical');
  const WOUND = t('lessonReady:name.woundMod');
  const STATES = t('lessonReady:name.statesMod');
  const ABILITIES = t('lessonReady:name.abilities');
  const LOOKUP = t('sheetTab:tab.lookup');
  const NEAR = t('effects:tab.near');
  const DONORS = t('effects:preview.donors');
  const EFFECTS = t('records:donors.effects');
  const CAME = t('records:donors.came');
  const SURE = t('ui:danger.sure');
  const DELETE = t('common:delete');
  const PIECE = t('lessonReady:chapter.piece.title');
  const EFFECT = t('lessonReady:chapter.effect.title');
  const ALONE = t('lessonReady:chapter.alone.title');

  const stats = (view: View) => tableBy(view.system, STATS);

  const hasRow = (view: View, row: string): boolean =>
    (stats(view)?.[1].rows ?? []).some(one => rowIs(one, row));

  return {
    id: 'ready',
    title: t('lessonReady:title'),
    sub: t('lessonReady:sub'),
    seed: blankSeed(words),
    tab: 'sheet',
    chapters: [
      { title: PIECE, sum: t('lessonReady:chapter.piece.sum') },
      { title: EFFECT, sum: t('lessonReady:chapter.effect.sum') },
      { title: ALONE, sum: t('lessonReady:chapter.alone.sum') },
    ],
    steps: [
      {
        id: 'take',
        chapter: PIECE,
        lead: t('lessonReady:take.lead'),
        tab: 'sheet',
        panel: LOOKUP,
        say: t('lessonReady:take.say'),
        hint: t('lessonReady:take.hint'),
        at: { text: ABILITIES },
        done: view => hasRow(view, CHARISMA),
        result: () => t('lessonReady:take.result'),
      },
      {
        id: 'seen',
        chapter: PIECE,
        tab: 'sheet',
        panel: LOOKUP,
        say: t('lessonReady:seen.say'),
        at: { text: CAME },
        done: view => view.tab === 'sheet' && foldOpen(CAME),
        result: () => t('lessonReady:seen.result'),
      },
      {
        id: 'drop',
        chapter: PIECE,
        tab: 'sheet',
        say: t('lessonReady:drop.say'),
        hint: t('lessonReady:drop.hint'),
        at: [
          { at: { text: INSPIRATION }, say: t('lessonReady:drop.field'), done: view => { const tag = fieldBy(view.system, INSPIRATION)?.tag; return Boolean(tag) && view.field === tag; } },
          { at: { text: DELETE }, say: t('lessonReady:drop.delete'), done: () => visible({ text: SURE }) },
          { at: { text: SURE }, say: t('lessonReady:drop.confirm') },
        ],
        done: view => Boolean(stats(view)) && Boolean(fieldBy(view.system, CLASS)) && !fieldBy(view.system, INSPIRATION),
        traps: [{
          when: view => Boolean(stats(view)) && !hasRow(view, CHARISMA) && errorsOf(view.system) > 0,
          say: t('lessonReady:drop.trap'),
        }],
        result: () => t('lessonReady:drop.result'),
      },
      {
        id: 'problems',
        chapter: PIECE,
        say: t('lessonReady:problems.say'),
        at: { guide: 'problems' },
        done: problemsClean,
        result: () => t('lessonReady:problems.result'),
      },
      {
        id: 'effect',
        chapter: EFFECT,
        lead: t('lessonReady:effect.lead'),
        tab: 'effects',
        panel: NEAR,
        say: t('lessonReady:effect.say'),
        hint: t('lessonReady:effect.hint'),
        at: [
          { at: { text: DONORS, in: NEAR }, say: t('lessonReady:effect.ready'), done: () => visible({ text: EFFECTS }), maybe: true },
          { at: { text: EFFECTS }, say: t('lessonReady:effect.open'), done: () => visible({ text: DISENGAGE }) },
          { at: { text: DISENGAGE }, say: t('lessonReady:effect.press') },
        ],
        done: view => Boolean(effectBy(view.system, DISENGAGE)),
        result: () => t('lessonReady:effect.result'),
      },
      {
        id: 'came',
        chapter: EFFECT,
        tab: 'effects',
        panel: NEAR,
        say: t('lessonReady:came.say'),
        at: { text: CAME },
        done: view => view.tab === 'effects' && foldOpen(CAME),
        result: () => t('lessonReady:came.result'),
      },
      {
        id: 'problems-effect',
        chapter: EFFECT,
        say: t('lessonReady:problemsEffect.say'),
        at: { guide: 'problems' },
        done: problemsClean,
        result: () => t('lessonReady:problemsEffect.result'),
      },
      {
        id: 'other',
        chapter: ALONE,
        lead: t('lessonReady:other.lead'),
        alone: true,
        tab: 'sheet',
        goal: t('lessonReady:other.goal'),
        say: t('lessonReady:other.say'),
        hint: t('lessonReady:other.hint'),
        done: view => Boolean(fieldBy(view.system, PHYSICAL)) && errorsOf(view.system) === 0
          && (!fieldBy(view.system, WOUND) || !fieldBy(view.system, STATES)),
        result: () => t('lessonReady:other.result'),
      },
    ],
  };
}, ['ru']);
