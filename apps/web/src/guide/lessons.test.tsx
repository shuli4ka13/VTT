// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { render, cleanup, act, fireEvent, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { world as W } from '@vtt/schema';
import type { System, Step as EffectStep } from '@vtt/schema';
import { useWorld, emptySystem } from '../store/world.ts';
import { useGuide } from '../store/guide.ts';
import { useOpened } from '../store/opened.ts';
import { useFormulaBar } from '../store/formula-bar.ts';
import { SystemBar } from '../screens/constructor/world-bar.tsx';
import { ConstructorScreen } from '../screens/constructor/constructor.tsx';
import { addColumn } from '../screens/constructor/rules/character-section.tsx';
import { openAll } from '../testing/render-open.tsx';
import { within, stepCard, block, addToArm, pickCombo, comboOptions } from '../testing/cards.ts';
import { TABS } from '../words.ts';
import { GuideLayer, PAUSE_MS, useView, movesOf, moveAt, pointOf } from './guide-card.tsx';
import { LESSONS, lessonOf } from './lessons/index.ts';
import { findAnchor, firstOf, openedDialog } from './anchor.ts';
import { compile, bringIn, lintSystem, flattenSystem, labelBlock } from '@vtt/engine';
import { FORBIDDEN_STEMS } from '../words.ts';
import { errorsOf } from './find.ts';
import { bring } from '../store/fresh.ts';
import { PIECES, bringPiece, SAMPLE_SYSTEMS } from '@vtt/engine/samples';
import type { View, Lesson, Step as LessonStep } from './types.ts';
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
const openPanels = () => {
  for (let pass = 0; pass < 4; pass++) {
    const closed = [...document.querySelectorAll<HTMLElement>('[aria-label^="развернуть «"]')];
    if (!closed.length) return;
    closed.forEach(button => fireEvent.click(button));
  }
};
const press = (el: HTMLElement) => {
  const target = el.matches('button, select, summary, [role="button"], [role="tab"]') ? el : el.querySelector<HTMLElement>('button, summary, [role="button"]') ?? el;
  act(() => { fireEvent.click(target); });
  openPanels();
};
const problemsOf = () => lintSystem(flattenSystem(useWorld.getState().system, true)).filter(p => p.level === 'error').map(p => p.text).join(' | ');
const flat = (text: string): string => text.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
const screenText = (): string => {
  const root = document.body.cloneNode(true) as HTMLElement;
  root.querySelectorAll('.guide').forEach(node => node.remove());
  const attrs = [...root.querySelectorAll('[placeholder], [title], [aria-label], [data-options]')]
    .flatMap(el => ['placeholder', 'title', 'aria-label', 'data-options'].map(name => el.getAttribute(name) ?? ''));
  const words: string[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) words.push(node.textContent ?? '');
  return flat([...words, ...attrs].join(' '));
};
const escaped = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const stemOf = (word: string): string => (word.length >= 7 ? word.slice(0, -2) : word.length >= 4 ? word.slice(0, -1) : word);
const said = (haystack: string, phrase: string): boolean => {
  const pieces = flat(phrase).match(/[\p{L}\d]+|[^\p{L}\d\s]+/gu) ?? [];
  const pattern = pieces.map(piece => (/\p{L}/u.test(piece) ? `(?<![\\p{L}\\d])${escaped(stemOf(piece))}\\p{L}*` : escaped(piece))).join('\\s*');
  return new RegExp(pattern, 'u').test(haystack);
};
const typedByAuthor = (phrase: string): boolean => /^[\d\s.,+\-*/()@<>=]*$/.test(phrase) || phrase.startsWith('@') || /[()]/.test(phrase) || phrase === 'Enter';
const phrasesIn = (...texts: (string | undefined)[]): string[] =>
  texts.flatMap(text => [...(text ?? '').matchAll(/«([^«»]*)»/g)].map(found => found[1]!.trim())).filter(phrase => /\p{L}|\d|\+/u.test(phrase));
const spokenPhrases = (lesson: Lesson, step: LessonStep): string[] =>
  phrasesIn(step.say, step.lead, step.hint, step.goal, lesson.steps[0] === step ? lesson.start : undefined, ...(step.traps ?? []).map(trap => trap.say));

const SCREEN_EXCEPTIONS: Record<string, string> = {
  'first-system/problems/Открыть': 'кнопка рядом с ошибкой: в чистой системе ошибок нет',
  'links/apply/в этом эффекте': 'название группы подсказки строки формул: список строится по набранному, тест вводит формулу мимо поля',
  'links/heal/прибавить': 'задание «Сами»: вариант «Как» живёт в шаге нового эффекта, которого к началу ещё нет',
  'tags/clear/снимаем': 'задание «Сами»: вариант шага «состояние» живёт в шаге, которого к началу ещё нет',
  'tags/clear/все эффекты с меткой': 'задание «Сами»: вариант шага «состояние» живёт в шаге, которого к началу ещё нет',
  'tables/block/сила': 'название строки, которую автор впишет на шаге «Строки»',
  'tables/block/ловкость': 'название строки, которую автор впишет на шаге «Строки»',
  'tables/through/Характеристика → Модификатор': 'пункт подсказки строки формул: список строится по набранному, тест вводит формулу мимо поля',
  'spells/if/Срок → Держится': 'пункт подсказки «Только если»: список строится по набранному',
  'templates/when/частых условиях': 'название группы подсказки строки формул, список строится по набранному',
  'items/armor/Автор книги': 'роль на экране входа: другой экран, сверено с screens/gate/gate.tsx',
  'items/armor/Завести запись': 'кнопка экрана компендиума: другой экран, сверено с screens/compendium/compendium.tsx',
  'ready/other/Счётчики здоровья и оглушения': 'кусок виден после раскрытия системы Shadowrun в «Готовое из образцов»',
};
const spoken = { total: 0 };
const toggleProblems = () => { act(() => { fireEvent.click(findAnchor({ guide: 'problems' })!.querySelector('button')!); }); };
const openProblems = () => { if (!openedDialog('Проблемы системы')) toggleProblems(); };

let bars = 0;
const openBar = (value: string) => act(() => { useFormulaBar.getState().open({ id: `урок-${++bars}`, where: 'урок', value, system: useWorld.getState().system }); });
const typeBar = (text: string) => act(() => { useFormulaBar.getState().write(text); });

const chooseDice = (mode: string) => {
  const box = [...document.querySelectorAll<HTMLElement>('[role="combobox"]')].find(el => comboOptions(el).some(option => option.value === mode));
  pickCombo(box!, mode);
};

const SOLVE_READY: Record<string, (() => void) | (() => void)[]> = {
  take: () => takePiece('d20-abilities'),
  drop: [() => pick({ activeFieldTag: 'inspiration' }), () => press(findAnchor({ text: 'Удалить' })!), () => dropField('inspiration')],
  problems: () => openProblems(),
  seen: () => press(findAnchor({ text: 'что пришло' })!),
  effect: [() => {}, () => press(findAnchor({ text: 'Отдельные эффекты' })!), () => takeEffect('disengage')],
  came: () => press(findAnchor({ text: 'что пришло' })!),
  'problems-effect': () => openProblems(),
  other: () => { takePiece('sr-tracks'); dropField('wound_mod'); },
};

