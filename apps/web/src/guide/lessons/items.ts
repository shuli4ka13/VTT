import type { System } from '@vtt/schema';
import type { Lesson, View } from '../types.ts';
import { effectBy, tableBy, fieldBy, stepsOf, reads, same } from '../find.ts';
import { problemsClean } from './first-system.ts';
import base from '../seeds/base.json' with { type: 'json' };

const strike = (view: View) => effectBy(view.system, 'Удар');
const weaponParam = (view: View) => (strike(view)?.[1].params ?? []).find(param => same(param.label, 'Урон оружия'));
const bookKind = (view: View, label: string) => {
  const found = tableBy(view.system, label);
  return found && found[1].shape === 'book' ? found : undefined;
};
const weapon = (view: View) => bookKind(view, 'Оружие');
const editsArmor = (view: View, label: string): boolean => {
  const ac = fieldBy(view.system, 'Класс брони')?.tag;
  return Boolean(ac && (bookKind(view, label)?.[1].modifiers ?? []).some(modifier => modifier.kind === 'value' && reads(modifier.target, ac)));
};

export const items: Lesson = {
  id: 'items',
  title: 'Вещи с эффектами',
  sub: 'Тип «Оружие»: свойство, кнопка «Удар» у владельца и правка класса брони.',
  seed: base as unknown as System,
  tab: 'records',
  chapters: [
    { title: 'Тип вещи', sum: 'Есть тип «Оружие», а «Удар» ждёт «Урон оружия» и даётся вещью.' },
    { title: 'Кнопка и правка', sum: 'Оружие даёт владельцу «Удар» со своим уроном и +1 к классу брони.' },
    { title: 'Сами', sum: 'Вы завели тип вещи с правкой без подсказок.' },
  ],
  steps: [
    {
      id: 'kind',
      chapter: 'Тип вещи',
      lead: 'Тип вещи — общая форма для всех вещей одного рода. У «Оружия» будут свойство, которое автор книги заполнит у каждого меча, кнопка «Удар» для владельца и +1 к классу брони, пока оружие у него.',
      tab: 'records',
      panel: 'книги',
      say: 'Заведите тип вещи «Оружие».',
      at: [
        { at: { text: '+ тип' }, say: 'В панели «книги» нажмите «+ тип».', done: view => Object.values(view.system.tables ?? {}).some(table => table.shape === 'book') },
        { at: { input: 'как зовётся тип' }, say: 'Впишите название «Оружие». В «Чем является» оставьте «вещь».' },
      ],
      done: view => Boolean(weapon(view)) && (weapon(view)?.[1].use ?? 'item') === 'item',
      result: () => 'Тип «Оружие» заведён.',
    },
    {
      id: 'param',
      chapter: 'Тип вещи',
      tab: 'effects',
      panel: 'Библиотека эффектов',
      say: 'Сделайте, чтобы «Удар» снимал столько хитов, сколько «Урон оружия».',
      hint: '«Удара» не видно? Он в группе «Без блока» — раскройте её. «Изменение» свёрнуто — щёлкните его имя. До шага с кнопкой «Проблемы» будут говорить, что «Урон оружия» никто не передаёт, — так и должно быть.',
      at: [
        { at: { text: '+ ещё одно' }, say: 'Откройте «Удар» и в «Что приходит» нажмите «+ ещё одно».', done: view => (strike(view)?.[1].params ?? []).length > 2 },
        { at: { text: 'Название' }, say: 'В «Название» впишите «Урон оружия». Вид — «число».', done: view => Boolean(weaponParam(view)) },
        { at: { text: 'Сколько' }, say: 'В «Изменении» в «Сколько» наберите «@» и выберите «Урон оружия». Нажмите «готово».' },
      ],
      via: { text: 'Удар', in: 'Библиотека эффектов' },
      done: view => {
        const param = weaponParam(view);
        return Boolean(param && param.kind === 'number'
          && stepsOf(strike(view)?.[1]).some(step => step.type === 'apply' && reads(step.value, `@${param.key}`)));
      },
      traps: [{
        when: view => !weaponParam(view)
          && (strike(view)?.[1].params ?? []).some(param => (param.label ?? '').toLowerCase().includes('урон оружия')),
        say: 'В названии осталось лишнее, например «Новый вход». Сотрите его, чтобы было ровно «Урон оружия».',
      }],
      result: () => '«Удар» снимает столько, сколько «Урон оружия».',
    },
    {
      id: 'given',
      chapter: 'Тип вещи',
      tab: 'sheet',
      say: 'Чтобы «Удар» давало оружие, а не все подряд, на вкладке «Лист» в разделе «Что даёт всем листам» уберите «Удар» крестиком.',
      hint: 'Раздела не видно? Выберите вид «блоки и типы листов».',
      at: { field: 'Что даёт всем листам' },
      via: { text: 'блоки и типы листов' },
      done: view => {
        const found = strike(view);
        return Boolean(found && !(view.system.grants ?? []).includes(found[0]));
      },
      result: () => '«Удар» больше не у всех: его даст вещь.',
    },
    {
      id: 'button',
      chapter: 'Кнопка и правка',
      tab: 'records',
      panel: 'книги',
      say: 'Сделайте, чтобы «Оружие» давало владельцу кнопку «Удар».',
      hint: 'В списке «Вызывает эффект» нет эффектов, которые висят на листе, — только кнопки и шаги для других.',
      at: [
        { at: { text: '+ кнопка' }, say: 'Откройте «Оружие» и в «Кнопки на листе» нажмите «+ кнопка».', done: view => (weapon(view)?.[1].bindings ?? []).length > 0 },
        { at: { text: 'Вызывает эффект' }, say: 'В «Вызывает эффект» выберите «Удар».' },
      ],
      via: { text: 'Оружие', in: 'книги' },
      done: view => {
        const found = strike(view);
        const param = weaponParam(view);
        const kind = weapon(view)?.[1];
        return Boolean(found && param && kind
          && (kind.bindings ?? []).some(binding => binding.effect === found[0])
          && (kind.columns ?? []).some(column => column.key === param.key));
      },
      result: () => 'Кнопка «Удар» есть. У «Оружия» само появилось свойство «Урон оружия»: его значение у меча уйдёт в «Удар».',
    },
    {
      id: 'modifier',
      chapter: 'Кнопка и правка',
      lead: 'Под кнопкой видно, чем «Оружие» заполняет «Удар»: «Урон оружия» — свойство меча. Кто бьёт и кого, кнопка не спрашивает: это тот, кто нажал, и цели, выбранные за столом.',
      tab: 'records',
      say: 'Сделайте, чтобы оружие давало +1 к классу брони, пока оно у владельца.',
      at: [
        { at: { text: '+ правит поле' }, say: 'В «Что правит каждая вещь этого типа» нажмите «+ правит поле».', done: view => (weapon(view)?.[1].modifiers ?? []).length > 0 },
        { at: { text: 'Что правим' }, say: 'В «Что правим» выберите «Класс брони», в «На сколько» впишите 1.' },
      ],
      done: view => editsArmor(view, 'Оружие'),
      result: () => 'Пока оружие у владельца, класс брони +1.',
    },
    {
      id: 'problems',
      chapter: 'Кнопка и правка',
      say: 'Нажмите «Проблемы» в шапке. Ошибок быть не должно.',
      at: { guide: 'problems' },
      done: problemsClean,
      result: () => 'Проблем нет.',
    },
    {
      id: 'armor',
      chapter: 'Сами',
      lead: 'Сам меч заводит автор книги, когда система опубликована: главная → «Автор книги» → «Завести запись» → «Оружие». Учебную копию книга не видит. Последнее задание — без подсказок.',
      alone: true,
      tab: 'records',
      say: 'Заведите тип вещи «Броня», который правит «Класс брони».',
      hint: 'В панели «книги» нажмите «+ тип», затем у нового типа — «+ правит поле».',
      done: view => editsArmor(view, 'Броня'),
      result: () => '«Броня» правит класс брони.',
    },
  ],
};
