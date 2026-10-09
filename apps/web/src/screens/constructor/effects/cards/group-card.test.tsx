// @vitest-environment jsdom
import { within as cards } from '../../../../testing/cards.ts';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GroupCard } from './group-card.tsx';
import { groupSteps } from '../../cards.ts';
import type { System, Effect, Step } from '@vtt/schema';

const system = {
  tables: { лист: { shape: 'single', columns: [{ key: 'armor', label: 'Класс брони', kind: 'number', default: 10 }] } },
  constants: { lead: { label: 'Ведущая кость', kind: 'die', dice: [{ sides: 20 }] } },
  rolls: [], effects: {},
} as unknown as System;
const effect = { params: [] } as unknown as Effect;

const sheets = new Map([['цель', 'цель'], ['действующий', 'Кто действует']]);

const attackSteps = () => [
  { id: 'hit_бросок', type: 'roll', die: 'lead', by: { expr: '@действующий' } },
  { id: 'hit', type: 'check', successWhen: 'atLeast', value: { expr: '@hit_бросок' }, versus: { expr: '10' } },
  { id: 'n', type: 'roll' },
  { type: 'apply', target: { expr: '@цель.armor' }, direction: 'subtract', value: { expr: '@n' } },
] as unknown as Step[];

describe('GroupCard', () => {
  it('«Бросает» и «Против кого» пишутся в бросок, а не в проверку; «Бросает» в паре не снимается — иначе пара распадётся', () => {
    const steps = attackSteps();
    const group = groupSteps(steps)[0]!;
    const edits: Array<[number, (draft: Step) => void]> = [];
    render(<GroupCard group={group} position={1} system={system} effect={effect} sheets={sheets}
      earlier={[]} problem={null} edit={(at, change) => edits.push([at, change])} onDelete={() => {}} />);
    expect(cards().field('Бросает').textContent).toContain('Кто действует');
    cards().formula('Бросает', '@цель');
    cards().formula('Против кого', '@цель');
    const draft = structuredClone(steps[0]!) as any;
    edits.forEach(([at, change]) => { expect(at).toBe(0); change(draft); });
    expect(draft.type).toBe('roll');
    expect(draft.by).toEqual({ expr: '@цель' });
    expect(draft.against).toEqual({ expr: '@цель' });
    expect(draft.die).toEqual('lead');

    edits.length = 0;
    cards().formula('Бросает', '');
    expect(edits).toEqual([]);
  });

  it('выражение ложится в «применить», а кость — в величину под своим именем', () => {
    const steps = [
      { id: 'n', type: 'roll' },
      { type: 'apply', target: { expr: '@цель.armor' }, direction: 'set', value: { expr: '@n' } },
    ] as unknown as Step[];
    const group = groupSteps(steps)[0]!;
    const amount = steps[0] as any;
    const apply = steps[1] as any;
    render(<GroupCard group={group} position={2} system={system} effect={effect} sheets={sheets}
      earlier={[]} problem={null}
      edit={(at, change) => change((at === 0 ? amount : apply) as never)}
      onDelete={() => {}} />);

    const line = screen.getByText('Сколько').closest('label')!;
    const value = [...line.querySelectorAll('.chips__text')].at(-1) as HTMLInputElement;
    fireEvent.change(value, { target: { value: ' + 1d8' } });
    fireEvent.keyDown(value, { key: 'Enter' });

    expect(amount.die).toEqual({ expr: '"1d8"' });

    expect(apply.value).toEqual({ expr: '@n' });
    expect(apply.direction).toBe('set');
  });

  it('завести число некому — набранная кость не теряется молча', () => {
    const steps = [
      { type: 'apply', target: { expr: '@цель.armor' }, direction: 'set' },
    ] as unknown as Step[];
    const group = groupSteps(steps)[0]!;
    render(<GroupCard group={group} position={1} system={system} effect={effect} sheets={sheets}
      earlier={[]} problem={null} edit={() => {}} onDelete={() => {}} />);

    const line = screen.getByText('Сколько').closest('label')!;
    const value = [...line.querySelectorAll('.chips__text')].at(-1) as HTMLInputElement;
    fireEvent.change(value, { target: { value: '1d8' } });
    fireEvent.keyDown(value, { key: 'Enter' });
    expect(screen.getByText(/кость бросает отдельный шаг/)).toBeTruthy();
  });

  it('в тонкостях изменения нет ни «не ниже», ни «не выше»', () => {
    const steps = attackSteps();
    const group = groupSteps(steps)[1]!;
    render(<GroupCard group={group} position={2} system={system} effect={effect}
      earlier={[]} problem={null} edit={() => {}} onDelete={() => {}} />);
    expect(screen.queryByText('не ниже')).toBeNull();
    expect(screen.queryByText('не выше')).toBeNull();
  });

  it('оборванная строка «станет» получает приговор, данные не тронуты', () => {
    const steps = [
      { type: 'apply', target: { expr: '@цель.armor' }, direction: 'set', value: { expr: '@цель.armor' } },
    ] as unknown as Step[];
    const group = groupSteps(steps)[0]!;
    render(<GroupCard group={group} position={1} system={system} effect={effect} sheets={sheets}
      earlier={[]} problem={null}
      edit={(_, change) => change(steps[0]!)} onDelete={() => {}} />);

    const line = screen.getByText('Сколько').closest('label')!;
    const value = [...line.querySelectorAll('.chips__text')].at(-1) as HTMLInputElement;
    fireEvent.change(value, { target: { value: ' + ' } });
    fireEvent.keyDown(value, { key: 'Enter' });

    expect((steps[0] as any).value).toEqual({ expr: '@цель.armor' }, 'мусор не записан');
    expect(screen.getByText(/оборвано/)).toBeTruthy();
  });

});

