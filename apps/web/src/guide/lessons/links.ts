import type { System, Param, Effect } from '@vtt/schema';
import type { Lesson, View } from '../types.ts';
import { effectBy, fieldBy, stepsOf, reads, armOf, errorsOf, same } from '../find.ts';
import { problemsClean } from './first-system.ts';
import base from '../seeds/base.json' with { type: 'json' };

const damage = (view: View) => effectBy(view.system, 'Урон');
const strike = (view: View) => effectBy(view.system, 'Удар');
const paramsOf = (view: View): Param[] => damage(view)?.[1].params ?? [];
const sheetOf = (effect: Effect | undefined) => (effect?.params ?? []).find(param => param.kind === 'sheet' && !param.many);
const sheetParam = (view: View) => sheetOf(damage(view)?.[1]);
const amountParam = (view: View) => paramsOf(view).find(param => param.role === 'amount');

const callsOf = (view: View, id: string | undefined) =>
  id ? stepsOf(strike(view)?.[1]).filter(step => step.type === 'emit' && step.effect === id) : [];
const calls = (view: View) => callsOf(view, damage(view)?.[0]);

const successArm = (view: View) => {
  const steps = stepsOf(strike(view)?.[1]);
  const check = steps.find(step => step.type === 'check')?.id;
  const at = steps.findIndex(step => step.type === 'branch' && typeof check === 'string' && reads(step.if, `@${check}.success`));
  return at < 0 ? [] : armOf(steps, at);
};

