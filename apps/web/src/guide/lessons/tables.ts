import { TABS } from '../../words.ts';
import { ROW } from '@vtt/engine/model/sheet-columns';
import type { System } from '@vtt/schema';
import type { Lesson, View } from '../types.ts';
import { tableBy, columnBy, fieldBy, columnOf, reads, same } from '../find.ts';
import { problemsClean } from './first-system.ts';
import base from '../seeds/base.json' with { type: 'json' };

const stats = (view: View) => {
  const found = tableBy(view.system, 'Характеристики');
  return found && found[1].shape !== 'book' && found[1].shape !== 'single' ? found : undefined;
};

const FORMULA_HINT = 'Ключи таблицы и колонок («таблица», «колонка_2») за названием не идут — формулы показываются подписями, а пишутся через подсказку: руками ключ не набирайте. Поле формулы открывает строку формул наверху; «готово» или Enter сохраняет.';

const readsModifier = (view: View, label: string): boolean => {
  const table = stats(view)?.[1];
  const modifier = columnBy(table, 'Модификатор');
  return Boolean(modifier && reads(columnBy(table, label)?.expr, `@${ROW}.${modifier.key}`));
};

export const tables: Lesson = {
  id: 'tables',
  title: 'Таблицы',
  sub: 'Справочник характеристик с формулой, своими у каждого листа, и класс брони от ловкости.',
  seed: base as unknown as System,
  tab: 'dictionaries',
  chapters: [
    { title: 'Справочник', sum: 'Таблица «Характеристики»: сила и ловкость, «Значение» и «Модификатор» формулой.' },
    { title: 'На листе', sum: 'Характеристики свои у каждого листа, класс брони считается от ловкости.' },
    { title: 'Сами', sum: 'Вы добавили колонку с формулой без подсказок.' },
  ],
  steps: [
    {
      id: 'table',
      chapter: 'Справочник',
      lead: `Всё, что хранит система, — таблицы. Справочник со строками живёт в «${TABS.rules} → Таблицы», поля листа — таблица листа на вкладке «${TABS.sheet}», типы вещей — таблицы книги в «${TABS.records}».`,
      tab: 'dictionaries',
      panel: 'Разделы правил',
      say: 'В разделе «Таблицы» нажмите «+ таблица» и назовите её «Характеристики» в шапке таблицы.',
      hint: FORMULA_HINT,
      at: { text: '+ таблица' },
      via: { text: 'Таблицы', in: 'Разделы правил' },
      done: view => Boolean(stats(view)),
      result: () => 'Таблица «Характеристики» заведена.',
    },
    {
      id: 'rows',
      chapter: 'Справочник',
      tab: 'dictionaries',
      say: 'В пустую строку впишите «сила», затем «+ строка» — «ловкость».',
      at: { text: '+ строка' },
      via: { text: 'Характеристики' },
      done: view => {
        const rows = (stats(view)?.[1].rows ?? []).map(row => row.value);
        return rows.some(value => same(value, 'сила')) && rows.some(value => same(value, 'ловкость'));
      },
      result: () => 'Строки: сила и ловкость.',
    },
    {
      id: 'value',
      chapter: 'Справочник',
      tab: 'dictionaries',
      say: 'Нажмите «+» в шапке таблицы и назовите колонку «Значение», тип — «число».',
      at: { guide: 'add-column' },
      done: view => columnBy(stats(view)?.[1], 'Значение')?.kind === 'number',
      result: () => 'Колонка «Значение» — число.',
    },
    {
      id: 'modifier',
      chapter: 'Справочник',
      lead: '«@строка» в формуле колонки — та строка, которую сейчас считают.',
      tab: 'dictionaries',
      say: 'Ещё колонка — «Модификатор», в «Формула для всех строк»: «округлить вниз((», «@строка.» и «Значение» из подсказки, затем « - 10) / 2)».',
      hint: FORMULA_HINT,
      at: { text: 'Формула для всех строк' },
      via: { guide: 'add-column' },
      done: view => {
        const table = stats(view)?.[1];
        const value = columnBy(table, 'Значение');
        return Boolean(value && reads(columnBy(table, 'Модификатор')?.expr, `@${ROW}.${value.key}`));
      },
      result: () => 'Модификатор считается из значения у каждой строки.',
    },
    {
      id: 'block',
      chapter: 'На листе',
      tab: 'sheet',
      say: 'На листе в «блоки и типы листов» «+ блок» «Характеристики», слева «+ поля из таблицы…» → «Характеристики · справочник» → «Да, своими у каждого листа».',
      at: { text: '+ блок', in: 'Листы' },
      via: { text: 'блоки и типы листов' },
      done: view => {
        const found = stats(view);
        return Boolean(found && found[1].owner === 'sheet'
          && (view.system.blocks ?? []).some(block => block.parts.some(part => part.table === found[0])));
      },
      result: () => 'Характеристики на листе, у каждого героя свои значения.',
    },
    {
      id: 'sample',
      chapter: 'На листе',
      tab: 'sheet',
      say: 'Переключите на «образец листа»: у силы и ловкости — «Значение» и посчитанный «Модификатор».',
      at: { text: 'образец листа' },
    },
    {
      id: 'armor',
      chapter: 'На листе',
      lead: 'Адрес клетки — таблица · строка · колонка.',
      tab: 'sheet',
      say: 'Щёлкните «Класс брони» и в «Формула для всех листов» наберите «10 + », затем через подсказку «Характеристики» → «ловкость» → «Модификатор».',
      hint: FORMULA_HINT,
      at: { text: 'Формула для всех листов' },
      via: [{ text: 'Класс брони' }, { text: 'Бой', in: 'Листы' }],
      done: view => {
        const found = stats(view);
        const modifier = columnBy(found?.[1], 'Модификатор');
        const armor = columnOf(view.system, fieldBy(view.system, 'Класс брони'));
        return Boolean(found && modifier && reads(armor?.expr, `${found[0]}.ловкость.${modifier.key}`));
      },
      result: () => 'Класс брони: 10 + модификатор ловкости.',
    },
    {
      id: 'problems',
      chapter: 'На листе',
      say: 'Откройте «Проблемы» в шапке: ошибок быть не должно.',
      at: { guide: 'problems' },
      done: problemsClean,
      result: () => 'Проблем нет.',
    },
    {
      id: 'save',
      chapter: 'Сами',
      alone: true,
      tab: 'dictionaries',
      say: 'Добавьте в «Характеристики» колонку «Спасбросок», равную модификатору характеристики.',
      hint: '«+» в шапке таблицы, в формуле — «@строка.» и «Модификатор» из подсказки.',
      done: view => readsModifier(view, 'Спасбросок'),
      result: () => '«Спасбросок» = модификатор.',
    },
  ],
};