describe('GroupCard: условие и ход — не у шага', () => {
  const earlier = [{ id: 'hit', type: 'check', at: 1, title: 'Проверка' }];

  it('у изменения нет «Только если»: условие ставит блок «Если», шаг лишь оборачивает себя в него', () => {
    const steps = [{ type: 'apply', direction: 'subtract', value: { expr: '4' } }] as unknown as Step[];
    const group = groupSteps(steps)[0]!;
    let wrapped = 0;
    render(<GroupCard group={group} position={2} system={system} effect={effect}
      earlier={earlier} problem={null} edit={() => {}} onDelete={() => {}} onWrap={() => { wrapped++; }} />);
    expect(screen.queryByText('Только если')).toBeNull();
    expect([...document.querySelectorAll('select')].some(el => [...el.options].some(o => o.value === 'hit.success'))).toBe(false);
    cards().click('в «Если»');
    expect(wrapped).toBe(1);
  });

  it('у проверки нет «Шаги ниже идут при» и «Что сказать при остановке»; границы на кости — новыми словами', () => {
    const group = groupSteps(attackSteps())[0]!;
    render(<GroupCard group={group} position={1} system={system} effect={effect}
      earlier={[]} problem={null} edit={() => {}} onDelete={() => {}} />);
    const text = document.body.textContent ?? '';
    for (const gone of ['Шаги ниже идут при', 'Что сказать при остановке', 'Только если', 'Всегда успех', 'Всегда провал', 'Степени успеха']) expect(text).not.toContain(gone);
    expect(screen.queryByPlaceholderText('например: не хватает ячейки')).toBeNull();
    for (const label of ['Проверка', 'Успех, если на кости не меньше', 'Провал, если на кости не больше']) expect(cards().field(label)).toBeTruthy();
  });
});

