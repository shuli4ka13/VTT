import { emptySystem } from '../../store/world.ts';
import { TABS } from '../../words.ts';
import type { Lesson, View } from '../types.ts';
import { fieldBy, inBlock, columnOf, effectBy, stepsOf, reads, armOf, numberOf, errorsOf, exprOf } from '../find.ts';

const hp = (view: View) => fieldBy(view.system, 'Хиты');
const ac = (view: View) => fieldBy(view.system, 'Класс брони');
const strike = (view: View) => effectBy(view.system, 'Удар');

const checkAt = (view: View): number => stepsOf(strike(view)?.[1]).findIndex(step => step.type === 'check');

const branchAt = (view: View): number => {
  const steps = stepsOf(strike(view)?.[1]);
  const at = checkAt(view);
  const id = steps[at]?.id;
  if (at < 0 || typeof id !== 'string') return -1;
  return steps.findIndex((step, k) => k > at && step.type === 'branch' && reads(step.if, `@${id}.success`));
};

const applies = (view: View) => stepsOf(strike(view)?.[1]).filter(step => step.type === 'apply');
const armApplies = (view: View) => {
  const at = branchAt(view);
  return at < 0 ? [] : armOf(stepsOf(strike(view)?.[1]), at).filter(step => step.type === 'apply');
};

export const PROBLEMS = 'Проблемы системы';

export const problemsClean = (view: View): boolean => view.opened(PROBLEMS) && errorsOf(view.system) === 0;

