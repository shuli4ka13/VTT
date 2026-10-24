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

const blockNamed = (view: View, name: string) => (view.system.blocks ?? []).find(block => same(block.name, name));

const placedIn = (view: View, name: string): boolean => {
  const block = blockNamed(view, name);
  return Boolean(block?.parts.some(part => {
    const table = view.system.tables?.[part.table];
    return table && table.shape !== 'book' && table.shape !== 'single' && table.owner === 'sheet';
  }));
};

const onSheetIn = (view: View, found: ReturnType<typeof stats>, name: string): boolean =>
  Boolean(found && found[1].owner === 'sheet' && blockNamed(view, name)?.parts.some(part => part.table === found[0]));

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
  sub: 'Характеристики и навыки таблицами прямо на листе, формула колонки и класс брони от ловкости.',
  seed: base as unknown as System,
  tab: 'sheet',
  chapters: [
    { title: 'Таблица на листе', sum: 'На листе таблица «Характеристики»: сила и ловкость, «Значение» вписывает игрок, «Модификатор» считается.' },
    { title: 'Лист героя', sum: 'Характеристики видны на листе, класс брони считается от ловкости, ошибок нет.' },
    { title: 'Навыки', sum: 'Таблица «Навыки»: у атлетики характеристика «сила», «Итог» — модификатор силы плюс «Значение».' },
    { title: 'Сами', sum: 'Вы добавили колонку с формулой без подсказок.' },
  ],
  steps: [
    {
      id: 'block',
      chapter: 'Таблица на листе',
      lead: 'Таблица — как лист в Экселе: строки и колонки. Характеристики героя — таблица: строки «сила» и «ловкость», колонки «Значение» и «Модификатор». Заведём её прямо на листе.',
      tab: 'sheet',
      say: 'Заведите на листе блок «Характеристики».',
      at: [
        { at: { text: '+ блок', in: 'Листы' }, say: 'В виде «блоки и типы листов» нажмите «+ блок».', done: view => (view.system.blocks ?? []).length > 1 },
        { at: { input: 'как зовётся блок' }, say: 'Впишите имя «Характеристики» и нажмите Enter.' },
      ],
      via: { text: 'блоки и типы листов' },
      done: view => Boolean(blockNamed(view, 'Характеристики')),
      result: () => 'Блок «Характеристики» на листе.',
    },
    {
      id: 'table',
      chapter: 'Таблица на листе',
      tab: 'sheet',
      say: 'Заведите в блоке таблицу «Характеристики».',
      at: [
        { at: { text: '+ таблица', in: 'Характеристики' }, say: 'В блоке «Характеристики» нажмите «+ таблица».', done: view => placedIn(view, 'Характеристики') },
        { at: { input: 'как зовётся таблица' }, say: 'Над листом откроется таблица. Впишите её название «Характеристики» и нажмите Enter.' },
      ],
      via: [{ text: 'Характеристики', in: 'Листы' }, { text: 'блоки и типы листов' }],
      done: view => onSheetIn(view, stats(view), 'Характеристики'),
      result: () => 'Таблица «Характеристики» стоит в блоке. Колонка «Значение» в ней уже есть — его вписывает игрок.',
    },
    {
      id: 'rows',
      chapter: 'Таблица на листе',
      tab: 'sheet',
      say: 'Добавьте строки «сила» и «ловкость».',
      at: [
        { at: { input: 'слово' }, say: 'В пустой строке впишите «сила» и нажмите Enter.', done: view => (stats(view)?.[1].rows ?? []).some(row => same(row.value, 'сила')) },
        { at: { text: '+ строка' }, say: 'Нажмите «+ строка».', done: view => (stats(view)?.[1].rows ?? []).length > 1 },
        { at: { input: 'слово' }, say: 'В новой строке впишите «ловкость» и нажмите Enter.' },
      ],
      hint: 'Таблица закрылась? В блоке «Характеристики» щёлкните «Характеристики:» — она откроется над листом.',
      via: [{ text: 'Характеристики:' }, { text: 'блоки и типы листов' }],
      done: view => {
        const rows = (stats(view)?.[1].rows ?? []).map(row => row.value);
        return rows.some(value => same(value, 'сила')) && rows.some(value => same(value, 'ловкость'));
      },
      result: () => 'Строки: сила и ловкость.',
    },
    {
      id: 'modifier',
      chapter: 'Таблица на листе',
      lead: 'Формула колонки считается для каждой строки отдельно: «Значение» в ней — значение той же строки, у силы — силы, у ловкости — ловкости.',
      tab: 'sheet',
      say: 'Добавьте колонку «Модификатор»: (значение − 10) / 2, с округлением вниз.',
      hint: FORMULA_HINT,
      at: [
        { at: { guide: 'add-column' }, say: 'В шапке таблицы нажмите «+».', done: view => (stats(view)?.[1].columns ?? []).length > 1 },
        { at: { input: 'как зовётся колонка' }, say: 'Впишите название «Модификатор» и нажмите Enter.', done: view => Boolean(columnBy(stats(view)?.[1], 'Модификатор')) },
        { at: { text: 'Формула для всех строк' }, say: 'Щёлкните «Формула для всех строк» и наберите: округлить вниз((Значение - 10) / 2). Слово «Значение» не печатайте — наберите «@» и выберите его в подсказке. Нажмите «готово».' },
      ],
      via: [{ text: 'Характеристики:' }, { text: 'блоки и типы листов' }],
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
      id: 'sample',
      chapter: 'Лист героя',
      tab: 'sheet',
      say: 'Нажмите «образец листа». У силы и ловкости — поле для «Значения» и посчитанный «Модификатор».',
      at: { text: 'образец листа' },
    },
    {
      id: 'armor',
      chapter: 'Лист героя',
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
      chapter: 'Лист героя',
      say: 'Нажмите «Проблемы» в шапке. Ошибок быть не должно.',
      at: { guide: 'problems' },
      done: problemsClean,
      result: () => 'Проблем нет.',
    },
    {
      id: 'skills',
      chapter: 'Навыки',
      lead: 'Навык опирается на характеристику: атлетика — на силу. Сделаем навыки тоже таблицей на листе.',
      tab: 'sheet',
      say: 'Заведите на листе блок «Навыки» с таблицей «Навыки» и строкой «атлетика».',
      at: [
        { at: { text: '+ блок', in: 'Листы' }, say: 'В виде «блоки и типы листов» нажмите «+ блок».', done: view => (view.system.blocks ?? []).length > 2 },
        { at: { input: 'как зовётся блок' }, say: 'Впишите имя «Навыки» и нажмите Enter.', done: view => Boolean(blockNamed(view, 'Навыки')) },
        { at: { text: '+ таблица', in: 'Навыки' }, say: 'В блоке «Навыки» нажмите «+ таблица».', done: view => placedIn(view, 'Навыки') },
        { at: { input: 'как зовётся таблица' }, say: 'Впишите название таблицы «Навыки» и нажмите Enter.', done: view => Boolean(skills(view)) },
        { at: { input: 'слово' }, say: 'В пустой строке впишите «атлетика» и нажмите Enter.' },
      ],
      via: { text: 'блоки и типы листов' },
      done: view => onSheetIn(view, skills(view), 'Навыки') && (skills(view)?.[1].rows ?? []).some(row => same(row.value, 'атлетика')),
      result: () => 'Таблица «Навыки» на листе, строка «атлетика». «Значение» навыка вписывает игрок — это вложенные очки.',
    },
    {
      id: 'link',
      chapter: 'Навыки',
      tab: 'sheet',
      say: 'Добавьте в «Навыки» колонку «Характеристика», которая выбирается из таблицы «Характеристики».',
      at: [
        { at: { guide: 'add-column' }, say: 'В шапке таблицы «Навыки» нажмите «+».', done: view => (skills(view)?.[1].columns ?? []).length > 1 },
        { at: { input: 'как зовётся колонка' }, say: 'Впишите название «Характеристика» и нажмите Enter.', done: view => Boolean(columnBy(skills(view)?.[1], 'Характеристика')) },
        { at: { text: 'Тип' }, say: 'В «Тип» выберите «из таблицы», затем в «Из таблицы» — «Характеристики».' },
      ],
      via: [{ text: 'Навыки:' }, { text: 'блоки и типы листов' }],
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
      chapter: 'Навыки',
      tab: 'sheet',
      say: 'В строке «атлетика» в колонке «Характеристика» выберите «сила».',
      hint: 'Это выбираете вы, автор правил, — у всех героев атлетика будет от силы.',
      done: view => {
        const table = skills(view)?.[1];
        const column = columnBy(table, 'Характеристика');
        const row = (table?.rows ?? []).find(one => same(one.value, 'атлетика'));
        return Boolean(column && same(row?.cells?.[column.key], 'сила'));
      },
      result: () => 'У атлетики характеристика «сила».',
    },
    {
      id: 'through',
      chapter: 'Навыки',
      lead: 'Через колонку «Характеристика» формула навыка достаёт число из другой таблицы: у атлетики — модификатор силы.',
      tab: 'sheet',
      say: 'Добавьте в «Навыки» колонку «Итог»: модификатор характеристики плюс «Значение».',
      hint: FORMULA_HINT,
      at: [
        { at: { guide: 'add-column' }, say: 'В шапке таблицы «Навыки» нажмите «+».', done: view => (skills(view)?.[1].columns ?? []).length > 2 },
        { at: { input: 'как зовётся колонка' }, say: 'Впишите название «Итог» и нажмите Enter.', done: view => Boolean(columnBy(skills(view)?.[1], 'Итог')) },
        { at: { text: 'Формула для всех строк' }, say: 'Щёлкните «Формула для всех строк»: «@» → «Характеристика · Модификатор», затем « + », затем «@» → «Значение». Нажмите «готово».' },
      ],
      via: [{ text: 'Навыки:' }, { text: 'блоки и типы листов' }],
      done: view => {
        const table = skills(view)?.[1];
        const link = columnBy(table, 'Характеристика');
        const value = columnBy(table, 'Значение');
        const modifier = columnBy(stats(view)?.[1], 'Модификатор');
        const formula = columnBy(table, 'Итог')?.expr;
        return Boolean(link && value && modifier
          && reads(formula, `@${ROW}.${link.key}.${modifier.key}`) && reads(formula, `@${ROW}.${value.key}`));
      },
      result: () => 'У атлетики «Итог» — модификатор силы плюс вложенные очки.',
    },
    {
      id: 'save',
      chapter: 'Сами',
      alone: true,
      tab: 'sheet',
      say: 'Добавьте в таблицу «Характеристики» колонку «Спасбросок», равную модификатору.',
      hint: 'Откройте таблицу: в блоке «Характеристики» щёлкните «Характеристики:». Затем «+» в её шапке, в формуле — «@» и «Модификатор».',
      done: view => readsModifier(view, 'Спасбросок'),
      traps: [{
        when: view => Boolean(fieldBy(view.system, 'Спасбросок')),
        say: '«Спасбросок» попал отдельным полем листа, а нужен колонкой таблицы «Характеристики». Удалите поле и добавьте колонку «+» в шапке таблицы.',
      }],
      result: () => '«Спасбросок» = модификатор.',
    },
  ],
};