describe('GroupCard: изменение как вызов', () => {
  const eventful = {
    ...system,
    effects: { ...system.effects, damage: { label: 'Урон', params: [{ key: 'amount', label: 'Сколько', kind: 'number', role: 'amount' }], steps: [] } },
  } as unknown as System;

  it('где есть вызываемый эффект, у изменения появляется третий режим, переводящий шаг в emit', () => {
    const steps = [
      { id: 'n', type: 'roll' },
      { type: 'apply', target: { expr: '@цель.armor' }, direction: 'subtract', value: { expr: '@n' } },
    ] as unknown as Step[];
    const group = groupSteps(steps)[0]!;
    const apply = steps[1] as any;
    render(<GroupCard group={group} position={1} system={eventful} effect={effect} sheets={sheets}
      earlier={[]} problem={null} edit={(at, change) => change((at === 1 ? apply : steps[0]) as never)}
      onDelete={() => {}} />);
    fireEvent.click(screen.getByText('вызов'));
    expect(apply.type).toBe('emit');
    expect(apply.effect).toBe('damage');
    expect(apply.args).toEqual({ amount: { expr: '@n' } });
  });

  it('счёт и вызов — два шага, у вызова видно, что уходит', () => {
    const steps = [
      { id: 'n', type: 'roll' },
      { type: 'emit', effect: 'damage', args: { amount: { expr: '@n' } } },
    ] as unknown as Step[];
    const cards = groupSteps(steps);
    expect(cards.map(c => c.kind), 'число больше не прячется внутри вызова').toEqual(['number', 'change']);

    render(<GroupCard group={cards[1]!} position={2} system={eventful} effect={effect}
      earlier={[]} problem={null} edit={() => {}} onDelete={() => {}} />);
    expect(screen.getByText('Какой эффект')).toBeTruthy();
    expect(screen.getByText('Сколько')).toBeTruthy();
    expect(screen.queryByText('метки')).toBeNull();
  });

  it('вызов → состояние: вызванный эффект-кнопка не остаётся «состоянием» и не тащит свои входы, и наоборот', () => {
    const both = {
      ...eventful,
      effects: { ...eventful.effects, prone: { label: 'Лежит', activation: 'passive', params: [{ key: 'by', label: 'Кто сбил', kind: 'sheet' }], steps: [] } },
    } as unknown as System;
    const emit = { type: 'emit', effect: 'damage', args: { amount: { expr: '5' } } } as any;
    const first = render(<GroupCard group={groupSteps([emit])[0]!} position={1} system={both} effect={effect} sheets={sheets}
      earlier={[]} problem={null} edit={(_, change) => change(emit)} onDelete={() => {}} />);
    fireEvent.click(screen.getByText('состояние'));
    expect(emit.type).toBe('status');
    expect(emit.effect).toBeUndefined();
    expect(emit.args).toBeUndefined();
    first.unmount();

    const status = { type: 'status', effect: 'prone', to: { expr: '@цель' }, args: { by: { expr: '@действующий' } } } as any;
    render(<GroupCard group={groupSteps([status])[0]!} position={1} system={both} effect={effect} sheets={sheets}
      earlier={[]} problem={null} edit={(_, change) => change(status)} onDelete={() => {}} />);
    fireEvent.click(screen.getByText('вызов'));
    expect(status.type).toBe('emit');
    expect(status.effect).toBe('damage');
    expect(status.args).toBeUndefined();
  });

  it('у состояния с эффектом-кнопкой нет полей «Запомнит» — это входы кнопки, а не состояния', () => {
    const step = { type: 'status', effect: 'damage', to: { expr: '@цель' } } as unknown as Step;
    render(<GroupCard group={groupSteps([step])[0]!} position={1} system={eventful} effect={effect} sheets={sheets}
      earlier={[]} problem={null} edit={() => {}} onDelete={() => {}} />);
    expect(screen.queryByText(/Запомнит/)).toBeNull();
  });

  it('без вызываемых эффектов режима «вызов» нет', () => {
    const group = groupSteps(attackSteps())[1]!;
    render(<GroupCard group={group} position={2} system={system} effect={effect}
      earlier={[]} problem={null} edit={() => {}} onDelete={() => {}} />);
    expect(screen.queryByText('вызов')).toBeNull();
  });
});

