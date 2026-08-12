// apps/web/src/screens/constructor/card.test.tsx
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GroupCard } from './card.tsx';
import { groupSteps } from './cards.ts';
import type { System, Effect, Step } from '@vtt/schema';

const system = {
  fields: [{ tag: 'armor', label: 'Класс брони', value: { kind: 'stored', type: 'number', default: 10 } }],
  constants: { lead: { label: 'Ведущая кость', kind: 'die', dice: [{ sides: 20 }] } },
  rolls: [], effects: {},
} as unknown as System;
const effect = { params: [] } as unknown as Effect;

// Те же шаги, что автор собрал бы кирпичами: проверка + число + изменение.
const attackSteps = () => [
  {
    type: 'threshold', side: 'sender', successWhen: 'atLeast', continueOn: 'success',
    roll: { die: { constant: 'lead' }, check: null },
  },
  { id: 'n', type: 'amount', source: 'roll' },
  { type: 'apply', direction: 'subtract', targetModifiers: true, value: { ref: 'n' } },
] as unknown as Step[];

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

  // Кость и прибавка набираются ОДНОЙ строкой, а в данные ложатся порознь:
  // кость бросает отправитель, формулу считает лист.
  it('строка величины делится на кость и прибавку внутреннего числа', () => {
    const steps = attackSteps();
    const group = groupSteps(steps)[1]!;
    const amount = structuredClone(group.amount!) as any;
    let editedAt: number | null = null;
    render(<GroupCard group={group} position={2} system={system} effect={effect}
      earlier={[]} problem={null}
      edit={(at, change) => { editedAt = at; change(amount); }}
      onDelete={() => {}} />);
    const value = screen.getByPlaceholderText('1d8 + @Мод Силы');
    fireEvent.change(value, { target: { value: '1d8 + #power' } });
    fireEvent.keyDown(value, { key: 'Enter' });
    expect(editedAt).toBe(0);
    expect(amount.dice).toEqual({ const: '1d8' });
    expect(amount.bonus).toEqual({ expr: '#power' });
  });

  // STEP_SPECS (step-card.tsx) держит «против» на ['tag', 'expr', 'const'] —
  // карточка была строже своей же модели и отбрасывала набранное число или
  // формулу молча (allow не пускал ни 'const', ни 'expr'). Образцовый
  // «Спасбросок» хранит versus: {expr:'#spell_dc'}, а «против 15» — обычный
  // случай; оба обязаны коммититься.
  it('слот «против» принимает число', () => {
    const steps = attackSteps();
    const group = groupSteps(steps)[0]!;
    const edits: Array<(draft: Step) => void> = [];
    render(<GroupCard group={group} position={1} system={system} effect={effect}
      earlier={[]} problem={null} edit={(_, change) => edits.push(change)} onDelete={() => {}} />);

    const versus = screen.getByPlaceholderText('число или формула');
    fireEvent.change(versus, { target: { value: '15' } });
    fireEvent.keyDown(versus, { key: 'Enter' });

    const draft = structuredClone(steps[0]!);
    edits.forEach(change => change(draft));
    expect((draft as any).versus).toEqual({ const: 15 });
  });

  it('слот «против» принимает формулу', () => {
    const steps = attackSteps();
    const group = groupSteps(steps)[0]!;
    const edits: Array<(draft: Step) => void> = [];
    render(<GroupCard group={group} position={1} system={system} effect={effect}
      earlier={[]} problem={null} edit={(_, change) => edits.push(change)} onDelete={() => {}} />);

    const versus = screen.getByPlaceholderText('число или формула');
    fireEvent.change(versus, { target: { value: '#что-то' } });
    fireEvent.keyDown(versus, { key: 'Enter' });

    const draft = structuredClone(steps[0]!);
    edits.forEach(change => change(draft));
    expect((draft as any).versus).toEqual({ expr: '#что-то' });
  });

  // STEP_SPECS держит floor/ceiling на ['const', 'tag', 'empty'] — карточка
  // разрешала только 'tag', как у трёх эффектов образца (floor: {const: 0}).
  it('слот «не ниже» принимает число', () => {
    const steps = attackSteps();
    const group = groupSteps(steps)[1]!;
    const applyIndex = group.amount ? 1 : 0;
    const edits: Array<{ at: number; change: (draft: Step) => void }> = [];
    render(<GroupCard group={group} position={2} system={system} effect={effect}
      earlier={[]} problem={null} edit={(at, change) => edits.push({ at, change })} onDelete={() => {}} />);

    const floor = screen.getByLabelText('не ниже');
    fireEvent.change(floor, { target: { value: '0' } });
    fireEvent.keyDown(floor, { key: 'Enter' });

    const draft = structuredClone(steps[2]!);
    edits.filter(e => e.at === applyIndex).forEach(e => e.change(draft));
    expect((draft as any).floor).toEqual({ const: 0 });
  });

  it('пересказ не отрывает точку от слова', () => {
    const group = groupSteps(attackSteps())[0]!;
    const { container } = render(<GroupCard group={group} position={1} system={system} effect={effect}
      earlier={[]} problem={null} edit={() => {}} onDelete={() => {}} />);
    const text = container.querySelector('.readback')!.textContent!;
    expect(text).not.toMatch(/\s[.,]/);
  });
});

