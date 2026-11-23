import { ROW, compile, blockLabel } from '@vtt/engine';
import type { System } from '@vtt/schema';
import type { Lesson, View, Move } from '../types.ts';
import { tableBy, columnBy, rowIs, fieldBy, columnOf, figure, same, exprOf, errorsOf, FORMULA_DONE, barOpen, barText } from '../find.ts';
import { problemsClean } from './first-system.ts';
import { visible } from '../anchor.ts';
import base from '../seeds/base.json' with { type: 'json' };

const stats = (view: View) => {
  const found = tableBy(view.system, 'Характеристики');
  return found && found[1].shape !== 'book' && found[1].shape !== 'single' ? found : undefined;
};

const skills = (view: View) => {
  const found = tableBy(view.system, 'Навыки');
  return found && found[1].shape !== 'book' && found[1].shape !== 'single' ? found : undefined;
};

const blockNamed = (view: View, name: string) => (view.system.blocks ?? []).find(block => same(blockLabel(view.system, block.key), name));

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

const equalsAll = (formula: unknown, vars: (sample: number) => Record<string, unknown>, wanted: (sample: number) => number): boolean =>
  [-3, 0, 2, 7, 11].every(sample => figure(formula, vars(sample)) === wanted(sample));

const modifierWanted = (sample: number): number => Math.floor((sample - 10) / 2);

const modifierRight = (view: View, formula: unknown): boolean => {
  const value = columnBy(stats(view)?.[1], 'Значение');
  return Boolean(value && parses(exprOf(formula)) && equalsAll(formula, sample => ({ [`${ROW}.${value.key}`]: sample }), modifierWanted));
};

const valueRead = (view: View, text: string): boolean => {
  const value = columnBy(stats(view)?.[1], 'Значение');
  return Boolean(value && text.replace(/\s+/g, '').includes(`@${ROW}.${value.key}`));
};

const armorRight = (view: View, formula: unknown): boolean => {
  const found = stats(view);
  const modifier = columnBy(found?.[1], 'Модификатор');
  const dexterity = (found?.[1].rows ?? []).find(row => rowIs(row, 'ловкость'));
  return Boolean(found && modifier && dexterity && equalsAll(formula, sample => ({ [`${found[0]}.${String(dexterity.value)}.${modifier.key}`]: sample }), sample => 10 + sample));
};

const armorExpr = (view: View): unknown => columnOf(view.system, fieldBy(view.system, 'Класс брони'))?.expr;

const squash = (text: string): string => text.replace(/\s+/g, '');

const FORMULA_HINT = 'Формула открывается строкой наверху экрана. Название целиком не печатайте — начните набирать его и выберите в подсказке. «готово» или Enter сохраняет.';

const hasRows = (view: View, names: string[]): boolean => {
  const rows = stats(view)?.[1].rows ?? [];
  return names.every(name => rows.some(row => rowIs(row, name)));
};

const SAMPLE = 'образец листа';
const sampleShown = (): boolean =>
  [...document.querySelectorAll('.segmented__item[aria-pressed="true"]')].some(el => same(el.textContent, SAMPLE));

const kindsFirst: Move = { at: { text: 'блоки и типы листов' }, say: 'Над листом нажмите «блоки и типы листов».', done: () => visible({ text: '+ блок', in: 'Листы' }), maybe: true };

const openTable = (name: string): boolean =>
  [...document.querySelectorAll<HTMLInputElement>('input[placeholder="как зовётся таблица"]')].some(el => same(el.value, name));

const tableOpened = (name: string): Move => ({
  at: [{ text: `${name}:` }, { text: name, in: 'Листы' }, { text: 'блоки и типы листов' }],
  say: `Если таблица закрыта: в виде «блоки и типы листов» раскройте блок «${name}» и щёлкните «${name}:» — она откроется над листом.`,
  done: () => openTable(name),
  maybe: true,
});

