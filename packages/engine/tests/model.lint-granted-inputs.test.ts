import { describe, it, expect } from 'vitest';
import { lintSystem } from '../src/model/lint.ts';
import type { System } from '../src/model/types.ts';

const systemOf = (skill: Record<string, unknown>, foe: Record<string, unknown>) => ({
  id: 'с', name: 'с', grants: ['атака'],
  tables: {
    лист: { label: 'Лист', shape: 'single', owner: 'sheet', columns: [{ key: 'хиты', label: 'Хиты', kind: 'number', default: 10 }] },
    навыки: { label: 'Навыки', key: 'word', columns: [{ key: 'ранг', label: 'Ранг', kind: 'number' }], rows: [{ value: 'атлетика', label: 'Атлетика', cells: { ранг: 2 } }] },
  },
  effects: {
    атака: { label: 'Атака', activation: 'manual', params: [
      { key: 'действующий', label: 'Кто действует', kind: 'sheet' },
      { key: 'навык', label: 'Навык', kind: 'choice', from: 'навыки', ...skill },
      { key: 'враг', label: 'Враг', kind: 'sheet', ...foe },
    ], steps: [{ type: 'apply', target: { expr: '@враг.хиты' }, direction: 'subtract', value: { expr: '@навык.ранг' } }] },
  },
} as unknown as System);

const found = (system: System) => lintSystem(system).filter(one => one.level === 'error' && one.text.includes('выдан листам кнопкой')).map(one => one.text);

describe('эффект, выданный листам кнопкой: каждый вход кому-то заполнять', () => {
  it('вход без «спросить» и лист без «цели» — две ошибки с названиями входов и подсказкой, что выбрать', () => {
    const texts = found(systemOf({}, {}));
    expect(texts).toHaveLength(2);
    expect(texts.join(' | ')).toContain('вход «Навык» заполнить некому');
    expect(texts.join(' | ')).toContain('«спросить игрока»');
    expect(texts.join(' | ')).toContain('лист во вход «Враг» поставить некому');
  });

  it('«спросить игрока» и «цель» — ошибок нет', () => {
    expect(found(systemOf({ ask: { by: 'actor' } }, { role: 'target' }))).toEqual([]);
  });
});
