import type { System, Effect, Handler } from '@vtt/schema';
import { NAMES } from '@vtt/engine';
import type { Lesson, View, Move } from '../types.ts';
import { effectBy, stepsOf, errorsOf, is, numberOf, exprOf } from '../find.ts';
import { problemsClean } from './first-system.ts';
import { visible } from '../anchor.ts';
import seed from '../seeds/tags.json' with { type: 'json' };

const TAG = 'гасит огонь';
const GUARD = 'защита';

const effect = (view: View, label: string): Effect | undefined => effectBy(view.system, label)?.[1];
const keyOf = (view: View, label: string): string | undefined => effectBy(view.system, label)?.[0];
const handlers = (view: View, label: string): Handler[] => effect(view, label)?.on ?? [];
const fresh = (view: View, label: string): Handler | undefined => handlers(view, label).at(-1);

const opened = (label: string): Move => ({
  at: { text: label, in: 'Библиотека эффектов' },
  say: `В «Библиотеке эффектов» откройте «${label}».`,
  done: view => Boolean(keyOf(view, label)) && view.effect === keyOf(view, label),
});

const propsOpened: Move = {
  at: { text: 'свойства' },
  say: 'Если свойств не видно, нажмите «свойства» рядом с названием эффекта.',
  done: () => visible({ field: 'Метки' }),
  maybe: true,
};

const gainedTag = (view: View): Handler | undefined =>
  handlers(view, 'Горение').find(handler => handler.on === `gained:${TAG}`);

const removesBurning = (view: View): boolean => {
  const burning = keyOf(view, 'Горение');
  return Boolean(burning) && (gainedTag(view)?.steps ?? []).some(step => {
    const raw = step as unknown as Record<string, unknown>;
    return raw.type === 'status' && raw.mode === 'remove' && raw.effect === burning && carrier(raw.to);
  });
};

const aboutCarrier = (handler: Handler | undefined): boolean => {
  const text = exprOf(handler?.if).replace(/\s+/g, '');
  const holder = `@${NAMES.holder}`;
  return new RegExp(`^@[\\p{L}\\p{N}_]+==${holder}$|^${holder}==@[\\p{L}\\p{N}_]+$`, 'u').test(text);
};

const carrier = (value: unknown): boolean => is(value, `@${NAMES.sheet}`) || is(value, `@${NAMES.holder}`);

const luck = (view: View): Handler | undefined => handlers(view, 'Удача').find(handler => handler.on === 'seen');

const sharedTag = (view: View): string[] => {
  const cold = effect(view, 'Холод')?.tags ?? [];
  const frost = effect(view, 'Иней')?.tags ?? [];
  return cold.filter(tag => frost.includes(tag));
};

const clearsByTag = (view: View): boolean => {
  const shared = sharedTag(view);
  return stepsOf(effect(view, 'Согреться')).some(step =>
    step.type === 'status' && step.mode === 'remove' && step.by === 'tag' && shared.includes(String(step.effect)) && Boolean(step.to));
};

