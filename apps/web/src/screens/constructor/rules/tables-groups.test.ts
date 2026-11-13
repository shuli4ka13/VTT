import { describe, it, expect } from 'vitest';
import type { Table } from '@vtt/schema';
import { groupsOfTables, foldersInGroup } from './tables-section.tsx';

const t = (label: string, owner?: string) => ({ label, shape: 'rows', ...(owner ? { owner } : {}) }) as unknown as Table;

describe('таблицы в «Правилах» — по смыслу, выводом из «Чьё значение»', () => {
  it('своё у листа впереди, справочники в конце, внутри по алфавиту', () => {
    const groups = groupsOfTables([
      ['levels', t('Уровни')],
      ['skills', t('Навыки', 'sheet')],
      ['abilities', t('Характеристики', 'sheet')],
      ['damage', t('Виды урона')],
      ['party', t('Казна', 'group')],
    ]);
    expect(groups.map(([title, list]) => [title, list.map(([key]) => key)])).toEqual([
      ['Своё у каждого листа', ['skills', 'abilities']],
      ['Общее у группы', ['party']],
      ['Справочники', ['damage', 'levels']],
    ]);
  });
});

describe('папки внутри группы', () => {
  const g = (label: string, group?: string) => ({ ...t(label), ...(group ? { group } : {}) }) as Table;

  it('одна папка — вместе, без папки — в конце', () => {
    const folders = foldersInGroup([['a', g('А')], ['b', g('Б', 'Яд')], ['c', g('В', 'Магия')], ['d', g('Г', 'Яд')]]);
    expect(folders.map(([folder, list]) => [folder, list.map(([key]) => key)])).toEqual([
      ['Магия', ['c']], ['Яд', ['b', 'd']], ['', ['a']],
    ]);
  });

  it('без папок — один безымянный раздел', () => {
    expect(foldersInGroup([['a', g('А')]]).map(([folder]) => folder)).toEqual(['']);
  });
});