describe('GroupCard: величина из записи', () => {
  const steps = () => [
    { id: 'n', type: 'roll', die: { expr: '@кость_урона' } },
    { type: 'apply', target: { expr: '@цель.armor' }, direction: 'subtract', value: { expr: '@n' } },
  ] as unknown as Step[];
  const withParam = { params: [{ key: 'кость_урона', label: 'Кость урона', kind: 'dice' }] } as unknown as Effect;

  it('направление — отдельный выбор, в формуле только величина', () => {
    const group = groupSteps(steps())[0]!;
    render(<GroupCard group={group} position={1} system={system} effect={withParam} sheets={sheets}
      earlier={[]} problem={null} edit={() => {}} onDelete={() => {}} />);

    expect((screen.getByDisplayValue('отнять') as HTMLSelectElement).value).toBe('subtract');
    const line = screen.getByText('Сколько').closest('label')!;
    expect(line.textContent).toContain('Кость урона');
    expect(line.textContent).not.toContain('Класс брони');
    expect(line.textContent).not.toContain('@n');
  });

  it('правка выражения кладёт его в «применить» и не трогает величину', () => {
    const list = steps();
    const amount = list[0] as Record<string, any>;
    const apply = list[1] as Record<string, any>;
    const group = groupSteps(list)[0]!;
    render(<GroupCard group={group} position={1} system={system} effect={withParam} sheets={sheets}
      earlier={[]} problem={null}
      edit={(at, change) => change((at === 0 ? amount : apply) as never)} onDelete={() => {}} />);

    const line = screen.getByText('Сколько').closest('label')!;
    const tail = [...line.querySelectorAll('.chips__text')].at(-1) as HTMLInputElement;
    fireEvent.change(tail, { target: { value: ' - 2' } });
    fireEvent.keyDown(tail, { key: 'Enter' });

    expect(apply.value).toEqual({ expr: '@n - 2' });
    expect(apply.direction).toBe('subtract');
    expect(amount.die).toEqual({ expr: '@кость_урона' }, 'величина осталась своей');
  });
});

const checkCell = (): HTMLElement => cards().field('Проверка');

describe('GroupCard: проверка одной формулой', () => {
  const checkSteps = () => [
    { id: 'c_бросок', type: 'roll', die: 'lead', by: { expr: '@действующий' } },
    { id: 'c', type: 'check', successWhen: 'atLeast', value: { expr: '@c_бросок' }, versus: { expr: '10' } },
  ] as unknown as Step[];

  const typed = (tail: string) => {
    const steps = checkSteps();
    const roll = steps[0] as Record<string, any>;
    const check = steps[1] as Record<string, any>;
    const group = groupSteps(steps)[0]!;
    render(<GroupCard group={group} position={1} system={system} effect={effect} sheets={sheets}
      earlier={[]} problem={null} edit={(at, change) => change((at === 0 ? roll : check) as never)} onDelete={() => {}} />);
    const line = checkCell();
    const last = [...line.querySelectorAll('.chips__text')].at(-1) as HTMLInputElement;
    fireEvent.change(last, { target: { value: tail } });
    fireEvent.keyDown(last, { key: 'Enter' });
    return { roll, check, line };
  };

  it('кость — фишкой, сравнение — текстом в той же строке', () => {
    const group = groupSteps(checkSteps())[0]!;
    render(<GroupCard group={group} position={1} system={system} effect={effect} sheets={sheets}
      earlier={[]} problem={null} edit={() => {}} onDelete={() => {}} />);
    const line = checkCell();
    expect(line.textContent).toContain('Ведущая кость');
    const texts = [...line.querySelectorAll('.chips__text')].map(i => (i as HTMLInputElement).value).join('');
    expect(texts).toContain('>= 10');
  });

  it('правка строки раскладывается по частям: бросок отдельно, сравнение отдельно', () => {
    const { roll, check } = typed(') + 2 >= @цель.armor');
    expect(roll.die).toEqual('lead');
    expect(roll.bonus).toEqual({ expr: '2' });
    expect(roll.by).toEqual({ expr: '@действующий' });
    expect(check.versus).toEqual({ expr: '@цель.armor' });
    expect(check.successWhen).toBeUndefined();
  });

  it('справа встречный бросок — ошибка: защита — отдельный шаг «бросок» того, кто защищается', () => {
    const { check, line } = typed(') > кинуть(1к20) + 1');
    expect(check.successWhen).toBe('atLeast');
    expect(check.versus).toEqual({ expr: '10' });
    expect(line.querySelector('.field__error')?.textContent).toMatch(/встречный бросок/);
  });

  it('проверка без сравнения не уходит в данные, а показывается ошибкой', () => {
    const { check, line } = typed(') + 2');
    expect(check.versus).toEqual({ expr: '10' });
    expect(line.querySelector('.field__error')).toBeTruthy();
  });
});

