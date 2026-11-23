import { describe, it, expect } from 'vitest';
import { perform } from '../src/core/perform.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const ACTOR = { key: 'действующий', label: 'Кто действует', kind: 'sheet' };
const TARGETS = { key: 'цели', label: 'Цели', kind: 'sheet', many: true, item: { key: 'цель' } };
const EACH = { type: 'each', of: 'цели' };
const roll = (id: string, tags: string[]) => ({ id, type: 'roll', die: { expr: '1d6' }, by: { expr: '@действующий' }, tags });

const world = (word: Record<string, unknown>, steps: unknown[], listen = false): System => ({
  id: 'раз', name: 'Раз',
  tables: {
    лист: { shape: 'single', owner: 'sheet', columns: [{ key: 'хп', label: 'Хиты', kind: 'number', default: 20 }] },
    приём: { shape: 'book', use: 'action', label: 'Приём', columns: [], bindings: [{ label: 'Удар', effect: 'удар', args: {} }] },
  },
  roll_edits: { дикий: { label: 'Дикий', ops: [{ op: 'addDie' }], ...word } },
  effects: {
    удар: { label: 'Удар', activation: 'manual', params: [ACTOR, TARGETS], steps },
    ...(listen ? { слух: { label: 'Слух', activation: 'passive', on: [{ on: 'before:удар', steps: [] }] } } : {}),
  },
} as unknown as System);

const book = { records: [{ id: 'приём', table: 'приём', label: 'Удар', cells: {} }] } as unknown as Compendium;
const sheet = (id: string, effects: string[] = []): Sheet =>
  ({ id, systemId: 'раз', name: id, values: {}, has: [{ of: 'приём' }], effects: effects.map(effectId => ({ effectId })) } as unknown as Sheet);

const worded = (system: System, actorEffects: string[] = []): Record<string, boolean> => {
  const out = perform({ system, compendium: book, clock: null, sheets: [sheet('а', actorEffects), sheet('б')], die: () => 3 },
    { op: 'act', intent: { actionId: 'приём:0', fromId: 'а', toIds: ['б'], claims: { а: ['дикий'] } } });
  const found: Record<string, boolean> = {};
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) { value.forEach(walk); return; }
    if (!value || typeof value !== 'object') return;
    const node = value as { step?: unknown; rolls?: unknown; edits?: string[] };
    if (Array.isArray(node.rolls) && typeof node.step === 'string') found[node.step] = (node.edits ?? []).includes('Дикий');
    Object.values(node).forEach(walk);
  };
  walk(out.entries);
  return found;
};

describe('заявка к одной проверке', () => {
  it('слово с отметкой ложится на первый бросок заявившего, второй — без него; без отметки — на оба', () => {
    const steps = [roll('первый', ['атака']), roll('второй', ['сопротивление']), EACH];
    expect(worded(world({ once: true }, steps))).toEqual({ первый: true, второй: false });
    expect(worded(world({}, steps))).toEqual({ первый: true, второй: true });
  });

  it('первый подходящий: слово с «Кроме: атака» пропускает атаку и ложится на следующий бросок', () => {
    const steps = [roll('первый', ['атака']), roll('второй', ['сопротивление']), roll('третий', ['сопротивление']), EACH];
    expect(worded(world({ once: true, notTags: ['атака'] }, steps))).toEqual({ первый: false, второй: true, третий: false });
  });

  it('проба тела перед «до удара» заявку не тратит — настоящий бросок её получает', () => {
    const steps = [EACH, roll('первый', ['атака']), roll('второй', ['сопротивление'])];
    expect(worded(world({ once: true }, steps, true), ['слух'])).toEqual({ первый: true, второй: false });
  });
});