export const tags: Lesson = {
  id: 'tags',
  title: 'Метки и реакции',
  sub: 'Метка на эффекте, подписка «появился с меткой» и «кроме меток» у броска.',
  start: 'заведены эффекты «Сырость», «Горение», «Удача», «Холод», «Иней» и «Согреться», пока пустые: без меток и подписок.',
  seed: seed as unknown as System,
  tab: 'effects',
  chapters: [
    { title: 'Метка и реакция', sum: '«Сырость» несёт метку «гасит огонь», а «Горение» снимает себя, когда на лист попадает эффект с этой меткой.' },
    { title: 'Кости', sum: '«Удача» прибавляет к броску, кроме бросков с меткой «защита». Ошибок нет.' },
    { title: 'Сами', sum: 'Вы собрали снятие всех эффектов по метке без подсказок.' },
  ],
  steps: [
    {
      id: 'tag',
      chapter: 'Метка и реакция',
      lead: 'Метка — слово на эффекте. По ней другие эффекты узнают своих: «Горение» должно погаснуть, когда на лист попала «Сырость». Для этого «Сырости» нужна метка.',
      tab: 'effects',
      panel: 'Библиотека эффектов',
      say: 'Поставьте «Сырости» метку «гасит огонь».',
      at: [
        opened('Сырость'),
        propsOpened,
        {
          at: { field: 'Метки' },
          say: 'В поле «Метки» щёлкните «+ метка…» и выберите «новая метка…».',
          done: () => visible({ input: 'как назвать метку' }),
        },
        { at: { input: 'как назвать метку' }, say: 'Впишите «гасит огонь» и нажмите «добавить».' },
      ],
      done: view => (effect(view, 'Сырость')?.tags ?? []).includes(TAG),
      result: () => '«Сырость» несёт метку «гасит огонь».',
    },
    {
      id: 'when',
      chapter: 'Метка и реакция',
      tab: 'effects',
      panel: 'Библиотека эффектов',
      say: 'Подпишите «Горение» на появление эффекта с меткой «гасит огонь».',
      at: [
        opened('Горение'),
        { at: { text: '+ когда' }, say: 'Нажмите «+ когда».', done: view => handlers(view, 'Горение').length > 0 },
        { at: { text: 'Что случилось' }, say: 'В «Что случилось» выберите «эффект появился на листе».', done: view => (fresh(view, 'Горение')?.on ?? '').startsWith('gained:') },
        { at: { text: 'Какое' }, say: 'В «Какое» выберите «с меткой «гасит огонь»».', hint: 'Пункта «с меткой «гасит огонь»» в «Какое» нет, пока метка не стоит ни у одного эффекта, — вернитесь к прошлому шагу.' },
      ],
      done: view => Boolean(gainedTag(view)),
      result: () => '«Горение» слышит появление эффекта с меткой «гасит огонь».',
    },
    {
      id: 'who',
      chapter: 'Метка и реакция',
      tab: 'effects',
      say: 'В «Кого касается» выберите «лист, с которым это случилось» — носитель: чтобы «Горение» гасло только у того, на кого попала «Сырость».',
      hint: 'Без этого подписка сработает на всех листах комнаты, где висит «Горение».',
      at: { text: 'Кого касается' },
      done: view => aboutCarrier(gainedTag(view)),
      traps: [{
        when: view => Boolean(gainedTag(view)) && !aboutCarrier(gainedTag(view)) && Boolean(gainedTag(view)?.if),
        say: 'Условие стоит, но в нём нет «носитель». В «Кого касается» выберите «лист, с которым это случилось» — носитель.',
      }],
      result: () => 'Подписка касается только листа-носителя.',
    },
    {
      id: 'remove',
      chapter: 'Метка и реакция',
      tab: 'effects',
      say: 'Добавьте в подписку шаг «Снять «Горение»».',
      hint: 'Шаги подписки — под ней, в «делает:». «+ изменение» → «состояние» → в «Что делаем» выберите «снимаем».',
      at: [
        { at: { text: '+ изменение' }, say: 'Под подпиской нажмите «+ изменение».', done: view => (gainedTag(view)?.steps ?? []).length > 0 },
        { at: { text: 'состояние' }, say: 'Выберите «состояние».', done: view => (gainedTag(view)?.steps ?? []).some(step => step.type === 'status') },
        { at: { text: 'Что делаем' }, say: 'В «Что делаем» выберите «снимаем».', done: view => (gainedTag(view)?.steps ?? []).some(step => (step as unknown as Record<string, unknown>).mode === 'remove') },
        { at: { text: 'Какое', in: 'шаг «Снять»' }, say: 'В «Какое» шага выберите «Горение».', done: view => (gainedTag(view)?.steps ?? []).some(step => (step as unknown as Record<string, unknown>).effect === keyOf(view, 'Горение')) },
        { at: { text: 'С кого' }, say: 'В «С кого» выберите «лист, с которым это случилось».' },
      ],
      done: removesBurning,
      result: () => 'Когда на лист попадает эффект с меткой «гасит огонь», «Горение» снимается.',
    },
    {
      id: 'seen',
      chapter: 'Кости',
      lead: 'Подписка «кости выпали» слышит каждый бросок. «Удача» должна помогать везде, кроме защиты: такие броски отсекаются меткой.',
      tab: 'effects',
      panel: 'Библиотека эффектов',
      say: 'Подпишите «Удачу» на «кости выпали», кроме бросков с меткой «защита».',
      at: [
        opened('Удача'),
        { at: { text: '+ когда' }, say: 'Нажмите «+ когда».', done: view => handlers(view, 'Удача').length > 0 },
        { at: { text: 'Что случилось' }, say: 'В «Что случилось» выберите «кости выпали».', done: view => Boolean(luck(view)) },
        { at: { text: '+ или / кроме' }, say: 'Под «Какие броски» нажмите «+ или / кроме».', done: () => visible({ text: 'Или хотя бы одно из' }) },
        { at: { text: 'Кроме' }, say: 'В «Кроме» щёлкните «+ кроме метки…» и выберите «защита».' },
      ],
      done: view => Boolean(luck(view)?.notTags?.includes(GUARD)),
      result: () => '«Удача» слышит все броски, кроме защиты.',
    },
    {
      id: 'plus',
      chapter: 'Кости',
      tab: 'effects',
      say: 'Под подпиской нажмите «+ прибавить»: к подходящему броску добавится единица.',
      hint: '«+ прибавить» появляется только у подписки «кости выпали».',
      at: { text: '+ прибавить' },
      done: view => (luck(view)?.steps ?? []).some(step => step.type === 'roll-plus' && numberOf((step as unknown as { value?: unknown }).value) === 1),
      result: () => '«Удача» прибавляет к броску.',
    },
    {
      id: 'problems',
      chapter: 'Кости',
      say: 'Нажмите в шапке кнопку «Проблем нет» (если что-то найдено, на ней «Проблемы» и число). Ошибок быть не должно.',
      at: { guide: 'problems' },
      done: problemsClean,
      result: () => 'Проблем нет.',
    },
    {
      id: 'clear',
      chapter: 'Сами',
      lead: 'Последнее задание — без подсказок.',
      alone: true,
      tab: 'effects',
      goal: 'у «Холода» и «Инея» одна общая метка, «Согреться» снимает всё с этой меткой, а в «Проблемах» нет ошибок.',
      say: 'Пусть эффект «Согреться» снимает с носителя «Холод» и «Иней» разом: поставьте им одну метку и снимите все эффекты с этой меткой.',
      hint: 'Метка — в свойствах «Холода» и «Инея». В «Согреться»: «+ изменение» → «состояние» → «снимаем» → «Снять» → «все эффекты с меткой».',
      done: view => sharedTag(view).length > 0 && clearsByTag(view) && errorsOf(view.system) === 0,
      result: () => '«Согреться» снимает всё, что несёт общую метку.',
    },
  ],
};
