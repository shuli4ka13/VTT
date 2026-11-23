import type { System, Binding, Table } from '@vtt/schema';
import type { Lesson, View } from '../types.ts';
import { effectBy, tableBy, columnBy, rowIs, is, errorsOf, FORMULA_DONE, barOpen, barText } from '../find.ts';
import { visible } from '../anchor.ts';
import { problemsClean } from '../find.ts';
import { bindingHolds, soleLang } from '@vtt/engine';
import type { System as EngineSystem, CompendiumRecord } from '@vtt/engine';
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

const instant = (view: View): unknown => (terms(view)?.[1].rows ?? []).find(row => rowIs(row, 'мгновенное'))?.value;

const stopFollowsTerm = (view: View): boolean => {
  const rows = terms(view)?.[1].rows ?? [];
  const holds = holdsColumn(view);
  if (!holds || !rows.length) return false;
  return rows.every(row => stopHolds(view, row.value) === ((row.cells ?? {})[holds] === true));
};

const holdsText = (view: View, text: string): boolean => {
  const term = termColumn(view);
  const holds = holdsColumn(view);
  return Boolean(term && holds && text.replace(/\s+/g, '') === `@${term}.${holds}`);
};

const longTerms = (view: View): number => {
  const holds = holdsColumn(view);
  return (terms(view)?.[1].rows ?? []).filter(row => holds && String(row.value ?? '').trim() !== '' && (row.cells ?? {})[holds] === true).length;
};

export const spells: Lesson = {
  id: 'spells',
  title: 'Кнопки у типа записи',
  sub: 'Тип «Заклинание»: кнопка «Сотворить», кнопка «Прекратить» только для длительных, якорь «Поддержание».',
  start: 'есть таблица «Сроки» (мгновенное и концентрация), тип «Заклинание» со свойством «Срок» и эффекты «Сотворить» (накладывает «Чары действуют»), «Прекратить», «Поддержание». Кнопок у типа ещё нет.',
  seed: soleLang(seed as unknown as System, 'ru'),
  tab: 'records',
  chapters: [
    { title: 'Кнопки', sum: 'У «Заклинания» две кнопки: «Сотворить» берёт «Срок» записи, «Прекратить» видна только если срок держится.' },
    { title: 'Якорь', sum: '«Сотворить» привязан к якорю «Поддержание», свой якорь на каждое сотворение: сняли якорь — чары спадают. Ошибок нет.' },
    { title: 'Сами', sum: 'Вы проверили условие кнопки на новом сроке без подсказок.' },
  ],
  steps: [
    {
      id: 'open',
      chapter: 'Кнопки',
      lead: 'У заклинаний есть «Срок»: «мгновенное» или «концентрация». Строки таблицы «Сроки» знают, держится ли срок («Держится» да или нет). Кнопки заклинания должны читать это из записи, а не из головы автора.',
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
        return Boolean(binding && prop && is(binding.args?.[castEffect(view)?.params?.find(param => param.kind === 'choice')?.key ?? ''], `@${prop}`));
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
      at: [
        { at: { text: 'ещё', in: 'кнопка «Прекратить»' }, say: 'У второй кнопки нажмите «ещё».', done: () => visible({ text: 'Только если', in: 'кнопка «Прекратить»' }) },
        { at: { text: 'Только если', in: 'кнопка «Прекратить»' }, say: 'Щёлкните «Только если» и начните набирать «срок».', done: view => barOpen(view) || stopFollowsTerm(view) },
        { at: { text: 'Только если', in: 'кнопка «Прекратить»' }, say: 'В списке выберите «Срок → Держится».', done: view => holdsText(view, barText(view)) || stopFollowsTerm(view) },
        { at: [FORMULA_DONE, { text: 'Только если', in: 'кнопка «Прекратить»' }], say: 'Нажмите Enter или «готово».' },
      ],
      done: view => {
        return stopFollowsTerm(view) && longTerms(view) > 0;
      },
      result: () => '«Прекратить» есть только у записей с длительным сроком.',
    },
    {
      id: 'bond',
      chapter: 'Якорь',
      lead: 'Пока заклинание длится, на колдуне висит якорь «Поддержание». Шагом его класть не нужно: привязка к якорю кладёт его сама, когда «Сотворить» что-то накладывает. Сняли якорь — спадает всё, что это сотворение наложило; наложенное без привязки осталось бы висеть.',
      tab: 'effects',
      panel: 'Библиотека эффектов',
      say: 'Привяжите «Сотворить» к якорю «Поддержание».',
      at: [
        { at: { text: 'Сотворить', in: 'Библиотека эффектов' }, say: 'В «Библиотеке эффектов» откройте «Сотворить».', done: view => view.effect === effectBy(view.system, 'Сотворить')?.[0] },
        { at: { text: 'свойства' }, say: 'Если свойств не видно, нажмите «свойства» рядом с названием эффекта.', done: () => visible({ text: '+ привязка к якорю' }), maybe: true },
        { at: { text: '+ привязка к якорю' }, say: 'В свойствах нажмите «+ привязка к якорю». В «Якорь» встанет «Поддержание».' },
      ],
      done: view => {
        const holder = effectBy(view.system, 'Поддержание')?.[0];
        return Boolean(holder && castEffect(view)?.bond?.effect === holder);
      },
      result: () => '«Сотворить» привязан к якорю «Поддержание».',
    },
    {
      id: 'many',
      chapter: 'Якорь',
      tab: 'effects',
      say: 'В «Сколько якорей» выберите «свой на каждое действие»: новое сотворение не отпускает прежнее.',
      at: { text: 'Сколько якорей' },
      done: view => castEffect(view)?.bond?.many === true,
      result: () => 'У каждого сотворения свой якорь.',
    },
    {
      id: 'problems',
      chapter: 'Якорь',
      say: 'Нажмите в шапке кнопку «Проблем нет» (если что-то найдено, на ней «Проблемы» и число). Ошибок быть не должно.',
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
      goal: 'в таблице «Сроки» не меньше двух сроков с «Держится» — да; у каждого такого срока «Прекратить» видна, у «мгновенного» нет; в «Проблемах» нет ошибок.',
      say: 'Заведите в таблице «Сроки» ещё один срок с «Держится» — да и убедитесь, что «Прекратить» у него есть, а у «мгновенного» нет.',
      hint: 'Таблица «Сроки» — в «Правила» → «Таблицы». Новую строку заполните как «концентрацию».',
      done: view => longTerms(view) >= 2 && stopFollowsTerm(view) && stopHolds(view, instant(view)) === false && errorsOf(view.system) === 0,
      result: () => 'У нового срока «Прекратить» есть, у «мгновенного» нет.',
    },
  ],
};
