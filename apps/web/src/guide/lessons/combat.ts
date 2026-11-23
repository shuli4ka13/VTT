import type { System, Effect } from '@vtt/schema';
import type { Lesson, View, Move } from '../types.ts';
import { lazyPlan, NAMES } from '@vtt/engine';
import { effectBy, actorKey, fieldBy, stepsOf, reads, is, subtracts, numberOf, armOf, errorsOf, isArm, FORMULA_DONE, barOpen, barText } from '../find.ts';
import { problemsClean } from './first-system.ts';
import seed from '../seeds/combat.json' with { type: 'json' };

const COMBAT = `@${NAMES.desk}.${NAMES.combat}`;

const strike = (view: View): [string, Effect] | undefined => effectBy(view.system, 'Удар');
const steps = (view: View): Record<string, unknown>[] => stepsOf(strike(view)?.[1]);
const counter = (view: View): string | undefined => fieldBy(view.system, 'Действий осталось')?.tag;

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
  at: { text: label, in: 'Библиотека эффектов' },
  say: `В «Библиотеке эффектов» откройте «${label}».`,
  done: view => view.effect === effectBy(view.system, label)?.[0],
});

export const combat: Lesson = {
  id: 'combat',
  title: 'Идёт ли бой',
  sub: 'Условие «идёт ли бой» в «Удар»: тратить действия только в бою, а в бою без действий — отказать.',
  start: 'есть пустой эффект «Удар», выданный всем листам, и поле «Действий осталось» на листе.',
  seed: seed as unknown as System,
  tab: 'effects',
  chapters: [
    { title: 'Только в бою', sum: '«Удар» снимает «Действий осталось» на 1 только пока идёт бой. Ошибок нет.' },
    { title: 'Сами', sum: 'Вы научили «Удар» отказывать в бою без действий без подсказок.' },
  ],
  steps: [
    {
      id: 'if',
      chapter: 'Только в бою',
      lead: 'Стол знает, идёт ли бой: он начинается, когда ведущий запускает ходы. Это можно спросить в условии. Пусть «Удар» тратит «Действий осталось» только в бою, а вне боя — бесплатно.',
      tab: 'effects',
      panel: 'Библиотека эффектов',
      say: 'В «Ударе» добавьте блок «Если» с условием «идёт ли бой».',
      hint: 'Условие читается словами: «идёт ли бой» — пункт подсказки, который появляется, когда начнёшь набирать «идёт».',
      at: [
        opened('Удар'),
        { at: { text: '+ если' }, say: 'В палитре «Шаг» нажмите «+ если».', done: view => steps(view).some(step => step.type === 'branch') },
        { at: { guide: 'if-condition' }, say: 'Щёлкните условие «Если» и начните набирать «идёт».', done: view => barOpen(view) || inCombat(view) >= 0 },
        { at: { guide: 'if-condition' }, say: 'В списке выберите «идёт ли бой».', done: view => is(barText(view), COMBAT) || inCombat(view) >= 0 },
        { at: [FORMULA_DONE, { guide: 'if-condition' }], say: 'Нажмите Enter или «готово».' },
      ],
      done: view => inCombat(view) >= 0,
      result: () => 'Блок «Если идёт ли бой» стоит.',
    },
    {
      id: 'spend',
      chapter: 'Только в бою',
      tab: 'effects',
      say: 'Внутри блока сделайте изменение: «Действий осталось» минус 1.',
      hint: 'В «У кого» должно стоять «Кто действует», в «Как» — «отнять»: так они и стоят.',
      at: [
        { at: { text: '+ шаг' }, say: 'В ветке блока в списке «+ шаг» выберите «изменение».', done: view => inCombat(view) >= 0 && armOf(steps(view), inCombat(view)).some(step => step.type === 'apply') },
        {
          at: { text: 'Какое поле' },
          say: 'В «Какое поле» выберите «Действий осталось».',
          done: view => Boolean(counter(view) && inCombat(view) >= 0 && armOf(steps(view), inCombat(view)).some(step => step.type === 'apply' && is(step.target, `@${actorKey(strike(view)?.[1])}.${counter(view)}`))),
        },
        { at: { text: 'Сколько' }, say: 'Щёлкните «Сколько» и впишите 1.', done: view => barText(view).trim() === '1' || spends(view) },
        { at: [FORMULA_DONE, { text: 'Сколько' }], say: 'Нажмите Enter или «готово».' },
      ],
      done: spends,
      traps: [{
        when: view => steps(view).some(step => step.type === 'apply') && inCombat(view) >= 0 && !armOf(steps(view), inCombat(view)).some(step => step.type === 'apply'),
        say: '«Изменение» стоит вне блока «Если» — действия будут тратиться и вне боя. Перенесите его внутрь.',
      }],
      result: () => 'В бою «Удар» тратит одно действие.',
    },
    {
      id: 'problems',
      chapter: 'Только в бою',
      say: 'Нажмите в шапке кнопку «Проблем нет» (если что-то найдено, на ней «Проблемы» и число). Ошибок быть не должно.',
      at: { guide: 'problems' },
      done: problemsClean,
      result: () => 'Проблем нет.',
    },
    {
      id: 'refuse',
      chapter: 'Сами',
      lead: 'Последнее задание — без подсказок.',
      alone: true,
      tab: 'effects',
      goal: 'в «Ударе» есть «Стоп», который срабатывает, только когда идёт бой и «Действий осталось» меньше 1; в «Проблемах» нет ошибок.',
      say: 'Сделайте так, чтобы «Удар» отказывал («Стоп»), когда идёт бой и «Действий осталось» меньше 1.',
      hint: 'Отказ должен стоять до траты действия. Можно собрать одним условием через «и» или вложить второй «Если».',
      done: view => refuses(view) && errorsOf(view.system) === 0,
      result: () => 'В бою без действий «Удар» отказывает.',
    },
  ],
};
