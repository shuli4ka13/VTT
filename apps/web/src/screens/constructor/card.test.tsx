// apps/web/src/screens/constructor/card.test.tsx
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GroupCard } from './card.tsx';
import { groupSteps, STEP_TEMPLATES } from './cards.ts';
import type { System, Effect, Step } from '@vtt/schema';

const system = {
  fields: [{ tag: 'armor', label: 'Класс брони', value: { kind: 'stored', type: 'number', default: 10 } }],
  constants: { lead: { label: 'Ведущая кость', kind: 'die', dice: [{ sides: 20 }] } },
  rolls: [], effects: {},
} as unknown as System;
const effect = { params: [] } as unknown as Effect;

const attackSteps = () => STEP_TEMPLATES.find(t => t.key === 'attack')!.make(system, []);

describe('GroupCard', () => {
  it('проверка показывает пересказ с пропуском мишени', () => {
    const group = groupSteps(attackSteps())[0]!;
    render(<GroupCard group={group} position={1} system={system} effect={effect}
      earlier={[]} problem={null} edit={() => {}} onDelete={() => {}} />);
    expect(screen.getByText('какого поля цели?')).toBeTruthy();
  });

  it('переключение «без броска» меняет тип на compare, не стирая roll', () => {
    const steps = attackSteps();
    const group = groupSteps(steps)[0]!;
    const edits: Array<(draft: Step) => void> = [];
    render(<GroupCard group={group} position={1} system={system} effect={effect}
      earlier={[]} problem={null} edit={(_, change) => edits.push(change)} onDelete={() => {}} />);
    fireEvent.click(screen.getByText('без броска'));
    const draft = structuredClone(steps[0]!);
    edits.forEach(change => change(draft));
    expect(draft.type).toBe('compare');
    expect((draft as any).roll).toBeDefined();
  });

  it('склеенное изменение правит кости внутреннего числа', () => {
    const steps = attackSteps();
    const group = groupSteps(steps)[1]!;
    let edited: { at: number } | null = null;
    render(<GroupCard group={group} position={2} system={system} effect={effect}
      earlier={[]} problem={null}
      edit={(at, change) => { edited = { at }; change(structuredClone(group.amount!)); }}
      onDelete={() => {}} />);
    const dice = screen.getByPlaceholderText('какие кости: 1к8, 2к6…');
    fireEvent.change(dice, { target: { value: '1d8' } });
    fireEvent.keyDown(dice, { key: 'Enter' });
    expect(edited).toEqual({ at: 0 });
  });
});
