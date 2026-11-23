import type { System, Effect } from '@vtt/schema';
import type { Lesson, View, Move } from '../types.ts';
import { lazyPlan, NAMES } from '@vtt/engine';
import { effectBy, actorKey, fieldBy, stepsOf, reads, is, subtracts, numberOf, armOf, errorsOf, isArm, FORMULA_DONE, barOpen, barText, problemsClean } from '../find.ts';
import { lazyLesson, seedIn } from '../lazy.ts';
import seed from '../seeds/combat.json' with { type: 'json' };

const COMBAT = `@${NAMES.desk}.${NAMES.combat}`;

export const combat: Lesson = lazyLesson('combat', words => {
  const { t } = words;
  const STRIKE = t('lessonCombat:name.strike');
  const LEFT = t('lessonCombat:name.actionsLeft');
  const LIBRARY = t('effects:tab.library');
  const IN_COMBAT = t('lessonCombat:chapter.inCombat.title');
  const ALONE = t('lessonCombat:chapter.alone.title');
  const AMOUNT = t('stepCards:change.amount.label');

  const strike = (view: View): [string, Effect] | undefined => effectBy(view.system, STRIKE);
  const steps = (view: View): Record<string, unknown>[] => stepsOf(strike(view)?.[1]);
  const counter = (view: View): string | undefined => fieldBy(view.system, LEFT)?.tag;

  const inCombat = (view: View): number =>
    steps(view).findIndex(step => isArm(step) && is(step.if, COMBAT));

  const spends = (view: View): boolean => {
    const at = inCombat(view);
    const tag = counter(view);
    return at >= 0 && Boolean(tag) && armOf(steps(view), at).some(step =>
      step.type === 'apply' && is(step.target, `@${actorKey(strike(view)?.[1])}.${tag}`) && subtracts(step) && numberOf(step.value) === 1);
  };

  const refuses = (view: View): boolean => {
    const tag = counter(view);
    if (!tag) return false;
    const list = steps(view);
    let guards: Map<number, string | null>;
    try { guards = lazyPlan(list, () => true).guards; } catch { return false; }
    return list.some((step, at) => {
      if (step.type !== 'stop') return false;
      const text = guards.get(at);
      return reads(text, COMBAT) && reads(text, `@${actorKey(strike(view)?.[1])}.${tag}`);
    });
  };

  const opened = (label: string): Move => ({
    at: { text: label, in: LIBRARY },
    say: t('lessonCombat:open', { name: label }),
    done: view => view.effect === effectBy(view.system, label)?.[0],
  });

  return {
    id: 'combat',
    title: t('lessonCombat:title'),
    sub: t('lessonCombat:sub'),
    start: t('lessonCombat:start'),
    seed: seedIn(seed as unknown as System, words),
    tab: 'effects',
    chapters: [
      { title: IN_COMBAT, sum: t('lessonCombat:chapter.inCombat.sum') },
      { title: ALONE, sum: t('lessonCombat:chapter.alone.sum') },
    ],
    steps: [
      {
        id: 'if',
        chapter: IN_COMBAT,
        lead: t('lessonCombat:if.lead'),
        tab: 'effects',
        panel: LIBRARY,
        say: t('lessonCombat:if.say'),
        hint: t('lessonCombat:if.hint'),
        at: [
          opened(STRIKE),
          { at: { text: t('constructor:brick.branch.label') }, say: t('lessonCombat:if.brick'), done: view => steps(view).some(step => step.type === 'branch') },
          { at: { guide: 'if-condition' }, say: t('lessonCombat:if.type'), done: view => barOpen(view) || inCombat(view) >= 0 },
          { at: { guide: 'if-condition' }, say: t('lessonCombat:if.pick'), done: view => is(barText(view), COMBAT) || inCombat(view) >= 0 },
          { at: [FORMULA_DONE, { guide: 'if-condition' }], say: t('lessonCombat:if.enter') },
        ],
        done: view => inCombat(view) >= 0,
        result: () => t('lessonCombat:if.result'),
      },
      {
        id: 'spend',
        chapter: IN_COMBAT,
        tab: 'effects',
        say: t('lessonCombat:spend.say'),
        hint: t('lessonCombat:spend.hint'),
        at: [
          { at: { text: t('effects:chain.addStep') }, say: t('lessonCombat:spend.addStep'), done: view => inCombat(view) >= 0 && armOf(steps(view), inCombat(view)).some(step => step.type === 'apply') },
          {
            at: { text: t('fields:target.field') },
            say: t('lessonCombat:spend.field'),
            done: view => Boolean(counter(view) && inCombat(view) >= 0 && armOf(steps(view), inCombat(view)).some(step => step.type === 'apply' && is(step.target, `@${actorKey(strike(view)?.[1])}.${counter(view)}`))),
          },
          { at: { text: AMOUNT }, say: t('lessonCombat:spend.amount'), done: view => barText(view).trim() === '1' || spends(view) },
          { at: [FORMULA_DONE, { text: AMOUNT }], say: t('lessonCombat:spend.enter') },
        ],
        done: spends,
        traps: [{
          when: view => steps(view).some(step => step.type === 'apply') && inCombat(view) >= 0 && !armOf(steps(view), inCombat(view)).some(step => step.type === 'apply'),
          say: t('lessonCombat:spend.trap'),
        }],
        result: () => t('lessonCombat:spend.result'),
      },
      {
        id: 'problems',
        chapter: IN_COMBAT,
        say: t('lessonCombat:problems.say'),
        at: { guide: 'problems' },
        done: problemsClean,
        result: () => t('lessonCombat:problems.result'),
      },
      {
        id: 'refuse',
        chapter: ALONE,
        lead: t('lessonCombat:refuse.lead'),
        alone: true,
        tab: 'effects',
        goal: t('lessonCombat:refuse.goal'),
        say: t('lessonCombat:refuse.say'),
        hint: t('lessonCombat:refuse.hint'),
        done: view => refuses(view) && errorsOf(view.system) === 0,
        result: () => t('lessonCombat:refuse.result'),
      },
    ],
  };
});
