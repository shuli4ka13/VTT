// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, act, fireEvent, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { world as W } from '@vtt/schema';
import type { System, Step as EffectStep } from '@vtt/schema';
import { useWorld, emptySystem } from '../store/world.ts';
import { useGuide } from '../store/guide.ts';
import { SystemBar } from '../screens/constructor/world-bar.tsx';
import { ConstructorScreen } from '../screens/constructor/constructor.tsx';
import { addColumn } from '../screens/constructor/rules/character-section.tsx';
import { openAll } from '../testing/render-open.tsx';
import { within, stepCard, block, addToArm } from '../testing/cards.ts';
import { TABS } from '../words.ts';
import { GuideLayer, PAUSE_MS, useView, movesOf, moveAt, pointOf } from './guide-card.tsx';
import { LESSONS, lessonOf } from './lessons/index.ts';
import { findAnchor, firstOf, openedDialog } from './anchor.ts';
import { errorsOf } from './find.ts';
import { bring } from '../store/fresh.ts';
import { PIECES, bringPiece } from '@vtt/engine/model/pieces';
import { bringIn } from '@vtt/engine/model/bring';
import { SAMPLE_SYSTEMS } from '@vtt/engine/model/systems';
import { lintSystem } from '@vtt/engine/model/lint';
import { flattenSystem } from '@vtt/engine/model/inherit';
import type { View } from './types.ts';
import base from './seeds/base.json' with { type: 'json' };

const seed = base as unknown as System;

let view: View | null = null;

function Probe() {
  view = useView();
  return null;
}

const mount = () => render(
  <MemoryRouter>
    <SystemBar /><ConstructorScreen /><GuideLayer /><Probe />
  </MemoryRouter>,
);

const edit = (change: (draft: System) => void) => act(() => { useWorld.getState().editSystem(change); });
const pick = (what: Parameters<ReturnType<typeof useWorld.getState>['pick']>[0]) => act(() => { useWorld.getState().pick(what); });
const steps = (id: string): Record<string, unknown>[] => useWorld.getState().system.effects[id]!.steps as unknown as Record<string, unknown>[];
const setSteps = (draft: System, id: string, list: Record<string, unknown>[]) => { draft.effects[id]!.steps = list as unknown as EffectStep[]; };
const beforeEnd = (list: Record<string, unknown>[], step: Record<string, unknown>) => {
  const at = list.findIndex(one => one.type === 'end');
  return [...list.slice(0, at), step, ...list.slice(at)];
};
const applied = (change: Record<string, unknown>) => steps('удар').map(step => (step.type === 'apply' ? { ...step, ...change } : step));
const labelColumn = (table: string, key: string, label: string) => edit(d => { d.tables![table]!.columns!.find(c => c.key === key)!.label = label; });
const press = (el: HTMLElement) => {
  const target = el.matches('button, select, summary, [role="button"], [role="tab"]') ? el : el.querySelector<HTMLElement>('button, summary, [role="button"]') ?? el;
  act(() => { fireEvent.click(target); });
  openAll();
};
const problemsOf = () => lintSystem(flattenSystem(useWorld.getState().system, true)).filter(p => p.level === 'error').map(p => p.text).join(' | ');
const toggleProblems = () => { act(() => { fireEvent.click(findAnchor({ guide: 'problems' })!.querySelector('button')!); }); };
const openProblems = () => { if (!openedDialog('Проблемы системы')) toggleProblems(); };

const SOLVE_READY: Record<string, (() => void) | (() => void)[]> = {
  take: () => takePiece('d20-abilities'),
  drop: [() => pick({ activeFieldTag: 'inspiration' }), () => dropField('inspiration')],
  problems: () => openProblems(),
  effect: () => takeEffect('disengage'),
  'problems-effect': () => undefined,
  other: () => { takePiece('sr-tracks'); dropField('wound_mod'); },
};