export const firstSystem: Lesson = {
  id: 'first-system',
  title: 'Первая система с нуля',
  sub: 'Лист с хитами и классом брони, кость и «Удар», который бьёт по цели.',
  seed: { ...emptySystem(), id: 'учебная', name: 'Учебная система' },
  tab: 'sheet',
  chapters: [
    { title: 'Лист', sum: 'На листе блок «Бой»: «Хиты» 10, не ниже 0, и «Класс брони» 12.' },
    { title: 'Кость и удар', sum: 'Есть «Кость проверки» к20 и эффект «Удар» у каждого листа.' },
    { title: 'Проверка и урон', sum: '«Удар» бросает кость против класса брони цели и при успехе снимает 5 хитов; ошибок нет, проба это показала.' },
    { title: 'Сами', sum: 'Вы собрали эффект без подсказок.' },
  ],
  steps: [
    {
      id: 'block',
      chapter: 'Лист',
      lead: `Система — правила вашей игры. Соберём героя с хитами и классом брони и «Удар», который при попадании снимает цели 5 хитов. Наверху вкладки: «${TABS.sheet}», «${TABS.rules}», «${TABS.effects}», «${TABS.records}». «Опубликовать» в уроке выключена: учебная копия никуда не сохраняется.`,
      tab: 'sheet',
      say: 'В виде «блоки и типы листов» нажмите «+ блок» и слева впишите имя блока: «Бой», затем Enter. Так же сохраняются и другие имена.',
      at: { text: '+ блок', in: 'Листы' },
      via: { text: 'блоки и типы листов' },
      done: view => (view.system.blocks ?? []).some(block => block.name.trim() === 'Бой'),
      result: () => 'Блок «Бой» на листе.',
    },
    {
      id: 'hp',
      chapter: 'Лист',
      tab: 'sheet',
      say: 'В блоке «Бой» нажмите «+ колонка» и назовите поле «Хиты».',
      hint: 'Блок свернулся? Щёлкните его имя «Бой» — он раскроется. Кнопка «+ колонка» нужна та, что внутри блока.',
      at: { text: '+ колонка', in: 'Листы' },
      via: [{ text: 'Бой', in: 'Листы' }, { text: 'блоки и типы листов' }],
      done: view => inBlock(hp(view), 'Бой'),
      result: () => '«Хиты» стоят в блоке «Бой».',
    },
    {
      id: 'hp-start',
      chapter: 'Лист',
      tab: 'sheet',
      say: 'У колонки «Хиты» в «В новом листе» поставьте 10 — столько хитов у нового героя.',
      hint: 'Колонка закрылась? Щёлкните «Хиты» в блоке «Бой».',
      at: { text: 'В новом листе' },
      via: [{ text: 'ещё', in: 'Лист' }, { text: 'Хиты', in: 'Листы' }, { text: 'Бой', in: 'Листы' }, { text: 'блоки и типы листов' }],
      done: view => numberOf(columnOf(view.system, hp(view))?.default) === 10,
      result: () => 'Хиты: в новом листе 10.',
    },
    {
      id: 'hp-min',
      chapter: 'Лист',
      tab: 'sheet',
      say: 'Там же в «Не ниже» поставьте 0 — хиты не уйдут в минус.',
      at: { text: 'Не ниже' },
      via: [{ text: 'ещё', in: 'Лист' }, { text: 'Хиты', in: 'Листы' }, { text: 'Бой', in: 'Листы' }, { text: 'блоки и типы листов' }],
      done: view => numberOf(columnOf(view.system, hp(view))?.min) === 0,
      result: () => 'Хиты: в новом листе 10, не ниже 0.',
    },
    {
      id: 'ac',
      chapter: 'Лист',
      tab: 'sheet',
      say: 'Ещё одно поле в блоке «Бой»: «Класс брони», в новом листе 12.',
      hint: 'После «+ колонка» блок сворачивается — щёлкните его имя, и кнопка снова видна.',
      at: { text: '+ колонка', in: 'Листы' },
      via: [{ text: 'Бой', in: 'Листы' }, { text: 'блоки и типы листов' }],
      done: view => inBlock(ac(view), 'Бой') && numberOf(columnOf(view.system, ac(view))?.default) === 12,
      result: () => 'Класс брони: в новом листе 12.',
    },
    {
      id: 'die',
      chapter: 'Кость и удар',
      tab: 'dictionaries',
      panel: 'Разделы правил',
      say: 'В разделе «Кости» нажмите «+ кость» и назовите её «Кость проверки»; граней 20 — так и оставьте.',
      hint: 'Кость нужна до проверки: проверка при создании берёт первую кость системы.',
      at: { text: '+ кость' },
      via: { text: 'Кости', in: 'Разделы правил' },
      done: view => Object.values(view.system.constants ?? {}).some(constant =>
        constant.kind === 'die' && constant.label?.trim() === 'Кость проверки' && constant.dice?.[0]?.sides === 20),
      result: () => '«Кость проверки» — к20.',
    },
    {
      id: 'strike',
      chapter: 'Кость и удар',
      lead: 'Эффект — то, что умеет герой. «Для каждого из · Цели» в новом эффекте уже стоит: шаги ниже повторятся для каждой цели.',
      tab: 'effects',
      panel: 'Библиотека эффектов',
      say: 'Нажмите «+ кнопкой» и назовите эффект «Удар».',
      at: { text: '+ кнопкой', in: 'Библиотека эффектов' },
      done: view => Boolean(strike(view)),
      result: () => 'Эффект «Удар» заведён.',
    },
    {
      id: 'everyone',
      chapter: 'Кость и удар',
      tab: 'effects',
      say: 'В свойствах «Удара» поменяйте «У кого есть» на «у всех листов».',
      hint: 'Свойств не видно? Нажмите «свойства» рядом с названием эффекта.',
      at: { field: 'У кого есть' },
      via: { text: 'свойства' },
      done: view => {
        const found = strike(view);
        return Boolean(found && (view.system.grants ?? []).includes(found[0]));
      },
      result: () => 'Кнопка «Удар» — у каждого героя.',
    },
    {
      id: 'check',
      chapter: 'Проверка и урон',
      lead: 'В палитре «Шаг» «+ проверка» ставит бросок «Кости проверки» против 10.',
      tab: 'effects',
      say: 'Поставьте проверку и в её формуле вместо 10 наберите «@цель.» и выберите «Класс брони» из подсказки.',
      hint: 'Формула открывается строкой наверху: «готово» или Enter сохраняет. Подпись поля руками не набирайте — выбирайте из подсказки.',
      at: { text: '+ проверка' },
      done: view => {
        const key = ac(view)?.tag;
        return Boolean(key && stepsOf(strike(view)?.[1]).some(step => step.type === 'check' && reads(step.versus, `@цель.${key}`)));
      },
      result: () => 'Проверка: кость против класса брони цели.',
    },
    {
      id: 'branch',
      chapter: 'Проверка и урон',
      tab: 'effects',
      say: 'На шаге проверки нажмите «+ по итогу» — встанет развилка «успех».',
      hint: '«+ изменение» из палитры ставит шаг без условия — бить будет всегда. Развилку ставит «+ по итогу».',
      at: { text: '+ по итогу' },
      done: view => branchAt(view) >= 0,
      traps: [{ when: view => applies(view).length > 0 && branchAt(view) < 0, say: '«Изменение» стоит без развилки — бить будет всегда. Уберите его и поставьте развилку «+ по итогу».' }],
      result: () => 'Развилка «успех»: её шаги — только при попадании.',
    },
    {
      id: 'damage',
      chapter: 'Проверка и урон',
      tab: 'effects',
      say: 'В ветке «успех» выберите «+ шаг» → «изменение»: у кого «Цель», поле «Хиты», отнять 5.',
      hint: 'У «Изменения» первым выбран «Кто действует» — сначала поставьте «У кого → Цель».',
      at: { text: '+ шаг' },
      done: view => {
        const key = hp(view)?.tag;
        return Boolean(key && armApplies(view).some(step =>
          reads(step.target, `@цель.${key}`) && step.value !== undefined && !step.direction));
      },
      traps: [
        { when: view => branchAt(view) >= 0 && applies(view).length > armApplies(view).length, say: '«Изменение» стоит вне развилки — бить будет всегда. Его место — внутри ветки «успех».' },
        { when: view => armApplies(view).some(step => reads(step.target, '@действующий') || exprOf(step.target).startsWith('@действующий.')), say: 'у «Изменения» «У кого» — «Кто действует»: удар ранит самого героя. Поставьте «Цель».' },
        { when: view => armApplies(view).some(step => exprOf(step.target).startsWith('@цель.') && !reads(step.target, `@цель.${hp(view)?.tag ?? ''}`)), say: 'поле «Изменения» не «Хиты». Выберите «Хиты» в «Какое поле».' },
      ],
      result: view => `При успехе у цели −${exprOf(armApplies(view)[0]?.value) || '5'} хитов.`,
    },
    {
      id: 'problems',
      chapter: 'Проверка и урон',
      say: 'Откройте «Проблемы» в шапке: ошибок быть не должно.',
      hint: 'Если что-то есть — «Открыть» приведёт к месту.',
      at: { guide: 'problems' },
      done: problemsClean,
      result: () => 'Проблем нет. Закройте список — ещё раз «Проблемы».',
    },
    {
      id: 'trial',
      chapter: 'Проверка и урон',
      tab: 'effects',
      panel: 'Рядом',
      say: 'Справа, в «Рядом», переключите на «Проба» и выберите кость «максимум»: в «Что вышло» будет «Б · Хиты: 10 → 5». Проба систему не меняет.',
      at: { text: 'Проба' },
    },
    {
      id: 'heal',
      chapter: 'Сами',
      lead: 'Дальше настоящую систему публикуют, автор книги заводит вещи, а за столом герои жмут «Удар». А пока — задание без подсказок.',
      alone: true,
      tab: 'effects',
      say: 'Сделайте эффект «Лечение»: он прибавляет 3 хита тому, кто действует.',
      hint: '«+ кнопкой», затем «+ изменение» выше «Для каждого из»: у кого «Кто действует», поле «Хиты», «прибавить», 3.',
      done: view => {
        const key = hp(view)?.tag;
        return Boolean(key && stepsOf(effectBy(view.system, 'Лечение')?.[1]).some(step =>
          step.type === 'apply' && step.direction === 'add' && reads(step.target, `@действующий.${key}`) && numberOf(step.value) === 3));
      },
      result: () => '«Лечение»: +3 хита своему листу.',
    },
  ],
};
