import type { System, Binding, Table } from '@vtt/schema';
import type { Lesson, View } from '../types.ts';
import { effectBy, tableBy, columnBy, reads, errorsOf } from '../find.ts';
import { problemsClean } from './first-system.ts';
import { bindingHolds } from '@vtt/engine/events/actions';
import type { System as EngineSystem, CompendiumRecord } from '@vtt/engine/model/types';
import seed from '../seeds/spells.json' with { type: 'json' };

const spell = (view: View): [string, Table] | undefined => {
  const found = tableBy(view.system, 'Заклинание');
  return found && found[1].shape === 'book' ? found : undefined;
};
const terms = (view: View): [string, Table] | undefined => tableBy(view.system, 'Сроки');
const buttons = (view: View): Binding[] => spell(view)?.[1].bindings ?? [];
const cast = (view: View): Binding | undefined => {
  const id = effectBy(view.system, 'Сотворить')?.[0];
  return id ? buttons(view).find(binding => binding.effect === id) : undefined;
};
const stop = (view: View): Binding | undefined => {
  const id = effectBy(view.system, 'Прекратить')?.[0];
  return id ? buttons(view).find(binding => binding.effect === id) : undefined;
};
const castEffect = (view: View) => effectBy(view.system, 'Сотворить')?.[1];

const termColumn = (view: View): string | undefined => (spell(view)?.[1].columns ?? []).find(column => column.kind === 'choice' && column.from === terms(view)?.[0])?.key;
const holdsColumn = (view: View): string | undefined => columnBy(terms(view)?.[1], 'Держится')?.key;

const stopHolds = (view: View, term: unknown): boolean | null => {
  const found = spell(view);
  const button = stop(view);
  const prop = termColumn(view);
  if (!found || !button || !prop) return null;
  const record = { id: 'проба', label: 'Проба', table: found[0], cells: { [prop]: term } } as unknown as CompendiumRecord;
  try { return bindingHolds(view.system as unknown as EngineSystem, record, button as never); } catch { return null; }
};

const stopFollowsTerm = (view: View): boolean => {
  const rows = terms(view)?.[1].rows ?? [];
  const holds = holdsColumn(view);
  if (!holds || !rows.length) return false;
  return rows.every(row => stopHolds(view, row.value) === ((row.cells ?? {})[holds] === true));
};

const longTerms = (view: View): number => {
  const holds = holdsColumn(view);
  return (terms(view)?.[1].rows ?? []).filter(row => holds && (row.cells ?? {})[holds] === true).length;
};