const SOLVE: Record<string, Record<string, (() => void) | (() => void)[]>> = {
  ready: SOLVE_READY,
  'first-system': {
    block: [
      () => { edit(d => { (d.blocks ??= []).push({ name: 'Новый блок', parts: [] }); }); pick({ activeBlock: 'Новый блок' }); },
      () => { edit(d => { d.blocks!.find(one => one.name === 'Новый блок')!.name = 'Бой'; }); pick({ activeBlock: 'Бой' }); },
    ],
    hp: [
      () => { edit(d => addColumn(d, { key: 'хиты', label: 'Новое поле', kind: 'number' }, 'sheet', 'Бой')); pick({ activeFieldTag: 'хиты', activeBlock: null }); },
      () => act(() => { useWorld.getState().editColumn('лист', 'хиты', c => { c.label = 'Хиты'; }); }),
    ],
    'hp-start': () => act(() => { useWorld.getState().editColumn('лист', 'хиты', c => { c.default = 10; }); }),
    'hp-min': () => act(() => { useWorld.getState().editColumn('лист', 'хиты', c => { c.min = 0; }); }),
    ac: [
      () => { edit(d => addColumn(d, { key: 'класс_брони', label: 'Новое поле', kind: 'number', default: 12 }, 'sheet', 'Бой')); pick({ activeFieldTag: 'класс_брони', activeBlock: null }); },
      () => { act(() => { useWorld.getState().editColumn('лист', 'класс_брони', c => { c.label = 'Класс брони'; }); }); pick({ activeFieldTag: null, activeBlock: null }); },
    ],
    die: [
      () => edit(d => { (d.constants ??= {}).кость = { label: '', kind: 'die', dice: [{ sides: 20 }] }; }),
      () => edit(d => { d.constants!.кость!.label = 'Кость проверки'; }),
    ],
    strike: [
      () => {
        edit(d => { d.effects.удар = { ...structuredClone(seed.effects.удар!), label: 'Новый эффект', params: [{ key: 'действующий', label: 'Кто действует', kind: 'sheet' }] }; setSteps(d, 'удар', []); });
        pick({ activeEffectId: 'удар' });
      },
      () => edit(d => { d.effects.удар!.label = 'Удар'; }),
    ],
    everyone: () => edit(d => { d.grants = ['удар']; }),
    targets: [
      () => press(findAnchor({ text: '+ ещё одно' })!),
      () => edit(d => { d.effects.удар!.params!.splice(1, 1, { key: 'цели', label: 'Цели', kind: 'sheet', many: true, item: { key: 'цель', label: 'Цель' } } as never); }),
    ],
    each: () => edit(d => setSteps(d, 'удар', [{ type: 'each', of: 'цели' }])),
    check: [
      () => edit(d => setSteps(d, 'удар', [...steps('удар'),
        { id: 'проверка_бросок', type: 'roll', die: 'кость', by: { expr: '@действующий' } },
        { id: 'проверка', type: 'check', value: { expr: '@проверка_бросок' }, versus: { expr: '10' } }])),
      () => edit(d => setSteps(d, 'удар', steps('удар').map(step => (step.type === 'check' ? { ...step, versus: { expr: '@цель.класс_брони' } } : step)))),
    ],
    branch: () => edit(d => setSteps(d, 'удар', [...steps('удар'), { type: 'branch', if: { expr: '@проверка.success' } }, { type: 'end' }])),
    damage: [
      () => edit(d => setSteps(d, 'удар', beforeEnd(steps('удар'), { type: 'apply', target: { expr: '@действующий' } }))),
      () => edit(d => setSteps(d, 'удар', applied({ target: { expr: '@цель.хиты' } }))),
      () => edit(d => setSteps(d, 'удар', applied({ value: { expr: '5' } }))),
    ],
    problems: openProblems,
    heal: () => edit(d => {
      d.effects.лечение = { label: 'Лечение', params: structuredClone(seed.effects.удар!.params), steps: [
        { type: 'apply', target: { expr: '@действующий.хиты' }, direction: 'add', value: { expr: '3' } },
        { type: 'each', of: 'цели' }] as never };
    }),
  },
  tables: {
    block: [
      () => { edit(d => { d.blocks!.push({ name: 'Новый блок', parts: [] }); }); pick({ activeBlock: 'Новый блок' }); },
      () => { edit(d => { d.blocks!.find(one => one.name === 'Новый блок')!.name = 'Характеристики'; }); pick({ activeBlock: 'Характеристики' }); },
    ],
    table: [
      () => {
        edit(d => {
          d.tables!.таблица = { label: '', key: 'word', owner: 'sheet', rows: [{ value: '' }], columns: [{ key: 'value', label: 'Значение', kind: 'number' }] } as never;
          d.blocks!.find(one => one.name === 'Характеристики')!.parts.push({ table: 'таблица' });
        });
        pick({ activeSheetTable: 'таблица', activeBlock: null });
      },
      () => edit(d => { d.tables!.таблица!.label = 'Характеристики'; }),
    ],
    rows: [
      () => edit(d => { d.tables!.таблица!.rows = [{ value: 'сила' }]; }),
      () => edit(d => { d.tables!.таблица!.rows = [{ value: 'сила' }, { value: '' }]; }),
      () => edit(d => { d.tables!.таблица!.rows = [{ value: 'сила' }, { value: 'ловкость' }]; }),
    ],
    modifier: [
      () => press(findAnchor({ guide: 'add-column' })!),
      () => labelColumn('таблица', 'колонка', 'Модификатор'),
      () => edit(d => {
        const column = d.tables!.таблица!.columns!.find(c => c.key === 'колонка')!;
        delete (column as { kind?: string }).kind;
        (column as { expr?: unknown }).expr = { expr: 'округлить вниз((@строка.value - 10) / 2)' };
      }),
    ],
    sample: () => press(findAnchor({ text: 'образец листа' })!),
    armor: () => {
      act(() => { useWorld.getState().editColumn('лист', 'класс_брони', c => { c.expr = { expr: '10 + @таблица.ловкость.колонка' } as never; }); });
      pick({ activeFieldTag: 'класс_брони' });
    },
    problems: openProblems,
    skills: [
      () => { edit(d => { d.blocks!.push({ name: 'Новый блок', parts: [] }); }); pick({ activeBlock: 'Новый блок', activeFieldTag: null, activeSheetTable: null }); },
      () => { edit(d => { d.blocks!.find(one => one.name === 'Новый блок')!.name = 'Навыки'; }); pick({ activeBlock: 'Навыки' }); },
      () => {
        edit(d => {
          d.tables!.таблица_2 = { label: '', key: 'word', owner: 'sheet', rows: [{ value: '' }], columns: [{ key: 'value', label: 'Значение', kind: 'number' }] } as never;
          d.blocks!.find(one => one.name === 'Навыки')!.parts.push({ table: 'таблица_2' });
        });
        pick({ activeSheetTable: 'таблица_2', activeBlock: null });
      },
      () => edit(d => { d.tables!.таблица_2!.label = 'Навыки'; }),
      () => edit(d => { d.tables!.таблица_2!.rows = [{ value: 'атлетика' }]; }),
    ],
    link: [
      () => press(findAnchor({ guide: 'add-column' })!),
      () => labelColumn('таблица_2', 'колонка', 'Характеристика'),
      () => edit(d => {
        const column = d.tables!.таблица_2!.columns!.find(c => c.key === 'колонка')!;
        Object.assign(column, { kind: 'choice', from: 'таблица' });
      }),
    ],
    pick: () => edit(d => { d.tables!.таблица_2!.rows = [{ value: 'атлетика', cells: { колонка: 'сила' } }]; }),
    through: [
      () => press(findAnchor({ guide: 'add-column' })!),
      () => labelColumn('таблица_2', 'колонка_2', 'Итог'),
      () => edit(d => {
        const column = d.tables!.таблица_2!.columns!.find(c => c.key === 'колонка_2')!;
        delete (column as { kind?: string }).kind;
        (column as { expr?: unknown }).expr = { expr: '@строка.колонка.колонка + @строка.value' };
      }),
    ],
    save: () => edit(d => { d.tables!.таблица!.columns!.push({ key: 'колонка_3', label: 'Спасбросок', expr: { expr: '@строка.колонка' } } as never); }),
  },
  links: {
    called: [
      () => {
        edit(d => {
          d.effects.урон = {
            label: 'Новый эффект',
            params: [{ key: 'лист', label: 'Лист', kind: 'sheet' }, { key: 'amount', label: 'Сколько', kind: 'number', role: 'amount' }],
            steps: [{ type: 'apply', target: { expr: '@лист.хиты' }, value: { expr: '@amount' } } as never],
          };
        });
        pick({ activeEffectId: 'урон' });
      },
      () => edit(d => { d.effects.урон!.label = 'Урон'; }),
    ],
    target: () => edit(d => { d.effects.урон!.params![0]!.role = 'target'; }),
    returns: [
      () => press(findAnchor({ text: '+ итог' })!),
      () => edit(d => { d.effects.урон!.returns = [{ key: 'осталось', label: 'Осталось', kind: 'number', expr: { expr: '@лист.хиты' } }] as never; }),
    ],
    call: [
      () => { act(() => { fireEvent.change(findAnchor({ text: '+ шаг' })!, { target: { value: 'call:урон' } }); }); },
      () => edit(d => setSteps(d, 'удар', steps('удар').map(step => (step.type === 'emit' ? { ...step, effect: 'урон', args: { лист: { expr: '@цель' }, amount: { expr: '5' } } } : step)))),
    ],
    drop: () => edit(d => setSteps(d, 'удар', steps('удар').filter(step => step.type !== 'apply'))),
    name: () => edit(d => setSteps(d, 'удар', steps('удар').map(step => (step.type === 'emit' ? { ...step, id: 'урон' } : step)))),
    problems: openProblems,
    heal: () => edit(d => {
      d.effects.лечение = {
        label: 'Лечение',
        params: [{ key: 'лист', label: 'Лист', kind: 'sheet', role: 'target' }, { key: 'amount', label: 'Сколько', kind: 'number', role: 'amount' }],
        steps: [{ type: 'apply', target: { expr: '@лист.хиты' }, direction: 'add', value: { expr: '@amount' } } as never],
      };
      setSteps(d, 'удар', beforeEnd(beforeEnd(steps('удар'), { type: 'orElse' }), { type: 'emit', effect: 'лечение', args: { лист: { expr: '@цель' }, amount: { expr: '2' } } }));
    }),
  },
  items: {
    kind: [
      () => { edit(d => { d.tables!.kind = { shape: 'book', use: 'item', label: '', block: 'Снаряжение' } as never; }); pick({ activeRecordKind: 'kind' }); },
      () => edit(d => { d.tables!.kind!.label = 'Оружие'; }),
    ],
    param: [
      () => press(findAnchor({ text: '+ ещё одно' })!),
      () => edit(d => { d.effects.удар!.params!.splice(2, 1, { key: 'урон_оружия', label: 'Урон оружия', kind: 'number' }); }),
      () => edit(d => setSteps(d, 'удар', steps('удар').map(step => (step.type === 'apply' ? { ...step, value: { expr: '@урон_оружия' } } : step)))),
    ],
    given: () => edit(d => { d.grants = []; }),
    button: [
      () => press(findAnchor({ text: '+ кнопка' })!),
      () => {
        edit(d => {
          const kind = d.tables!.kind!;
          kind.bindings = [{ effect: 'удар', label: 'Удар', args: { урон_оружия: { expr: '@урон_оружия' } } }] as never;
          kind.columns = [{ key: 'урон_оружия', label: 'Урон оружия', kind: 'number' }];
        });
        pick({ activeRecordKind: 'kind' });
      },
    ],
    modifier: [
      () => press(findAnchor({ text: '+ правит поле' })!),
      () => edit(d => { d.tables!.kind!.modifiers = [{ kind: 'value', target: 'класс_брони', op: 'add', value: { expr: '1' } }] as never; }),
    ],
    problems: openProblems,
    armor: () => edit(d => { d.tables!.kind_2 = { shape: 'book', use: 'item', label: 'Броня', modifiers: [{ kind: 'value', target: 'класс_брони', op: 'add', value: { expr: '2' } }] } as never; }),
  },
  tags: {
    tag: [
      () => pick({ activeEffectId: 'сырость' }),
      () => edit(d => { d.effects.сырость!.tags = ['гасит огонь']; }),
    ],
    when: [
      () => pick({ activeEffectId: 'горение' }),
      () => edit(d => { d.effects.горение!.on = [{ on: '' }]; }),
      () => edit(d => { d.effects.горение!.on = [{ on: 'gained:' }]; }),
      () => edit(d => { d.effects.горение!.on = [{ on: 'gained:гасит огонь' }]; }),
    ],
    who: () => edit(d => { d.effects.горение!.on![0]!.if = { expr: '@лист == @носитель' }; }),
    remove: [
      () => edit(d => { d.effects.горение!.on![0]!.steps = [{ type: 'apply' }]; }),
      () => edit(d => { d.effects.горение!.on![0]!.steps = [{ type: 'status' }]; }),
      () => edit(d => { d.effects.горение!.on![0]!.steps = [{ type: 'status', mode: 'remove' }]; }),
      () => edit(d => { d.effects.горение!.on![0]!.steps = [{ type: 'status', mode: 'remove', effect: 'горение', to: { expr: '@лист' } }]; }),
    ],
    seen: [
      () => pick({ activeEffectId: 'удача' }),
      () => edit(d => { d.effects.удача!.on = [{ on: '' }]; }),
      () => edit(d => { d.effects.удача!.on = [{ on: 'seen' }]; }),
      () => edit(d => { d.effects.удача!.on = [{ on: 'seen', notTags: ['защита'] }]; }),
    ],
    plus: () => edit(d => { d.effects.удача!.on![0]!.steps = [{ type: 'roll-plus', value: { expr: '1' } }]; }),
    problems: openProblems,
    clear: () => edit(d => {
      d.effects.холод!.tags = ['стужа'];
      d.effects.иней!.tags = ['стужа'];
      d.effects.согреться!.steps = [{ type: 'status', mode: 'remove', by: 'tag', effect: 'стужа', to: { expr: '@действующий' } }] as never;
    }),
  },
  spells: {
    open: () => pick({ activeRecordKind: 'заклинание' }),
    cast: [
      () => edit(d => { d.tables!.заклинание!.bindings = [{ effect: '', label: '' }] as never; }),
      () => edit(d => { d.tables!.заклинание!.bindings = [{ effect: 'сотворить', label: 'Сотворить', args: { срок: { expr: '@срок' } } }] as never; }),
    ],
    stop: [
      () => edit(d => { d.tables!.заклинание!.bindings!.push({ effect: '', label: '' } as never); }),
      () => edit(d => { d.tables!.заклинание!.bindings![1] = { effect: 'прекращение', label: 'Прекратить' } as never; }),
    ],
    if: () => edit(d => { d.tables!.заклинание!.bindings![1]!.if = { expr: '@срок.держится' }; }),
    bond: [
      () => pick({ activeEffectId: 'сотворить' }),
      () => edit(d => { d.effects.сотворить!.bond = { effect: 'поддержание', by: 'колдун' }; }),
    ],
    many: () => edit(d => { d.effects.сотворить!.bond!.many = true; }),
    problems: openProblems,
    term: () => edit(d => { d.tables!.сроки!.rows!.push({ value: 'час', label: 'Час', cells: { держится: true } }); }),
  },
  templates: {
    open: () => pick({ activeSheetKind: 'по_заготовке' }),
    target: [
      () => edit(d => { d.sheets!.по_заготовке!.modifiers = [{ kind: 'value', target: 'акт', op: 'add', value: { expr: '1' } }] as never; }),
      () => edit(d => { (d.sheets!.по_заготовке!.modifiers![0] as { target: string }).target = 'cell:навыки.*.ранг'; }),
    ],
    op: () => edit(d => { (d.sheets!.по_заготовке!.modifiers![0] as { op: string }).op = 'set'; }),
    value: () => edit(d => { (d.sheets!.по_заготовке!.modifiers![0] as { value: unknown }).value = { expr: '@заготовка.[@строка]' }; }),
    when: () => edit(d => { (d.sheets!.по_заготовке!.modifiers![0] as { if: unknown }).if = { expr: 'не пусто(@заготовка)' }; }),
    problems: openProblems,
    more: () => edit(d => { d.tables!.заготовки!.rows!.push({ value: 'разведчик', label: 'Разведчик', cells: { ближний_бой: 2, стрельба: 3 } }); }),
  },
  combat: {
    if: [
      () => pick({ activeEffectId: 'удар' }),
      () => edit(d => setSteps(d, 'удар', [{ type: 'branch' }, { type: 'end' }])),
      () => edit(d => setSteps(d, 'удар', [{ type: 'branch', if: { expr: '@стол.бой' } }, { type: 'end' }])),
    ],
    spend: [
      () => edit(d => setSteps(d, 'удар', beforeEnd(steps('удар'), { type: 'apply', target: { expr: '@действующий' } }))),
      () => edit(d => setSteps(d, 'удар', applied({ target: { expr: '@действующий.действий_осталось' }, value: { expr: '1' } }))),
    ],
    problems: openProblems,
    refuse: () => edit(d => setSteps(d, 'удар', [
      { type: 'branch', if: { expr: '@стол.бой и @действующий.действий_осталось < 1' } },
      { type: 'stop' },
      { type: 'end' },
      ...steps('удар'),
    ])),
  },
};