const throughRight = (view: View, formula: unknown): boolean => {
  const table = skills(view)?.[1];
  const link = columnBy(table, 'Характеристика');
  const value = columnBy(table, 'Значение');
  const modifier = columnBy(stats(view)?.[1], 'Модификатор');
  return Boolean(link && value && modifier
    && [-2, 0, 3].every(first => [0, 1, 5].every(second => figure(formula, {
      [`${ROW}.${link.key}.${modifier.key}`]: first, [`${ROW}.${value.key}`]: second,
    }) === first + second)));
};

const throughReads = (view: View, text: string): boolean => {
  const link = columnBy(skills(view)?.[1], 'Характеристика');
  const modifier = columnBy(stats(view)?.[1], 'Модификатор');
  return Boolean(link && modifier && squash(text).includes(`@${ROW}.${link.key}.${modifier.key}`));
};

const copiesModifier = (view: View, label: string): boolean => {
  const table = stats(view)?.[1];
  const modifier = columnBy(table, 'Модификатор');
  return Boolean(modifier && equalsAll(columnBy(table, label)?.expr, sample => ({ [`${ROW}.${modifier.key}`]: sample }), sample => sample));
};

export const tables: Lesson = {
  id: 'tables',
  title: 'Таблицы',
  sub: 'Характеристики и навыки таблицами прямо на листе, формула колонки и класс брони от ловкости.',
  start: 'на листе в блоке «Бой» есть «Хиты» и «Класс брони», есть «Кость проверки» и эффект «Удар», который сам отнимает у цели 5 хитов. Таблиц ещё нет.',
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
        kindsFirst,
        { at: { text: '+ блок', in: 'Листы' }, say: 'В «Листы» нажмите «+ блок».', done: view => (view.system.blocks ?? []).length > 1 },
        { at: { input: 'как зовётся блок' }, say: 'Впишите имя «Характеристики» и нажмите Enter.' },
      ],
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
        tableOpened('Характеристики'),
        { at: { input: 'как зовётся строка' }, say: 'В пустой строке впишите «сила» и нажмите Enter.', done: view => (stats(view)?.[1].rows ?? []).some(row => rowIs(row, 'сила')) },
        { at: { text: '+ строка' }, say: 'Нажмите «+ строка».', done: view => (stats(view)?.[1].rows ?? []).length > 1 },
        { at: { input: 'как зовётся строка' }, say: 'В новой строке впишите «ловкость» и нажмите Enter.' },
      ],
      done: view => {
        const rows = stats(view)?.[1].rows ?? [];
        return rows.some(row => rowIs(row, 'сила')) && rows.some(row => rowIs(row, 'ловкость'));
      },
      result: () => 'Строки: сила и ловкость.',
    },
    {
      id: 'modifier',
      chapter: 'Таблица на листе',
      lead: 'Формула колонки считается для каждой строки отдельно: «Значение» в ней — значение той же строки, у силы — силы, у ловкости — ловкости.',
      tab: 'sheet',
      say: 'Добавьте колонку «Модификатор»: (значение - 10) / 2, с округлением вниз.',
      at: [
        tableOpened('Характеристики'),
        { at: { guide: 'add-column' }, say: 'В шапке таблицы нажмите «+».', done: view => (stats(view)?.[1].columns ?? []).length > 1 },
        { at: { input: 'как зовётся колонка' }, say: 'Впишите название «Модификатор» и нажмите Enter.', done: view => Boolean(columnBy(stats(view)?.[1], 'Модификатор')) },
        {
          at: { text: 'Формула для всех строк' },
          say: 'Щёлкните «Формула для всех строк» и наберите «округлить вниз((».',
          hint: FORMULA_HINT,
          done: view => barText(view).includes('floor') || modifierRight(view, columnBy(stats(view)?.[1], 'Модификатор')?.expr),
        },
        {
          at: { text: 'Формула для всех строк' },
          say: 'Начните набирать «значение» и выберите «Значение» в списке.',
          hint: FORMULA_HINT,
          done: view => valueRead(view, barText(view)) || modifierRight(view, columnBy(stats(view)?.[1], 'Модификатор')?.expr),
        },
        {
          at: { text: 'Формула для всех строк' },
          say: 'Допишите «- 10) / 2)».',
          done: view => modifierRight(view, barText(view)) || modifierRight(view, columnBy(stats(view)?.[1], 'Модификатор')?.expr),
        },
        { at: [FORMULA_DONE, { text: 'Формула для всех строк' }], say: 'Нажмите Enter или «готово».' },
      ],
      done: view => hasRows(view, ['сила', 'ловкость']) && modifierRight(view, columnBy(stats(view)?.[1], 'Модификатор')?.expr),
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
      say: 'Нажмите «образец листа»: у силы и ловкости — поле для «Значения» и посчитанный «Модификатор».',
      at: { text: SAMPLE },
      done: view => view.tab === 'sheet' && sampleShown(),
      result: () => 'Образец листа открыт: у силы и ловкости видны «Значение» и «Модификатор».',
    },
    {
      id: 'armor',
      chapter: 'Лист героя',
      lead: 'Поле листа может брать число из любой клетки таблицы — например, модификатор ловкости.',
      tab: 'sheet',
      say: 'Сделайте так, чтобы класс брони рос с ловкостью: 10 плюс модификатор ловкости.',
      at: [
        {
          at: { text: 'Формула для всех листов' },
          say: 'В поле «Класс брони» щёлкните «Формула для всех листов» и наберите «10 + ».',
          hint: FORMULA_HINT,
          done: view => squash(barText(view)).startsWith('10+') || armorRight(view, armorExpr(view)),
        },
        {
          at: { text: 'Формула для всех листов' },
          say: 'Начните набирать «модификатор» и выберите «Модификатор: ловкость» в списке.',
          hint: FORMULA_HINT,
          done: view => armorRight(view, barText(view)) || armorRight(view, armorExpr(view)),
        },
        { at: [FORMULA_DONE, { text: 'Формула для всех листов' }], say: 'Нажмите Enter или «готово».' },
      ],
      via: [{ text: 'Класс брони' }, { text: 'Бой', in: 'Листы' }],
      done: view => armorRight(view, armorExpr(view)),
      result: () => 'Класс брони: 10 + модификатор ловкости.',
    },
    {
      id: 'problems',
      chapter: 'Лист героя',
      say: 'Нажмите в шапке кнопку «Проблем нет» (если что-то найдено, на ней «Проблемы» и число). Ошибок быть не должно.',
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
        kindsFirst,
        { at: { text: '+ блок', in: 'Листы' }, say: 'В «Листы» нажмите «+ блок».', done: view => (view.system.blocks ?? []).length > 2 },
        { at: { input: 'как зовётся блок' }, say: 'Впишите имя «Навыки» и нажмите Enter.', done: view => Boolean(blockNamed(view, 'Навыки')) },
        { at: { text: '+ таблица', in: 'Навыки' }, say: 'В блоке «Навыки» нажмите «+ таблица».', done: view => placedIn(view, 'Навыки') },
        { at: { input: 'как зовётся таблица' }, say: 'Впишите название таблицы «Навыки» и нажмите Enter.', done: view => Boolean(skills(view)) },
        { at: { input: 'как зовётся строка' }, say: 'В пустой строке впишите «атлетика» и нажмите Enter.' },
      ],
      done: view => onSheetIn(view, skills(view), 'Навыки') && (skills(view)?.[1].rows ?? []).some(row => rowIs(row, 'атлетика')),
      result: () => 'Таблица «Навыки» на листе, строка «атлетика». «Значение» навыка вписывает игрок — это вложенные очки.',
    },
    {
      id: 'link',
      chapter: 'Навыки',
      tab: 'sheet',
      say: 'Добавьте в «Навыки» колонку «Характеристика», которая выбирается из таблицы «Характеристики».',
      at: [
        tableOpened('Навыки'),
        { at: { guide: 'add-column' }, say: 'В шапке таблицы «Навыки» нажмите «+».', done: view => (skills(view)?.[1].columns ?? []).length > 1 },
        { at: { input: 'как зовётся колонка' }, say: 'Впишите название «Характеристика» и нажмите Enter.', done: view => Boolean(columnBy(skills(view)?.[1], 'Характеристика')) },
        { at: { text: 'Тип' }, say: 'В «Тип» выберите «из таблицы».', done: view => columnBy(skills(view)?.[1], 'Характеристика')?.kind === 'choice' },
        { at: { text: 'Из таблицы' }, say: 'В поле «Из таблицы · заполнить» выберите «Характеристики».' },
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
        say: 'Таблица не указана — выбирать не из чего. В поле «Из таблицы» выберите «Характеристики».',
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
        const row = (table?.rows ?? []).find(one => rowIs(one, 'атлетика'));
        const strength = (stats(view)?.[1].rows ?? []).find(one => rowIs(one, 'сила'));
        return Boolean(column && strength && same(row?.cells?.[column.key], String(strength.value)));
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
        tableOpened('Навыки'),
        { at: { guide: 'add-column' }, say: 'В шапке таблицы «Навыки» нажмите «+».', done: view => (skills(view)?.[1].columns ?? []).length > 2 },
        { at: { input: 'как зовётся колонка' }, say: 'Впишите название «Итог» и нажмите Enter.', done: view => Boolean(columnBy(skills(view)?.[1], 'Итог')) },
        { at: { text: 'Формула для всех строк' }, say: 'Щёлкните «Формула для всех строк» и начните набирать «модификатор».', done: view => barOpen(view) || throughRight(view, columnBy(skills(view)?.[1], 'Итог')?.expr) },
        {
          at: { text: 'Формула для всех строк' },
          say: 'В списке выберите «Характеристика → Модификатор».',
          done: view => throughReads(view, barText(view)) || throughRight(view, columnBy(skills(view)?.[1], 'Итог')?.expr),
        },
        {
          at: { text: 'Формула для всех строк' },
          say: 'Допишите « + » и начните набирать «значение».',
          done: view => barText(view).includes('+') || throughRight(view, columnBy(skills(view)?.[1], 'Итог')?.expr),
        },
        {
          at: { text: 'Формула для всех строк' },
          say: 'Выберите «Значение» в списке.',
          done: view => throughRight(view, barText(view)) || throughRight(view, columnBy(skills(view)?.[1], 'Итог')?.expr),
        },
        { at: [FORMULA_DONE, { text: 'Формула для всех строк' }], say: 'Нажмите Enter или «готово».' },
      ],
      done: view => throughRight(view, columnBy(skills(view)?.[1], 'Итог')?.expr),
      result: () => 'У атлетики «Итог» — модификатор силы плюс вложенные очки.',
    },
    {
      id: 'save',
      chapter: 'Сами',
      alone: true,
      tab: 'sheet',
      say: 'Добавьте в таблицу «Характеристики» колонку «Спасбросок», равную модификатору.',
      goal: 'в таблице «Характеристики» есть колонка «Спасбросок», которая в каждой строке равна «Модификатору» этой же строки, а в «Проблемах» нет ошибок.',
      hint: 'Откройте таблицу: раскройте блок «Характеристики» и щёлкните «Характеристики:». Затем «+» в её шапке, в формуле начните набирать «модификатор» и выберите «Модификатор».',
      done: view => copiesModifier(view, 'Спасбросок') && errorsOf(view.system) === 0,
      traps: [{
        when: view => Boolean(fieldBy(view.system, 'Спасбросок')),
        say: '«Спасбросок» попал отдельным полем листа, а нужен колонкой таблицы «Характеристики». Удалите поле и добавьте колонку «+» в шапке таблицы.',
      }],
      result: () => '«Спасбросок» = модификатор.',
    },
  ],
};
