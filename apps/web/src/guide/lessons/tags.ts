import type { System, Effect, Handler } from '@vtt/schema';
import { NAMES } from '@vtt/engine';
import type { Lesson, View, Move } from '../types.ts';
import { effectBy, stepsOf, errorsOf, is, numberOf, exprOf, stepWord, problemsClean } from '../find.ts';
import { slugOf } from '../../store/world.ts';
import { visible } from '../anchor.ts';
import { lazyLesson, seedIn } from '../lazy.ts';
import seed from '../seeds/tags.json' with { type: 'json' };

const GUARD = 'zaschita';

const effect = (view: View, label: string): Effect | undefined => effectBy(view.system, label)?.[1];
const keyOf = (view: View, label: string): string | undefined => effectBy(view.system, label)?.[0];
const handlers = (view: View, label: string): Handler[] => effect(view, label)?.on ?? [];
const fresh = (view: View, label: string): Handler | undefined => handlers(view, label).at(-1);

const aboutCarrier = (handler: Handler | undefined): boolean => {
  const text = exprOf(handler?.if).replace(/\s+/g, '');
  const holder = `@${NAMES.holder}`;
  return new RegExp(`^@[\\p{L}\\p{N}_]+==${holder}$|^${holder}==@[\\p{L}\\p{N}_]+$`, 'u').test(text);
};

const carrier = (value: unknown): boolean => is(value, `@${NAMES.sheet}`) || is(value, `@${NAMES.holder}`);