const takePiece = (id: string) => {
  const piece = PIECES.find(one => one.id === id)!;
  act(() => { bring(`«${piece.label}»`, current => bringPiece(current, piece)); });
};
const dropField = (tag: string) => edit(d => {
  for (const table of Object.values(d.tables ?? {})) table.columns = (table.columns ?? []).filter(column => column.key !== tag);
  for (const block of d.blocks ?? []) for (const part of block.parts) if (part.columns) part.columns = part.columns.filter(key => key !== tag);
});
const takeEffect = (key: string) => {
  const donor = (SAMPLE_SYSTEMS as System[]).find(one => one.id === 'dnd5e')!;
  act(() => { bring('«Отход»', current => bringIn(current, donor, [{ kind: 'effect', key }])); });
};

const start = async (id: string) => {
  await act(async () => { expect(await useGuide.getState().start(id)).toBe(true); });
};

const card = (): HTMLElement => screen.getByRole('region', { name: 'Урок' });
const cardText = (): string => (card().textContent ?? '').replace(/\s+/g, ' ');

const realWorld = (): System => ({ ...emptySystem(), name: 'Моя система', tables: { лист: { shape: 'single', columns: [{ key: 'сила', label: 'Сила', kind: 'number' }] } } } as System);

const reset = () => {
  try { localStorage.clear(); } catch { return; }
  useGuide.setState({ lesson: null, step: 0, folded: false, note: null, started: {} });
  useWorld.getState().replaceWorld({ system: realWorld(), compendium: { records: [] }, sheets: [] });
  useWorld.setState({ origin: { mode: 'system' }, activeTab: 'sheet' });
};

