import type { System, Binding, Table } from '@vtt/schema';
import type { Lesson, View } from '../types.ts';
import { effectBy, tableBy, columnBy, rowIs, is, errorsOf, FORMULA_DONE, barOpen, barText, problemsClean } from '../find.ts';
import { visible } from '../anchor.ts';
import { bindingHolds } from '@vtt/engine';
import type { System as EngineSystem, CompendiumRecord } from '@vtt/engine';
import { lazyLesson, seedIn } from '../lazy.ts';
import seed from '../seeds/spells.json' with { type: 'json' };

const stopHolds = (view: View, spell: (view: View) => [string, Table] | undefined, stop: (view: View) => Binding | undefined, termColumn: (view: View) => string | undefined, term: unknown): boolean | null => {
  const found = spell(view);
  const button = stop(view);
  const prop = termColumn(view);
  if (!found || !button || !prop) return null;
  const record = { id: 'probe', label: 'Probe', table: found[0], cells: { [prop]: term } } as unknown as CompendiumRecord;
  try { return bindingHolds(view.system as unknown as EngineSystem, record, button as never); } catch { return null; }
};

export const spells: Lesson = lazyLesson('spells', words => {
  const { t } = words;
  const SPELL = t('lessonSpells:name.spell');
  const CAST = t('lessonSpells:name.cast');
  const STOP = t('lessonSpells:name.stop');
  const UPKEEP = t('lessonSpells:name.upkeep');
  const TERMS = t('lessonSpells:name.terms');
  const HOLDS = t('lessonSpells:name.holds');
  const INSTANT = t('lessonSpells:name.instant');
  const BOOKS = t('records:list.head');
  const LIBRARY = t('effects:tab.library');
  const BUTTON = t('records:kind.buttons.add');
  const CALLS = t('records:button.effect');
  const WHERE = t('fields:cond.title');
  const STOP_BUTTON = t('records:button.card', { where: STOP });
  const PLUS_BOND = `+ ${t('effects:editor.extras.bond')}`;
  const BUTTONS = t('lessonSpells:chapter.buttons.title');
  const ANCHOR = t('lessonSpells:chapter.anchor.title');
  const ALONE = t('lessonSpells:chapter.alone.title');

  const spell = (view: View): [string, Table] | undefined => {
    const found = tableBy(view.system, SPELL);
    return found && found[1].shape === 'book' ? found : undefined;
  };
  const terms = (view: View): [string, Table] | undefined => tableBy(view.system, TERMS);
  const buttons = (view: View): Binding[] => spell(view)?.[1].bindings ?? [];
  const cast = (view: View): Binding | undefined => {
    const id = effectBy(view.system, CAST)?.[0];
    return id ? buttons(view).find(binding => binding.effect === id) : undefined;
  };
  const stop = (view: View): Binding | undefined => {
    const id = effectBy(view.system, STOP)?.[0];
    return id ? buttons(view).find(binding => binding.effect === id) : undefined;
  };
  const castEffect = (view: View) => effectBy(view.system, CAST)?.[1];

  const termColumn = (view: View): string | undefined => (spell(view)?.[1].columns ?? []).find(column => column.kind === 'choice' && column.from === terms(view)?.[0])?.key;
  const holdsColumn = (view: View): string | undefined => columnBy(terms(view)?.[1], HOLDS)?.key;

  const holdsFor = (view: View, term: unknown): boolean | null => stopHolds(view, spell, stop, termColumn, term);

  const instant = (view: View): unknown => (terms(view)?.[1].rows ?? []).find(row => rowIs(row, INSTANT))?.value;

  const stopFollowsTerm = (view: View): boolean => {
    const rows = terms(view)?.[1].rows ?? [];
    const holds = holdsColumn(view);
    if (!holds || !rows.length) return false;
    return rows.every(row => holdsFor(view, row.value) === ((row.cells ?? {})[holds] === true));
  };

  const holdsText = (view: View, text: string): boolean => {
    const term = termColumn(view);
    const holds = holdsColumn(view);
    return Boolean(term && holds && text.replace(/\s+/g, '') === `@${term}.${holds}`);
  };

  const longTerms = (view: View): number => {
    const holds = holdsColumn(view);
    return (terms(view)?.[1].rows ?? []).filter(row => holds && String(row.value ?? '').trim() !== '' && (row.cells ?? {})[holds] === true).length;
  };

  return {
    id: 'spells',
    title: t('lessonSpells:title'),
    sub: t('lessonSpells:sub'),
    start: t('lessonSpells:start'),
    seed: seedIn(seed as unknown as System, words),
    tab: 'records',
    chapters: [
      { title: BUTTONS, sum: t('lessonSpells:chapter.buttons.sum') },
      { title: ANCHOR, sum: t('lessonSpells:chapter.anchor.sum') },
      { title: ALONE, sum: t('lessonSpells:chapter.alone.sum') },
    ],
    steps: [
      {
        id: 'open',
        chapter: BUTTONS,
        lead: t('lessonSpells:open.lead'),
        tab: 'records',
        panel: BOOKS,
        say: t('lessonSpells:open.say'),
        at: { text: SPELL, in: BOOKS },
        done: view => Boolean(spell(view)) && view.record === spell(view)?.[0],
        result: () => t('lessonSpells:open.result'),
      },
      {
        id: 'cast',
        chapter: BUTTONS,
        tab: 'records',
        panel: BOOKS,
        say: t('lessonSpells:cast.say'),
        hint: t('lessonSpells:cast.hint'),
        at: [
          { at: { text: BUTTON }, say: t('lessonSpells:cast.add'), done: view => buttons(view).length > 0 },
          { at: { text: CALLS }, say: t('lessonSpells:cast.pick') },
        ],
        via: { text: SPELL, in: BOOKS },
        done: view => {
          const binding = cast(view);
          const prop = termColumn(view);
          return Boolean(binding && prop && is(binding.args?.[castEffect(view)?.params?.find(param => param.kind === 'choice')?.key ?? ''], `@${prop}`));
        },
        result: () => t('lessonSpells:cast.result'),
      },
      {
        id: 'stop',
        chapter: BUTTONS,
        tab: 'records',
        panel: BOOKS,
        say: t('lessonSpells:stop.say'),
        at: [
          { at: { text: BUTTON }, say: t('lessonSpells:stop.add'), done: view => buttons(view).length > 1 },
          { at: { text: CALLS }, say: t('lessonSpells:stop.pick') },
        ],
        done: view => Boolean(stop(view)),
        result: () => t('lessonSpells:stop.result'),
      },
      {
        id: 'if',
        chapter: BUTTONS,
        tab: 'records',
        panel: BOOKS,
        say: t('lessonSpells:if.say'),
        at: [
          { at: [{ text: t('common:more'), in: STOP_BUTTON }, { text: t('common:more') }], say: t('lessonSpells:if.more'), done: () => visible({ text: WHERE, in: STOP_BUTTON }) },
          { at: [{ text: WHERE, in: STOP_BUTTON }, { text: WHERE }], say: t('lessonSpells:if.type'), done: view => barOpen(view) || stopFollowsTerm(view) },
          { at: [{ text: WHERE, in: STOP_BUTTON }, { text: WHERE }], say: t('lessonSpells:if.pick'), done: view => holdsText(view, barText(view)) || stopFollowsTerm(view) },
          { at: [FORMULA_DONE, { text: WHERE, in: STOP_BUTTON }, { text: WHERE }], say: t('lessonSpells:if.enter') },
        ],
        done: view => stopFollowsTerm(view) && longTerms(view) > 0,
        result: () => t('lessonSpells:if.result'),
      },
      {
        id: 'bond',
        chapter: ANCHOR,
        lead: t('lessonSpells:bond.lead'),
        tab: 'effects',
        panel: LIBRARY,
        say: t('lessonSpells:bond.say'),
        at: [
          { at: { text: CAST, in: LIBRARY }, say: t('lessonSpells:bond.open'), done: view => view.effect === effectBy(view.system, CAST)?.[0] },
          { at: { text: t('effects:editor.props') }, say: t('lessonSpells:bond.props'), done: () => visible({ text: PLUS_BOND }), maybe: true },
          { at: { text: PLUS_BOND }, say: t('lessonSpells:bond.add') },
        ],
        done: view => {
          const holder = effectBy(view.system, UPKEEP)?.[0];
          return Boolean(holder && castEffect(view)?.bond?.effect === holder);
        },
        result: () => t('lessonSpells:bond.result'),
      },
      {
        id: 'many',
        chapter: ANCHOR,
        tab: 'effects',
        say: t('lessonSpells:many.say'),
        at: { text: t('effects:bond.count') },
        done: view => castEffect(view)?.bond?.many === true,
        result: () => t('lessonSpells:many.result'),
      },
      {
        id: 'problems',
        chapter: ANCHOR,
        say: t('lessonSpells:problems.say'),
        at: { guide: 'problems' },
        done: problemsClean,
        result: () => t('lessonSpells:problems.result'),
      },
      {
        id: 'term',
        chapter: ALONE,
        lead: t('lessonSpells:term.lead'),
        alone: true,
        tab: 'dictionaries',
        goal: t('lessonSpells:term.goal'),
        say: t('lessonSpells:term.say'),
        hint: t('lessonSpells:term.hint'),
        done: view => longTerms(view) >= 2 && stopFollowsTerm(view) && holdsFor(view, instant(view)) === false && errorsOf(view.system) === 0,
        result: () => t('lessonSpells:term.result'),
      },
    ],
  };
});
