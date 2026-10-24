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

const dicts = (view: View) => Object.values(view.system.tables ?? {}).filter(table => table.shape !== 'book' && table.shape !== 'single');

const parses = (text: string): boolean => {
  try { compile(text); return true; } catch { return false; }
};

const brokenModifier = (view: View): boolean => {
  const text = exprOf(columnBy(stats(view)?.[1], 'Модификатор')?.expr).trim();
  return text !== '' && !parses(text);
};

const FORMULA_HINT = 'Формула открывается строкой наверху экрана. Названия не печатайте — наберите «@» и выберите в подсказке. «готово» или Enter сохраняет.';

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
      lead: `Таблица — как лист в Экселе: строки и колонки. Здесь заведём справочник характеристик: строки «сила» и «ловкость», колонки «Значение» и «Модификатор». Справочники лежат на вкладке «${TABS.rules}» в разделе «Таблицы».`,
      tab: 'dictionaries',
      panel: 'Разделы правил',
      say: 'Заведите таблицу «Характеристики».',
      at: [
        { at: { text: '+ таблица' }, say: 'В разделе «Таблицы» нажмите «+ таблица».', done: view => dicts(view).length > 0 },
        { at: { input: 'как зовётся таблица' }, say: 'В шапке таблицы впишите название «Характеристики» и нажмите Enter.' },
      ],
      via: { text: 'Таблицы', in: 'Разделы правил' },
      done: view => Boolean(stats(view)),
      result: () => 'Таблица «Характеристики» заведена.',
    },
    {
      id: 'rows',
      chapter: 'Справочник',
      tab: 'dictionaries',
      say: 'Добавьте строки «сила» и «ловкость».',
      at: [
        { at: { input: 'слово' }, say: 'В пустой строке впишите «сила» и нажмите Enter.', done: view => (stats(view)?.[1].rows ?? []).some(row => same(row.value, 'сила')) },
        { at: { text: '+ строка' }, say: 'Нажмите «+ строка».', done: view => (stats(view)?.[1].rows ?? []).length > 1 },
        { at: { input: 'слово' }, say: 'В новой строке впишите «ловкость» и нажмите Enter.' },
      ],
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
      say: 'Добавьте колонку «Значение» — число.',
      at: [
        { at: { guide: 'add-column' }, say: 'В шапке таблицы нажмите «+».', done: view => (stats(view)?.[1].columns ?? []).length > 0 },
        { at: { input: 'как зовётся колонка' }, say: 'Впишите название «Значение» и нажмите Enter. Тип «число» уже стоит.' },
      ],
      done: view => columnBy(stats(view)?.[1], 'Значение')?.kind === 'number',
      result: () => 'Колонка «Значение» — число.',
    },
    {
      id: 'modifier',
      chapter: 'Справочник',
      lead: 'Формула колонки считается для каждой строки отдельно: «Значение» в ней — значение той же строки, у силы — силы, у ловкости — ловкости.',
      tab: 'dictionaries',
      say: 'Добавьте колонку «Модификатор»: (значение − 10) / 2, с округлением вниз.',
      hint: FORMULA_HINT,
      at: [
        { at: { guide: 'add-column' }, say: 'В шапке таблицы нажмите «+».', done: view => (stats(view)?.[1].columns ?? []).length > 1 },
        { at: { input: 'как зовётся колонка' }, say: 'Впишите название «Модификатор» и нажмите Enter.', done: view => Boolean(columnBy(stats(view)?.[1], 'Модификатор')) },
        { at: { text: 'Формула для всех строк' }, say: 'Щёлкните «Формула для всех строк» и наберите: округлить вниз((Значение - 10) / 2). Слово «Значение» не печатайте — наберите «@» и выберите его в подсказке. Нажмите «готово».' },
      ],
      done: view => {
        const table = stats(view)?.[1];
        const value = columnBy(table, 'Значение');
        const formula = columnBy(table, 'Модификатор')?.expr;
        return Boolean(value && reads(formula, `@${ROW}.${value.key}`) && parses(exprOf(formula)));
      },
      traps: [{
        when: brokenModifier,
        say: 'В формуле ошибка: не закрыта скобка или лишний знак. Должно выйти: округлить вниз((Значение - 10) / 2).',
      }],
      result: () => 'Модификатор считается в каждой строке: у силы — из значения силы, у ловкости — из значения ловкости.',
    },
    {
      id: 'block',
      chapter: 'На листе',
      tab: 'sheet',
      say: 'Поставьте характеристики на лист — у каждого героя свои значения.',
      at: [
        { at: { text: '+ блок', in: 'Листы' }, say: 'В виде «блоки и типы листов» нажмите «+ блок».', done: view => (view.system.blocks ?? []).length > 1 },
        { at: { input: 'как зовётся блок' }, say: 'Впишите имя блока «Характеристики» и нажмите Enter.', done: view => (view.system.blocks ?? []).some(block => same(block.name, 'Характеристики')) },
        { at: { text: '+ поля из таблицы…' }, say: 'В списке «+ поля из таблицы…» выберите «Характеристики · справочник», затем нажмите «Да, своими у каждого листа».' },
      ],
      via: { text: 'блоки и типы листов' },
      done: view => {
        const found = stats(view);
        return Boolean(found && found[1].owner === 'sheet'
          && (view.system.blocks ?? []).some(block => block.parts.some(part => part.table === found[0])));
      },
      result: () => 'Характеристики на листе. Значения у каждого героя свои.',
    },
    {
      id: 'sample',
      chapter: 'На листе',
      tab: 'sheet',
      say: 'Нажмите «образец листа». У силы и ловкости видно «Значение» и посчитанный «Модификатор».',
      at: { text: 'образец листа' },
    },
    {
      id: 'armor',
      chapter: 'На листе',
      lead: 'Поле листа может брать число из любой клетки таблицы — например, модификатор ловкости.',
      tab: 'sheet',
      say: 'Чтобы класс брони рос с ловкостью, щёлкните поле «Класс брони», в «Формула для всех листов» наберите «10 + @» и выберите «Модификатор: ловкость». Нажмите «готово».',
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
      say: 'Нажмите «Проблемы» в шапке. Ошибок быть не должно.',
      at: { guide: 'problems' },
      done: problemsClean,
      result: () => 'Проблем нет.',
    },
    {
      id: 'skills',
      chapter: 'Ссылка на таблицу',
      lead: 'Навык опирается на характеристику: атлетика — на силу. В таблице навыков будет колонка «Характеристика», где выбирают строку из «Характеристик».',
      tab: 'dictionaries',
      panel: 'Разделы правил',
      say: 'Заведите таблицу «Навыки» со строкой «атлетика».',
      at: [
        { at: { text: '+ таблица' }, say: 'В разделе «Таблицы» нажмите «+ таблица».', done: view => dicts(view).length > 1 },
        { at: { input: 'как зовётся таблица' }, say: 'Впишите название «Навыки» и нажмите Enter.', done: view => Boolean(skills(view)) },
        { at: { input: 'слово' }, say: 'В пустой строке впишите «атлетика» и нажмите Enter.' },
      ],
      via: { text: 'Таблицы', in: 'Разделы правил' },
      done: view => (skills(view)?.[1].rows ?? []).some(row => same(row.value, 'атлетика')),
      result: () => 'Таблица «Навыки»: строка «атлетика».',
    },
    {
      id: 'link',
      chapter: 'Ссылка на таблицу',
      tab: 'dictionaries',
      say: 'Добавьте в «Навыки» колонку «Характеристика», которая выбирается из таблицы «Характеристики».',
      at: [
        { at: { guide: 'add-column' }, say: 'В шапке таблицы «Навыки» нажмите «+».', done: view => (skills(view)?.[1].columns ?? []).length > 0 },
        { at: { input: 'как зовётся колонка' }, say: 'Впишите название «Характеристика» и нажмите Enter.', done: view => Boolean(columnBy(skills(view)?.[1], 'Характеристика')) },
        { at: { text: 'Тип' }, say: 'В «Тип» выберите «из таблицы», затем в «Из таблицы» — «Характеристики».' },
      ],
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
        say: 'Таблица не указана — выбирать не из чего. В «Из таблицы» выберите «Характеристики».',
      }],
      result: () => '«Характеристика» выбирается из таблицы «Характеристики».',
    },
    {
      id: 'pick',
      chapter: 'Ссылка на таблицу',
      tab: 'dictionaries',
      say: 'В строке «атлетика» в колонке «Характеристика» выберите «сила».',
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
      lead: 'Через колонку «Характеристика» формула навыка достаёт число из другой таблицы: у атлетики — модификатор силы.',
      tab: 'dictionaries',
      say: 'Добавьте в «Навыки» колонку «Значение», равную модификатору характеристики навыка.',
      hint: FORMULA_HINT,
      at: [
        { at: { guide: 'add-column' }, say: 'В шапке таблицы «Навыки» нажмите «+».', done: view => (skills(view)?.[1].columns ?? []).length > 1 },
        { at: { input: 'как зовётся колонка' }, say: 'Впишите название «Значение» и нажмите Enter.', done: view => Boolean(columnBy(skills(view)?.[1], 'Значение')) },
        { at: { text: 'Формула для всех строк' }, say: 'Щёлкните «Формула для всех строк», наберите «@» и выберите «Характеристика · Модификатор». Нажмите «готово».' },
      ],
      done: view => {
        const table = skills(view)?.[1];
        const link = columnBy(table, 'Характеристика');
        const modifier = columnBy(stats(view)?.[1], 'Модификатор');
        return Boolean(link && modifier && reads(columnBy(table, 'Значение')?.expr, `@${ROW}.${link.key}.${modifier.key}`));
      },
      result: () => 'У атлетики «Значение» — модификатор силы.',
    },
    {
      id: 'save',
      chapter: 'Сами',
      alone: true,
      tab: 'dictionaries',
      say: 'Добавьте в таблицу «Характеристики» колонку «Спасбросок», равную модификатору.',
      hint: 'Вкладка «Правила», раздел «Таблицы», «+» в шапке «Характеристик». В формуле — «@» и «Модификатор».',
      done: view => readsModifier(view, 'Спасбросок'),
      traps: [{
        when: view => Boolean(fieldBy(view.system, 'Спасбросок')),
        say: '«Спасбросок» попал в поле листа, а нужен колонкой в таблице «Характеристики» на вкладке «Правила».',
      }],
      result: () => '«Спасбросок» = модификатор.',
    },
  ],
};