describe('GroupCard: присланное число по слагаемым', () => {
  const steps = () => [
    { id: 'n', type: 'roll', die: { expr: '@кость_урона' }, bonus: { expr: '@armor' } },
    { type: 'apply', target: { expr: '@цель.armor' }, direction: 'subtract', value: { expr: '@n' } },
  ] as unknown as Step[];
  const withParam = { params: [{ key: 'кость_урона', label: 'Кость урона', kind: 'dice' }] } as unknown as Effect;

  it('кость и прибавка стоят разными фишками', () => {
    const group = groupSteps(steps())[0]!;
    render(<GroupCard group={group} position={1} system={system} effect={withParam} sheets={sheets}
      earlier={[]} problem={null} edit={() => {}} onDelete={() => {}} />);

    const line = screen.getByText('Сколько').closest('label')!;
    const sent = [...line.querySelectorAll('.chips__chip--sent')];
    expect(sent).toHaveLength(2);
    expect(sent[0]!.textContent).toContain('Кость урона');
    expect(sent[1]!.textContent).toContain('Класс брони');

    expect(sent.every(c => c.textContent?.includes('расчёт'))).toBe(true);
  });

  it('крестик убирает ровно своё слагаемое', () => {
    const list = steps();
    const amount = list[0] as Record<string, any>;
    const group = groupSteps(list)[0]!;
    render(<GroupCard group={group} position={1} system={system} effect={withParam} sheets={sheets}
      earlier={[]} problem={null}
      edit={(at, change) => { if (at === 0) change(amount as never); }} onDelete={() => {}} />);

    const line = screen.getByText('Сколько').closest('label')!;
    const [diceX] = [...line.querySelectorAll('.chips__chip--sent .chips__x')];
    fireEvent.mouseDown(diceX!);

    expect(amount.die).toBeUndefined();
    expect(amount.bonus).toEqual({ expr: '@armor' }, 'прибавка не тронута');
  });
});

describe('GroupCard: изменение само заводит число', () => {
  const lone = () => [
    { type: 'apply', target: { expr: '@цель.armor' }, direction: 'set' },
  ] as unknown as Step[];

  const mount = (steps: Step[], effectOf: Effect = effect) => {
    const group = groupSteps(steps)[0]!;
    render(<GroupCard group={group} position={1} system={system} effect={effectOf} sheets={sheets}
      earlier={[]} problem={null}
      edit={(at, change) => change(steps[group.indices[at] ?? group.indices[0]!]!)}
      withNumber={change => {
        const applyAt = group.indices[group.indices.length - 1]!;
        let amountAt = group.amount ? group.indices[0]! : -1;
        if (amountAt < 0) {
          steps.splice(applyAt, 0, { id: 'n', type: 'roll' } as never);
          amountAt = applyAt;
        }
        change(steps[amountAt]!, steps[amountAt + 1]!, String(steps[amountAt]!.id));
      }}
      onDelete={() => {}} />);
    const line = screen.getByText('Сколько').closest('label')!;
    return { line, value: [...line.querySelectorAll('.chips__text')].at(-1) as HTMLInputElement };
  };

  it('набранная кость заводит число и оставляет в строке его имя', () => {
    const steps = lone();
    const { value } = mount(steps);
    fireEvent.change(value, { target: { value: '1d8' } });
    fireEvent.keyDown(value, { key: 'Enter' });

    expect(steps).toHaveLength(2);
    expect(steps[0]).toMatchObject({ type: 'roll', die: { expr: '"1d8"' } });
    expect((steps[1] as any).value).toEqual({ expr: '@n' });
  });

  it('«из записи» больше не проваливается в пустоту', () => {
    const steps = [
      { type: 'apply', target: { expr: '@цель.armor' }, direction: 'set', value: { expr: '@цель.armor - ' } },
    ] as unknown as Step[];
    const withParam = { params: [{ key: 'урон', label: 'Кость урона', kind: 'dice' }] } as unknown as Effect;
    const { value } = mount(steps, withParam);

    fireEvent.focus(value);
    fireEvent.change(value, { target: { value: ' - @' } });
    value.selectionStart = 4;
    fireEvent.keyUp(value, { key: '@' });
    fireEvent.mouseDown(screen.getByText('Кость урона'));

    expect(steps[0]).toMatchObject({ type: 'roll', die: { expr: '@урон' } });
    expect((steps[1] as any).value).toEqual({ expr: '@цель.armor - @n' });
  });

  it('у поля в формуле подписан лист, а не роль: значок только показывает, чьё поле', () => {
    const steps = [
      { type: 'apply', target: { expr: '@цель.armor' }, direction: 'set',
        value: { expr: '@цель.armor - @действующий.armor / 2' } },
    ] as unknown as Step[];
    const { line } = mount(steps);

    const badges = [...line.querySelectorAll('.chips__side--sheet')];
    expect(badges.map(b => b.textContent)).toEqual(['цель', 'Кто действует']);
    expect(line.querySelector('.chips__side--pick')).toBeNull();
    fireEvent.mouseDown(badges[1]!);
    const value = [...line.querySelectorAll('.chips__text')].at(-1) as HTMLInputElement;
    fireEvent.keyDown(value, { key: 'Enter' });

    expect((steps[0] as any).value).toEqual({ expr: '@цель.armor - @действующий.armor / 2' });
  });

  it('смена направления пишет только направление, величина остаётся', () => {
    const steps = [
      { type: 'apply', target: { expr: '@цель.armor' }, direction: 'subtract', value: { expr: '1' } },
    ] as unknown as Step[];
    mount(steps);
    fireEvent.change(screen.getByDisplayValue('отнять'), { target: { value: 'add' } });
    expect((steps[0] as any).direction).toBe('add');
    expect((steps[0] as any).value).toEqual({ expr: '1' });
  });
});

