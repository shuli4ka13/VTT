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

  // «Чем поле станет» — обычная математика. Кость в формуле не считается
  // (её бросает отправитель), поэтому набранная нотация уезжает в величину
  // карточки, а в выражении остаётся её имя.
  it('выражение ложится в «применить», а кость — в величину под своим именем', () => {
    const steps = [
      { id: 'n', type: 'amount', source: 'roll' },
      { type: 'apply', target: { tag: 'armor' }, direction: 'set', value: { ref: 'n' } },
    ] as unknown as Step[];
    const group = groupSteps(steps)[0]!;
    const amount = steps[0] as any;
    const apply = steps[1] as any;
    render(<GroupCard group={group} position={2} system={system} effect={effect}
      earlier={[]} problem={null}
      edit={(at, change) => change((at === 0 ? amount : apply) as never)}
      onDelete={() => {}} />);

    // Дописываем в хвост, как рукой: «станет #n + 1d8».
    const line = screen.getByText('станет').closest('label')!;
    const value = [...line.querySelectorAll('.chips__text')].at(-1) as HTMLInputElement;
    fireEvent.change(value, { target: { value: ' + 1d8' } });
    fireEvent.keyDown(value, { key: 'Enter' });

    // Кость уехала в величину — формулой её не посчитать, её бросает
    // отправитель, — а в выражении осталось имя.
    expect(amount.dice).toEqual({ const: '1d8' });
    expect(apply.value).toEqual({ expr: '#n + #n', of: 'target' });
    expect(apply.direction).toBe('set');
  });

  it('без величины кость в формулу не пускают — и объясняют почему', () => {
    const steps = [
      { type: 'apply', target: { tag: 'armor' }, direction: 'set' },
    ] as unknown as Step[];
    const group = groupSteps(steps)[0]!;
    render(<GroupCard group={group} position={1} system={system} effect={effect}
      earlier={[]} problem={null} edit={() => {}} onDelete={() => {}} />);

    const line = screen.getByText('станет').closest('label')!;
    const value = [...line.querySelectorAll('.chips__text')].at(-1) as HTMLInputElement;
    fireEvent.change(value, { target: { value: '1d8' } });
    fireEvent.keyDown(value, { key: 'Enter' });
    expect(screen.getByText(/кость бросает отправитель/)).toBeTruthy();
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

// «Из записи» — тоже число, которого у формулы нет: его берёт величина
// карточки, а выражение зовёт её по имени. Так кость меча и брошенный кубик
// живут одинаково, и выражение остаётся обычной математикой.
describe('GroupCard: величина из записи', () => {
  const steps = () => [
    { id: 'n', type: 'amount', source: 'roll', dice: { param: 'кость_урона' } },
    { type: 'apply', target: { tag: 'armor' }, direction: 'subtract', value: { ref: 'n' } },
  ] as unknown as Step[];
  const withParam = { params: [{ key: 'кость_урона', label: 'Кость урона', kind: 'dice' }] } as unknown as Effect;

  it('старое «направление + величина» показывается выражением', () => {
    const group = groupSteps(steps())[0]!;
    render(<GroupCard group={group} position={1} system={system} effect={withParam}
      earlier={[]} problem={null} edit={() => {}} onDelete={() => {}} />);
    // Данные не тронуты, но человек видит то, что посчитается: поле-тег
    // рисуется фишкой, имя величины остаётся текстом.
    const line = screen.getByText('станет').closest('label')!;
    expect(line.textContent).toContain('Класс брони');
    expect(line.textContent).toContain('n');
  });

  it('правка выражения кладёт его в «применить» и не трогает величину', () => {
    const list = steps();
    const amount = list[0] as Record<string, any>;
    const apply = list[1] as Record<string, any>;
    const group = groupSteps(list)[0]!;
    render(<GroupCard group={group} position={1} system={system} effect={withParam}
      earlier={[]} problem={null}
      edit={(at, change) => change((at === 0 ? amount : apply) as never)} onDelete={() => {}} />);

    const line = screen.getByText('станет').closest('label')!;
    const tail = [...line.querySelectorAll('.chips__text')].at(-1) as HTMLInputElement;
    fireEvent.change(tail, { target: { value: ' - 2' } });
    fireEvent.keyDown(tail, { key: 'Enter' });

    // Было «#armor - #n» показом старых данных, стало выражением в данных.
    expect(apply.value).toEqual({ expr: '#armor - #n - 2', of: 'target' });
    expect(apply.direction).toBe('set');
    expect(amount.dice).toEqual({ param: 'кость_урона' }, 'величина осталась своей');
  });
});

// Кость — фишка и не исчезает, пока набирают прибавку; набранная нотация
// её заменяет; неразбираемая формула не уходит в данные молча.
describe('GroupCard: строка броска с фишкой кости', () => {
  const rollSteps = () => [{
    type: 'threshold', side: 'sender', successWhen: 'atLeast', continueOn: 'success',
    roll: { die: { constant: 'lead' }, bonus: { expr: '#armor' }, check: null },
  }] as unknown as Step[];

  it('фишка кости остаётся видна во время набора', () => {
    const group = groupSteps(rollSteps())[0]!;
    render(<GroupCard group={group} position={1} system={system} effect={effect}
      earlier={[]} problem={null} edit={() => {}} onDelete={() => {}} />);
    const line = screen.getByText('бросок').closest('label')!;
    const tail = [...line.querySelectorAll('.chips__text')].at(-1) as HTMLInputElement;
    fireEvent.change(tail, { target: { value: ' + 2' } });
    // Фишка кости — в самой строке, а не только в пересказе над карточкой.
    expect(line.querySelector('.chips__chip')?.textContent).toContain('1d20');
  });

  it('набранная нотация заменяет кость', () => {
    const steps = rollSteps();
    const step = steps[0] as Record<string, any>;
    const group = groupSteps(steps)[0]!;
    render(<GroupCard group={group} position={1} system={system} effect={effect}
      earlier={[]} problem={null} edit={(_, change) => change(step as never)} onDelete={() => {}} />);
    const line = screen.getByText('бросок').closest('label')!;
    // Нотацию пишут в начале строки — там же, где её читают.
    const head = line.querySelector('.chips__text') as HTMLInputElement;
    fireEvent.change(head, { target: { value: '3d15 + ' } });
    fireEvent.keyDown(head, { key: 'Enter' });
    expect(step.roll.die).toEqual({ const: '3d15' });
  });

  it('непонятая формула не уходит в данные, а показывается ошибкой', () => {
    const steps = rollSteps();
    const step = steps[0] as Record<string, any>;
    const group = groupSteps(steps)[0]!;
    render(<GroupCard group={group} position={1} system={system} effect={effect}
      earlier={[]} problem={null} edit={(_, change) => change(step as never)} onDelete={() => {}} />);
    const line = screen.getByText('бросок').closest('label')!;
    const tail = [...line.querySelectorAll('.chips__text')].at(-1) as HTMLInputElement;
    fireEvent.change(tail, { target: { value: '@ерунда' } });
    fireEvent.keyDown(tail, { key: 'Enter' });
    expect(step.roll.bonus).toEqual({ expr: '#armor' });
    expect(line.querySelector('.field__error')).toBeTruthy();
  });
});
