import { describe, it, expect } from 'vitest';
import type { Step } from '@vtt/schema';
import { moveGroup, moveSpan, blockSpan, addArm, dropArm, unwrapBlock, armEnd, validFlow, groupSteps } from './cards.ts';

const s = (id: string): Step => ({ id, type: 'roll', fixed: { expr: '1' } } as unknown as Step);
const IF = (expr: string): Step => ({ type: 'branch', if: { expr } } as unknown as Step);
const ELSE = { type: 'orElse' } as unknown as Step;
const END = { type: 'end' } as unknown as Step;
const EACH = { type: 'each', of: 'цели' } as unknown as Step;
const shape = (steps: Step[]) => steps.map(step => step.id ?? step.type);

describe('операции над блоками «Если»', () => {
  it('↑ у первого шага руки выносит его из блока, ↓ над блоком — вносит в первую руку', () => {
    const steps = [s('a'), IF('@x'), s('b'), END];
    const groups = groupSteps(steps);
    const b = groups.findIndex(g => g.step.id === 'b');
    expect(shape(moveGroup(steps, b, -1))).toEqual(['a', 'b', 'branch', 'end']);
    expect(shape(moveGroup(steps, 0, 1))).toEqual(['branch', 'a', 'b', 'end']);
  });

  it('блок двигается целиком и перепрыгивает соседа', () => {
    const steps = [s('a'), IF('@x'), s('b'), ELSE, s('c'), END, s('d')];
    expect(shape(moveSpan(steps, blockSpan(steps, 1), 1, true))).toEqual(['a', 'd', 'branch', 'b', 'orElse', 'c', 'end']);
    expect(shape(moveSpan(steps, blockSpan(steps, 1), -1, true))).toEqual(['branch', 'b', 'orElse', 'c', 'end', 'a', 'd']);
  });

  it('«Для каждого из» не заезжает внутрь блока — перепрыгивает его целиком', () => {
    const steps = [EACH, IF('@x'), s('b'), END];
    expect(shape(moveGroup(steps, 0, 1))).toEqual(['branch', 'b', 'end', 'each']);
    expect(validFlow([IF('@x'), EACH, END])).toBe(false);
  });

  it('руки: «иначе, если» встаёт перед «иначе»; убрать ветку; конец руки', () => {
    const steps = [IF('@x'), s('b'), ELSE, s('c'), END];
    const more = addArm(steps, 0, true);
    expect(shape(more)).toEqual(['branch', 'b', 'orElse', 'orElse', 'c', 'end']);
    expect((more[2] as { if?: unknown }).if).toEqual({ expr: '' });
    expect(shape(dropArm(steps, 2))).toEqual(['branch', 'b', 'end']);
    expect(armEnd(steps, 0)).toBe(2);
    expect(armEnd(steps, 2)).toBe(4);
  });

  it('снять «Если» — шаги остаются на месте', () => {
    expect(shape(unwrapBlock([s('a'), IF('@x'), s('b'), END, s('c')], 1))).toEqual(['a', 'b', 'c']);
  });
});
