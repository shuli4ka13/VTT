import type { Lesson, View } from '../types.ts';
import { fieldsOf, blockLabel } from '@vtt/engine';
import { visible } from '../anchor.ts';
import { fieldBy, inBlock, columnOf, effectBy, actorKey, aimKey, stepsOf, reads, is, subtracts, adds, armOf, numberOf, errorsOf, exprOf, isArm, same, FORMULA_DONE, barOpen, barText, trialShows, problemsClean } from '../find.ts';
import { lazyLesson, blankSeed } from '../lazy.ts';

export const firstSystem: Lesson = lazyLesson('first-system', words => {
  const { t } = words;
  const BLOCK = t('lessonFirstSystem:name.block');
  const HP = t('lessonFirstSystem:name.hp');
  const AC = t('lessonFirstSystem:name.ac');
  const DIE = t('lessonFirstSystem:name.die');
  const STRIKE = t('lessonFirstSystem:name.strike');
  const TARGETS = t('lessonFirstSystem:name.targets');
  const TARGET = t('lessonFirstSystem:name.target');
  const HEAL = t('lessonFirstSystem:name.heal');
  const SHEET = t('lessonFirstSystem:chapter.sheet.title');
  const DIE_STRIKE = t('lessonFirstSystem:chapter.dieStrike.title');
  const CHECK_DAMAGE = t('lessonFirstSystem:chapter.checkDamage.title');
  const ALONE = t('lessonFirstSystem:chapter.alone.title');
  const SHEETS = t('rolls:character.title');
  const KINDS = t('sheetTab:tab.viewKinds');
  const ADD_BLOCK = t('rolls:character.addBlock');
  const ADD_FIELD = t('rolls:character.addField');
  const MORE = t('common:more');
  const SHEET_TAB = t('sheetTab:tab.head');
  const START = t('records:table.start');
  const NOT_BELOW = t('records:table.notBelow');
  const LIBRARY = t('effects:tab.library');
  const NEAR = t('effects:tab.near');
  const RESULT = t('effects:preview.result');
  const AMOUNT = t('stepCards:change.amount.label');

  const hp = (view: View) => fieldBy(view.system, HP);
  const ac = (view: View) => fieldBy(view.system, AC);
  const strike = (view: View) => effectBy(view.system, STRIKE);

  const inFight = (view: View) => fieldsOf(view.system).filter(field => !field.cell && inBlock(view.system, field, BLOCK));

  const targetsOf = (view: View) => (strike(view)?.[1].params ?? []).find(param => param.kind === 'sheet' && param.many && same(param.label, TARGETS) && same(param.item?.label, TARGET));
  const aim = (view: View): string => aimKey(strike(view)?.[1]);
  const checkAt = (view: View): number => stepsOf(strike(view)?.[1]).findIndex(step => step.type === 'check');
  const rollAt = (view: View): number => stepsOf(strike(view)?.[1]).findIndex(step => step.type === 'roll' && (step as { by?: unknown }).by !== undefined);

  const branchAt = (view: View): number => {
    const steps = stepsOf(strike(view)?.[1]);
    const at = checkAt(view);
    const id = steps[at]?.id;
    if (at < 0 || typeof id !== 'string') return -1;
    return steps.findIndex((step, k) => k > at && isArm(step) && is(step.if, `@${id}.success`));
  };

  const applies = (view: View) => stepsOf(strike(view)?.[1]).filter(step => step.type === 'apply');
  const armApplies = (view: View) => {
    const at = branchAt(view);
    return at < 0 ? [] : armOf(stepsOf(strike(view)?.[1]), at).filter(step => step.type === 'apply');
  };

  const checkOf = (view: View): Record<string, unknown> | undefined => stepsOf(strike(view)?.[1])[checkAt(view)];

  const rollsCheckDie = (view: View): boolean => {
    const steps = stepsOf(strike(view)?.[1]);
    const roll = steps[rollAt(view)];
    const check = checkOf(view);
    const die = Object.entries(view.system.constants ?? {}).find(([key]) => key === roll?.die)?.[1];
    return Boolean(roll && check && typeof roll.id === 'string' && is(check.value, `@${roll.id}`) && die && same(die.label, DIE));
  };

  const versusOk = (view: View): boolean => {
    const key = ac(view)?.tag;
    return Boolean(key && is(checkOf(view)?.versus, `@${aim(view)}.${key}`));
  };

  const trialLine = `${t('app:mannequin.b')} · ${HP}: 10 → 5`;
  const trialShown = (view: View): boolean => trialShows(view, trialLine);

  return {
    id: 'first-system',
    title: t('lessonFirstSystem:title'),
    sub: t('lessonFirstSystem:sub'),
    seed: blankSeed(words),
    tab: 'sheet',
    chapters: [
      { title: SHEET, sum: t('lessonFirstSystem:chapter.sheet.sum') },
      { title: DIE_STRIKE, sum: t('lessonFirstSystem:chapter.dieStrike.sum') },
      { title: CHECK_DAMAGE, sum: t('lessonFirstSystem:chapter.checkDamage.sum') },
      { title: ALONE, sum: t('lessonFirstSystem:chapter.alone.sum') },
    ],
    steps: [
      {
        id: 'block',
        chapter: SHEET,
        lead: t('lessonFirstSystem:block.lead'),
        tab: 'sheet',
        say: t('lessonFirstSystem:block.say'),
        at: [
          { at: { text: KINDS }, say: t('lessonFirstSystem:block.open'), done: () => visible({ text: ADD_BLOCK, in: SHEETS }) },
          { at: { text: ADD_BLOCK, in: SHEETS }, say: t('lessonFirstSystem:block.add'), done: view => (view.system.blocks ?? []).length > 0 },
          { at: { input: t('common:name.block') }, say: t('lessonFirstSystem:block.name') },
        ],
        via: { text: KINDS },
        done: view => (view.system.blocks ?? []).some(block => blockLabel(view.system, block.key).trim() === BLOCK),
        result: () => t('lessonFirstSystem:block.result'),
      },
      {
        id: 'hp',
        chapter: SHEET,
        tab: 'sheet',
        say: t('lessonFirstSystem:hp.say'),
        at: [
          { at: { text: ADD_FIELD, in: SHEETS }, say: t('lessonFirstSystem:hp.add'), hint: t('lessonFirstSystem:hp.addHint'), done: view => inFight(view).length > 0 },
          { at: { input: t('common:name.field') }, say: t('lessonFirstSystem:hp.name') },
        ],
        via: [{ text: BLOCK, in: SHEETS }, { text: KINDS }],
        done: view => inBlock(view.system, hp(view), BLOCK),
        result: () => t('lessonFirstSystem:hp.result'),
      },
      {
        id: 'hp-start',
        chapter: SHEET,
        tab: 'sheet',
        say: t('lessonFirstSystem:hpStart.say'),
        hint: t('lessonFirstSystem:hpStart.hint'),
        at: { text: START },
        via: [{ text: MORE, in: SHEET_TAB }, { text: HP, in: SHEETS }, { text: BLOCK, in: SHEETS }, { text: KINDS }],
        done: view => numberOf(columnOf(view.system, hp(view))?.default) === 10,
        result: () => t('lessonFirstSystem:hpStart.result'),
      },
      {
        id: 'hp-min',
        chapter: SHEET,
        tab: 'sheet',
        say: t('lessonFirstSystem:hpMin.say'),
        hint: t('lessonFirstSystem:hpMin.hint'),
        at: [
          { at: { text: NOT_BELOW }, say: t('lessonFirstSystem:hpMin.click'), done: view => barText(view).trim() === '0' || numberOf(columnOf(view.system, hp(view))?.min) === 0 },
          { at: [FORMULA_DONE, { text: NOT_BELOW }], say: t('lessonFirstSystem:hpMin.enter') },
        ],
        via: [{ text: MORE, in: SHEET_TAB }, { text: HP, in: SHEETS }, { text: BLOCK, in: SHEETS }, { text: KINDS }],
        done: view => numberOf(columnOf(view.system, hp(view))?.min) === 0,
        result: () => t('lessonFirstSystem:hpMin.result'),
      },
      {
        id: 'ac',
        chapter: SHEET,
        tab: 'sheet',
        say: t('lessonFirstSystem:ac.say'),
        at: [
          { at: { text: ADD_FIELD, in: SHEETS }, say: t('lessonFirstSystem:ac.add'), hint: t('lessonFirstSystem:ac.addHint'), done: view => inFight(view).length > 1 },
          { at: { input: t('common:name.field') }, say: t('lessonFirstSystem:ac.name'), done: view => Boolean(ac(view)) },
          { at: [{ text: START }, { text: MORE, in: SHEET_TAB }, { text: AC, in: SHEETS }], say: t('lessonFirstSystem:ac.start'), hint: t('lessonFirstSystem:ac.startHint') },
        ],
        via: [{ text: BLOCK, in: SHEETS }, { text: KINDS }],
        done: view => inBlock(view.system, ac(view), BLOCK) && numberOf(columnOf(view.system, ac(view))?.default) === 12,
        result: () => t('lessonFirstSystem:ac.result'),
      },
      {
        id: 'die',
        chapter: DIE_STRIKE,
        tab: 'dictionaries',
        panel: t('tables:section.title'),
        say: t('lessonFirstSystem:die.say'),
        hint: t('lessonFirstSystem:die.hint'),
        at: [
          { at: { text: t('rolls:dice.add') }, say: t('lessonFirstSystem:die.add'), done: view => Object.values(view.system.constants ?? {}).some(constant => constant.kind === 'die') },
          { at: { input: t('rolls:dice.namePlaceholder') }, say: t('lessonFirstSystem:die.name') },
        ],
        via: { text: t('tables:section.rolls'), in: t('tables:section.title') },
        done: view => Object.values(view.system.constants ?? {}).some(constant =>
          constant.kind === 'die' && constant.label?.trim() === DIE && constant.dice?.[0]?.sides === 20),
        result: () => t('lessonFirstSystem:die.result'),
      },
      {
        id: 'strike',
        chapter: DIE_STRIKE,
        lead: t('lessonFirstSystem:strike.lead'),
        tab: 'effects',
        panel: LIBRARY,
        say: t('lessonFirstSystem:strike.say'),
        at: [
          { at: { text: t('effects:tab.addButton'), in: LIBRARY }, say: t('lessonFirstSystem:strike.add'), done: view => Object.keys(view.system.effects ?? {}).length > 0 },
          { at: { input: t('common:name.effect') }, say: t('lessonFirstSystem:strike.name') },
        ],
        done: view => Boolean(strike(view)),
        result: () => t('lessonFirstSystem:strike.result'),
      },
      {
        id: 'everyone',
        chapter: DIE_STRIKE,
        tab: 'sheet',
        say: t('lessonFirstSystem:everyone.say'),
        at: [
          { at: { text: KINDS }, say: t('lessonFirstSystem:everyone.open'), done: () => visible({ text: t('rolls:character.allBlocks'), in: SHEETS }), maybe: true },
          { at: { text: t('rolls:character.allBlocks'), in: SHEETS }, say: t('lessonFirstSystem:everyone.all'), done: () => visible({ field: t('rolls:character.grantsTitle') }), maybe: true },
          { at: { field: t('rolls:character.grantsTitle') }, say: t('lessonFirstSystem:everyone.pick') },
        ],
        done: view => {
          const found = strike(view);
          return Boolean(found && (view.system.grants ?? []).includes(found[0]));
        },
        result: () => t('lessonFirstSystem:everyone.result'),
      },
      {
        id: 'targets',
        chapter: DIE_STRIKE,
        lead: t('lessonFirstSystem:targets.lead'),
        tab: 'effects',
        say: t('lessonFirstSystem:targets.say'),
        at: [
          { at: { text: t('params:add.more') }, say: t('lessonFirstSystem:targets.more'), done: view => (strike(view)?.[1].params ?? []).length > 1 },
          { at: { text: t('params:field.name') }, say: t('lessonFirstSystem:targets.kind'), done: view => Boolean((strike(view)?.[1].params ?? []).find(param => param.kind === 'sheet' && param.many && same(param.label, TARGETS))) },
          { at: { text: t('params:each.label') }, say: t('lessonFirstSystem:targets.each'), hint: t('lessonFirstSystem:targets.eachHint') },
        ],
        done: view => Boolean(targetsOf(view)),
        result: () => t('lessonFirstSystem:targets.result'),
      },
      {
        id: 'each',
        chapter: DIE_STRIKE,
        lead: t('lessonFirstSystem:each.lead'),
        tab: 'effects',
        say: t('lessonFirstSystem:each.say'),
        hint: t('lessonFirstSystem:each.hint'),
        at: { text: t('constructor:brick.each.label') },
        done: view => {
          const list = targetsOf(view)?.key;
          return Boolean(list && stepsOf(strike(view)?.[1]).some(step => step.type === 'each' && (step as unknown as { of?: string }).of === list));
        },
        result: () => t('lessonFirstSystem:each.result'),
      },
      {
        id: 'check',
        chapter: CHECK_DAMAGE,
        lead: t('lessonFirstSystem:check.lead'),
        tab: 'effects',
        say: t('lessonFirstSystem:check.say'),
        at: [
          { at: { text: t('constructor:brick.roll.label') }, say: t('lessonFirstSystem:check.roll'), done: view => rollAt(view) >= 0 },
          { at: { text: t('constructor:brick.check.label') }, say: t('lessonFirstSystem:check.check'), done: view => checkAt(view) >= 0 },
          {
            at: { guide: 'check-formula' },
            say: t('lessonFirstSystem:check.formula'),
            hint: t('lessonFirstSystem:check.formulaHint'),
            done: view => barOpen(view) || versusOk(view),
          },
          {
            at: { guide: 'check-formula' },
            say: t('lessonFirstSystem:check.type'),
            done: view => is(barText(view), `@${aim(view)}.${ac(view)?.tag ?? ''}`) || versusOk(view),
          },
          { at: [FORMULA_DONE, { guide: 'check-formula' }], say: t('lessonFirstSystem:check.enter') },
        ],
        done: view => rollsCheckDie(view) && versusOk(view),
        result: () => t('lessonFirstSystem:check.result'),
      },
      {
        id: 'branch',
        chapter: CHECK_DAMAGE,
        tab: 'effects',
        say: t('lessonFirstSystem:branch.say'),
        hint: t('lessonFirstSystem:branch.hint'),
        at: { text: t('stepCards:group.byOutcome.add') },
        done: view => branchAt(view) >= 0,
        traps: [{ when: view => applies(view).length > 0 && branchAt(view) < 0, say: t('lessonFirstSystem:branch.trap') }],
        result: () => t('lessonFirstSystem:branch.result'),
      },
      {
        id: 'damage',
        chapter: CHECK_DAMAGE,
        tab: 'effects',
        say: t('lessonFirstSystem:damage.say'),
        at: [
          { at: { text: t('effects:chain.addStep') }, say: t('lessonFirstSystem:damage.step'), done: view => armApplies(view).length > 0 },
          {
            at: { text: t('fields:target.owner') },
            say: t('lessonFirstSystem:damage.target'),
            hint: t('lessonFirstSystem:damage.targetHint'),
            done: view => {
              const key = hp(view)?.tag;
              return Boolean(key && armApplies(view).some(step => is(step.target, `@${aim(view)}.${key}`)));
            },
          },
          {
            at: { text: AMOUNT },
            say: t('lessonFirstSystem:damage.amount'),
            done: view => barText(view).trim() === '5' || Boolean(hp(view) && armApplies(view).some(step => numberOf(step.value) === 5)),
          },
          { at: [FORMULA_DONE, { text: AMOUNT }], say: t('lessonFirstSystem:damage.enter') },
        ],
        done: view => {
          const key = hp(view)?.tag;
          return Boolean(key && armApplies(view).some(step =>
            is(step.target, `@${aim(view)}.${key}`) && numberOf(step.value) === 5 && subtracts(step)));
        },
        traps: [
          { when: view => branchAt(view) >= 0 && applies(view).length > armApplies(view).length, say: t('lessonFirstSystem:damage.trapOutside') },
          { when: view => armApplies(view).some(step => reads(step.target, `@${actorKey(strike(view)?.[1])}`) || exprOf(step.target).startsWith(`@${actorKey(strike(view)?.[1])}.`)), say: t('lessonFirstSystem:damage.trapActor') },
          { when: view => armApplies(view).some(step => exprOf(step.target).startsWith(`@${aim(view)}.`) && !reads(step.target, `@${aim(view)}.${hp(view)?.tag ?? ''}`)), say: t('lessonFirstSystem:damage.trapField') },
        ],
        result: view => t('lessonFirstSystem:damage.result', { n: exprOf(armApplies(view)[0]?.value) || '5' }),
      },
      {
        id: 'problems',
        chapter: CHECK_DAMAGE,
        say: t('lessonFirstSystem:problems.say'),
        hint: t('lessonFirstSystem:problems.hint'),
        at: { guide: 'problems' },
        done: problemsClean,
        result: () => t('lessonFirstSystem:problems.result'),
      },
      {
        id: 'trial',
        chapter: CHECK_DAMAGE,
        tab: 'effects',
        panel: NEAR,
        say: t('lessonFirstSystem:trial.say'),
        at: [
          { at: { text: t('effects:preview.trial'), in: NEAR }, say: t('lessonFirstSystem:trial.open'), done: () => visible({ text: RESULT }) },
          { at: { text: t('effects:preview.die') }, say: t('lessonFirstSystem:trial.die'), done: view => trialShown(view) },
        ],
        done: view => trialShown(view),
        result: () => t('lessonFirstSystem:trial.result'),
      },
      {
        id: 'heal',
        chapter: ALONE,
        lead: t('lessonFirstSystem:heal.lead'),
        alone: true,
        tab: 'effects',
        say: t('lessonFirstSystem:heal.say'),
        hint: t('lessonFirstSystem:heal.hint'),
        goal: t('lessonFirstSystem:heal.goal'),
        done: view => {
          const key = hp(view)?.tag;
          return Boolean(key && errorsOf(view.system) === 0 && stepsOf(effectBy(view.system, HEAL)?.[1]).some(step =>
            step.type === 'apply' && adds(step) && is(step.target, `@${actorKey(effectBy(view.system, HEAL)?.[1])}.${key}`) && numberOf(step.value) === 3));
        },
        result: () => t('lessonFirstSystem:heal.result'),
      },
    ],
  };
});
