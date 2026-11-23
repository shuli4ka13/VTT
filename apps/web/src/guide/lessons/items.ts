import type { System } from '@vtt/schema';
import type { Lesson, View } from '../types.ts';
import { effectBy, tableBy, fieldBy, stepsOf, is, numberOf, same, errorsOf, FORMULA_DONE, barOpen, barText, problemsClean } from '../find.ts';
import { visible } from '../anchor.ts';
import { lazyLesson, seedIn } from '../lazy.ts';
import base from '../seeds/base.json' with { type: 'json' };

export const items: Lesson = lazyLesson('items', words => {
  const { t } = words;
  const STRIKE = t('lessonItems:name.strike');
  const HP = t('lessonItems:name.hp');
  const AC = t('lessonItems:name.ac');
  const WEAPON = t('lessonItems:name.weapon');
  const ARMOR = t('lessonItems:name.armor');
  const WEAPON_DAMAGE = t('lessonItems:name.weaponDamage');
  const KIND = t('lessonItems:chapter.kind.title');
  const BUTTON = t('lessonItems:chapter.button.title');
  const ALONE = t('lessonItems:chapter.alone.title');
  const BOOKS = t('records:list.head');
  const LIBRARY = t('effects:tab.library');
  const SHEETS = t('rolls:character.title');
  const ALL_BLOCKS = t('rolls:character.allBlocks');
  const GRANTS = t('rolls:character.grantsTitle');
  const AMOUNT = t('stepCards:change.amount.label');

  const strike = (view: View) => effectBy(view.system, STRIKE);
  const weaponParam = (view: View) => (strike(view)?.[1].params ?? []).find(param => same(param.label, WEAPON_DAMAGE));
  const bookKind = (view: View, label: string) => {
    const found = tableBy(view.system, label);
    return found && found[1].shape === 'book' ? found : undefined;
  };
  const paramUsed = (view: View): boolean => {
    const param = weaponParam(view);
    return Boolean(param && param.kind === 'number' && stepsOf(strike(view)?.[1]).some(step => step.type === 'apply' && is(step.value, `@${param.key}`)));
  };
  const weapon = (view: View) => bookKind(view, WEAPON);
  const editsArmor = (view: View, label: string, by?: number): boolean => {
    const ac = fieldBy(view.system, AC)?.tag;
    return Boolean(ac && (bookKind(view, label)?.[1].modifiers ?? []).some(modifier => {
      const loose = modifier as unknown as { op?: string; value?: unknown };
      return modifier.kind === 'value' && is(modifier.target, ac) && (by === undefined || ((!loose.op || loose.op === 'add') && numberOf(loose.value) === by));
    }));
  };

  return {
    id: 'items',
    title: t('lessonItems:title'),
    sub: t('lessonItems:sub'),
    start: t('lessonItems:start'),
    seed: seedIn(base as unknown as System, words),
    tab: 'records',
    chapters: [
      { title: KIND, sum: t('lessonItems:chapter.kind.sum') },
      { title: BUTTON, sum: t('lessonItems:chapter.button.sum') },
      { title: ALONE, sum: t('lessonItems:chapter.alone.sum') },
    ],
    steps: [
      {
        id: 'kind',
        chapter: KIND,
        lead: t('lessonItems:kind.lead'),
        tab: 'records',
        panel: BOOKS,
        say: t('lessonItems:kind.say'),
        at: [
          { at: { text: t('records:list.addKind') }, say: t('lessonItems:kind.add'), done: view => Object.values(view.system.tables ?? {}).some(table => table.shape === 'book') },
          { at: { input: t('common:name.kind') }, say: t('lessonItems:kind.name') },
        ],
        hint: t('lessonItems:kind.hint'),
        done: view => Boolean(weapon(view)) && (weapon(view)?.[1].use ?? 'item') === 'item',
        result: () => t('lessonItems:kind.result'),
      },
      {
        id: 'param',
        chapter: KIND,
        tab: 'effects',
        panel: LIBRARY,
        say: t('lessonItems:param.say'),
        hint: t('lessonItems:param.hint'),
        at: [
          { at: { text: t('params:add.more') }, say: t('lessonItems:param.more'), hint: t('lessonItems:param.moreHint'), done: view => (strike(view)?.[1].params ?? []).length > 2 },
          { at: { text: t('params:field.name') }, say: t('lessonItems:param.name'), done: view => Boolean(weaponParam(view)) },
          {
            at: { text: `4 · ${t('readback:step.set')} «${HP}»` },
            say: t('lessonItems:param.expand'),
            done: () => visible({ text: AMOUNT }),
          },
          {
            at: { text: AMOUNT },
            say: t('lessonItems:param.number'),
            done: view => barOpen(view) || paramUsed(view),
          },
          {
            at: { text: AMOUNT },
            say: t('lessonItems:param.pick'),
            done: view => is(barText(view), `@${weaponParam(view)?.key ?? ''}`) || paramUsed(view),
          },
          { at: [FORMULA_DONE, { text: AMOUNT }], say: t('lessonItems:param.enter') },
        ],
        via: { text: STRIKE, in: LIBRARY },
        done: paramUsed,
        traps: [{
          when: view => !weaponParam(view)
            && (strike(view)?.[1].params ?? []).some(param => (param.label ?? '').toLowerCase().includes(WEAPON_DAMAGE.toLowerCase())),
          say: t('lessonItems:param.trap'),
        }],
        result: () => t('lessonItems:param.result'),
      },
      {
        id: 'given',
        chapter: KIND,
        tab: 'sheet',
        say: t('lessonItems:given.say'),
        at: [
          { at: { text: t('sheetTab:tab.viewKinds') }, say: t('lessonItems:given.kinds'), done: () => visible({ text: ALL_BLOCKS, in: SHEETS }), maybe: true },
          { at: { text: ALL_BLOCKS, in: SHEETS }, say: t('lessonItems:given.all'), done: () => visible({ field: GRANTS }), maybe: true },
          { at: { field: GRANTS }, say: t('lessonItems:given.remove') },
        ],
        done: view => {
          const found = strike(view);
          return Boolean(found && !(view.system.grants ?? []).includes(found[0]));
        },
        result: () => t('lessonItems:given.result'),
      },
      {
        id: 'button',
        chapter: BUTTON,
        tab: 'records',
        panel: BOOKS,
        say: t('lessonItems:button.say'),
        hint: t('lessonItems:button.hint'),
        at: [
          { at: { text: t('records:kind.buttons.add') }, say: t('lessonItems:button.add'), done: view => (weapon(view)?.[1].bindings ?? []).length > 0 },
          { at: { text: t('records:button.effect') }, say: t('lessonItems:button.effect') },
        ],
        via: { text: WEAPON, in: BOOKS },
        done: view => {
          const found = strike(view);
          const param = weaponParam(view);
          const kind = weapon(view)?.[1];
          return Boolean(found && param && kind
            && (kind.bindings ?? []).some(binding => binding.effect === found[0])
            && (kind.columns ?? []).some(column => column.key === param.key));
        },
        result: () => t('lessonItems:button.result'),
      },
      {
        id: 'modifier',
        chapter: BUTTON,
        lead: t('lessonItems:modifier.lead'),
        tab: 'records',
        say: t('lessonItems:modifier.say'),
        at: [
          { at: { text: t('fields:mod.addField') }, say: t('lessonItems:modifier.add'), done: view => (weapon(view)?.[1].modifiers ?? []).length > 0 },
          { at: { text: t('fields:mod.target') }, say: t('lessonItems:modifier.target'), done: view => Boolean(editsArmor(view, WEAPON)) },
          { at: { text: t('fields:mod.amount') }, say: t('lessonItems:modifier.amount') },
        ],
        done: view => editsArmor(view, WEAPON, 1),
        result: () => t('lessonItems:modifier.result'),
      },
      {
        id: 'problems',
        chapter: BUTTON,
        say: t('lessonItems:problems.say'),
        at: { guide: 'problems' },
        done: problemsClean,
        result: () => t('lessonItems:problems.result'),
      },
      {
        id: 'armor',
        chapter: ALONE,
        lead: t('lessonItems:armor.lead'),
        alone: true,
        tab: 'records',
        say: t('lessonItems:armor.say'),
        goal: t('lessonItems:armor.goal'),
        hint: t('lessonItems:armor.hint'),
        done: view => editsArmor(view, ARMOR) && errorsOf(view.system) === 0,
        result: () => t('lessonItems:armor.result'),
      },
    ],
  };
});
