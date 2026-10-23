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
      lead: 'Тип вещи — таблица книги: свойства (их заполнит автор книги у каждого меча), кнопки, которые вещь даёт владельцу, и правки, пока вещь у него.',
      tab: 'records',
      panel: 'книги',
      say: 'Нажмите «+ тип» и назовите его «Оружие»; «Чем является» — вещь.',
      at: { text: '+ тип' },
      done: view => Boolean(weapon(view)) && (weapon(view)?.[1].use ?? 'item') === 'item',
      result: () => 'Тип «Оружие» — вещь.',
    },
    {
      id: 'param',
      chapter: 'Тип вещи',
      tab: 'effects',
      panel: 'Библиотека эффектов',
      say: 'В «Ударе» в «Что приходит» «+ ещё одно»: «Урон оружия», число; в «Сколько» у «Изменения» — «@» и «Урон оружия» из подсказки.',
      hint: '«Проблемы» сейчас скажут, что вход никто не передаёт, — это до шага с кнопкой.',
      at: { text: '+ ещё одно' },
      via: { text: 'Удар', in: 'Библиотека эффектов' },
      done: view => {
        const param = weaponParam(view);
        return Boolean(param && param.kind === 'number'
          && stepsOf(strike(view)?.[1]).some(step => step.type === 'apply' && reads(step.value, `@${param.key}`)));
      },
      result: () => '«Удар» снимает столько, сколько «Урон оружия».',
    },
    {
      id: 'given',
      chapter: 'Тип вещи',
      tab: 'effects',
      say: 'В свойствах «Удара» поставьте «У кого есть» → «даёт запись или тип».',
      hint: 'Свойств не видно? Нажмите «свойства» рядом с названием эффекта.',
      at: { field: 'У кого есть' },
      via: { text: 'свойства' },
      done: view => {
        const found = strike(view);
        return Boolean(found && !(view.system.grants ?? []).includes(found[0]));
      },
      result: () => '«Удар» больше не у всех — его даст вещь.',
    },
    {
      id: 'button',
      chapter: 'Кнопка и правка',
      tab: 'records',
      panel: 'книги',
      say: 'В «Оружии», в «Кнопки на листе», «+ кнопка» и в «Вызывает эффект» — «Удар».',
      hint: 'Висящие эффекты в «Вызывает эффект» не показаны. Свойство, названное как вход эффекта, попадает во вход само.',
      at: { text: '+ кнопка' },
      via: { text: 'Оружие', in: 'книги' },
      done: view => {
        const found = strike(view);
        const param = weaponParam(view);
        const kind = weapon(view)?.[1];
        return Boolean(found && param && kind
          && (kind.bindings ?? []).some(binding => binding.effect === found[0])
          && (kind.columns ?? []).some(column => column.key === param.key));
      },
      result: () => 'Кнопка «Удар»; тип сам завёл свойство «Урон оружия».',
    },
    {
      id: 'modifier',
      chapter: 'Кнопка и правка',
      lead: 'Под кнопкой — все входы «Удара»: «Кто действует» — кто нажал, «Цели» — выбранные за столом, «Урон оружия» — свойство записи.',
      tab: 'records',
      say: 'В «Что правит каждая вещь этого типа» нажмите «+ правит поле»: «Класс брони» +1.',
      at: { text: '+ правит поле' },
      done: view => editsArmor(view, 'Оружие'),
      result: () => 'Пока оружие у владельца — класс брони +1.',
    },
    {
      id: 'problems',
      chapter: 'Кнопка и правка',
      say: 'Откройте «Проблемы»: ошибок быть не должно.',
      at: { guide: 'problems' },
      done: problemsClean,
      result: () => 'Проблем нет.',
    },
    {
      id: 'armor',
      chapter: 'Сами',
      lead: 'Сам меч заводит автор книги в опубликованной системе (учебную копию книга не видит): главная → «Автор книги» → «Завести запись» → «Оружие». А пока — задание.',
      alone: true,
      tab: 'records',
      say: 'Заведите тип вещи «Броня», который правит «Класс брони».',
      hint: '«+ блок» в списке «книги» заводит новый тип, затем «+ правит поле».',
      done: view => editsArmor(view, 'Броня'),
      result: () => '«Броня» правит класс брони.',
    },
  ],
};
