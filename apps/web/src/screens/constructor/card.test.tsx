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
    // Имя числа в строке ОДНО: кость уехала внутрь него, а не встала
    // вторым слагаемым. Раньше здесь и появлялся второй «+ #n».
    expect(apply.value).toEqual({ expr: '#n', of: 'target' });
    expect(apply.direction).toBe('set');
  });

  // Без обработчика, умеющего завести число (так карточка живёт в этих
  // тестах), набранная кость не теряется молча — карточка объясняет.
  // В приложении обработчик есть, и число заводится само: см. тест ниже.
  it('завести число некому — набранная кость не теряется молча', () => {
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
    // Данные не тронуты, но человек видит то, что посчитается. Имя числа
    // подписано его содержимым: «dmg» человеку ничего не говорит.
    const line = screen.getByText('станет').closest('label')!;
    expect(line.textContent).toContain('Класс брони');
    expect(line.textContent).toContain('Кость урона');
    expect(line.textContent).not.toContain('#n');
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
// Строка броска — обычная формула: кость пишется текстом, поля становятся
// фишками. Декоративных знаков нет: что видно, то автор и написал.
describe('GroupCard: строка броска', () => {
  const rollSteps = () => [{
    type: 'threshold', side: 'sender', successWhen: 'atLeast', continueOn: 'success',
    roll: { die: { constant: 'lead' }, bonus: { expr: '#armor' }, check: null },
  }] as unknown as Step[];

  it('кость стоит в строке текстом, поле — фишкой', () => {
    const group = groupSteps(rollSteps())[0]!;
    render(<GroupCard group={group} position={1} system={system} effect={effect}
      earlier={[]} problem={null} edit={() => {}} onDelete={() => {}} />);
    const line = screen.getByText('бросок').closest('label')!;
    // Кость — часть математики, а не отдельная сущность в рамке.
    expect(line.textContent).toContain('Класс брони');
    const head = line.querySelector('.chips__text') as HTMLInputElement;
    expect(head.value).toContain('1d20');
  });

  // Прежняя версия рисовала «+» за автора, и его собственный плюс давал два.
  it('лишнего знака в строке нет: что видно, то и написано', () => {
    const group = groupSteps(rollSteps())[0]!;
    const { container } = render(<GroupCard group={group} position={1} system={system} effect={effect}
      earlier={[]} problem={null} edit={() => {}} onDelete={() => {}} />);
    expect(container.querySelector('.chips__plus')).toBeNull();
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

// Присланное число — это слагаемые, а не один ком: у кости и у прибавки
// свои фишки и свои крестики. Считает их отправитель (потому «прислано»),
// но видеть и убирать автор должен по отдельности.
describe('GroupCard: присланное число по слагаемым', () => {
  const steps = () => [
    { id: 'n', type: 'amount', source: 'roll', dice: { param: 'кость_урона' }, bonus: { expr: '#armor' } },
    { type: 'apply', target: { tag: 'armor' }, direction: 'subtract', value: { ref: 'n' } },
  ] as unknown as Step[];
  const withParam = { params: [{ key: 'кость_урона', label: 'Кость урона', kind: 'dice' }] } as unknown as Effect;

  it('кость и прибавка стоят разными фишками', () => {
    const group = groupSteps(steps())[0]!;
    render(<GroupCard group={group} position={1} system={system} effect={withParam}
      earlier={[]} problem={null} edit={() => {}} onDelete={() => {}} />);

    const line = screen.getByText('станет').closest('label')!;
    const sent = [...line.querySelectorAll('.chips__chip--sent')];
    expect(sent).toHaveLength(2);
    expect(sent[0]!.textContent).toContain('Кость урона');
    expect(sent[1]!.textContent).toContain('Класс брони');
    // И обе честно подписаны стороной: считал их не тот, чей это лист.
    expect(sent.every(c => c.textContent?.includes('у отправителя'))).toBe(true);
  });

  it('крестик убирает ровно своё слагаемое', () => {
    const list = steps();
    const amount = list[0] as Record<string, any>;
    const group = groupSteps(list)[0]!;
    render(<GroupCard group={group} position={1} system={system} effect={withParam}
      earlier={[]} problem={null}
      edit={(at, change) => { if (at === 0) change(amount as never); }} onDelete={() => {}} />);

    const line = screen.getByText('станет').closest('label')!;
    const [diceX] = [...line.querySelectorAll('.chips__chip--sent .chips__x')];
    fireEvent.mouseDown(diceX!);

    expect(amount.dice).toBeUndefined();
    expect(amount.bonus).toEqual({ expr: '#armor' }, 'прибавка не тронута');
  });
});

// Число — не карточка, которую автор обязан завести заранее, а внутренность
// изменения. Пока его заводили руками, «изменение» стояло одиноким `apply`,
// и всё, что считает отправитель, писалось некуда: выбор «из записи» тихо
// уходил в никуда, а набранная кость упиралась в совет завести карточку.
describe('GroupCard: изменение само заводит число', () => {
  const lone = () => [
    { type: 'apply', target: { tag: 'armor' }, direction: 'set' },
  ] as unknown as Step[];

  // Тот же обработчик, что даёт вкладка эффектов: заводит число перед
  // изменением и правит пару одной правкой.
  const mount = (steps: Step[], effectOf: Effect = effect) => {
    const group = groupSteps(steps)[0]!;
    render(<GroupCard group={group} position={1} system={system} effect={effectOf}
      earlier={[]} problem={null}
      edit={(at, change) => change(steps[group.indices[at] ?? group.indices[0]!]!)}
      withNumber={change => {
        const applyAt = group.indices[group.indices.length - 1]!;
        let amountAt = group.amount ? group.indices[0]! : -1;
        if (amountAt < 0) {
          steps.splice(applyAt, 0, { id: 'n', type: 'amount', source: 'roll' } as never);
          amountAt = applyAt;
        }
        change(steps[amountAt]!, steps[amountAt + 1]!, String(steps[amountAt]!.id));
      }}
      onDelete={() => {}} />);
    const line = screen.getByText('станет').closest('label')!;
    return { line, value: [...line.querySelectorAll('.chips__text')].at(-1) as HTMLInputElement };
  };

  it('набранная кость заводит число и оставляет в строке его имя', () => {
    const steps = lone();
    const { value } = mount(steps);
    fireEvent.change(value, { target: { value: '1d8' } });
    fireEvent.keyDown(value, { key: 'Enter' });

    expect(steps).toHaveLength(2);
    expect(steps[0]).toMatchObject({ type: 'amount', dice: { const: '1d8' } });
    expect((steps[1] as any).value).toEqual({ expr: '#n', of: 'target' });
  });

  it('«из записи» больше не проваливается в пустоту', () => {
    const steps = [
      { type: 'apply', target: { tag: 'armor' }, direction: 'set', value: { expr: '#armor - ', of: 'target' } },
    ] as unknown as Step[];
    const withParam = { params: [{ key: 'урон', label: 'Кость урона', kind: 'dice' }] } as unknown as Effect;
    const { value } = mount(steps, withParam);

    // Подсказка живёт от каретки: фокус, набор «@», каретка за ним.
    fireEvent.focus(value);
    fireEvent.change(value, { target: { value: ' - @' } });
    value.selectionStart = 4;
    fireEvent.keyUp(value, { key: '@' });
    fireEvent.mouseDown(screen.getByText('Кость урона'));

    // Значение из записи уехало в число (его берёт отправитель), а строка
    // зовёт его по имени — раньше клик не делал ничего.
    expect(steps[0]).toMatchObject({ type: 'amount', dice: { param: 'урон' } });
    expect((steps[1] as any).value).toEqual({ expr: '#armor - #n', of: 'target' });
  });

  // Ответ на «как поменять у цели на у отправителя»: щелчок по подписи.
  // Слагаемое уезжает в число — считать его листом ЦЕЛИ нельзя, там чужая
  // сила (tests/rule.sides.test.ts в движке).
  it('щелчок по подписи «у цели» переносит слагаемое на лист отправителя', () => {
    const steps = lone();
    const { line } = mount(steps);
    const value = [...line.querySelectorAll('.chips__text')].at(-1) as HTMLInputElement;
    fireEvent.change(value, { target: { value: '#armor' } });
    fireEvent.keyDown(value, { key: 'Enter' });

    fireEvent.mouseDown(screen.getByTitle(/считать у отправителя/));

    expect(steps[0]).toMatchObject({ type: 'amount', bonus: { expr: '#armor' } });
    expect((steps[1] as any).value).toEqual({ expr: '#n', of: 'target' });
  });

  // Второе слагаемое складывается с содержимым числа, и знак тут решает
  // всё: «ХП − #n + Сила» это «ХП − (урон − Сила)». Сложить их через «+»
  // значило бы поменять математику молча — ровно то, ради чего затевался
  // весь разбор сторон.
  it('знак слагаемого сохраняется при переносе к отправителю', () => {
    const steps = [
      { id: 'n', type: 'amount', source: 'roll', bonus: { expr: '#armor' } },
      { type: 'apply', target: { tag: 'armor' }, direction: 'set',
        value: { expr: '#armor - #n + #armor', of: 'target' } },
    ] as unknown as Step[];
    mount(steps);

    // Переключаем ПОСЛЕДНЕЕ слагаемое — оно стоит с «+», а число с «−».
    const flips = [...screen.getByText('станет').closest('label')!
      .querySelectorAll('.chips__side--pick')];
    fireEvent.mouseDown(flips.at(-1)!);

    expect((steps[0] as any).bonus).toEqual({ expr: '#armor - #armor' });
    expect((steps[1] as any).value).toEqual({ expr: '#armor - #n', of: 'target' });
  });

  it('умножение не переносят молча — карточка объясняет, что делать', () => {
    const steps = [
      { id: 'n', type: 'amount', source: 'roll' },
      { type: 'apply', target: { tag: 'armor' }, direction: 'set',
        value: { expr: '#n * #armor', of: 'target' } },
    ] as unknown as Step[];
    mount(steps);

    fireEvent.mouseDown([...screen.getByText('станет').closest('label')!
      .querySelectorAll('.chips__side--pick')].at(-1)!);

    expect((steps[0] as any).bonus).toBeUndefined();
    expect(screen.getByText(/вынесите его отдельной карточкой/)).toBeTruthy();
  });

  it('и обратно: присланное слагаемое возвращается цели', () => {
    const steps = [
      { id: 'n', type: 'amount', source: 'roll', bonus: { expr: '#armor' } },
      { type: 'apply', target: { tag: 'armor' }, direction: 'set', value: { expr: '#n', of: 'target' } },
    ] as unknown as Step[];
    mount(steps);

    fireEvent.mouseDown(screen.getByTitle(/вернуть цели/));

    expect((steps[0] as any).bonus).toBeUndefined();
    expect((steps[1] as any).value).toEqual({ expr: '#armor', of: 'target' });
  });
});