describe('GroupCard: отдельный бросок с «Бросает»', () => {
  it('формула броска раскладывается в кость, прибавку и метки, а не в расчёт; против — «первый из целей»', () => {
    const roll = { id: 'hit_бросок', type: 'roll', die: 'lead', by: { expr: '@действующий' } } as Record<string, any>;
    const many = { ...effect, params: [...(effect.params ?? []), { key: 'цели', label: 'Цели', kind: 'sheet', many: true, item: { key: 'цель', label: 'Цель' } }] } as typeof effect;
    const group = groupSteps([roll as unknown as Step])[0]!;
    render(<GroupCard group={group} position={1} system={system} effect={many} sheets={sheets}
      earlier={[]} problem={null} edit={(_, change) => change(roll as never)} onDelete={() => {}} />);
    const line = [...cards().field('Сколько').querySelectorAll('input.chips__text')].at(-1) as HTMLInputElement;
    fireEvent.change(line, { target: { value: ') + 2' } });
    fireEvent.keyDown(line, { key: 'Enter' });
    expect(roll.die).toBe('lead');
    expect(roll.bonus).toEqual({ expr: '2' });
    expect(roll.fixed).toBeUndefined();
    cards().formula('Против кого', 'первый(@цели)');
    expect(roll.against).toEqual({ expr: 'первый(@цели)' });
  });
});

describe('GroupCard: взять из таблицы', () => {
  it('шаг «таблица» — свой вид: правка числа не стирает таблицу', () => {
    const step = { id: 'dv', type: 'table', table: 'броски', value: { expr: '@distance' } } as Record<string, any>;
    const withTable = { ...system, tables: { ...(system.tables ?? {}), броски: { label: 'Броски', key: 'word', rows: [{ value: 'атака' }] } } } as typeof system;
    const group = groupSteps([step as unknown as Step])[0]!;
    expect(group.kind).toBe('table');
    render(<GroupCard group={group} position={1} system={withTable} effect={effect} sheets={sheets}
      earlier={[]} problem={null} edit={(_, change) => change(step as never)} onDelete={() => {}} />);
    expect(screen.getByDisplayValue('Броски')).toBeTruthy();
    fireEvent.change(screen.getByDisplayValue('по числу или формуле'), { target: { value: 'dice' } });
    expect(step.table).toBe('броски');
    expect(step.value).toBeUndefined();
    expect(step.dice).toBeDefined();
  });
});