export const links: Lesson = {
  id: 'links',
  title: 'Связи и аргументы',
  sub: '«Урон» как функция: входы, итог и вызов из «Удара».',
  seed: base as unknown as System,
  tab: 'effects',
  chapters: [
    { title: 'Функция', sum: '«Урон»: приходит лист (сам — текущая цель) и сколько, снимает хиты и отдаёт «Осталось».' },
    { title: 'Вызов', sum: '«Удар» при успехе зовёт «Урон», проба и «Проблемы» это подтвердили.' },
    { title: 'Сами', sum: 'Вы собрали вторую функцию и её вызов без подсказок.' },
  ],
  steps: [
    {
      id: 'called',
      chapter: 'Функция',
      lead: 'Эффект — функция: «Что приходит» — входы, дальше шаги, «Что получит тот, кто вызвал» — итоги. Тот, кто вызывает, передаёт входы явно.',
      tab: 'effects',
      panel: 'Библиотека эффектов',
      say: 'Нажмите «+ шаг для других» и назовите эффект «Урон». Входы «Лист» и «Сколько» уже стоят.',
      hint: 'Без входа «Сколько» и без вызывающих «Урон» перестаёт быть шагом для других.',
      at: [
        {
          at: { text: '+ шаг для других', in: 'Библиотека эффектов' },
          done: view => Object.values(view.system.effects ?? {}).some(effect =>
            !same(effect.label, 'Удар') && (effect.params ?? []).some(param => param.role === 'amount')),
        },
        { at: { input: 'как зовётся эффект' } },
      ],
      done: view => Boolean(amountParam(view)),
      result: () => '«Урон» заведён; «Сколько» — величина.',
    },
    {
      id: 'target',
      chapter: 'Функция',
      tab: 'effects',
      say: 'У входа «Лист» в «Приходит сам» выберите «текущая цель».',
      hint: '«Лист» без «Приходит сам» вызывающий не заполнит — в шаге вызова будет красное «не передано». Поле — под «ещё» у входа.',
      at: { text: 'Приходит сам' },
      via: [{ text: 'ещё', in: 'Что приходит' }, { text: 'Лист', in: 'Что приходит' }],
      done: view => sheetParam(view)?.role === 'target',
      result: () => '«Лист» приходит сам — текущая цель.',
    },
    {
      id: 'apply',
      chapter: 'Функция',
      tab: 'effects',
      say: '«Изменение» уже стоит: у «Листа» отнять «Сколько». Проверьте, что «Какое поле» — «Хиты».',
      at: { text: 'Какое поле' },
      done: view => {
        const sheet = sheetParam(view)?.key;
        const amount = amountParam(view)?.key;
        const hp = fieldBy(view.system, 'Хиты')?.tag;
        return Boolean(sheet && amount && hp && stepsOf(damage(view)?.[1]).some(step =>
          step.type === 'apply' && reads(step.target, `@${sheet}.${hp}`) && reads(step.value, `@${amount}`)));
      },
      result: () => '«Урон» отнимает «Сколько» от хитов листа.',
    },
    {
      id: 'returns',
      chapter: 'Функция',
      tab: 'effects',
      say: 'Нажмите «+ итог»: «Осталось», число, «Откуда» → «формулой…» — «@лист.» и «Хиты» из подсказки.',
      at: [
        { at: { text: '+ итог' }, done: view => (damage(view)?.[1].returns ?? []).length > 0 },
        { at: { text: 'Откуда' } },
      ],
      done: view => (damage(view)?.[1].returns ?? []).some(column => column.kind === 'number' && Boolean(column.expr)),
      result: () => 'Итог «Осталось» — хиты листа после урона.',
    },
    {
      id: 'call',
      chapter: 'Вызов',
      tab: 'effects',
      panel: 'Библиотека эффектов',
      say: 'В «Ударе», в ветке «успех», «+ шаг» → «вызов» → «Какой эффект» → «Урон»; в красном «Сколько» впишите 5.',
      hint: '«Лист» заполнится сам — это цель. «как устроено →» в шаге вызова открывает саму функцию.',
      at: [
        { at: { text: '+ шаг' }, done: view => stepsOf(strike(view)?.[1]).some(step => step.type === 'emit') },
        { at: { text: 'Какой эффект' } },
      ],
      via: { text: 'Удар', in: 'Библиотека эффектов' },
      done: view => {
        const amount = amountParam(view)?.key;
        const sheet = sheetParam(view)?.key;
        return Boolean(amount && sheet && calls(view).some(step => {
          const args = (step.args ?? {}) as Record<string, unknown>;
          return args[amount] !== undefined && (args[sheet] === undefined || reads(args[sheet], '@цель'));
        }));
      },
      result: () => 'При успехе «Удар» зовёт «Урон» с целью и 5.',
    },
    {
      id: 'drop',
      chapter: 'Вызов',
      tab: 'effects',
      say: 'Удалите из ветки прежнее «Изменение» — теперь хиты снимает функция.',
      done: view => calls(view).length > 0 && !stepsOf(strike(view)?.[1]).some(step => step.type === 'apply'),
      result: () => 'Своего «Изменения» у «Удара» больше нет.',
    },
    {
      id: 'name',
      chapter: 'Вызов',
      tab: 'effects',
      say: 'Под вызовом нажмите «результат…», назовите шаг «урон» и щёлкните мимо поля — итог читается ниже по имени.',
      at: { text: 'результат…' },
      done: view => calls(view).some(step => typeof step.id === 'string' && step.id.trim() !== ''),
      result: view => `Шаг вызова зовётся «${String(calls(view).find(step => step.id)?.id ?? '')}».`,
    },
    {
      id: 'trial',
      chapter: 'Вызов',
      tab: 'effects',
      panel: 'Рядом',
      say: 'Справа «Проба», кость «максимум»: «Б · Хиты: 10 → 5» — урон прошёл через функцию.',
      at: { text: 'Проба' },
    },
    {
      id: 'problems',
      chapter: 'Вызов',
      say: 'Откройте «Проблемы»: непереданный обязательный вход был бы ошибкой здесь.',
      at: { guide: 'problems' },
      done: problemsClean,
      result: () => 'Проблем нет.',
    },
    {
      id: 'heal',
      chapter: 'Сами',
      alone: true,
      tab: 'effects',
      say: 'Сделайте функцию «Лечение» — прибавляет хиты листу — и вызовите её из «Удара» при провале.',
      hint: '«+ шаг для других», «Как» — «прибавить». В «Ударе» под развилкой — «+ провал», в ней вызов «Лечения».',
      done: view => {
        const heal = effectBy(view.system, 'Лечение');
        const sheet = sheetOf(heal?.[1])?.key;
        const hp = fieldBy(view.system, 'Хиты')?.tag;
        const arm = successArm(view);
        return Boolean(heal && sheet && hp
          && stepsOf(heal[1]).some(step => step.type === 'apply' && step.direction === 'add' && reads(step.target, `@${sheet}.${hp}`))
          && callsOf(view, heal[0]).some(step => !arm.includes(step))
          && errorsOf(view.system) === 0);
      },
      result: () => 'При провале «Удар» зовёт «Лечение».',
    },
  ],
};
