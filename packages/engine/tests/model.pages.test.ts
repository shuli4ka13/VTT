import { describe, it, expect } from 'vitest';
import { bandsOf, pageOfBlock, renamePage, removePage } from '../src/model/pages.ts';
import { tidyLayout } from '../src/model/layout.ts';
import { lintSystem } from '../src/model/lint.ts';
import type { System } from '../src/model/types.ts';

const system = (): System => ({
  id: 'x', name: 'x', effects: {},
  tables: { лист: { shape: 'single', columns: [{ key: 'хиты', label: 'Хиты', kind: 'number' }] } },
  pages: [{ name: 'Шапка', top: true }, { name: 'Основное', stacks: 2 }, { name: 'Магия', lists: ['hanging'] }],
  blocks: [
    { name: 'Здоровье', page: 'Шапка', parts: [{ table: 'лист' }] },
    { name: 'Без страницы', parts: [{ table: 'лист' }] },
    { name: 'Заклинания', page: 'Магия', parts: [{ table: 'лист' }] },
    { name: 'Ячейки', parent: 'Заклинания', parts: [{ table: 'лист' }] },
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

  it('широкий блок режет страницу на полосы, остальные стоят в своём столбце', () => {
    const items = [{ n: 'а' }, { n: 'б', stack: 2 }, { n: 'в', wide: true }, { n: 'г', stack: 3 }];
    const bands = bandsOf(items, 2, item => item);
    expect(bands.map(band => ('wide' in band ? band.wide.n : band.stacks.map(list => list.map(i => i.n))))).toEqual([
      [['а'], ['б']], 'в', [[], ['г']],
    ]);
    expect(bandsOf(items, 1, item => item)).toEqual([{ stacks: [items] }]);
  });

  it('переименование и удаление страницы правят блоки, уборка снимает несуществующую', () => {
    const s = system();
    renamePage(s, 'Магия', 'Чары');
    expect(s.blocks!.find(b => b.name === 'Заклинания')!.page).toBe('Чары');
    removePage(s, 'Чары');
    expect(s.blocks!.find(b => b.name === 'Заклинания')!.page).toBeUndefined();
    s.blocks![0]!.page = 'Нет такой';
    tidyLayout(s);
    expect(s.blocks![0]!.page).toBeUndefined();
  });

  it('проверка ловит лишнюю шапку, повтор списка, чужую страницу и страницу у вложенного', () => {
    const s = system();
    expect(texts(s)).toEqual([]);
    s.pages!.push({ name: 'Ещё шапка', top: true, lists: ['hanging'] });
    s.blocks![1]!.page = 'Нет такой';
    s.blocks![3]!.page = 'Магия';
    const found = texts(s);
    expect(found).toContain('шапка листа одна, а страниц-шапок несколько');
    expect(found).toContain('список «Висит сейчас» стоит и на «Магия», и на «Ещё шапка»');
    expect(found).toContain('блок «Без страницы» стоит на странице «Нет такой», а её нет');
    expect(found).toContain('блок «Ячейки» внутри «Заклинания»: страницу и столбец берёт у него, своих не задаёт');
  });
});