describe('уроки конструктора', () => {
  beforeEach(reset);
  afterEach(() => { if (openedDialog('Проблемы системы')) toggleProblems(); cleanup(); vi.useRealTimers(); });

  it('сид урока проходит схему и линт без ошибок', () => {
    for (const lesson of LESSONS) {
      const parsed = W.system.safeParse(lesson.seed);
      expect(parsed.success, `${lesson.id}: ${parsed.success ? '' : parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')}`).toBe(true);
      expect(errorsOf(lesson.seed), lesson.id).toBe(0);
    }
  });

  for (const lesson of LESSONS) {
    it(`${lesson.title}: на каждом шаге якорь на экране, решение шага засчитывается`, { timeout: 60000 }, async () => {
      mount();
      await start(lesson.id);
      for (const [index, step] of lesson.steps.entries()) {
        act(() => { useGuide.getState().go(index); });
        if (step.tab) pick({ activeTab: step.tab });
        openAll();
        const solve = SOLVE[lesson.id]?.[step.id];
        const parts = Array.isArray(solve) ? solve : [];
        for (const [at, move] of movesOf(step).entries()) {
          expect(moveAt(step, view!), `${lesson.id}/${step.id}: ход ${at + 1} — рамка не на нём`).toBe(at);
          for (let k = 0; k < 4 && !firstOf(move.at) && step.via; k++) {
            const via = firstOf(step.via);
            expect(via, `${lesson.id}/${step.id}: нет «${JSON.stringify(step.via)}»`).not.toBeNull();
            press(via!);
          }
          expect(firstOf(move.at), `${lesson.id}/${step.id}: ход ${at + 1}, нет якоря ${JSON.stringify(move.at)}`).not.toBeNull();
          parts[at]?.();
          openAll();
          if (move.done) expect(move.done(view!), `${lesson.id}/${step.id}: ход ${at + 1} не засчитан`).toBe(true);
        }
        if (typeof solve === 'function') solve();
        openAll();
        if (step.done) expect(step.done(view!), `${lesson.id}/${step.id}: решение не засчитано ${problemsOf()}`).toBe(true);
      }
      expect(errorsOf(useWorld.getState().system), `${lesson.id}: итог с ошибками`).toBe(0);
    });
  }

  it('урок 1 проходится кликами: шаги засчитываются сами, ловушка видна, итог равен сиду; выйти и продолжить с места', { timeout: 120000 }, async () => {
    vi.useFakeTimers();
    mount();
    await start('first-system');
    const lesson = lessonOf('first-system')!;
    const ui = within();
    const at = () => lesson.steps[useGuide.getState().step]!.id;
    const settleCard = async () => {
      await act(async () => { vi.advanceTimersByTime(300); });
      await act(async () => { vi.advanceTimersByTime(PAUSE_MS + 100); });
    };
    const pass = async (id: string, run: () => void) => {
      expect(at()).toBe(id);
      run();
      await settleCard();
      expect(at(), `шаг «${id}» не засчитался`).not.toBe(id);
    };
    const next = (id: string) => {
      expect(at()).toBe(id);
      act(() => { fireEvent.click(within(card()).button('Дальше')); });
    };
    const closing = async (id: string, run: () => void, said: string) => {
      expect(at()).toBe(id);
      run();
      await settleCard();
      expect(at(), `глава не должна уходить сама на «${id}»`).toBe(id);
      expect(cardText()).toContain(said);
      expect(cardText()).toContain('Глава «');
      next(id);
    };
    const inBar = (box: HTMLElement, text: string) => {
      act(() => { fireEvent.click(box.querySelector('.formula-field') ?? box); });
      const chips = document.querySelector('.formula-bar .chips')!;
      act(() => { for (const x of [...chips.querySelectorAll<HTMLElement>('.chips__x')].reverse()) fireEvent.mouseDown(x); });
      const inputs = [...document.querySelectorAll<HTMLInputElement>('.formula-bar input.chips__text')];
      act(() => {
        for (const other of inputs.slice(1)) fireEvent.change(other, { target: { value: '' } });
        fireEvent.change(inputs[0]!, { target: { value: text } });
        fireEvent.keyDown(inputs[0]!, { key: 'Enter' });
      });
      openAll();
    };
    const clickAt = (anchor: Parameters<typeof findAnchor>[0]) => {
      const el = findAnchor(anchor);
      expect(el, JSON.stringify(anchor)).not.toBeNull();
      press(el!);
    };

    openAll();
    expect(cardText()).toContain('глава 1 из 4 · шаг 1 из 5');
    await pass('block', () => {
      ui.click('блоки и типы листов');
      expect(pointOf(lesson.steps[0]!, 'sheet').target).toBe(findAnchor({ text: '+ блок', in: 'Листы' }));
      ui.click('+ блок');
      expect(pointOf(lesson.steps[0]!, 'sheet').target).toBe(screen.getByPlaceholderText('как зовётся блок'));
      ui.type(screen.getByPlaceholderText('как зовётся блок'), 'Бой');
    });
    await pass('hp', () => {
      clickAt({ text: '+ поле', in: 'Листы' });
      expect(pointOf(lesson.steps[1]!, 'sheet').target).toBe(screen.getByPlaceholderText('как зовётся поле'));
      ui.type(screen.getByPlaceholderText('как зовётся поле'), 'Хиты');
    });
    await pass('hp-start', () => { ui.type('В новом листе', '10'); });
    await pass('hp-min', () => { inBar(ui.field('Не ниже'), '0'); });
    await closing('ac', () => {
      clickAt({ text: 'Бой', in: 'Листы' });
      clickAt({ text: '+ поле', in: 'Листы' });
      ui.type(screen.getByPlaceholderText('как зовётся поле'), 'Класс брони');
      ui.type('В новом листе', '12');
    }, 'Класс брони: в новом листе 12');
    expect(cardText()).toContain(`Откройте вкладку «${TABS.rules}»`);
    await pass('die', () => {
      ui.click(TABS.rules);
      openAll();
      clickAt({ text: 'Кости', in: 'Разделы правил' });
      ui.click('+ кость');
      ui.type(screen.getByPlaceholderText('название кости'), 'Кость проверки');
    });
    await pass('strike', () => {
      ui.click(TABS.effects);
      openAll();
      clickAt({ text: '+ кнопкой', in: 'Библиотека эффектов' });
      ui.type(screen.getByPlaceholderText('как зовётся эффект'), 'Удар');
    });
    await pass('everyone', () => {
      if (!ui.has('свернуть свойства')) ui.click('свойства');
      ui.select('У кого есть', 'all');
    });
    await pass('targets', () => {
      ui.click('+ ещё одно');
      ui.type(ui.cell('Название', 1), 'Цели');
      ui.select(ui.cell('Вид', 1), 'sheet+many');
      ui.type(ui.cell('Каждый', 1), 'Цель');
    });
    await closing('each', () => { ui.click('+ для каждого из списка'); }, 'по каждой цели');
    await pass('check', () => {
      ui.click('+ проверка');
      inBar(within(stepCard(/^2 · /)).field('Проверка'), '@проверка_бросок >= @цель.класс_брони');
    });
    await pass('branch', () => { within(stepCard(/^2 · /)).click('+ по итогу'); });
    addToArm(block(0), 0, 'change');
    const change = () => stepCard(/^3 · /);
    within(change()).select('Какое поле', 'хиты');
    await act(async () => { vi.advanceTimersByTime(300); });
    expect(cardText()).toContain('В «У кого» стоит «Кто действует» — удар ранит самого героя');
    await pass('damage', () => {
      within(change()).select('У кого', 'цель');
      inBar(within(change()).field('Сколько'), '5');
    });
    expect(cardText()).not.toContain('удар ранит самого героя');
    await pass('problems', () => { clickAt({ guide: 'problems' }); });
    clickAt({ text: 'Проба' });
    expect(cardText()).toContain('Глава «Проверка и урон»');
    next('trial');
    expect(at()).toBe('heal');
    expect(cardText()).toContain('Сами:');

    const { name: _built, ...built } = useWorld.getState().system;
    const { name: _seed, ...wanted } = seed;
    expect(built).toEqual(wanted);

    await act(async () => { fireEvent.click(within(card()).button('Выйти из урока')); });
    expect(useGuide.getState().lesson).toBeNull();
    expect(useWorld.getState().system).toEqual(realWorld());
    expect(useGuide.getState().started['first-system']).toBe(lesson.steps.length - 1);

    await start('first-system');
    expect(at()).toBe('heal');
    expect(useWorld.getState().system.effects.удар).toEqual(seed.effects.удар);
    (SOLVE['first-system']!.heal as () => void)();
    await settleCard();
    expect(cardText()).toContain('«Лечение»: +3 хита своему листу');
    await act(async () => { fireEvent.click(within(card()).button('Завершить урок')); });
    expect(useGuide.getState().lesson).toBeNull();
    expect(useGuide.getState().passed).toContain('first-system');
    expect(useGuide.getState().started['first-system']).toBeUndefined();
    expect(useWorld.getState().system).toEqual(realWorld());
    expect(useWorld.getState().origin.lesson).toBeUndefined();
  });

  it('урок — данные: главы по 3–5 шагов (кроме задания), последний шаг — задание без подсветки, у засчитываемых шагов итог словами', () => {
    for (const lesson of LESSONS) {
      const titles = lesson.chapters.map(chapter => chapter.title);
      expect(lesson.steps.every(step => titles.includes(step.chapter)), lesson.id).toBe(true);
      const order = lesson.steps.map(step => titles.indexOf(step.chapter));
      expect(order, lesson.id).toEqual([...order].sort((a, b) => a - b));
      for (const chapter of lesson.chapters) {
        const count = lesson.steps.filter(step => step.chapter === chapter.title).length;
        const alone = lesson.steps.filter(step => step.chapter === chapter.title).every(step => step.alone);
        expect(alone ? count : count >= 3 && count <= 5 ? count : -count, `${lesson.id} · ${chapter.title}`).toBeGreaterThan(0);
      }
      const last = lesson.steps.at(-1)!;
      expect(last.alone && last.done && !last.at && !last.via, lesson.id).toBeTruthy();
      expect(lesson.steps.filter(step => step.done && !step.result).map(step => step.id), lesson.id).toEqual([]);
    }
  });

  it('«Выйти из урока» возвращает настоящий мир и вкладку', async () => {
    useWorld.setState({ activeTab: 'records' });
    mount();
    await start('tables');
    expect(useWorld.getState().system.name).toBe(seed.name);
    expect(useWorld.getState().activeTab).toBe('sheet');
    expect(useWorld.getState().origin).toEqual({ mode: 'system', systemTitle: 'Таблицы', lesson: 'tables' });
    await act(async () => { fireEvent.click(within(card()).button('Выйти из урока')); });
    expect(useGuide.getState().lesson).toBeNull();
    expect(useWorld.getState().system).toEqual(realWorld());
    expect(useWorld.getState().activeTab).toBe('records');
    expect(screen.queryByRole('region', { name: 'Урок' })).toBeNull();
  });

  it('уже сделанное при входе в шаг не проскакивает: «уже сделано» и ждёт «Дальше»', async () => {
    vi.useFakeTimers();
    mount();
    await start('first-system');
    edit(d => { d.blocks = [{ name: 'Бой', parts: [] }]; addColumn(d, { key: 'хиты', label: 'Хиты', kind: 'number' }, 'sheet', 'Бой'); });
    act(() => { useGuide.getState().go(1); });
    await act(async () => { vi.advanceTimersByTime(PAUSE_MS * 3); });
    expect(useGuide.getState().step).toBe(1);
    expect(cardText()).toContain('уже сделано');
    act(() => { fireEvent.click(within(card()).button('Дальше')); });
    expect(useGuide.getState().step).toBe(2);
  });

  it('шаг с условием без решения не даёт «Дальше», «Назад» показывает прежний шаг с «Дальше»', async () => {
    mount();
    await start('first-system');
    act(() => { useGuide.getState().go(1); });
    expect(within(card()).has('Дальше')).toBe(false);
    act(() => { fireEvent.click(within(card()).button('Назад')); });
    expect(useGuide.getState().step).toBe(0);
    expect(within(card()).has('Дальше')).toBe(true);
  });

  it('«Опубликовать» в уроке выключена', async () => {
    mount();
    await start('items');
    expect((screen.getByText('Опубликовать') as HTMLButtonElement).disabled).toBe(true);
  });

  it('окошко сворачивается в полоску и разворачивается из неё', async () => {
    mount();
    await start('items');
    act(() => { fireEvent.click(within(card()).button('свернуть')); });
    expect(cardText()).toBe('Урок · Тип вещи · шаг 1 из 3');
    act(() => { fireEvent.click(within(card()).button('Урок · Тип вещи · шаг 1 из 3')); });
    expect(cardText()).toContain('глава 1 из 3 · шаг 1 из 3');
  });
});