// Кость «из записи» формулой не выражается — но человеку она такая же
// ссылка, как поле листа: в строке стоит фишкой, а текст правит только
// прибавку. Стереть её строкой нельзя, только крестиком на фишке.
describe('GroupCard: величина из записи', () => {
  const steps = () => [
    { id: 'n', type: 'amount', source: 'roll', dice: { param: 'кость_урона' }, bonus: { expr: '#armor' } },
    { type: 'apply', direction: 'subtract', value: { ref: 'n' } },
  ] as unknown as Step[];
  const withParam = { params: [{ key: 'кость_урона', label: 'Кость урона', kind: 'dice' }] } as unknown as Effect;

  it('кость из записи стоит в строке фишкой', () => {
    const group = groupSteps(steps())[0]!;
    render(<GroupCard group={group} position={1} system={system} effect={withParam}
      earlier={[]} problem={null} edit={() => {}} onDelete={() => {}} />);
    expect(screen.getByText('Кость урона')).toBeTruthy();
    expect(screen.getByText('сколько')).toBeTruthy();
    expect(screen.queryByText('сколько — кости')).toBeNull();
  });

  it('правка строки трогает прибавку, но не кость из записи', () => {
    const list = steps();
    const amount = list[0] as Record<string, any>;
    const group = groupSteps(list)[0]!;
    render(<GroupCard group={group} position={1} system={system} effect={withParam}
      earlier={[]} problem={null}
      edit={(_, change) => change(amount as never)} onDelete={() => {}} />);
    // «#armor» нарисован фишкой, дописываем в хвост ЭТОЙ строки — как рукой.
    const line = screen.getByText('сколько').closest('label')!;
    const tail = [...line.querySelectorAll('.chips__text')].at(-1) as HTMLInputElement;
    fireEvent.change(tail, { target: { value: ' + 2' } });
    fireEvent.keyDown(tail, { key: 'Enter' });
    expect(amount.bonus).toEqual({ expr: '#armor + 2' });
    expect(amount.dice).toEqual({ param: 'кость_урона' });
  });

  it('крестик на фишке убирает кость из записи', () => {
    const list = steps();
    const amount = list[0] as Record<string, any>;
    const group = groupSteps(list)[0]!;
    render(<GroupCard group={group} position={1} system={system} effect={withParam}
      earlier={[]} problem={null}
      edit={(_, change) => change(amount as never)} onDelete={() => {}} />);
    fireEvent.mouseDown(screen.getByLabelText('убрать из записи'));
    expect(amount.dice).toBeUndefined();
  });
});
