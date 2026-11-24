import { group, test, eq, ok } from './harness.ts';
import { lintSystem } from '../src/model/lint.ts';
import type { System } from '../src/model/types.ts';

const ACTOR = { key: 'действующий', label: 'Кто действует', kind: 'sheet' };
const TARGETS = { key: 'цели', label: 'Цели', kind: 'sheet', many: true, item: { key: 'цель' } };

const system = (effects: Record<string, unknown>): System => ({
  id: 'л', name: 'л',
  tables: {
    лист: { shape: 'single', owner: 'sheet', columns: [{ key: 'хп', label: 'Хиты', kind: 'number', default: 20 }, { key: 'сила', label: 'Сила', kind: 'number', default: 3 }] },
    приём: { shape: 'book', use: 'action', label: 'Приём', columns: [], bindings: [{ label: 'Удар', effect: 'удар', args: {} }] },
  },
  effects: {
    удар: {
      label: 'Удар', activation: 'manual', params: [ACTOR, TARGETS, { key: 'сколько', label: 'Сколько', kind: 'number', default: 2 }],
      steps: [{ type: 'each', of: 'цели' }, { type: 'apply', target: { expr: '@цель.хп' }, value: { expr: '@сколько' } }],
    },
    ...effects,
  },
}) as unknown as System;

const found = (s: System, part: string): string[] => lintSystem(s).filter(problem => problem.text.includes(part)).map(problem => `${problem.level}: ${problem.text}`);

const heal = (value: string) => ({ type: 'apply', target: { expr: '@holder.хп' }, direction: 'add', value: { expr: value } });
const pressed = (steps: unknown[], cost?: unknown[]) => ({
  ответ: { label: 'Ответ', activation: 'passive', duration: { kind: 'permanent' }, on: [{ on: 'after:удар', manual: true, ...(cost ? { cost } : {}), steps }] },
});

group('«Проблемы»: невыясненное кормит плату или запись на известный лист', () => {
  test('шаг кнопки пишет на лист носителя то, что подписка слышит, — замечание; с запасом «известно» — чисто', () => {
    const bad = found(system(pressed([heal('@сколько')])), 'кнопкой его не будет');
    eq(bad.length, 1);
    ok(bad[0]!.startsWith('warn: шаг пишет на известный лист «сколько»'), bad[0]);
    eq(found(system(pressed([heal('if(known(@сколько), @сколько, 1)')])), 'кнопкой его не будет').join(' | '), '');
  });

  test('плата кнопки читает то, что подписка слышит, — замечание; своё поле носителя — чисто', () => {
    eq(found(system(pressed([], [heal('@сколько')])), 'плата читает').length, 1);
    eq(found(system(pressed([heal('@holder.сила')], [heal('@holder.сила')])), 'кнопкой его не будет').join(' | '), '');
  });

  test('шаг кнопки несёт услышанное невыясненному листу — не тревожит; без «можно кнопкой» проверки нет', () => {
    const toEvent = { type: 'apply', target: { expr: '@цель.хп' }, value: { expr: '@сколько' } };
    eq(found(system(pressed([toEvent])), 'кнопкой его не будет').join(' | '), '');
    const heard = { ответ: { label: 'Ответ', activation: 'passive', duration: { kind: 'permanent' }, on: [{ on: 'after:удар', steps: [heal('@сколько')] }] } };
    eq(found(system(heard), 'кнопкой его не будет').join(' | '), '');
  });

  test('кнопка с целями лечит действующего числом с листа цели — замечание «без цели его не будет»', () => {
    const drain = (value: string) => ({
      пиявка: { label: 'Пиявка', activation: 'manual', params: [ACTOR, TARGETS], steps: [{ type: 'each', of: 'цели' }, { type: 'apply', target: { expr: '@действующий.хп' }, direction: 'add', value: { expr: value } }] },
    });
    eq(found(system(drain('@цель.сила')), 'без цели его не будет').length, 1);
    eq(found(system(drain('if(known(@цель.сила), @цель.сила, 1)')), 'без цели его не будет').join(' | '), '');
    eq(found(system(drain('@действующий.сила')), 'без цели его не будет').join(' | '), '');
  });
});