export const spells: Lesson = {
  id: 'spells',
  title: 'Кнопки у типа записи',
  sub: 'Тип «Заклинание»: кнопка «Сотворить», кнопка «Прекратить» только для длительных, держание.',
  seed: seed as unknown as System,
  tab: 'records',
  chapters: [
    { title: 'Кнопки', sum: 'У «Заклинания» две кнопки: «Сотворить» берёт «Срок» записи, «Прекратить» видна только если срок держится.' },
    { title: 'Держание', sum: '«Сотворить» держит «Поддержание» отдельно для каждого сотворения. Ошибок нет.' },
    { title: 'Сами', sum: 'Вы проверили условие кнопки на новом сроке без подсказок.' },
  ],
  steps: [
    {
      id: 'open',
      chapter: 'Кнопки',
      lead: 'У заклинаний есть «Срок»: «мгновенное» или «концентрация». Строки «Сроков» знают, держится ли срок («Держится» да или нет). Кнопки заклинания должны читать это из записи, а не из головы автора.',
      tab: 'records',
      panel: 'книги',
      say: 'Откройте тип «Заклинание».',
      at: { text: 'Заклинание', in: 'книги' },
      done: view => Boolean(spell(view)) && view.record === spell(view)?.[0],
      result: () => 'Тип «Заклинание» открыт: у него свойство «Срок».',
    },
    {
      id: 'cast',
      chapter: 'Кнопки',
      tab: 'records',
      panel: 'книги',
      say: 'Добавьте кнопку, которая вызывает «Сотворить» и берёт «Срок» из записи.',
      hint: 'В «Вызывает эффект» нет эффектов, которые висят на листе, — только кнопки. «Срок» заполнится сам: у свойства то же имя, что у входа.',
      at: [
        { at: { text: '+ кнопка' }, say: 'В «Кнопки на листе» нажмите «+ кнопка».', done: view => buttons(view).length > 0 },
        { at: { text: 'Вызывает эффект' }, say: 'В «Вызывает эффект» выберите «Сотворить».' },
      ],
      via: { text: 'Заклинание', in: 'книги' },
      done: view => {
        const binding = cast(view);
        const prop = termColumn(view);
        return Boolean(binding && prop && reads(binding.args?.[castEffect(view)?.params?.find(param => param.kind === 'choice')?.key ?? ''], `@${prop}`));
      },
      result: () => 'Кнопка «Сотворить» берёт «Срок» из записи.',
    },
    {
      id: 'stop',
      chapter: 'Кнопки',
      tab: 'records',
      panel: 'книги',
      say: 'Добавьте вторую кнопку, которая вызывает «Прекратить».',
      at: [
        { at: { text: '+ кнопка' }, say: 'Ещё раз нажмите «+ кнопка».', done: view => buttons(view).length > 1 },
        { at: { text: 'Вызывает эффект' }, say: 'В новой кнопке в «Вызывает эффект» выберите «Прекратить».' },
      ],
      done: view => Boolean(stop(view)),
      result: () => 'У заклинания две кнопки.',
    },
    {
      id: 'if',
      chapter: 'Кнопки',
      tab: 'records',
      panel: 'книги',
      say: 'Покажите «Прекратить» только тем записям, у которых срок держится.',
      hint: 'У второй кнопки нажмите «ещё». В «Только если» выберите «Срок · Держится».',
      at: { text: 'Только если', in: 'кнопка «Прекратить»' },
      via: { text: 'ещё', in: 'кнопка «Прекратить»' },
      done: view => {
        const prop = termColumn(view);
        const holds = holdsColumn(view);
        return Boolean(prop && holds && reads(stop(view)?.if, `${prop}.${holds}`));
      },
      result: () => '«Прекратить» есть только у записей с длительным сроком.',
    },
    {
      id: 'bond',
      chapter: 'Держание',
      lead: 'Пока заклинание длится, на колдуне висит «Поддержание». Закончилось «Поддержание» — закончилось и заклинание.',
      tab: 'effects',
      panel: 'Библиотека эффектов',
      say: 'Пусть «Сотворить» держит «Поддержание».',
      hint: 'Свойств не видно? Нажмите «свойства» рядом с названием эффекта.',
      at: [
        { at: { text: 'Сотворить', in: 'Библиотека эффектов' }, say: 'В «Библиотеке эффектов» откройте «Сотворить».', done: view => view.effect === effectBy(view.system, 'Сотворить')?.[0] },
        { at: { text: '+ держание' }, say: 'В свойствах нажмите «+ держание». В «Держит» встанет «Поддержание».' },
      ],
      via: { text: 'свойства' },
      done: view => {
        const holder = effectBy(view.system, 'Поддержание')?.[0];
        return Boolean(holder && castEffect(view)?.bond?.effect === holder);
      },
      result: () => '«Сотворить» держит «Поддержание».',
    },
    {
      id: 'many',
      chapter: 'Держание',
      tab: 'effects',
      say: 'В «Сколько держит» выберите «каждое отдельно»: новое сотворение не отпускает прежнее.',
      at: { text: 'Сколько держит' },
      done: view => castEffect(view)?.bond?.many === true,
      result: () => 'Каждое сотворение держится отдельно.',
    },
    {
      id: 'problems',
      chapter: 'Держание',
      say: 'Нажмите «Проблемы» в шапке. Ошибок быть не должно.',
      at: { guide: 'problems' },
      done: problemsClean,
      result: () => 'Проблем нет.',
    },
    {
      id: 'term',
      chapter: 'Сами',
      lead: 'Последнее задание — без подсказок.',
      alone: true,
      tab: 'dictionaries',
      say: 'Заведите в «Сроках» ещё один срок с «Держится» — да и убедитесь, что «Прекратить» у него есть, а у «мгновенного» нет.',
      hint: 'Таблица «Сроки» — в «Правила» → «Таблицы». Новую строку заполните как «концентрацию».',
      done: view => longTerms(view) >= 2 && stopFollowsTerm(view) && stopHolds(view, 'мгновенное') === false && errorsOf(view.system) === 0,
      result: () => 'У нового срока «Прекратить» есть, у «мгновенного» нет.',
    },
  ],
};
