import type { System, Param, Effect } from '@vtt/schema';
import type { Lesson, View } from '../types.ts';
import { effectBy, aimKey, fieldBy, stepsOf, is, subtracts, adds, numberOf, armOf, errorsOf, same, isArm, FORMULA_DONE, barOpen, barText, problemsClean, trialShows } from '../find.ts';
import { armsOf, stepSaid, LAUNCHES } from '@vtt/engine';
import { visible } from '../anchor.ts';
import { lazyLesson, seedIn } from '../lazy.ts';
import base from '../seeds/base.json' with { type: 'json' };

const rowOpen = (name: string): boolean =>
  [...document.querySelectorAll('.param-item')].some(item => same(item.querySelector('.param-line__name')?.textContent, name) && item.querySelector('.param-form') !== null);

const sheetOf = (effect: Effect | undefined) => (effect?.params ?? []).find(param => param.kind === 'sheet' && !param.many);

const callsOf = (view: View, strike: string, id: string | undefined) =>
  id ? stepsOf(effectBy(view.system, strike)?.[1]).filter(step => step.type === 'emit' && step.effect === id) : [];

export const links: Lesson = lazyLesson('links', words => {
  const { t } = words;
  const STRIKE = t('lessonLinks:name.strike');
  const DAMAGE = t('lessonLinks:name.damage');
  const HEAL = t('lessonLinks:name.heal');
  const HP = t('lessonLinks:name.hp');
  const ACTOR = t('lessonLinks:name.actor');
  const AMOUNT_NAME = t('lessonLinks:name.amount');
  const LEFT = t('lessonLinks:name.left');
  const LIBRARY = t('effects:tab.library');
  const WHAT_IN = t('params:card.title');
  const WHAT_BACK = t('params:card.returnsTitle');
  const FIELD_NAME = t('params:field.name');
  const NEARBY = t('effects:tab.near');
  const HOW_MUCH = t('stepCards:change.amount.label');
  const WHICH_EFFECT = t('records:call.effect');
  const CALLED = t('lessonLinks:chapter.called.title');
  const CALL = t('lessonLinks:chapter.call.title');
  const ALONE = t('lessonLinks:chapter.alone.title');
  const CHANGE_HEAD = t('lessonLinks:head.change', { field: HP });
  const CALL_HEAD = t('lessonLinks:head.call', { name: DAMAGE });
  const TRIAL_LINE = `${t('app:mannequin.b')} · ${HP}: 10 → 5`;

  const trialShown = (view: View): boolean => trialShows(view, TRIAL_LINE);

  const damage = (view: View) => effectBy(view.system, DAMAGE);
  const strike = (view: View) => effectBy(view.system, STRIKE);
  const paramsOf = (view: View): Param[] => damage(view)?.[1].params ?? [];
  const sheetParam = (view: View) => sheetOf(damage(view)?.[1]);
  const amountParam = (view: View) => paramsOf(view).find(param => param.role === 'amount');

  const callsFrom = (view: View, id: string | undefined) => callsOf(view, STRIKE, id);
  const amountApplied = (view: View): boolean => {
    const amount = amountParam(view)?.key;
    return Boolean(amount && stepsOf(damage(view)?.[1]).some(step => step.type === 'apply' && is(step.value, `@${amount}`)));
  };
  const calls = (view: View) => callsFrom(view, damage(view)?.[0]);

  const successArm = (view: View) => {
    const steps = stepsOf(strike(view)?.[1]);
    const check = steps.find(step => step.type === 'check')?.id;
    const at = steps.findIndex(step => isArm(step) && typeof check === 'string' && is(step.if, `@${check}.success`));
    return at < 0 ? [] : armOf(steps, at);
  };

  const returnsRight = (view: View, expr: unknown): boolean => {
    const sheet = sheetParam(view)?.key;
    const hp = fieldBy(view.system, HP)?.tag;
    return Boolean(sheet && hp && is(expr, `@${sheet}.${hp}`));
  };

  const returnedRight = (view: View): boolean =>
    (damage(view)?.[1].returns ?? []).some(column => column.kind === 'number' && same(column.label, LEFT) && returnsRight(view, column.expr));

  const failArm = (view: View) => {
    const steps = stepsOf(strike(view)?.[1]);
    const check = steps.find(step => step.type === 'check')?.id;
    const head = steps.findIndex(step => isArm(step) && typeof check === 'string' && is(step.if, `@${check}.success`));
    if (head < 0) return [];
    const arms = armsOf(steps);
    const tail = steps.findIndex((step, k) => k > head && step.type === 'orElse' && !step.if && arms[k]?.at(-1)?.open === head);
    return tail < 0 ? [] : armOf(steps, tail);
  };

  return {
    id: 'links',
    title: t('lessonLinks:title'),
    sub: t('lessonLinks:sub'),
    start: t('lessonLinks:start'),
    seed: seedIn(base as unknown as System, words),
    tab: 'effects',
    chapters: [
      { title: CALLED, sum: t('lessonLinks:chapter.called.sum') },
      { title: CALL, sum: t('lessonLinks:chapter.call.sum') },
      { title: ALONE, sum: t('lessonLinks:chapter.alone.sum') },
    ],
    steps: [
      {
        id: 'called',
        chapter: CALLED,
        lead: t('lessonLinks:called.lead'),
        tab: 'effects',
        panel: LIBRARY,
        say: t('lessonLinks:called.say'),
        at: [
          {
            at: { text: `+ ${LAUNCHES.manual.label.toLowerCase()}`, in: LIBRARY },
            say: t('lessonLinks:called.add'),
            done: view => Object.values(view.system.effects ?? {}).some(effect => !same(effect.label, STRIKE)),
          },
          { at: { input: t('common:name.effect') }, say: t('lessonLinks:called.type') },
        ],
        done: view => Boolean(damage(view)),
        result: () => t('lessonLinks:called.result'),
      },
      {
        id: 'amount',
        chapter: CALLED,
        tab: 'effects',
        say: t('lessonLinks:amount.say'),
        at: [
          {
            at: { text: t('params:add.more'), in: WHAT_IN },
            say: t('lessonLinks:amount.more'),
            done: view => paramsOf(view).length > 1,
          },
          {
            at: { text: FIELD_NAME, in: WHAT_IN },
            say: t('lessonLinks:amount.name'),
            done: view => paramsOf(view).some(param => param.kind === 'number' && same(param.label, AMOUNT_NAME)),
          },
          {
            at: { text: t('params:amount.label'), in: WHAT_IN },
            say: t('lessonLinks:amount.mark'),
            hint: t('lessonLinks:amount.hint'),
          },
        ],
        via: [{ text: t('common:more'), in: WHAT_IN }, { text: AMOUNT_NAME, in: WHAT_IN }],
        done: view => paramsOf(view).some(param => param.role === 'amount' && param.kind === 'number' && same(param.label, AMOUNT_NAME)),
        result: () => t('lessonLinks:amount.result'),
      },
      {
        id: 'target',
        chapter: CALLED,
        tab: 'effects',
        say: t('lessonLinks:target.say'),
        hint: t('lessonLinks:target.hint'),
        at: [
          { at: { text: ACTOR, in: WHAT_IN }, say: t('lessonLinks:target.open'), done: () => rowOpen(ACTOR) },
          { at: { text: t('params:who.label') }, say: t('lessonLinks:target.pick') },
        ],
        done: view => sheetParam(view)?.role === 'target',
        result: () => t('lessonLinks:target.result'),
      },
      {
        id: 'apply',
        chapter: CALLED,
        tab: 'effects',
        say: t('lessonLinks:apply.say'),
        hint: t('lessonLinks:apply.hint'),
        at: [
          { at: { text: t('constructor:brick.change.label') }, say: t('lessonLinks:apply.add'), done: view => stepsOf(damage(view)?.[1]).some(step => step.type === 'apply') },
          {
            at: { text: t('fields:target.field') },
            say: t('lessonLinks:apply.field'),
            done: view => {
              const sheet = sheetParam(view)?.key;
              const hp = fieldBy(view.system, HP)?.tag;
              return Boolean(sheet && hp && stepsOf(damage(view)?.[1]).some(step => step.type === 'apply' && is(step.target, `@${sheet}.${hp}`)));
            },
          },
          { at: { text: HOW_MUCH }, say: t('lessonLinks:apply.amount'), done: view => barOpen(view) || amountApplied(view) },
          { at: { text: HOW_MUCH }, say: t('lessonLinks:apply.group'), done: view => is(barText(view), `@${amountParam(view)?.key ?? ''}`) || amountApplied(view) },
          { at: [FORMULA_DONE, { text: HOW_MUCH }], say: t('lessonLinks:apply.enter') },
        ],
        done: view => {
          const sheet = sheetParam(view)?.key;
          const amount = amountParam(view)?.key;
          const hp = fieldBy(view.system, HP)?.tag;
          return Boolean(sheet && amount && hp && stepsOf(damage(view)?.[1]).some(step =>
            step.type === 'apply' && is(step.target, `@${sheet}.${hp}`) && is(step.value, `@${amount}`) && subtracts(step)));
        },
        result: () => t('lessonLinks:apply.result'),
      },
      {
        id: 'returns',
        chapter: CALLED,
        lead: t('lessonLinks:returns.lead'),
        tab: 'effects',
        say: t('lessonLinks:returns.say'),
        at: [
          { at: { text: t('params:returns.add') }, say: t('lessonLinks:returns.add'), done: view => (damage(view)?.[1].returns ?? []).length > 0 },
          { at: { text: FIELD_NAME, in: WHAT_BACK }, say: t('lessonLinks:returns.name'), done: view => (damage(view)?.[1].returns ?? []).some(column => same(column.label, LEFT)) },
          { at: { text: t('params:field.kind'), in: WHAT_BACK }, say: t('lessonLinks:returns.kind'), done: view => (damage(view)?.[1].returns ?? []).some(column => column.kind === 'number') },
          {
            at: [{ text: t('params:field.from') }, { text: LEFT }],
            say: t('lessonLinks:returns.from'),
            hint: t('lessonLinks:returns.fromHint'),
            done: view => barOpen(view) || returnedRight(view),
          },
          {
            at: [{ text: t('params:field.from') }, { text: LEFT }],
            say: t('lessonLinks:returns.pick'),
            done: view => returnsRight(view, barText(view)) || returnedRight(view),
          },
          { at: [FORMULA_DONE, { text: t('params:field.from') }, { text: LEFT }], say: t('lessonLinks:returns.enter') },
        ],
        traps: [{
          when: view => (damage(view)?.[1].returns ?? []).some(column => column.kind !== 'number' && Boolean(column.expr)),
          say: t('lessonLinks:returns.trap'),
        }],
        done: returnedRight,
        result: () => t('lessonLinks:returns.result'),
      },
      {
        id: 'call',
        chapter: CALL,
        tab: 'effects',
        panel: LIBRARY,
        say: t('lessonLinks:call.say'),
        hint: t('lessonLinks:call.hint'),
        at: [
          { at: { text: t('effects:chain.addStep') }, say: t('lessonLinks:call.add'), done: view => stepsOf(strike(view)?.[1]).some(step => step.type === 'emit') },
          {
            at: { text: WHICH_EFFECT },
            say: t('lessonLinks:call.five'),
            done: view => barText(view).trim() === '5' || calls(view).some(step => numberOf(((step.args ?? {}) as Record<string, unknown>)[amountParam(view)?.key ?? '']) === 5),
          },
          { at: [FORMULA_DONE, { text: WHICH_EFFECT }], say: t('lessonLinks:call.enter') },
        ],
        via: { text: STRIKE, in: LIBRARY },
        done: view => {
          const amount = amountParam(view)?.key;
          const sheet = sheetParam(view)?.key;
          const arm = successArm(view);
          return Boolean(amount && sheet && calls(view).some(step => {
            const args = (step.args ?? {}) as Record<string, unknown>;
            return arm.includes(step) && numberOf(args[amount]) === 5 && (args[sheet] === undefined || is(args[sheet], `@${aimKey(strike(view)?.[1])}`));
          }));
        },
        result: () => t('lessonLinks:call.result'),
      },
      {
        id: 'drop',
        chapter: CALL,
        tab: 'effects',
        say: t('lessonLinks:drop.say'),
        at: [
          { at: [{ text: t('common:delete'), in: CHANGE_HEAD }, { text: t('common:delete') }], say: t('lessonLinks:drop.delete'), done: () => visible({ text: t('ui:danger.sure') }) },
          { at: { text: t('ui:danger.sure') }, say: t('lessonLinks:drop.confirm') },
        ],
        done: view => calls(view).length > 0 && !stepsOf(strike(view)?.[1]).some(step => step.type === 'apply'),
        result: () => t('lessonLinks:drop.result'),
      },
      {
        id: 'name',
        chapter: CALL,
        tab: 'effects',
        say: t('lessonLinks:callName.say'),
        hint: t('lessonLinks:callName.hint'),
        at: [
          { at: [{ text: t('rollCards:result.name') }, { text: CALL_HEAD }], say: t('lessonLinks:callName.open'), done: () => visible({ guide: 'step-name' }) },
          { at: { guide: 'step-name' }, say: t('lessonLinks:callName.type') },
        ],
        done: view => calls(view).some(step => typeof step.id === 'string' && step.id.trim() !== ''),
        result: view => t('lessonLinks:callName.result', { name: stepSaid(calls(view).find(step => step.id) ?? {}) }),
      },
      {
        id: 'trial',
        chapter: CALL,
        tab: 'effects',
        panel: NEARBY,
        say: t('lessonLinks:trial.say', { line: TRIAL_LINE }),
        at: [
          { at: { text: t('effects:preview.trial'), in: NEARBY }, say: t('lessonLinks:trial.open'), done: () => visible({ text: t('effects:preview.result') }) },
          { at: { text: t('effects:preview.die') }, say: t('lessonLinks:trial.die'), done: view => trialShown(view) },
        ],
        done: view => trialShown(view),
        result: () => t('lessonLinks:trial.result'),
      },
      {
        id: 'problems',
        chapter: CALL,
        say: t('lessonLinks:problems.say'),
        at: { guide: 'problems' },
        done: problemsClean,
        result: () => t('lessonLinks:problems.result'),
      },
      {
        id: 'heal',
        chapter: ALONE,
        alone: true,
        tab: 'effects',
        say: t('lessonLinks:heal.say'),
        goal: t('lessonLinks:heal.goal'),
        hint: t('lessonLinks:heal.hint'),
        done: view => {
          const heal = effectBy(view.system, HEAL);
          const sheet = sheetOf(heal?.[1])?.key;
          const hp = fieldBy(view.system, HP)?.tag;
          return Boolean(heal && sheet && hp
            && stepsOf(heal[1]).some(step => step.type === 'apply' && adds(step) && is(step.target, `@${sheet}.${hp}`))
            && callsFrom(view, heal[0]).some(step => failArm(view).includes(step))
            && errorsOf(view.system) === 0);
        },
        result: () => t('lessonLinks:heal.result'),
      },
    ],
  };
});
