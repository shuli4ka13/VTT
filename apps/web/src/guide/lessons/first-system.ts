import { emptySystem } from '../../store/world.ts';
import type { Lesson, View } from '../types.ts';
import { fieldsOf, blockLabel } from '@vtt/engine';
import { visible } from '../anchor.ts';
import { fieldBy, inBlock, columnOf, effectBy, actorKey, aimKey, stepsOf, reads, is, subtracts, adds, armOf, numberOf, errorsOf, exprOf, isArm, same, FORMULA_DONE, barOpen, barText } from '../find.ts';

const hp = (view: View) => fieldBy(view.system, 'Хиты');
const ac = (view: View) => fieldBy(view.system, 'Класс брони');
const strike = (view: View) => effectBy(view.system, 'Удар');

const inFight = (view: View) => fieldsOf(view.system).filter(field => !field.cell && inBlock(view.system, field, 'Бой'));

const targetsOf = (view: View) => (strike(view)?.[1].params ?? []).find(param => param.kind === 'sheet' && param.many && same(param.label, 'Цели') && same(param.item?.label, 'Цель'));
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
  return Boolean(roll && check && typeof roll.id === 'string' && is(check.value, `@${roll.id}`) && die && same(die.label, 'Кость проверки'));
};

const versusOk = (view: View): boolean => {
  const key = ac(view)?.tag;
  return Boolean(key && is(checkOf(view)?.versus, `@${aim(view)}.${key}`));
};

export const PROBLEMS = 'Проблемы системы';

const textOutsideGuide = (): string => {
  const root = document.body.cloneNode(true) as HTMLElement;
  root.querySelectorAll('.guide').forEach(node => node.remove());
  return (root.textContent ?? '').replace(/\s+/g, ' ');
};