export const tags: Lesson = lazyLesson('tags', words => {
  const { t } = words;
  const WET = t('lessonTags:name.wet');
  const BURNING = t('lessonTags:name.burning');
  const LUCK = t('lessonTags:name.luck');
  const COLD = t('lessonTags:name.cold');
  const FROST = t('lessonTags:name.frost');
  const WARM_UP = t('lessonTags:name.warmUp');
  const TAG = t('lessonTags:name.tag');
  const TAGS = [TAG, slugOf(TAG)];
  const LIBRARY = t('effects:tab.library');
  const LINK = t('lessonTags:chapter.link.title');
  const DICE = t('lessonTags:chapter.dice.title');
  const ALONE = t('lessonTags:chapter.alone.title');
  const WHAT_HAPPENED = t('effects:handler.happened');
  const ADD_WHEN = t('effects:whileWhen.addWhen');
  const ADD_CHANGE = t('constructor:brick.change.label');
  const WHICH_STEP = t('stepCards:change.which.label');
  const HOLDER_FIELD = t('fields:cond.holder');
  const TAGS_FIELD = t('effects:editor.tagsField');
  const PLUS_STEP = `+ ${stepWord('roll-plus').toLowerCase()}`;

  const opened = (label: string): Move => ({
    at: { text: label, in: LIBRARY },
    say: t('lessonTags:open', { name: label }),
    done: view => Boolean(keyOf(view, label)) && view.effect === keyOf(view, label),
  });

  const propsOpened: Move = {
    at: { text: t('effects:editor.props') },
    say: t('lessonTags:tag.props'),
    done: () => visible({ field: TAGS_FIELD }),
    maybe: true,
  };

  const gainedTag = (view: View): Handler | undefined =>
    handlers(view, BURNING).find(handler => TAGS.some(tag => handler.on === `gained:${tag}`));

  const removesBurning = (view: View): boolean => {
    const burning = keyOf(view, BURNING);
    return Boolean(burning) && (gainedTag(view)?.steps ?? []).some(step => {
      const raw = step as unknown as Record<string, unknown>;
      return raw.type === 'status' && raw.mode === 'remove' && raw.effect === burning && carrier(raw.to);
    });
  };

  const luck = (view: View): Handler | undefined => handlers(view, LUCK).find(handler => handler.on === 'seen');

  const sharedTag = (view: View): string[] => {
    const cold = effect(view, COLD)?.tags ?? [];
    const frost = effect(view, FROST)?.tags ?? [];
    return cold.filter(tag => frost.includes(tag));
  };

  const clearsByTag = (view: View): boolean => {
    const shared = sharedTag(view);
    return stepsOf(effect(view, WARM_UP)).some(step =>
      step.type === 'status' && step.mode === 'remove' && step.by === 'tag' && shared.includes(String(step.effect)) && Boolean(step.to));
  };

  return {
    id: 'tags',
    title: t('lessonTags:title'),
    sub: t('lessonTags:sub'),
    start: t('lessonTags:start'),
    seed: seedIn(seed as unknown as System, words),
    tab: 'effects',
    chapters: [
      { title: LINK, sum: t('lessonTags:chapter.link.sum') },
      { title: DICE, sum: t('lessonTags:chapter.dice.sum') },
      { title: ALONE, sum: t('lessonTags:chapter.alone.sum') },
    ],
    steps: [
      {
        id: 'tag',
        chapter: LINK,
        lead: t('lessonTags:tag.lead'),
        tab: 'effects',
        panel: LIBRARY,
        say: t('lessonTags:tag.say'),
        at: [
          opened(WET),
          propsOpened,
          {
            at: { field: TAGS_FIELD },
            say: t('lessonTags:tag.field'),
            done: () => visible({ input: t('records:tags.namePlaceholder') }),
          },
          { at: { input: t('records:tags.namePlaceholder') }, say: t('lessonTags:tag.input') },
        ],
        done: view => (effect(view, WET)?.tags ?? []).some(tag => TAGS.includes(tag)),
        result: () => t('lessonTags:tag.result'),
      },
      {
        id: 'when',
        chapter: LINK,
        tab: 'effects',
        panel: LIBRARY,
        say: t('lessonTags:when.say'),
        at: [
          opened(BURNING),
          { at: { text: ADD_WHEN }, say: t('lessonTags:when.add'), done: view => handlers(view, BURNING).length > 0 },
          { at: { text: WHAT_HAPPENED }, say: t('lessonTags:when.what'), done: view => (fresh(view, BURNING)?.on ?? '').startsWith('gained:') },
          { at: { text: t('effects:handler.subject.other') }, say: t('lessonTags:when.which'), hint: t('lessonTags:when.hint') },
        ],
        done: view => Boolean(gainedTag(view)),
        result: () => t('lessonTags:when.result'),
      },
      {
        id: 'who',
        chapter: LINK,
        tab: 'effects',
        say: t('lessonTags:who.say'),
        hint: t('lessonTags:who.hint'),
        at: { text: HOLDER_FIELD },
        done: view => aboutCarrier(gainedTag(view)),
        traps: [{
          when: view => Boolean(gainedTag(view)) && !aboutCarrier(gainedTag(view)) && Boolean(gainedTag(view)?.if),
          say: t('lessonTags:who.trap'),
        }],
        result: () => t('lessonTags:who.result'),
      },
      {
        id: 'remove',
        chapter: LINK,
        tab: 'effects',
        say: t('lessonTags:remove.say'),
        hint: t('lessonTags:remove.hint'),
        at: [
          { at: { text: ADD_CHANGE }, say: t('lessonTags:remove.change'), done: view => (gainedTag(view)?.steps ?? []).length > 0 },
          { at: { text: t('stepCards:change.kind.status') }, say: t('lessonTags:remove.state'), done: view => (gainedTag(view)?.steps ?? []).some(step => step.type === 'status') },
          { at: { text: t('stepCards:change.do.label') }, say: t('lessonTags:remove.do'), done: view => (gainedTag(view)?.steps ?? []).some(step => (step as unknown as Record<string, unknown>).mode === 'remove') },
          {
            at: { text: WHICH_STEP, in: t('stepCards:group.card.label', { name: t('stepCards:change.take.label') }) },
            say: t('lessonTags:remove.which'),
            done: view => (gainedTag(view)?.steps ?? []).some(step => (step as unknown as Record<string, unknown>).effect === keyOf(view, BURNING)),
          },
          { at: { text: t('stepCards:change.to.remove') }, say: t('lessonTags:remove.from') },
        ],
        done: removesBurning,
        result: () => t('lessonTags:remove.result'),
      },
      {
        id: 'seen',
        chapter: DICE,
        lead: t('lessonTags:seen.lead'),
        tab: 'effects',
        panel: LIBRARY,
        say: t('lessonTags:seen.say'),
        at: [
          opened(LUCK),
          { at: { text: ADD_WHEN }, say: t('lessonTags:when.add'), done: view => handlers(view, LUCK).length > 0 },
          { at: { text: WHAT_HAPPENED }, say: t('lessonTags:seen.what'), done: view => Boolean(luck(view)) },
          { at: { text: t('fields:rolls.more') }, say: t('lessonTags:seen.more'), done: () => visible({ text: t('fields:rolls.any') }) },
          { at: { text: t('fields:rolls.not') }, say: t('lessonTags:seen.except') },
        ],
        done: view => Boolean(luck(view)?.notTags?.includes(GUARD)),
        result: () => t('lessonTags:seen.result'),
      },
      {
        id: 'plus',
        chapter: DICE,
        tab: 'effects',
        say: t('lessonTags:plus.say'),
        hint: t('lessonTags:plus.hint'),
        at: { text: PLUS_STEP },
        done: view => (luck(view)?.steps ?? []).some(step => step.type === 'roll-plus' && numberOf((step as unknown as { value?: unknown }).value) === 1),
        result: () => t('lessonTags:plus.result'),
      },
      {
        id: 'problems',
        chapter: DICE,
        say: t('lessonTags:problems.say'),
        at: { guide: 'problems' },
        done: problemsClean,
        result: () => t('lessonTags:problems.result'),
      },
      {
        id: 'clear',
        chapter: ALONE,
        lead: t('lessonTags:clear.lead'),
        alone: true,
        tab: 'effects',
        goal: t('lessonTags:clear.goal'),
        say: t('lessonTags:clear.say'),
        hint: t('lessonTags:clear.hint'),
        done: view => sharedTag(view).length > 0 && clearsByTag(view) && errorsOf(view.system) === 0,
        result: () => t('lessonTags:clear.result'),
      },
    ],
  };
});
