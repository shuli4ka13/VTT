import { TABS } from '../../words.ts';
import { ROW } from '@vtt/engine/model/sheet-columns';
import { compile } from '@vtt/engine/formula';
import type { System } from '@vtt/schema';
import type { Lesson, View } from '../types.ts';
import { tableBy, columnBy, fieldBy, columnOf, reads, same, exprOf } from '../find.ts';
import { problemsClean } from './first-system.ts';
import base from '../seeds/base.json' with { type: 'json' };

const stats = (view: View) => {
  const found = tableBy(view.system, 'Характеристики');
  return found && found[1].shape !== 'book' && found[1].shape !== 'single' ? found : undefined;
};

const skills = (view: View) => {
  const found = tableBy(view.system, 'Навыки');
  return found && found[1].shape !== 'book' && found[1].shape !== 'single' ? found : undefined;
};

const parses = (text: string): boolean => {
  try { compile(text); return true; } catch { return false; }
};

const brokenModifier = (view: View): boolean => {
  const text = exprOf(columnBy(stats(view)?.[1], 'Модификатор')?.expr).trim();
  return text !== '' && !parses(text);
};

const FORMULA_HINT = 'Формулы показываются подписями, а пишутся через подсказку: набирайте «@» и выбирайте, имена руками не печатайте. Поле формулы открывает строку формул наверху; «готово» или Enter сохраняет.';

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
    { title: 'Ссылка на таблицу', sum: 'Таблица «Навыки»: у «атлетики» характеристика «сила», а «Значение» берёт её модификатор.' },
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
      at: { guide: 'add-column' },
      done: view => {
        const table = stats(view)?.[1];
        const value = columnBy(table, 'Значение');
        const formula = columnBy(table, 'Модификатор')?.expr;
        return Boolean(value && reads(formula, `@${ROW}.${value.key}`) && parses(exprOf(formula)));
      },
      traps: [{
        when: brokenModifier,
        say: 'в формуле ошибка — не закрыта скобка или лишний знак. Сверьте с образцом: «округлить вниз((@строка.Значение - 10) / 2)». Место ошибки покажут «Проблемы» в шапке.',
      }],
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
      say: 'Щёлкните «Класс брони» и в «Формула для всех листов» наберите «10 + @», затем выберите в подсказке «Модификатор: ловкость».',
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
      id: 'skills',
      chapter: 'Ссылка на таблицу',
      lead: 'Навык берёт значение у характеристики: у «атлетики» это сила. Для этого колонка «Характеристика» ссылается на таблицу «Характеристики» — выбирать можно только из её строк.',
      tab: 'dictionaries',
      panel: 'Разделы правил',
      say: 'В разделе «Таблицы» нажмите «+ таблица», назовите её «Навыки» и впишите в пустую строку «атлетика».',
      at: { text: '+ таблица' },
      via: { text: 'Таблицы', in: 'Разделы правил' },
      done: view => (skills(view)?.[1].rows ?? []).some(row => same(row.value, 'атлетика')),
      result: () => 'Таблица «Навыки»: строка «атлетика».',
    },
    {
      id: 'link',
      chapter: 'Ссылка на таблицу',
      tab: 'dictionaries',
      say: 'Нажмите «+» в шапке таблицы «Навыки» и назовите колонку «Характеристика»; в «Тип» выберите «из таблицы», а в появившемся «Из таблицы» — «Характеристики».',
      hint: 'Если «Из таблицы» оставить пустым, выбирать будет не из чего.',
      at: { guide: 'add-column' },
      done: view => {
        const column = columnBy(skills(view)?.[1], 'Характеристика');
        const source = stats(view);
        return Boolean(column && column.kind === 'choice' && source && column.from === source[0]);
      },
      traps: [{
        when: view => {
          const column = columnBy(skills(view)?.[1], 'Характеристика');
          return Boolean(column && column.kind === 'choice' && !column.from);
        },
        say: 'выбирать не из чего: в «Из таблицы» укажите таблицу «Характеристики».',
      }],
      result: () => '«Характеристика» выбирается из таблицы «Характеристики».',
    },
    {
      id: 'pick',
      chapter: 'Ссылка на таблицу',
      tab: 'dictionaries',
      say: 'В строке «атлетика», в колонке «Характеристика» выберите «сила».',
      done: view => {
        const table = skills(view)?.[1];
        const column = columnBy(table, 'Характеристика');
        const row = (table?.rows ?? []).find(one => same(one.value, 'атлетика'));
        return Boolean(column && same(row?.cells?.[column.key], 'сила'));
      },
      result: () => 'У «атлетики» характеристика «сила».',
    },
    {
      id: 'through',
      chapter: 'Ссылка на таблицу',
      lead: 'Адрес можно вести дальше по колонке-ссылке: строка навыка → её характеристика → модификатор этой характеристики.',
      tab: 'dictionaries',
      say: 'Ещё колонка «Значение»: в «Формула для всех строк» наберите «@строка.» и выберите в подсказке «Характеристика · Модификатор».',
      hint: FORMULA_HINT,
      at: { guide: 'add-column' },
      done: view => {
        const table = skills(view)?.[1];
        const link = columnBy(table, 'Характеристика');
        const modifier = columnBy(stats(view)?.[1], 'Модификатор');
        return Boolean(link && modifier && reads(columnBy(table, 'Значение')?.expr, `@${ROW}.${link.key}.${modifier.key}`));
      },
      result: () => '«Значение» навыка — модификатор его характеристики.',
    },
    {
      id: 'save',
      chapter: 'Сами',
      alone: true,
      tab: 'dictionaries',
      say: 'Добавьте в таблицу «Характеристики» на вкладке «Правила» колонку «Спасбросок», равную модификатору характеристики.',
      hint: 'Нужен «+» в шапке таблицы «Характеристики» (не «+ колонка» в блоке листа); в формуле — «@строка.» и «Модификатор» из подсказки.',
      done: view => readsModifier(view, 'Спасбросок'),
      traps: [{
        when: view => Boolean(fieldBy(view.system, 'Спасбросок')),
        say: 'это поле листа; колонка нужна в таблице «Характеристики» на вкладке «Правила».',
      }],
      result: () => '«Спасбросок» = модификатор.',
    },
  ],
};