export const trialShown = (view: View): boolean =>
  errorsOf(view.system) === 0 && textOutsideGuide().includes('Б · Хиты: 10 → 5');

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
    { title: 'Проверка и урон', sum: '«Удар» бросает кость против класса брони цели и при успехе снимает 5 хитов. Ошибок нет, проба это показала.' },
    { title: 'Сами', sum: 'Вы собрали эффект без подсказок.' },
  ],
  steps: [
    {
      id: 'block',
      chapter: 'Лист',
      lead: 'Система — правила вашей игры. В этом уроке соберём героя с хитами и классом брони и «Удар»: при попадании он снимает цели 5 хитов. Урок идёт на учебной копии — ваша система не меняется.',
      tab: 'sheet',
      say: 'Заведите на листе блок «Бой».',
      at: [
        { at: { text: 'блоки и типы листов' }, say: 'Над листом нажмите «блоки и типы листов».', done: () => visible({ text: '+ блок', in: 'Листы' }) },
        { at: { text: '+ блок', in: 'Листы' }, say: 'В «Листы» нажмите «+ блок».', done: view => (view.system.blocks ?? []).length > 0 },
        { at: { input: 'как зовётся блок' }, say: 'Впишите имя «Бой» и нажмите Enter.' },
      ],
      via: { text: 'блоки и типы листов' },
      done: view => (view.system.blocks ?? []).some(block => blockLabel(view.system, block.key).trim() === 'Бой'),
      result: () => 'Блок «Бой» на листе.',
    },
    {
      id: 'hp',
      chapter: 'Лист',
      tab: 'sheet',
      say: 'Добавьте в блок «Бой» поле «Хиты».',
      at: [
        { at: { text: '+ поле', in: 'Листы' }, say: 'В блоке «Бой» нажмите «+ поле».', hint: 'Кнопки «+ поле» не видно? Щёлкните имя блока «Бой» — он раскроется.', done: view => inFight(view).length > 0 },
        { at: { input: 'как зовётся поле' }, say: 'Впишите название «Хиты» и нажмите Enter.' },
      ],
      via: [{ text: 'Бой', in: 'Листы' }, { text: 'блоки и типы листов' }],
      done: view => inBlock(view.system, hp(view), 'Бой'),
      result: () => '«Хиты» стоят в блоке «Бой».',
    },
    {
      id: 'hp-start',
      chapter: 'Лист',
      tab: 'sheet',
      say: 'Чтобы новый герой начинал с 10 хитами, у поля «Хиты» откройте «ещё» и в «В новом листе» впишите 10.',
      hint: 'Поле «Хиты» закрылось? Щёлкните «Хиты» в блоке «Бой».',
      at: { text: 'В новом листе' },
      via: [{ text: 'ещё', in: 'Лист' }, { text: 'Хиты', in: 'Листы' }, { text: 'Бой', in: 'Листы' }, { text: 'блоки и типы листов' }],
      done: view => numberOf(columnOf(view.system, hp(view))?.default) === 10,
      result: () => 'Хиты: в новом листе 10.',
    },
    {
      id: 'hp-min',
      chapter: 'Лист',
      tab: 'sheet',
      say: 'Чтобы хиты не уходили в минус, там же в «Не ниже» впишите 0.',
      hint: '«Не ниже» — поле формулы: после щелчка ввод идёт в строку формул наверху экрана. Enter или «готово» сохраняет.',
      at: [
        { at: { text: 'Не ниже' }, say: 'Щёлкните «Не ниже» и впишите 0.', done: view => barText(view).trim() === '0' || numberOf(columnOf(view.system, hp(view))?.min) === 0 },
        { at: [FORMULA_DONE, { text: 'Не ниже' }], say: 'Нажмите Enter или «готово».' },
      ],
      via: [{ text: 'ещё', in: 'Лист' }, { text: 'Хиты', in: 'Листы' }, { text: 'Бой', in: 'Листы' }, { text: 'блоки и типы листов' }],
      done: view => numberOf(columnOf(view.system, hp(view))?.min) === 0,
      result: () => 'Хиты: в новом листе 10, не ниже 0.',
    },
    {
      id: 'ac',
      chapter: 'Лист',
      tab: 'sheet',
      say: 'Добавьте в блок «Бой» поле «Класс брони», в новом листе 12.',
      at: [
        { at: { text: '+ поле', in: 'Листы' }, say: 'В блоке «Бой» нажмите «+ поле».', hint: 'Кнопки «+ поле» не видно? Щёлкните имя блока «Бой».', done: view => inFight(view).length > 1 },
        { at: { input: 'как зовётся поле' }, say: 'Впишите название «Класс брони» и нажмите Enter.', done: view => Boolean(ac(view)) },
        { at: [{ text: 'В новом листе' }, { text: 'ещё', in: 'Лист' }, { text: 'Класс брони', in: 'Листы' }], say: 'Откройте «ещё» и в «В новом листе» впишите 12.', hint: 'Поле «Класс брони» закрылось? Щёлкните «Класс брони» в блоке «Бой».' },
      ],
      via: [{ text: 'Бой', in: 'Листы' }, { text: 'блоки и типы листов' }],
      done: view => inBlock(view.system, ac(view), 'Бой') && numberOf(columnOf(view.system, ac(view))?.default) === 12,
      result: () => 'Класс брони: в новом листе 12.',
    },
    {
      id: 'die',
      chapter: 'Кость и удар',
      tab: 'dictionaries',
      panel: 'Разделы правил',
      say: 'Заведите кость к20 для проверок.',
      hint: 'Кость заводится раньше проверки: новая проверка берёт первую кость системы.',
      at: [
        { at: { text: '+ кость' }, say: 'В разделе «Броски», в «Костях», раскройте «+ кость» и выберите «одна кость — к20».', done: view => Object.values(view.system.constants ?? {}).some(constant => constant.kind === 'die') },
        { at: { input: 'название кости' }, say: 'Впишите название «Кость проверки». Граней 20 — так и оставьте.' },
      ],
      via: { text: 'Броски', in: 'Разделы правил' },
      done: view => Object.values(view.system.constants ?? {}).some(constant =>
        constant.kind === 'die' && constant.label?.trim() === 'Кость проверки' && constant.dice?.[0]?.sides === 20),
      result: () => '«Кость проверки» — к20.',
    },
    {
      id: 'strike',
      chapter: 'Кость и удар',
      lead: 'Эффект — то, что умеет герой: удар, лечение, заклинание. Эффект «кнопкой» появится у героя за столом как кнопка.',
      tab: 'effects',
      panel: 'Библиотека эффектов',
      say: 'Заведите эффект «Удар».',
      at: [
        { at: { text: '+ кнопкой', in: 'Библиотека эффектов' }, say: 'В «Библиотеке эффектов» нажмите «+ кнопкой».', done: view => Object.keys(view.system.effects ?? {}).length > 0 },
        { at: { input: 'как зовётся эффект' }, say: 'Впишите название «Удар» и нажмите Enter.' },
      ],
      done: view => Boolean(strike(view)),
      result: () => 'Эффект «Удар» заведён. Пока у него один вход — «Кто действует».',
    },
    {
      id: 'everyone',
      chapter: 'Кость и удар',
      tab: 'sheet',
      say: 'Чтобы «Удар» был у каждого героя, на вкладке «Лист» в разделе «Что даёт всем листам» добавьте «Удар».',
      at: [
        { at: { text: 'блоки и типы листов' }, say: 'Над листом нажмите «блоки и типы листов».', done: () => visible({ text: 'все блоки', in: 'Листы' }), maybe: true },
        { at: { text: 'все блоки', in: 'Листы' }, say: 'В «Листы» нажмите «все блоки»: раздел показан только на ней.', done: () => visible({ field: 'Что даёт всем листам' }), maybe: true },
        { at: { field: 'Что даёт всем листам' }, say: 'В «Что даёт всем листам» выберите «Удар».' },
      ],
      done: view => {
        const found = strike(view);
        return Boolean(found && (view.system.grants ?? []).includes(found[0]));
      },
      result: () => 'Кнопка «Удар» — у каждого героя.',
    },
    {
      id: 'targets',
      chapter: 'Кость и удар',
      lead: 'Эффект похож на функцию: всё, что ему нужно, приходит входами, и у каждого входа есть вид. «Число» — урон или бонус, «да / нет» — признак, «из таблицы» — строка справочника, «лист» — один герой, «список листов» — сколько угодно героев. Кого бить, решают за столом, поэтому «Удару» нужен вход-список.',
      tab: 'effects',
      say: 'Добавьте «Удару» вход «Цели» вида «список листов».',
      at: [
        { at: { text: '+ ещё одно' }, say: 'В «Что приходит» нажмите «+ ещё одно».', done: view => (strike(view)?.[1].params ?? []).length > 1 },
        { at: { text: 'Название' }, say: 'В «Название» впишите «Цели», в «Вид» выберите «список листов».', done: view => Boolean((strike(view)?.[1].params ?? []).find(param => param.kind === 'sheet' && param.many && same(param.label, 'Цели'))) },
        { at: { text: 'Каждый' }, say: 'В «Каждый» впишите «Цель».', hint: 'Один лист из списка в шагах зовётся по полю «Каждый» — назовите его «Цель».' },
      ],
      done: view => Boolean(targetsOf(view)),
      result: () => 'У «Удара» два входа: «Кто действует» — лист, «Цели» — список листов, каждый из них — «Цель».',
    },
    {
      id: 'each',
      chapter: 'Кость и удар',
      lead: 'Теперь разделитель: шаги выше него выполнятся один раз, шаги ниже — для каждой цели по очереди.',
      tab: 'effects',
      say: 'В палитре «Шаг» нажмите «+ для каждого из списка».',
      hint: 'Разделитель сам возьмёт список «Цели».',
      at: { text: '+ для каждого из списка' },
      done: view => {
        const list = targetsOf(view)?.key;
        return Boolean(list && stepsOf(strike(view)?.[1]).some(step => step.type === 'each' && (step as unknown as { of?: string }).of === list));
      },
      result: () => 'Стоит «Для каждого из · Цели»: всё, что ниже, сработает по каждой цели.',
    },
    {
      id: 'check',
      chapter: 'Проверка и урон',
      lead: 'Бросок и проверка — два шага: сначала кто-то бросает кость, потом итог сравнивается с числом. Здесь число — класс брони цели: выпало не меньше — попадание.',
      tab: 'effects',
      say: 'Сделайте бросок и проверку: «Кость проверки» против класса брони цели.',
      at: [
        { at: { text: '+ бросок' }, say: 'В палитре «Шаг» нажмите «+ бросок». Встанет бросок: «Кто действует» бросает «Кость проверки».', done: view => rollAt(view) >= 0 },
        { at: { text: '+ проверка' }, say: 'Теперь нажмите «+ проверка». Она сравнит этот бросок с 10.', done: view => checkAt(view) >= 0 },
        {
          at: { guide: 'check-formula' },
          say: 'В строке «Проверка» щёлкните число справа от знака: формула откроется строкой наверху, число 10 в ней выделено.',
          hint: 'Порог — то, что стоит справа от знака. Названия полей не печатайте — выбирайте в подсказке, когда начнёте набирать.',
          done: view => barOpen(view) || versusOk(view),
        },
        {
          at: { guide: 'check-formula' },
          say: 'Начните набирать «класс» — число заменится — и в группе «у «Цель»» выберите «Класс брони».',
          done: view => is(barText(view), `@${aim(view)}.${ac(view)?.tag ?? ''}`) || versusOk(view),
        },
        { at: [FORMULA_DONE, { guide: 'check-formula' }], say: 'Нажмите Enter или «готово».' },
      ],
      done: view => rollsCheckDie(view) && versusOk(view),
      result: () => 'Бросок кости и проверка: итог против класса брони цели.',
    },
    {
      id: 'branch',
      chapter: 'Проверка и урон',
      tab: 'effects',
      say: 'На шаге проверки нажмите «+ по итогу». Появится развилка «успех»: её шаги выполнятся только при попадании.',
      hint: 'Не берите «+ изменение» из палитры: такой шаг сработает при любом броске.',
      at: { text: '+ по итогу' },
      done: view => branchAt(view) >= 0,
      traps: [{ when: view => applies(view).length > 0 && branchAt(view) < 0, say: '«Изменение» стоит без развилки — урон будет при любом броске. Удалите его и нажмите «+ по итогу» на проверке.' }],
      result: () => 'Развилка «успех» стоит.',
    },
    {
      id: 'damage',
      chapter: 'Проверка и урон',
      tab: 'effects',
      say: 'Сделайте урон: при успехе цель теряет 5 хитов.',
      at: [
        { at: { text: '+ шаг' }, say: 'В ветке «успех» в списке «+ шаг» выберите «изменение».', done: view => armApplies(view).length > 0 },
        {
          at: { text: 'У кого' },
          say: 'В «У кого» выберите «Цель», в «Какое поле» — «Хиты».',
          hint: 'Сначала в «У кого» стоит «Кто действует» — это сам герой. Для удара нужна «Цель».',
          done: view => {
            const key = hp(view)?.tag;
            return Boolean(key && armApplies(view).some(step => is(step.target, `@${aim(view)}.${key}`)));
          },
        },
        {
          at: { text: 'Сколько' },
          say: 'Щёлкните «Сколько» и впишите 5.',
          done: view => barText(view).trim() === '5' || Boolean(hp(view) && armApplies(view).some(step => numberOf(step.value) === 5)),
        },
        { at: [FORMULA_DONE, { text: 'Сколько' }], say: 'Нажмите Enter или «готово».' },
      ],
      done: view => {
        const key = hp(view)?.tag;
        return Boolean(key && armApplies(view).some(step =>
          is(step.target, `@${aim(view)}.${key}`) && numberOf(step.value) === 5 && subtracts(step)));
      },
      traps: [
        { when: view => branchAt(view) >= 0 && applies(view).length > armApplies(view).length, say: '«Изменение» стоит вне развилки — урон будет при любом броске. Перенесите его в ветку «успех».' },
        { when: view => armApplies(view).some(step => reads(step.target, `@${actorKey(strike(view)?.[1])}`) || exprOf(step.target).startsWith(`@${actorKey(strike(view)?.[1])}.`)), say: 'В «У кого» стоит «Кто действует» — удар ранит самого героя. Выберите «Цель».' },
        { when: view => armApplies(view).some(step => exprOf(step.target).startsWith(`@${aim(view)}.`) && !reads(step.target, `@${aim(view)}.${hp(view)?.tag ?? ''}`)), say: 'Урон идёт не в «Хиты». В «Какое поле» выберите «Хиты».' },
      ],
      result: view => `При успехе цель теряет ${exprOf(armApplies(view)[0]?.value) || '5'} хитов.`,
    },
    {
      id: 'problems',
      chapter: 'Проверка и урон',
      say: 'Нажмите в шапке кнопку «Проблем нет» (если что-то найдено, на ней «Проблемы» и число). Ошибок быть не должно.',
      hint: 'Если ошибка есть, «Открыть» рядом с ней приведёт к месту.',
      at: { guide: 'problems' },
      done: problemsClean,
      result: () => 'Проблем нет. Чтобы закрыть список, нажмите ту же кнопку ещё раз.',
    },
    {
      id: 'trial',
      chapter: 'Проверка и урон',
      tab: 'effects',
      panel: 'Рядом',
      say: 'Проверьте «Удар» пробой: с костью «максимум» в «Что вышло» появится «Б · Хиты: 10 → 5». Проба систему не меняет.',
      at: [
        { at: { text: 'Проба', in: 'Рядом' }, say: 'В панели «Рядом» нажмите «Проба».', done: () => visible({ text: 'Что вышло' }) },
        { at: { text: 'Кость' }, say: 'В «Кость» выберите «максимум».', done: view => trialShown(view) },
      ],
      done: view => trialShown(view),
      result: () => 'Проба показала: Б теряет 5 хитов.',
    },
    {
      id: 'heal',
      chapter: 'Сами',
      lead: 'Дальше систему публикуют, автор книги заводит вещи, а за столом герои нажимают «Удар». Последнее задание — без подсказок.',
      alone: true,
      tab: 'effects',
      say: 'Сделайте эффект «Лечение»: он прибавляет 3 хита тому, кто действует.',
      hint: '«+ кнопкой», затем «+ изменение»: «У кого» — «Кто действует», «Какое поле» — «Хиты», «Как» — «прибавить», «Сколько» — 3.',
      goal: 'у эффекта «Лечение» есть изменение: «Хиты» того, кто действует, прибавляются на 3, а в «Проблемах» нет ошибок.',
      done: view => {
        const key = hp(view)?.tag;
        return Boolean(key && errorsOf(view.system) === 0 && stepsOf(effectBy(view.system, 'Лечение')?.[1]).some(step =>
          step.type === 'apply' && adds(step) && is(step.target, `@${actorKey(effectBy(view.system, 'Лечение')?.[1])}.${key}`) && numberOf(step.value) === 3));
      },
      result: () => '«Лечение»: +3 хита своему листу.',
    },
  ],
};
