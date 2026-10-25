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
  title: 'Шаг для других',
  sub: '«Урон» отдельным эффектом: «Удар» передаёт ему цель и число.',
  seed: base as unknown as System,
  tab: 'effects',
  chapters: [
    { title: 'Шаг для других', sum: '«Урон» получает цель и число, снимает хиты и сообщает, сколько осталось.' },
    { title: 'Вызов', sum: '«Удар» при успехе вызывает «Урон». Проба и «Проблемы» это подтвердили.' },
    { title: 'Сами', sum: 'Вы собрали второй шаг для других и его вызов без подсказок.' },
  ],
  steps: [
    {
      id: 'called',
      chapter: 'Шаг для других',
      lead: 'Урон снимают многие: удар, ловушка, яд. Опишем его один раз эффектом «Урон» вида «шаг для других», а другие эффекты будут его вызывать. Что «Урону» передают — кому и сколько — стоит в его «Что приходит».',
      tab: 'effects',
      panel: 'Библиотека эффектов',
      say: 'Заведите шаг для других «Урон».',
      hint: 'Не удаляйте «Сколько» из «Что приходит»: без него «Урон» перестанет быть шагом для других.',
      at: [
        {
          at: { text: '+ шаг для других', in: 'Библиотека эффектов' },
          say: 'В «Библиотеке эффектов» нажмите «+ шаг для других».',
          done: view => Object.values(view.system.effects ?? {}).some(effect =>
            !same(effect.label, 'Удар') && (effect.params ?? []).some(param => param.role === 'amount')),
        },
        { at: { input: 'как зовётся эффект' }, say: 'Впишите название «Урон».' },
      ],
      done: view => Boolean(amountParam(view)),
      result: () => '«Урон» заведён. В «Что приходит» уже стоят «Лист» — кому — и «Сколько».',
    },
    {
      id: 'target',
      chapter: 'Шаг для других',
      tab: 'effects',
      say: 'Чтобы «Удар» сам передавал свою цель, у «Лист» откройте «ещё» и в «Приходит сам» выберите «текущая цель».',
      hint: 'Без этого в вызове «Урона» у «Лист» будет красное «не передано».',
      at: { text: 'Приходит сам' },
      via: [{ text: 'ещё', in: 'Что приходит' }, { text: 'Лист', in: 'Что приходит' }],
      done: view => sheetParam(view)?.role === 'target',
      result: () => '«Лист» приходит сам: это текущая цель того, кто вызывает.',
    },
    {
      id: 'apply',
      chapter: 'Шаг для других',
      tab: 'effects',
      say: '«Изменение» уже стоит: у «Листа» отнять «Сколько». В «Какое поле» выберите «Хиты», если там другое.',
      at: { text: 'Какое поле' },
      done: view => {
        const sheet = sheetParam(view)?.key;
        const amount = amountParam(view)?.key;
        const hp = fieldBy(view.system, 'Хиты')?.tag;
        return Boolean(sheet && amount && hp && stepsOf(damage(view)?.[1]).some(step =>
          step.type === 'apply' && reads(step.target, `@${sheet}.${hp}`) && reads(step.value, `@${amount}`)));
      },
      result: () => '«Урон» отнимает «Сколько» от хитов.',
    },
    {
      id: 'returns',
      chapter: 'Шаг для других',
      lead: '«Урон» может сообщить тому, кто его вызвал, сколько хитов осталось у цели — например, чтобы «Удар» проверил, не упала ли она.',
      tab: 'effects',
      say: 'Добавьте в «Что получит тот, кто вызвал» число «Осталось» — хиты цели после урона.',
      at: [
        { at: { text: '+ итог' }, say: 'Нажмите «+ итог», впишите название «Осталось», вид — «число».', done: view => (damage(view)?.[1].returns ?? []).length > 0 },
        { at: { text: 'Откуда' }, say: 'В «Откуда» выберите «формулой…», наберите «@» и в группе «поле: Лист» выберите «Хиты». Нажмите «готово».' },
      ],
      done: view => (damage(view)?.[1].returns ?? []).some(column => column.kind === 'number' && Boolean(column.expr)),
      result: () => '«Осталось» — хиты цели после урона.',
    },
    {
      id: 'call',
      chapter: 'Вызов',
      tab: 'effects',
      panel: 'Библиотека эффектов',
      say: 'Сделайте, чтобы «Удар» при успехе вызывал «Урон» на 5.',
      hint: '«Лист» заполнится сам — это цель. «как устроено →» в шаге вызова открывает сам «Урон».',
      at: [
        { at: { text: '+ шаг' }, say: 'Откройте «Удар». В ветке «успех» в списке «+ шаг» выберите «вызов».', done: view => stepsOf(strike(view)?.[1]).some(step => step.type === 'emit') },
        { at: { text: 'Какой эффект' }, say: 'В «Какой эффект» выберите «Урон», в красном «Сколько» впишите 5.' },
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
      result: () => 'При успехе «Удар» вызывает «Урон»: цели — 5.',
    },
    {
      id: 'drop',
      chapter: 'Вызов',
      tab: 'effects',
      say: 'Удалите из ветки «успех» старое «Изменение»: хиты теперь снимает «Урон».',
      done: view => calls(view).length > 0 && !stepsOf(strike(view)?.[1]).some(step => step.type === 'apply'),
      result: () => 'Своего «Изменения» у «Удара» больше нет.',
    },
    {
      id: 'name',
      chapter: 'Вызов',
      tab: 'effects',
      say: 'Чтобы шаги ниже могли прочитать «Осталось», под вызовом нажмите «результат…», впишите имя «урон» и щёлкните мимо поля.',
      at: { text: 'результат…' },
      done: view => calls(view).some(step => typeof step.id === 'string' && step.id.trim() !== ''),
      result: view => `Вызов называется «${String(calls(view).find(step => step.id)?.id ?? '')}»: шаги ниже видят его «Осталось».`,
    },
    {
      id: 'trial',
      chapter: 'Вызов',
      tab: 'effects',
      panel: 'Рядом',
      say: 'В панели «Рядом» откройте «Проба» и выберите кость «максимум». В «Что вышло» появится «Б · Хиты: 10 → 5»: урон прошёл через «Урон».',
      at: { text: 'Проба' },
    },
    {
      id: 'problems',
      chapter: 'Вызов',
      say: 'Нажмите «Проблемы» в шапке. Ошибок быть не должно: если «Удар» не передаст «Урону» что-то нужное, ошибка появится здесь.',
      at: { guide: 'problems' },
      done: problemsClean,
      result: () => 'Проблем нет.',
    },
    {
      id: 'heal',
      chapter: 'Сами',
      alone: true,
      tab: 'effects',
      say: 'Сделайте шаг для других «Лечение», который прибавляет хиты, и вызовите его из «Удара» при провале.',
      hint: '«+ шаг для других», в «Изменении» «Как» — «прибавить». В «Ударе» под развилкой нажмите «+ провал» и поставьте туда вызов «Лечения».',
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