const SOLVE: Record<string, Record<string, (() => void) | (() => void)[]>> = {
  ready: SOLVE_READY,
  'first-system': {
    block: [
      () => press(findAnchor({ text: 'блоки и типы листов' })!),
      () => { edit(d => { (d.blocks ??= []).push({ key: 'новый_блок', label: 'Новый блок', parts: [] }); }); pick({ activeBlock: 'новый_блок' }); },
      () => { edit(d => { labelBlock(d, 'новый_блок', 'Бой'); }); pick({ activeBlock: 'новый_блок' }); },
    ],
    hp: [
      () => { edit(d => addColumn(d, { key: 'хиты', label: 'Новое поле', kind: 'number' }, 'sheet', 'новый_блок')); pick({ activeFieldTag: 'хиты', activeBlock: null }); },
      () => act(() => { useWorld.getState().editColumn('лист', 'хиты', c => { c.label = 'Хиты'; }); }),
    ],
    'hp-start': () => act(() => { useWorld.getState().editColumn('лист', 'хиты', c => { c.default = 10; }); }),
    'hp-min': [
      () => { openBar(''); typeBar('0'); },
      () => act(() => { useWorld.getState().editColumn('лист', 'хиты', c => { c.min = 0; }); }),
    ],
    ac: [
      () => { edit(d => addColumn(d, { key: 'класс_брони', label: 'Новое поле', kind: 'number' }, 'sheet', 'новый_блок')); pick({ activeFieldTag: 'класс_брони', activeBlock: null }); },
      () => act(() => { useWorld.getState().editColumn('лист', 'класс_брони', c => { c.label = 'Класс брони'; }); }),
      () => { act(() => { useWorld.getState().editColumn('лист', 'класс_брони', c => { c.default = 12; }); }); pick({ activeFieldTag: null, activeBlock: null }); },
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
    everyone: [
      () => press(findAnchor({ text: 'блоки и типы листов' })!),
      () => press(findAnchor({ text: 'все блоки', in: 'Листы' })!),
      () => edit(d => { d.grants = ['удар']; }),
    ],
    targets: [
      () => press(findAnchor({ text: '+ ещё одно' })!),
      () => edit(d => { Object.assign(d.effects.удар!.params![1]!, { label: 'Цели', kind: 'sheet', many: true, item: { key: 'каждый', label: 'Каждый' } }); }),
      () => edit(d => { d.effects.удар!.params![1] = { key: 'цели', label: 'Цели', kind: 'sheet', many: true, item: { key: 'цель', label: 'Цель' } } as never; }),
    ],
    each: () => edit(d => setSteps(d, 'удар', [{ type: 'each', of: 'цели' }])),
    check: [
      () => edit(d => setSteps(d, 'удар', [...steps('удар'),
        { id: 'бросок', type: 'roll', die: 'кость', by: { expr: '@действующий' } }])),
      () => edit(d => setSteps(d, 'удар', [...steps('удар'),
        { id: 'проверка', type: 'check', value: { expr: '@бросок' }, versus: { expr: '10' } }])),
      () => openBar('10'),
      () => typeBar('@цель.класс_брони'),
      () => edit(d => setSteps(d, 'удар', steps('удар').map(step => (step.type === 'check' ? { ...step, versus: { expr: '@цель.класс_брони' } } : step)))),
    ],
    branch: () => edit(d => setSteps(d, 'удар', [...steps('удар'), { type: 'branch', if: { expr: '@проверка.success' } }, { type: 'end' }])),
    damage: [
      () => edit(d => setSteps(d, 'удар', beforeEnd(steps('удар'), { type: 'apply' }))),
      () => edit(d => setSteps(d, 'удар', applied({ target: { expr: '@цель.хиты' } }))),
      () => { openBar(''); typeBar('5'); },
      () => edit(d => setSteps(d, 'удар', applied({ value: { expr: '5' } }))),
    ],
    problems: openProblems,
    trial: [
      () => press(findAnchor({ text: 'Проба' })!),
      () => chooseDice('max'),
    ],
    heal: () => edit(d => {
      d.effects.лечение = { label: 'Лечение', params: structuredClone(seed.effects.удар!.params), steps: [
        { type: 'apply', target: { expr: '@действующий.хиты' }, direction: 'add', value: { expr: '3' } },
        { type: 'each', of: 'цели' }] as never };
    }),
  },
  tables: {
    block: [
      () => press(findAnchor({ text: 'блоки и типы листов' })!),
      () => { edit(d => { d.blocks!.push({ key: 'новый_блок_2', label: 'Новый блок', parts: [] }); }); pick({ activeBlock: 'новый_блок_2' }); },
      () => { edit(d => { labelBlock(d, 'новый_блок_2', 'Характеристики'); }); pick({ activeBlock: 'новый_блок_2' }); },
    ],
    table: [
      () => {
        edit(d => {
          d.tables!.таблица = { label: '', key: 'word', owner: 'sheet', rows: [{ value: '' }], columns: [{ key: 'value', label: 'Значение', kind: 'number' }] } as never;
          d.blocks!.find(one => one.key === 'новый_блок_2')!.parts.push({ table: 'таблица' });
        });
        pick({ activeSheetTable: 'таблица', activeBlock: null });
      },
      () => edit(d => { d.tables!.таблица!.label = 'Характеристики'; }),
    ],
    rows: [
      () => {},
      () => edit(d => { d.tables!.таблица!.rows = [{ value: 'сила' }]; }),
      () => edit(d => { d.tables!.таблица!.rows = [{ value: 'сила' }, { value: '' }]; }),
      () => edit(d => { d.tables!.таблица!.rows = [{ value: 'сила' }, { value: 'ловкость' }]; }),
    ],
    modifier: [
      () => {},
      () => press(findAnchor({ guide: 'add-column' })!),
      () => labelColumn('таблица', 'колонка', 'Модификатор'),
      () => { openBar(''); typeBar('floor(('); },
      () => typeBar('floor((@row.value'),
      () => typeBar('floor((@row.value - 10) / 2)'),
      () => edit(d => {
        const column = d.tables!.таблица!.columns!.find(c => c.key === 'колонка')!;
        delete (column as { kind?: string }).kind;
        (column as { expr?: unknown }).expr = { expr: 'floor((@row.value - 10) / 2)' };
      }),
    ],
    sample: () => press(findAnchor({ text: 'образец листа' })!),
    armor: [
      () => { pick({ activeFieldTag: 'класс_брони' }); openBar(''); typeBar('10 + '); },
      () => typeBar('10 + @таблица.ловкость.колонка'),
      () => act(() => { useWorld.getState().editColumn('лист', 'класс_брони', c => { c.expr = { expr: '10 + @таблица.ловкость.колонка' } as never; }); }),
    ],
    problems: openProblems,
    skills: [
      () => press(findAnchor({ text: 'блоки и типы листов' })!),
      () => { edit(d => { d.blocks!.push({ key: 'новый_блок_3', label: 'Новый блок', parts: [] }); }); pick({ activeBlock: 'новый_блок_3', activeFieldTag: null, activeSheetTable: null }); },
      () => { edit(d => { labelBlock(d, 'новый_блок_3', 'Навыки'); }); pick({ activeBlock: 'новый_блок_3' }); },
      () => {
        edit(d => {
          d.tables!.таблица_2 = { label: '', key: 'word', owner: 'sheet', rows: [{ value: '' }], columns: [{ key: 'value', label: 'Значение', kind: 'number' }] } as never;
          d.blocks!.find(one => one.key === 'новый_блок_3')!.parts.push({ table: 'таблица_2' });
        });
        pick({ activeSheetTable: 'таблица_2', activeBlock: null });
      },
      () => edit(d => { d.tables!.таблица_2!.label = 'Навыки'; }),
      () => edit(d => { d.tables!.таблица_2!.rows = [{ value: 'атлетика' }]; }),
    ],
    link: [
      () => {},
      () => press(findAnchor({ guide: 'add-column' })!),
      () => labelColumn('таблица_2', 'колонка', 'Характеристика'),
      () => edit(d => { Object.assign(d.tables!.таблица_2!.columns!.find(c => c.key === 'колонка')!, { kind: 'choice' }); }),
      () => edit(d => { Object.assign(d.tables!.таблица_2!.columns!.find(c => c.key === 'колонка')!, { from: 'таблица' }); }),
    ],
    pick: () => edit(d => { d.tables!.таблица_2!.rows = [{ value: 'атлетика', cells: { колонка: 'сила' } }]; }),
    through: [
      () => {},
      () => press(findAnchor({ guide: 'add-column' })!),
      () => labelColumn('таблица_2', 'колонка_2', 'Итог'),
      () => openBar(''),
      () => typeBar('@row.колонка.колонка'),
      () => typeBar('@row.колонка.колонка + '),
      () => typeBar('@row.колонка.колонка + @row.value'),
      () => edit(d => {
        const column = d.tables!.таблица_2!.columns!.find(c => c.key === 'колонка_2')!;
        delete (column as { kind?: string }).kind;
        (column as { expr?: unknown }).expr = { expr: '@row.колонка.колонка + @row.value' };
      }),
    ],
    save: () => edit(d => { d.tables!.таблица!.columns!.push({ key: 'колонка_3', label: 'Спасбросок', expr: { expr: '@row.колонка' } } as never); }),
  },
  links: {
    called: [
      () => {
        edit(d => {
          d.effects.урон = {
            label: 'Новый эффект',
            params: [{ key: 'действующий', label: 'Кто действует', kind: 'sheet' }],
            steps: [],
          };
        });
        pick({ activeEffectId: 'урон' });
      },
      () => edit(d => { d.effects.урон!.label = 'Урон'; }),
    ],
    amount: [
      () => press(findAnchor({ text: '+ ещё одно' })!),
      () => edit(d => { d.effects.урон!.params!.splice(1, 1, { key: 'amount', label: 'Сколько', kind: 'number' }); }),
      () => edit(d => { d.effects.урон!.params![1]!.role = 'amount'; }),
    ],
    target: [
      () => {
        const item = [...document.querySelectorAll<HTMLElement>('.param-item')].find(one => one.querySelector('.param-line__name')?.textContent?.trim() === 'Кто действует')!;
        act(() => { fireEvent.click(item.querySelector('.param-line__sum')!); });
        openAll();
      },
      () => edit(d => { d.effects.урон!.params![0]!.role = 'target'; }),
    ],
    apply: [
      () => press(findAnchor({ text: '+ изменение' })!),
      () => edit(d => { d.effects.урон!.steps = [{ type: 'apply', target: { expr: '@действующий.хиты' } } as never]; }),
      () => openBar(''),
      () => typeBar('@amount'),
      () => edit(d => { d.effects.урон!.steps = [{ type: 'apply', target: { expr: '@действующий.хиты' }, value: { expr: '@amount' } } as never]; }),
    ],
    returns: [
      () => press(findAnchor({ text: '+ итог' })!),
      () => edit(d => { d.effects.урон!.returns![0]!.label = 'Осталось'; }),
      () => edit(d => { d.effects.урон!.returns![0]!.kind = 'number'; }),
      () => openBar(''),
      () => typeBar('@действующий.хиты'),
      () => edit(d => { d.effects.урон!.returns = [{ key: 'осталось', label: 'Осталось', kind: 'number', expr: { expr: '@действующий.хиты' } }] as never; }),
    ],
    call: [
      () => { within(document).select(findAnchor({ text: '+ шаг' })!, 'call:урон'); },
      () => { openBar(''); typeBar('5'); },
      () => edit(d => setSteps(d, 'удар', steps('удар').map(step => (step.type === 'emit' ? { ...step, effect: 'урон', args: { действующий: { expr: '@цель' }, amount: { expr: '5' } } } : step)))),
    ],
    drop: [
      () => press(findAnchor({ text: 'Удалить', in: '4 · Изменить «Хиты»' })!),
      () => edit(d => setSteps(d, 'удар', steps('удар').filter(step => step.type !== 'apply'))),
    ],
    name: [
      () => {
        if (!findAnchor({ text: 'результат…' })) press(findAnchor({ text: '4 · Урон' })!);
        press(findAnchor({ text: 'результат…' })!);
      },
      () => edit(d => setSteps(d, 'удар', steps('удар').map(step => (step.type === 'emit' ? { ...step, id: 'урон' } : step)))),
    ],
    trial: [
      () => press(findAnchor({ text: 'Проба' })!),
      () => chooseDice('max'),
    ],
    problems: openProblems,
    heal: () => edit(d => {
      d.effects.лечение = {
        label: 'Лечение',
        params: [{ key: 'действующий', label: 'Кто действует', kind: 'sheet', role: 'target' }, { key: 'amount', label: 'Сколько', kind: 'number', role: 'amount' }],
        steps: [{ type: 'apply', target: { expr: '@действующий.хиты' }, direction: 'add', value: { expr: '@amount' } } as never],
      };
      setSteps(d, 'удар', beforeEnd(beforeEnd(steps('удар'), { type: 'orElse' }), { type: 'emit', effect: 'лечение', args: { действующий: { expr: '@цель' }, amount: { expr: '2' } } }));
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
      () => press(findAnchor({ text: '4 · Изменить «Хиты»' })!),
      () => openBar('5'),
      () => typeBar('@урон_оружия'),
      () => edit(d => setSteps(d, 'удар', steps('удар').map(step => (step.type === 'apply' ? { ...step, value: { expr: '@урон_оружия' } } : step)))),
    ],
    given: [
      () => press(findAnchor({ text: 'блоки и типы листов' })!),
      () => press(findAnchor({ text: 'все блоки', in: 'Листы' })!),
      () => edit(d => { d.grants = []; }),
    ],
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
      () => edit(d => { d.tables!.kind!.modifiers = [{ kind: 'value', target: 'класс_брони', op: 'add' }] as never; }),
      () => edit(d => { d.tables!.kind!.modifiers = [{ kind: 'value', target: 'класс_брони', op: 'add', value: { expr: '1' } }] as never; }),
    ],
    problems: openProblems,
    armor: () => edit(d => { d.tables!.kind_2 = { shape: 'book', use: 'item', label: 'Броня', modifiers: [{ kind: 'value', target: 'класс_брони', op: 'add', value: { expr: '2' } }] } as never; }),
  },
  tags: {
    tag: [
      () => pick({ activeEffectId: 'сырость' }),
      () => { const el = findAnchor({ text: 'свойства' }); if (el) press(el); },
      () => { pickCombo(findAnchor({ field: 'Метки' })!.querySelector<HTMLElement>('[role="combobox"]')!, ':своя'); },
      () => edit(d => { d.effects.сырость!.tags = ['гасит огонь']; }),
    ],
    when: [
      () => pick({ activeEffectId: 'горение' }),
      () => edit(d => { d.effects.горение!.on = [{ on: '' }]; }),
      () => edit(d => { d.effects.горение!.on = [{ on: 'gained:' }]; }),
      () => edit(d => { d.effects.горение!.on = [{ on: 'gained:гасит огонь' }]; }),
    ],
    who: () => edit(d => { d.effects.горение!.on![0]!.if = { expr: '@sheet == @holder' }; }),
    remove: [
      () => edit(d => { d.effects.горение!.on![0]!.steps = [{ type: 'apply' }]; }),
      () => edit(d => { d.effects.горение!.on![0]!.steps = [{ type: 'status' }]; }),
      () => edit(d => { d.effects.горение!.on![0]!.steps = [{ type: 'status', mode: 'remove' }]; }),
      () => edit(d => { d.effects.горение!.on![0]!.steps = [{ type: 'status', mode: 'remove', effect: 'горение', to: { expr: '@sheet' } }]; }),
    ],
    seen: [
      () => pick({ activeEffectId: 'удача' }),
      () => edit(d => { d.effects.удача!.on = [{ on: '' }]; }),
      () => edit(d => { d.effects.удача!.on = [{ on: 'seen' }]; }),
      () => press(findAnchor({ text: '+ или / кроме' })!),
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
    if: [
      () => press(findAnchor({ text: 'ещё', in: 'кнопка «Прекратить»' })!),
      () => openBar(''),
      () => typeBar('@срок.держится'),
      () => edit(d => { d.tables!.заклинание!.bindings![1]!.if = { expr: '@срок.держится' }; }),
    ],
    bond: [
      () => pick({ activeEffectId: 'сотворить' }),
      () => { const el = findAnchor({ text: 'свойства' }); if (el) press(el); },
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
    value: [
      () => openBar(''),
      () => edit(d => { (d.sheets!.по_заготовке!.modifiers![0] as { value: unknown }).value = { expr: '@заготовка.[@row]' }; }),
    ],
    when: [
      () => openBar(''),
      () => typeBar('not empty(@заготовка)'),
      () => edit(d => { (d.sheets!.по_заготовке!.modifiers![0] as { if: unknown }).if = { expr: 'not empty(@заготовка)' }; }),
    ],
    problems: openProblems,
    more: () => edit(d => { d.tables!.заготовки!.rows!.push({ value: 'разведчик', label: 'Разведчик', cells: { ближний_бой: 2, стрельба: 3 } }); }),
  },
  combat: {
    if: [
      () => pick({ activeEffectId: 'удар' }),
      () => edit(d => setSteps(d, 'удар', [{ type: 'branch' }, { type: 'end' }])),
      () => openBar(''),
      () => typeBar('@desk.combat'),
      () => edit(d => setSteps(d, 'удар', [{ type: 'branch', if: { expr: '@desk.combat' } }, { type: 'end' }])),
    ],
    spend: [
      () => edit(d => setSteps(d, 'удар', beforeEnd(steps('удар'), { type: 'apply' }))),
      () => edit(d => setSteps(d, 'удар', applied({ target: { expr: '@действующий.действий_осталось' } }))),
      () => { openBar(''); typeBar('1'); },
      () => edit(d => setSteps(d, 'удар', applied({ target: { expr: '@действующий.действий_осталось' }, value: { expr: '1' } }))),
    ],
    problems: openProblems,
    refuse: () => edit(d => setSteps(d, 'удар', [
      { type: 'branch', if: { expr: '@desk.combat and @действующий.действий_осталось < 1' } },
      { type: 'stop' },
      { type: 'end' },
      ...steps('удар'),
    ])),
  },
};

type Wrong = (draft: System) => Partial<View> | void;

const col = (d: System, table: string, key: string) => d.tables![table]!.columns!.find(c => c.key === key)! as unknown as Record<string, unknown>;
const stepsIn = (d: System, effect: string) => d.effects[effect]!.steps as unknown as Record<string, unknown>[];
const stepOf = (d: System, effect: string, type: string) => stepsIn(d, effect).find(one => one.type === type)!;
const formula = (text: string) => ({ expr: text });
const closed: Wrong = () => ({ opened: () => false });
const away: Wrong = () => ({ tab: 'effects' });
const broken: Wrong = d => { stepsIn(d, 'удар').splice(0, 0, { type: 'apply', target: formula('@фантом.поле'), value: formula('1') }); };
const dropLabel = (d: System, label: string) => {
  for (const table of Object.values(d.tables ?? {})) table.columns = (table.columns ?? []).filter(column => column.label !== label);
};
const setExpr = (table: string, key: string, text: string): Wrong => d => { col(d, table, key).expr = formula(text); };

const BAD: Record<string, Record<string, Wrong[]>> = {
  'first-system': {
    block: [d => { labelBlock(d, d.blocks![0]!.key, 'Битва'); }],
    hp: [d => { col(d, 'лист', 'хиты').label = 'Здоровье'; }],
    'hp-start': [d => { col(d, 'лист', 'хиты').default = 5; }, d => { delete col(d, 'лист', 'хиты').default; }],
    'hp-min': [d => { col(d, 'лист', 'хиты').min = 1; }, d => { delete col(d, 'лист', 'хиты').min; }],
    ac: [d => { col(d, 'лист', 'класс_брони').default = 10; }],
    die: [d => { d.constants!.кость!.dice![0]!.sides = 6; }, d => { d.constants!.кость!.label = 'Кубик'; }],
    strike: [d => { d.effects.удар!.label = 'Атака'; }],
    everyone: [d => { d.grants = []; }],
    targets: [d => { (d.effects.удар!.params![1] as { many?: boolean }).many = false; }, d => { d.effects.удар!.params![1]!.label = 'Враги'; }],
    each: [d => { stepOf(d, 'удар', 'each').of = 'другие'; }],
    check: [
      d => { stepOf(d, 'удар', 'check').versus = formula('@цель.хиты'); },
      d => { stepOf(d, 'удар', 'check').versus = formula('@действующий.класс_брони'); },
      d => { stepOf(d, 'удар', 'check').versus = formula('@цель.класс_брони + 1'); },
      d => { stepOf(d, 'удар', 'check').versus = formula('10'); },
      d => { d.constants!.кость!.label = 'Кубик'; },
    ],
    branch: [d => { stepOf(d, 'удар', 'branch').if = formula('not @проверка.success'); }],
    damage: [
      d => { stepOf(d, 'удар', 'apply').direction = 'add'; },
      d => { stepOf(d, 'удар', 'apply').value = formula('3'); },
      d => { stepOf(d, 'удар', 'apply').target = formula('@действующий.хиты'); },
      d => { stepOf(d, 'удар', 'apply').target = formula('@цель.класс_брони'); },
    ],
    problems: [closed, broken],
    trial: [broken],
    heal: [
      d => { delete stepOf(d, 'лечение', 'apply').direction; },
      d => { stepOf(d, 'лечение', 'apply').value = formula('4'); },
      d => { stepOf(d, 'лечение', 'apply').target = formula('@цель.хиты'); },
      broken,
    ],
  },
  tables: {
    block: [d => { labelBlock(d, 'новый_блок_2', 'Статы'); }],
    table: [d => { d.tables!.таблица!.label = 'Статы'; }],
    rows: [d => { d.tables!.таблица!.rows = [{ value: 'сила' }, { value: 'ум' }]; }],
    modifier: [
      d => { d.tables!.таблица!.rows = [{ value: 'сила' }]; },
      setExpr('таблица', 'колонка', '@row.value / 2'),
      setExpr('таблица', 'колонка', '(@row.value - 10) / 2'),
      setExpr('таблица', 'колонка', '@row.value - 10'),
      setExpr('таблица', 'колонка', 'floor((@row.value - 10) / 2) + 1'),
    ],
    armor: [
      setExpr('лист', 'класс_брони', '10 + @таблица.сила.колонка'),
      setExpr('лист', 'класс_брони', '@таблица.ловкость.колонка'),
      setExpr('лист', 'класс_брони', '10 - @таблица.ловкость.колонка'),
    ],
    sample: [away],
    problems: [closed],
    skills: [d => { d.tables!.таблица_2!.rows = [{ value: 'акробатика' }]; }, d => { d.tables!.таблица_2!.label = 'Умения'; }],
    link: [d => { col(d, 'таблица_2', 'колонка').kind = 'number'; }, d => { col(d, 'таблица_2', 'колонка').from = 'лист'; }],
    pick: [d => { d.tables!.таблица_2!.rows = [{ value: 'атлетика', cells: { колонка: 'ловкость' } }]; }],
    through: [
      setExpr('таблица_2', 'колонка_2', '@row.колонка.колонка - @row.value'),
      setExpr('таблица_2', 'колонка_2', '@row.колонка.колонка'),
      setExpr('таблица_2', 'колонка_2', '@row.value + @row.value'),
    ],
    save: [setExpr('таблица', 'колонка_3', '@row.колонка + 1'), setExpr('таблица', 'колонка_3', '@row.value'), broken],
  },
  links: {
    called: [d => { d.effects.урон!.label = 'Вред'; }],
    amount: [d => { delete d.effects.урон!.params![1]!.role; }, d => { d.effects.урон!.params![1]!.label = 'Количество'; }],
    target: [d => { delete d.effects.урон!.params![0]!.role; }],
    apply: [
      d => { stepOf(d, 'урон', 'apply').direction = 'add'; },
      d => { stepOf(d, 'урон', 'apply').value = formula('1 - @amount'); },
      d => { stepOf(d, 'урон', 'apply').target = formula('@действующий.класс_брони'); },
      d => { stepOf(d, 'урон', 'apply').value = formula('5'); },
    ],
    returns: [
      d => { (d.effects.урон!.returns![0] as { expr?: unknown }).expr = formula('@действующий.класс_брони'); },
      d => { d.effects.урон!.returns![0]!.kind = 'boolean'; },
      d => { d.effects.урон!.returns![0]!.label = 'Остаток'; },
    ],
    call: [
      d => { (stepOf(d, 'удар', 'emit').args as Record<string, unknown>).amount = formula('7'); },
      d => { (stepOf(d, 'удар', 'emit').args as Record<string, unknown>).действующий = formula('@действующий'); },
      d => { const list = stepsIn(d, 'удар'); const emit = stepOf(d, 'удар', 'emit'); list.splice(list.indexOf(emit), 1); list.unshift(emit); },
    ],
    drop: [
      d => { stepsIn(d, 'удар').unshift({ type: 'apply', target: formula('@цель.хиты'), value: formula('5') }); },
      d => { d.effects.удар!.steps = stepsIn(d, 'удар').filter(one => one.type !== 'emit') as never; },
    ],
    name: [d => { stepOf(d, 'удар', 'emit').id = ''; }],
    trial: [broken],
    problems: [closed],
    heal: [
      d => { delete stepOf(d, 'лечение', 'apply').direction; },
      d => { d.effects.удар!.steps = stepsIn(d, 'удар').filter(one => one.type !== 'orElse') as never; },
    ],
  },
  items: {
    kind: [d => { d.tables!.kind!.label = 'Оружие2'; }],
    param: [
      d => { stepOf(d, 'удар', 'apply').value = formula('5'); },
      d => { d.effects.удар!.params![2]!.label = 'Урон'; },
    ],
    given: [d => { d.grants = ['удар']; }],
    button: [d => { d.tables!.kind!.bindings = []; }, d => { d.tables!.kind!.columns = []; }],
    modifier: [
      d => { (d.tables!.kind!.modifiers![0] as { value: unknown }).value = formula('2'); },
      d => { (d.tables!.kind!.modifiers![0] as { op: string }).op = 'set'; },
      d => { (d.tables!.kind!.modifiers![0] as { target: string }).target = 'хиты'; },
    ],
    problems: [closed],
    armor: [d => { (d.tables!.kind_2!.modifiers![0] as { target: string }).target = 'хиты'; }, broken],
  },
  tags: {
    tag: [d => { d.effects.сырость!.tags = ['гасит воду']; }],
    when: [d => { d.effects.горение!.on![0]!.on = 'gained:'; }, d => { d.effects.горение!.on![0]!.on = 'gained:гасит воду'; }],
    who: [d => { d.effects.горение!.on![0]!.if = formula('@sheet != @holder'); }, d => { d.effects.горение!.on![0]!.if = formula('@sheet'); }],
    remove: [
      d => { (d.effects.горение!.on![0]!.steps![0] as unknown as { to: unknown }).to = formula('@действующий'); },
      d => { (d.effects.горение!.on![0]!.steps![0] as unknown as { effect: string }).effect = 'сырость'; },
      d => { (d.effects.горение!.on![0]!.steps![0] as unknown as { mode: string }).mode = 'add'; },
    ],
    seen: [d => { d.effects.удача!.on![0]!.notTags = ['атака']; }, d => { d.effects.удача!.on![0]!.notTags = []; }],
    plus: [d => { (d.effects.удача!.on![0]!.steps![0] as unknown as { value: unknown }).value = formula('2'); }],
    problems: [closed],
    clear: [d => { d.effects.иней!.tags = ['другая']; }, d => { delete (stepOf(d, 'согреться', 'status') as { by?: string }).by; }],
  },
  spells: {
    open: [() => ({ record: null })],
    cast: [
      d => { (d.tables!.заклинание!.bindings![0] as unknown as { args: Record<string, unknown> }).args.срок = formula('@другое'); },
      d => { d.tables!.заклинание!.bindings![0]!.effect = 'прекращение'; },
    ],
    stop: [d => { d.tables!.заклинание!.bindings![1]!.effect = 'сотворить'; }],
    if: [d => { d.tables!.заклинание!.bindings![1]!.if = formula('not @срок.держится'); }, d => { delete d.tables!.заклинание!.bindings![1]!.if; }],
    bond: [d => { d.effects.сотворить!.bond!.effect = 'прекращение'; }],
    many: [d => { d.effects.сотворить!.bond!.many = false; }],
    problems: [closed],
    term: [
      d => { const row = d.tables!.сроки!.rows!.find(one => one.value === 'час')!; row.cells = { держится: false }; },
      d => { d.tables!.сроки!.rows!.find(one => one.value === 'час')!.value = ''; },
    ],
  },
  templates: {
    open: [() => ({ sheetKind: null })],
    target: [d => { (d.sheets!.по_заготовке!.modifiers![0] as { target: string }).target = 'cell:навыки.*.другое'; }],
    op: [d => { (d.sheets!.по_заготовке!.modifiers![0] as { op: string }).op = 'add'; }],
    value: [
      d => { (d.sheets!.по_заготовке!.modifiers![0] as { value: unknown }).value = formula('@заготовка'); },
      d => { (d.sheets!.по_заготовке!.modifiers![0] as { value: unknown }).value = formula('@заготовка.[@row] + 1'); },
    ],
    when: [d => { (d.sheets!.по_заготовке!.modifiers![0] as { if: unknown }).if = formula('empty(@заготовка)'); }],
    problems: [closed],
    more: [
      d => { d.tables!.заготовки!.rows!.pop(); },
      d => { d.tables!.заготовки!.rows!.at(-1)!.value = ''; },
    ],
  },
  combat: {
    if: [d => { stepOf(d, 'удар', 'branch').if = formula('not @desk.combat'); }],
    spend: [d => { stepOf(d, 'удар', 'apply').value = formula('2'); }, d => { stepOf(d, 'удар', 'apply').direction = 'add'; }],
    problems: [closed],
    refuse: [
      d => { stepsIn(d, 'удар')[0]!.if = formula('@действующий.действий_осталось < 1'); },
      d => { stepsIn(d, 'удар')[0]!.if = formula('@desk.combat'); },
    ],
  },
  ready: {
    take: [d => { const table = Object.values(d.tables!).find(one => one.label === 'Характеристики')!; table.rows = table.rows!.filter(row => row.value !== 'харизма'); }],
    drop: [d => { d.tables!.лист!.columns!.push({ key: 'вдохновение', label: 'Вдохновение', kind: 'number' } as never); }],
    problems: [closed],
    seen: [away],
    effect: [d => { for (const key of Object.keys(d.effects)) if (d.effects[key]!.label === 'Отход') delete d.effects[key]; }],
    came: [() => ({ tab: 'sheet' })],
    'problems-effect': [closed],
    other: [d => { dropLabel(d, 'Физический урон'); }],
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
  useFormulaBar.getState().dismiss();
  useOpened.setState({ opened: {} });
  useGuide.setState({ lesson: null, step: 0, folded: false, note: null, finished: null, started: {} });
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
      const wrongWords: string[] = [];
      for (const [index, step] of lesson.steps.entries()) {
        act(() => { useGuide.getState().go(index); });
        if (step.tab) pick({ activeTab: step.tab });
        openPanels();
        let onScreen = '';
        const lateMoves: { at: number; phrase: string }[] = [];
        let inData = flat(JSON.stringify(lesson.seed));
        const snap = () => {
          onScreen += ` | ${screenText()}`;
          inData += ` | ${flat(JSON.stringify(useWorld.getState().system))}`;
        };
        snap();
        const solve = SOLVE[lesson.id]?.[step.id];
        const parts = Array.isArray(solve) ? solve : [];
        for (const [at, move] of movesOf(step).entries()) {
          if (move.maybe && move.done?.(view!)) {
            for (const phrase of phrasesIn(move.say, move.hint)) {
              spoken.total += 1;
              if (typedByAuthor(phrase) || said(screenText(), phrase) || SCREEN_EXCEPTIONS[`${lesson.id}/${step.id}/${phrase}`]) continue;
              lateMoves.push({ at: at + 1, phrase });
            }
            continue;
          }
          expect(moveAt(step, view!), `${lesson.id}/${step.id}: ход ${at + 1} — рамка не на нём`).toBe(at);
          for (let k = 0; k < 4 && !firstOf(move.at) && step.via; k++) {
            const via = firstOf(step.via);
            expect(via, `${lesson.id}/${step.id}: нет «${JSON.stringify(step.via)}»`).not.toBeNull();
            press(via!);
          }
          expect(firstOf(move.at), `${lesson.id}/${step.id}: ход ${at + 1}, нет якоря ${JSON.stringify(move.at)}`).not.toBeNull();
          openPanels();
          snap();
          const now = screenText();
          for (const phrase of phrasesIn(move.say, move.hint)) {
            spoken.total += 1;
            if (typedByAuthor(phrase) || said(now, phrase) || SCREEN_EXCEPTIONS[`${lesson.id}/${step.id}/${phrase}`]) continue;
            lateMoves.push({ at: at + 1, phrase });
          }
          parts[at]?.();
          openPanels();
          snap();
          if (move.done) expect(move.done(view!), `${lesson.id}/${step.id}: ход ${at + 1} не засчитан`).toBe(true);
        }
        if (typeof solve === 'function') solve();
        openPanels();
        snap();
        if (step.done) expect(step.done(view!), `${lesson.id}/${step.id}: решение не засчитано ${problemsOf()}`).toBe(true);
        for (const late of lateMoves) {
          if (!said(inData, late.phrase)) wrongWords.push(`${lesson.id} / ${step.id} / ход ${late.at}: «${late.phrase}»`);
        }
        for (const phrase of spokenPhrases(lesson, step)) {
          spoken.total += 1;
          if (typedByAuthor(phrase) || said(onScreen, phrase) || said(inData, phrase) || SCREEN_EXCEPTIONS[`${lesson.id}/${step.id}/${phrase}`]) continue;
          wrongWords.push(`${lesson.id} / ${step.id}: «${phrase}»`);
        }
        for (const [n, wrong] of (BAD[lesson.id]?.[step.id] ?? []).entries()) {
          const system = structuredClone(useWorld.getState().system);
          const extra = wrong(system) ?? {};
          expect(Object.keys(extra).length > 0 || JSON.stringify(system) !== JSON.stringify(useWorld.getState().system), `${lesson.id}/${step.id}: неверное решение ${n + 1} ничего не меняет`).toBe(true);
          expect(step.done!({ ...view!, ...extra, system }), `${lesson.id}/${step.id}: неверное решение ${n + 1} засчитано`).toBe(false);
        }
      }
      expect(wrongWords, `урок говорит не словами экрана:\n${wrongWords.join('\n')}`).toEqual([]);
      expect(problemsOf(), `${lesson.id}: после всех решений «Проблемы» не чисты`).toBe('');
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
    const inBar = (box: HTMLElement, text: string, probes: { opened?: () => void; typed?: () => void; pick?: { group: string; label: string; stored: string } } = {}) => {
      act(() => { fireEvent.click(box.querySelector('.formula-field') ?? box); });
      probes.opened?.();
      const chips = document.querySelector('.formula-bar .chips')!;
      act(() => { for (const x of [...chips.querySelectorAll<HTMLElement>('.chips__x')].reverse()) fireEvent.mouseDown(x); });
      const inputs = [...document.querySelectorAll<HTMLInputElement>('.formula-bar input.chips__text')];
      act(() => {
        for (const other of inputs.slice(1)) fireEvent.change(other, { target: { value: '' } });
        fireEvent.change(inputs[0]!, { target: { value: text } });
      });
      if (probes.pick) {
        const { group, label, stored } = probes.pick;
        const option = [...document.querySelectorAll<HTMLElement>('.slot__option')]
          .find(one => one.querySelector('.slot__group')?.textContent === group && one.textContent === `${group}${label}`);
        expect(option, `в подсказке по «${text}» нет «${label}» в группе «${group}»`).toBeDefined();
        act(() => { fireEvent.mouseDown(option!); });
        expect(useFormulaBar.getState().target?.value, 'выбор из подсказки записал имя').toBe(stored);
      }
      probes.typed?.();
      act(() => { fireEvent.keyDown(document.querySelector<HTMLInputElement>('.formula-bar input.chips__text') ?? inputs[0]!, { key: 'Enter' }); });
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
      clickAt({ text: 'Броски', in: 'Разделы правил' });
      ui.select(screen.getByLabelText('добавить кость'), 'one');
      ui.type(screen.getByPlaceholderText('название кости'), 'Кость проверки');
    });
    await pass('strike', () => {
      ui.click(TABS.effects);
      openAll();
      clickAt({ text: '+ кнопкой', in: 'Библиотека эффектов' });
      ui.type(screen.getByPlaceholderText('как зовётся эффект'), 'Удар');
    });
    await pass('everyone', () => {
      ui.click(TABS.sheet);
      ui.click('блоки и типы листов');
      ui.select('Что даёт всем листам', 'Удар');
    });
    await pass('targets', () => {
      ui.click(TABS.effects);
      openAll();
      ui.click('+ ещё одно');
      ui.type(ui.cell('Название', 1), 'Цели');
      ui.select(ui.cell('Вид', 1), 'sheet+many');
      ui.type(ui.cell('Каждый', 1), 'Цель');
    });
    await closing('each', () => { ui.click('+ для каждого из списка'); }, 'по каждой цели');
    await pass('check', () => {
      ui.click('+ бросок');
      ui.click('+ проверка');
      const checkStep = lesson.steps.find(one => one.id === 'check')!;
      inBar(within(stepCard(/^3 · /)).field('С чем'), 'класс', {
        pick: { group: 'у «Цель»', label: 'Класс брони', stored: '@цель.класс_брони' },
        opened: () => expect(moveAt(checkStep, view!), 'строка открылась — ход «щёлкните поле» засчитан').toBe(3),
        typed: () => expect(moveAt(checkStep, view!), 'формула набрана — ход «наберите и выберите» засчитан').toBe(4),
      });
    });
    await pass('branch', () => { within(stepCard(/^3 · /)).click('+ по итогу'); });
    addToArm(block(0), 0, 'change');
    const change = () => stepCard(/^4 · /);
    within(change()).select('Какое поле', 'хиты');
    await act(async () => { vi.advanceTimersByTime(300); });
    expect(cardText()).toContain('В «У кого» стоит «Кто действует» — удар ранит самого героя');
    await pass('damage', () => {
      within(change()).select('У кого', 'цель');
      inBar(within(change()).field('Сколько'), '5');
    });
    expect(cardText()).not.toContain('удар ранит самого героя');
    expect(at()).toBe('problems');
    clickAt({ guide: 'problems' });
    await act(async () => { vi.advanceTimersByTime(300); });
    clickAt({ guide: 'problems' });
    await settleCard();
    expect(at(), 'окно «Проблем» закрыто до перехода — шаг остаётся засчитанным').toBe('problems');
    next('problems');
    clickAt({ text: 'Проба' });
    await act(async () => { await Promise.resolve(); });
    await act(async () => { vi.advanceTimersByTime(300); });
    expect(cardText(), 'проба открыта, но без кости «максимум» шаг не засчитан').not.toContain('Проба показала');
    chooseDice('max');
    await act(async () => { await Promise.resolve(); });
    await act(async () => { vi.advanceTimersByTime(300); });
    expect(cardText()).toContain('Проба показала: Б теряет 5 хитов');
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

  it('у каждого шага с условием есть неверное решение, и у каждого неверного решения есть шаг с условием', () => {
    for (const lesson of LESSONS) {
      for (const step of lesson.steps) {
        expect(Boolean(step.done), `${lesson.id}/${step.id}: условие`).toBe(Boolean(BAD[lesson.id]?.[step.id]?.length));
      }
    }
    for (const [lessonId, byStep] of Object.entries(BAD)) {
      for (const stepId of Object.keys(byStep)) expect(lessonOf(lessonId)!.steps.some(one => one.id === stepId), `${lessonId}/${stepId}`).toBe(true);
    }
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
    edit(d => { d.blocks = [{ key: 'Бой', parts: [] }]; addColumn(d, { key: 'хиты', label: 'Хиты', kind: 'number' }, 'sheet', 'Бой'); });
    act(() => { useGuide.getState().go(1); });
    await act(async () => { vi.advanceTimersByTime(PAUSE_MS * 3); });
    expect(useGuide.getState().step).toBe(1);
    expect(cardText()).toContain('уже сделано');
    act(() => { fireEvent.click(within(card()).button('Дальше')); });
    expect(useGuide.getState().step).toBe(2);
  });

  it('шаг с условием без решения не даёт «Дальше» — и после «Назад» тоже, пока шаг не сделан заново', async () => {
    mount();
    await start('first-system');
    act(() => { useGuide.getState().go(1); });
    expect(within(card()).has('Дальше')).toBe(false);
    act(() => { fireEvent.click(within(card()).button('Назад')); });
    expect(useGuide.getState().step).toBe(0);
    expect(within(card()).has('Дальше')).toBe(false);
  });

  it('«Назад» возвращает систему к началу прежнего шага', async () => {
    mount();
    await start('first-system');
    edit(d => { d.blocks = [{ key: 'Бой', parts: [] }]; });
    act(() => { useGuide.getState().go(1); });
    edit(d => { addColumn(d, { key: 'хиты', label: 'Хиты', kind: 'number' }, 'sheet', 'Бой'); });
    act(() => { useGuide.getState().go(2); });
    act(() => { fireEvent.click(within(card()).button('Назад')); });
    expect(useGuide.getState().step).toBe(1);
    expect(useWorld.getState().system.blocks?.map(block => block.key)).toEqual(['Бой']);
    expect(Object.keys(useWorld.getState().system.tables?.лист?.columns ?? []).length).toBe(0);
    act(() => { fireEvent.click(within(card()).button('Назад')); });
    expect(useWorld.getState().system.blocks ?? []).toEqual([]);
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

  it('«отказ в бою»: «Если не бой» → «Иначе, если действий меньше 1» → «Стоп» → «Конец» засчитывается', () => {
    const lesson = lessonOf('combat')!;
    const refuse = lesson.steps.find(step => step.id === 'refuse')!;
    const system = structuredClone(lesson.seed);
    system.effects.удар!.steps = [
      { type: 'branch', if: { expr: 'not @desk.combat' } },
      { type: 'orElse', if: { expr: '@действующий.действий_осталось < 1' } },
      { type: 'stop' },
      { type: 'end' },
    ] as never;
    const view = { system, tab: 'effects', effect: 'удар', record: null, sheetKind: null, block: null, field: null, opened: () => true } as View;
    expect(refuse.done!(view)).toBe(true);
  });
});

describe('окошко урока', () => {
  beforeEach(reset);
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  const at = () => useGuide.getState().step;
  const stepIndex = (lessonId: string, id: string) => lessonOf(lessonId)!.steps.findIndex(one => one.id === id);
  const gone = async (ms: number) => { await act(async () => { vi.advanceTimersByTime(ms); }); };
  const makeBlock = () => edit(d => { d.blocks = [{ key: 'Бой', parts: [] }]; });
  const back = () => act(() => { fireEvent.click(within(card()).button('Назад')); });

  it('«Назад» после автоперехода: окошко остаётся на шаге, даже если решение сделано заново', async () => {
    vi.useFakeTimers();
    mount();
    await start('first-system');
    makeBlock();
    await gone(300);
    await gone(PAUSE_MS + 100);
    expect(at()).toBe(1);
    back();
    expect(at()).toBe(0);
    await gone(PAUSE_MS * 3);
    expect(at()).toBe(0);
    makeBlock();
    await gone(PAUSE_MS * 3);
    expect(at()).toBe(0);
    expect(cardText()).toContain('Дальше');
  });

  it('условие стало истинным и до конца паузы снова ложным — автоперехода нет', async () => {
    vi.useFakeTimers();
    mount();
    await start('first-system');
    makeBlock();
    await gone(300);
    await gone(PAUSE_MS / 3);
    edit(d => { d.blocks = []; });
    await gone(PAUSE_MS * 3);
    expect(at()).toBe(0);
  });

  it('на первом шаге урока сказано, с чего он начинается; у шага «Сами» под заданием — «Готово, когда»', async () => {
    mount();
    await start('links');
    expect(cardText()).toContain('С чего начинаем: у вас уже есть «Удар»: он сам отнимает у цели 5 хитов');
    act(() => { useGuide.getState().go(stepIndex('links', 'amount')); });
    expect(cardText()).not.toContain('С чего начинаем');
    act(() => { useGuide.getState().go(stepIndex('links', 'heal')); });
    expect(cardText()).toContain('Готово, когда: «Лечение» прибавляет');
    cleanup();
    await act(async () => { await useGuide.getState().exit(); });
    mount();
    await start('first-system');
    expect(cardText()).not.toContain('С чего начинаем');
  });

  it('«Не получается?» показывает подсказку текущего хода, а не всего шага', async () => {
    mount();
    await start('first-system');
    act(() => { useGuide.getState().go(stepIndex('first-system', 'hp')); });
    expect(cardText()).toContain('Кнопки «+ поле» не видно?');
    edit(d => { d.blocks = [{ key: 'Бой', parts: [] }]; addColumn(d, { key: 'хиты', label: 'Новое поле', kind: 'number' }, 'sheet', 'Бой'); });
    expect(cardText()).not.toContain('Кнопки «+ поле» не видно?');
  });

  it('конец урока: «Урок пройден», что получилось, «Следующий урок» и «Закрыть»', async () => {
    mount();
    await start('items');
    act(() => { useGuide.getState().go(lessonOf('items')!.steps.length - 1); });
    await act(async () => { expect(await useGuide.getState().finish()).toBe(true); });
    const done = screen.getByRole('region', { name: 'Урок пройден' });
    const text = (done.textContent ?? '').replace(/\s+/g, ' ');
    expect(text).toContain('Урок пройден');
    expect(text).toContain('Вы завели тип вещи с правкой без подсказок.');
    expect(text).toContain('Следующий урок: Метки и реакции');
    expect(text).not.toContain('Все уроки пройдены');
    await act(async () => { fireEvent.click(within(done).button('Следующий урок: Метки и реакции')); });
    expect(useGuide.getState().lesson).toBe('tags');
    expect(useGuide.getState().finished).toBeNull();
    expect(screen.queryByRole('region', { name: 'Урок пройден' })).toBeNull();
  });

  it('после последнего урока — «Все уроки пройдены», без «Следующий урок»; «Закрыть» убирает окошко', async () => {
    mount();
    const last = LESSONS.at(-1)!;
    await start(last.id);
    await act(async () => { await useGuide.getState().finish(); });
    const done = screen.getByRole('region', { name: 'Урок пройден' });
    const text = (done.textContent ?? '').replace(/\s+/g, ' ');
    expect(text).toContain('Все уроки пройдены');
    expect(text).not.toContain('Следующий урок');
    act(() => { fireEvent.click(within(done).button('Закрыть')); });
    expect(screen.queryByRole('region', { name: 'Урок пройден' })).toBeNull();
    expect(useGuide.getState().finished).toBeNull();
  });
});

const VERBS = ['нажмите', 'впишите', 'выберите', 'наберите', 'сотрите', 'щёлкните', 'щелкните', 'откройте', 'раскройте', 'поставьте', 'снимите', 'перетащите', 'задайте', 'добавьте', 'уберите'];
const VERB_RE = new RegExp(`(?<![\\p{L}])(${VERBS.join('|')})(?![\\p{L}])`, 'giu');
const PLACES = /(в шапке|на вкладке|слева|справа|под |в строке|в панели|в блоке|в виде|над листом|в разделе|в списке|в «)/iu;
const FORMULA_LIKE = /^@\S|\S [-+] \S/;

const sourceDir = join(__dirname, 'lessons');
const sourceTexts = readdirSync(sourceDir).filter(name => name.endsWith('.ts')).flatMap(name => {
  const code = readFileSync(join(sourceDir, name), 'utf8');
  return [...code.matchAll(/'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g)]
    .map(found => found[1] ?? found[2] ?? '')
    .filter(text => /\p{L}/u.test(text) && /[а-яё]/iu.test(text))
    .map(text => ({ file: name, text }));
});

const dataTexts = (lesson: (typeof LESSONS)[number]): string[] => [
  lesson.title, lesson.sub, lesson.start ?? '',
  ...lesson.chapters.flatMap(chapter => [chapter.title, chapter.sum]),
  ...lesson.steps.flatMap(step => [
    step.lead ?? '', step.say, step.hint ?? '', step.goal ?? '',
    ...movesOf(step).flatMap(move => [move.say ?? '', move.hint ?? '']),
    ...(step.traps ?? []).map(trap => trap.say),
  ]),
].filter(Boolean);

const actionsOf = (text: string): number => (text.match(VERB_RE) ?? []).length;

const turns = (step: (typeof LESSONS)[number]['steps'][number]): { say: string; has: boolean }[] =>
  Array.isArray(step.at) ? step.at.map(move => ({ say: move.say ?? '', has: true })) : [{ say: step.say, has: step.at !== undefined }];

describe('тексты уроков', () => {
  it('знака «−» нет нигде: в формуле дефис-минус, в прозе слово «минус»', () => {
    const bad = sourceTexts.filter(one => one.text.includes('\u2212')).map(one => `${one.file}: ${one.text}`);
    expect(bad, bad.join('\n')).toEqual([]);
    for (const lesson of LESSONS) expect(dataTexts(lesson).filter(text => text.includes('\u2212')), lesson.id).toEqual([]);
  });

  it('в текстах уроков нет указания набирать «@»', () => {
    const AT = /(наб(е|и)р\p{L}*|введите|впишите|через|знак\p{L}*|символ\p{L}*|поставьте|нажмите)\s*(?:\p{L}+\s+){0,2}[«"„]?@/iu;
    const bareAt = /«\s*@\s*»/u;
    const bad = sourceTexts.filter(one => AT.test(one.text) || bareAt.test(one.text)).map(one => `${one.file}: ${one.text}`);
    expect(bad, bad.join('\n')).toEqual([]);
    const spoken = LESSONS.flatMap(lesson => dataTexts(lesson).filter(text => AT.test(text) || bareAt.test(text)).map(text => `${lesson.id}: ${text}`));
    expect(spoken, spoken.join('\n')).toEqual([]);
  });

  it('всё, что в «ёлочках» похоже на формулу, разбирается парсером формул', () => {
    const bad: string[] = [];
    for (const one of sourceTexts) {
      for (const found of one.text.matchAll(/«([^«»]*)»/g)) {
        const part = found[1]!;
        if (!FORMULA_LIKE.test(part)) continue;
        try { compile(part); } catch (error) { bad.push(`${one.file}: «${part}» — ${(error as Error).message}`); }
      }
    }
    expect(bad, bad.join('\n')).toEqual([]);
  });

  it('в одном ходу не больше двух действий', () => {
    const bad: string[] = [];
    for (const lesson of LESSONS) {
      for (const step of lesson.steps) {
        for (const turn of turns(step)) if (actionsOf(turn.say) > 2) bad.push(`${lesson.id}/${step.id}: ${turn.say}`);
      }
    }
    expect(bad, bad.join('\n')).toEqual([]);
  });

  it('ход, который велит нажать или щёлкнуть, показывает место рамкой или называет его словами', () => {
    const bad: string[] = [];
    for (const lesson of LESSONS) {
      for (const step of lesson.steps) {
        for (const turn of turns(step)) {
          if (/(нажмите|щёлкните|щелкните)/iu.test(turn.say) && !turn.has && !PLACES.test(turn.say)) bad.push(`${lesson.id}/${step.id}: ${turn.say}`);
        }
      }
    }
    expect(bad, bad.join('\n')).toEqual([]);
  });

  it('запрещённые слова не встречаются в текстах уроков', () => {
    const words = [...FORBIDDEN_STEMS, 'шаг для других'];
    const bad: string[] = [];
    for (const one of sourceTexts) for (const word of words) if (one.text.toLowerCase().includes(word.toLowerCase())) bad.push(`${one.file}: «${word}» в «${one.text}»`);
    for (const lesson of LESSONS) for (const text of dataTexts(lesson)) for (const word of words) if (text.toLowerCase().includes(word.toLowerCase())) bad.push(`${lesson.id}: «${word}»`);
    expect(bad, bad.join('\n')).toEqual([]);
  });

  it('у каждого шага «Сами» есть строка «Готово, когда», у урока с непустым началом — фраза «с чего начинаем»', () => {
    for (const lesson of LESSONS) {
      for (const step of lesson.steps.filter(one => one.alone)) {
        expect(step.goal?.trim(), `${lesson.id}/${step.id}`).toBeTruthy();
        expect(step.goal, `${lesson.id}/${step.id}`).not.toMatch(/^готово/i);
      }
    }
    for (const lesson of LESSONS) {
      const filled = Boolean(lesson.seed.tables && Object.keys(lesson.seed.tables).length > 0) || Object.keys(lesson.seed.effects ?? {}).length > 0;
      expect(Boolean(lesson.start), `${lesson.id}: фраза «с чего начинаем»`).toBe(filled);
    }
  });
});
