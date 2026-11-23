import { describe, it, expect } from 'vitest';
import { cellsOf, placeBlock, setWidth, setHeight, pageOfBlock, pageLabel, labelPage, removePage } from '../src/model/pages.ts';
import { tidyLayout } from '../src/model/layout.ts';
import { splitWords, perRowWords, widthWords } from '../src/words/glossary.ts';
import { lintSystem } from '../src/model/lint.ts';
import type { System } from '../src/model/types.ts';

const system = (): System => ({
  id: 'x', name: 'x', effects: {},
  tables: { лист: { shape: 'single', columns: [{ key: 'хиты', label: 'Хиты', kind: 'number' }] } },
  pages: [{ key: 'Шапка', top: true }, { key: 'Основное' }, { key: 'Магия' }],
  blocks: [
    { key: 'Здоровье', page: 'Шапка', parts: [{ table: 'лист' }] },
    { key: 'Без страницы', parts: [{ table: 'лист' }] },
    { key: 'Заклинания', page: 'Магия', list: 'hanging', parts: [{ table: 'лист' }] },
    { key: 'Ячейки', parent: 'Заклинания', parts: [{ table: 'лист' }] },
  ],
} as unknown as System);

const texts = (s: System) => lintSystem(s).filter(p => p.level === 'error').map(p => p.text);

describe('страницы листа', () => {
  it('блок без страницы — на первой закладке, вложенный — там же, где корень', () => {
    const s = system();
    expect(pageOfBlock(s, 'Здоровье')).toBe('Шапка');
    expect(pageOfBlock(s, 'Без страницы')).toBe('Основное');
    expect(pageOfBlock(s, 'Ячейки')).toBe('Магия');
    expect(pageOfBlock({ ...s, pages: undefined } as System, 'Здоровье')).toBeUndefined();
  });

  it('сетка: блок открывает ячейку своей ширины, «под» встаёт в ячейку предыдущего, вложенный раскладывается как любой', () => {
    const s = system();
    s.blocks = [
      { key: 'А', width: 4, parts: [] },
      { key: 'Б', under: true, parts: [] },
      { key: 'В', width: 8, parts: [] },
      { key: 'Г', parent: 'В', parts: [] },
    ] as never;
    expect(cellsOf(s, 'Основное')).toEqual([{ width: 4, blocks: ['А', 'Б'] }, { width: 8, blocks: ['В'] }, { width: 12, blocks: ['Г'] }]);
  });

  it('ширина ставится ячейке, даже если тянут блок «под»; 12 снимает ключ', () => {
    const s = system();
    s.blocks = [{ key: 'А', width: 4, parts: [] }, { key: 'Б', under: true, parts: [] }] as never;
    setWidth(s, 'Б', 5);
    expect(s.blocks![0]!.width).toBe(5);
    expect(s.blocks![1]).not.toHaveProperty('width');
    setWidth(s, 'А', 12);
    expect(s.blocks![0]).not.toHaveProperty('width');
  });

  it('перенос: под блок, рядом до и после ячейки; уходящая голова отдаёт ширину следующему', () => {
    const s = system();
    s.blocks = [
      { key: 'А', width: 4, parts: [] },
      { key: 'Б', under: true, parts: [] },
      { key: 'В', width: 8, parts: [] },
    ] as never;
    placeBlock(s, 'А', 'В', 'under');
    expect(s.blocks!.map(b => [b.key, b.width, b.under])).toEqual([['Б', 4, undefined], ['В', 8, undefined], ['А', undefined, true]]);
    placeBlock(s, 'А', 'Б', 'before');
    expect(cellsOf(s, 'Основное').map(cell => cell.blocks)).toEqual([['А'], ['Б'], ['В']]);
    placeBlock(s, 'Б', 'В', 'after');
    expect(cellsOf(s, 'Основное').map(cell => cell.blocks)).toEqual([['А'], ['В'], ['Б']]);
  });

  it('перенос на блок другой страницы переносит и страницу', () => {
    const s = system();
    placeBlock(s, 'Без страницы', 'Заклинания', 'under');
    expect(s.blocks!.find(b => b.key === 'Без страницы')!.page).toBe('Магия');
  });

  it('подпись страницы пишется отдельно от ключа; подпись, равная ключу, снимается', () => {
    const s = system();
    expect(pageLabel(s, 'Магия')).toBe('Магия');
    labelPage(s, 'Магия', 'Чары');
    expect(pageLabel(s, 'Магия')).toBe('Чары');
    expect(s.blocks!.find(b => b.key === 'Заклинания')!.page).toBe('Магия');
    labelPage(s, 'Магия', 'Магия');
    expect(s.pages!.find(p => p.key === 'Магия')).not.toHaveProperty('label');
  });

  it('удаление страницы снимает ссылки блоков, уборка снимает несуществующую', () => {
    const s = system();
    removePage(s, 'Магия');
    expect(s.blocks!.find(b => b.key === 'Заклинания')!.page).toBeUndefined();
    s.blocks![0]!.page = 'Нет такой';
    tidyLayout(s);
    expect(s.blocks![0]!.page).toBeUndefined();
  });

  it('проверка ловит лишнюю шапку, повтор списка и чужую страницу', () => {
    const s = system();
    expect(texts(s)).toEqual([]);
    s.pages!.push({ key: 'Ещё шапка', top: true });
    s.blocks!.push({ key: 'Эффекты', list: 'hanging', parts: [] });
    s.blocks![1]!.page = 'Нет такой';
    s.blocks![3]!.page = 'Магия';
    const found = texts(s);
    expect(found).toContain('шапка листа одна, а страниц-шапок несколько');
    expect(found).toContain('список «Висит сейчас» стоит и в блоке «Заклинания», и в «Эффекты»');
    expect(found).toContain('блок «Без страницы» стоит на странице «Нет такой», а её нет');
  });

  it('слова раскладки: доли ширины, столбцы строк, поля в строку', () => {
    expect([3, 4, 5, 12].map(widthWords)).toEqual(['четверть', 'треть', '5/12', 'вся ширина']);
    expect([1, 2, 5, 11].map(splitWords)).toEqual(['одним списком', 'в 2 столбца', 'в 5 столбцов', 'в 11 столбцов']);
    expect([1, 3].map(perRowWords)).toEqual(['по одному в строку', 'по 3 в строку']);
  });

  it('высота блока прилипает к шагу 10 и держится в пределах; пусто — по содержимому', () => {
    const s = system();
    setHeight(s, 'Здоровье', 333);
    expect(s.blocks![0]!.height).toBe(330);
    setHeight(s, 'Здоровье', 5);
    expect(s.blocks![0]!.height).toBe(40);
    setHeight(s, 'Здоровье', undefined);
    expect(s.blocks![0]).not.toHaveProperty('height');
  });
});
