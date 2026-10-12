// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Chain } from './chain.tsx';
import { EffectEditor } from './effect-editor.tsx';
import { useWorld, emptySystem } from '../../../store/world.ts';
import type { Effect, System, Step } from '@vtt/schema';
import { within, stepCard, block, headOf, armOf, armWord, addToArm, addArm, stopNote, stopStrip, isFused } from '../../../testing/cards.ts';
import { openAll } from '../../../testing/render-open.tsx';

const withCost = (): System => ({
  ...emptySystem(),
  effects: {
    cost_action: { label: 'Стоимость: действие', group: 'Плата', activation: 'manual', params: [], steps: [] },
    удар: { label: 'Удар', activation: 'manual', params: [], steps: [] },
  },
} as unknown as System);

describe('стоимость эффекта — одним выбором', () => {
  beforeEach(() => { useWorld.setState(state => ({ ...state, system: withCost() })); });

  const lane = (steps: unknown[] = []) => {
    const effect = { label: 'Удар', steps } as unknown as Effect;
    render(<Chain id="удар" placeAt={index => ({ part: 'steps', index })} effect={effect} system={useWorld.getState().system} lane="steps"
      edit={change => change(effect)}
      onAddCost={id => { (effect.steps ??= []).unshift({ id: 'стоимость', type: 'emit', effect: id } as never); }} />);
    return effect;
  };

  it('выбор «+ плата» предлагает эффекты блока «Стоимость», выбранная встаёт первым шагом', () => {
    const effect = lane([{ type: 'apply', target: { tag: 'x' } }]);
    const pick = screen.getByDisplayValue('+ плата') as HTMLSelectElement;
    expect([...pick.options].map(o => o.textContent)).toEqual(['+ плата', 'Стоимость: действие', '+ новая плата…']);
    fireEvent.change(pick, { target: { value: 'cost_action' } });
    expect(effect.steps![0]).toEqual({ id: 'стоимость', type: 'emit', effect: 'cost_action' });
  });

  it('ценой может стать и другой вызываемый эффект — не только из блока «Стоимость», но не сам эффект', () => {
    useWorld.getState().editSystem(draft => { draft.effects.spend = { label: 'Потратить', activation: 'manual', params: [], steps: [] } as never; });
    lane();
    const pick = screen.getByDisplayValue('+ плата') as HTMLSelectElement;
    expect([...pick.options].map(o => o.textContent)).toEqual(['+ плата', 'Стоимость: действие', 'Потратить', '+ новая плата…']);
  });

  it('«+ новая плата» заводит эффект в блоке «Плата» и сразу его зовёт', () => {
    const effect = lane();
    fireEvent.change(screen.getByDisplayValue('+ плата'), { target: { value: ':новая' } });
    const made = Object.entries(useWorld.getState().system.effects).find(([id]) => id.startsWith('стоимость'))!;
    expect(made[1]).toMatchObject({ group: 'Плата' });
    expect(effect.steps![0]).toMatchObject({ type: 'emit', effect: made[0] });
  });

  it('без «onAddCost» (цепочка хука или подписки без решения) выбора стоимости нет', () => {
    const effect = { label: 'Удар', steps: [] } as unknown as Effect;
    render(<Chain id="удар" placeAt={index => ({ part: 'steps', index })} effect={effect} system={withCost()} edit={() => {}} />);
    expect(screen.queryByDisplayValue('+ плата')).toBeNull();
  });

  it('«+ плата» стоит рядом с остальными шагами и ставит плату первым шагом над чертой', () => {
    const view = () => {
      const system = useWorld.getState().system;
      return <EffectEditor id="удар" effect={system.effects.удар!} system={system} />;
    };
    const { rerender } = render(view());
    fireEvent.change(screen.getByDisplayValue('+ плата'), { target: { value: 'cost_action' } });
    expect(useWorld.getState().system.effects.удар!.cost).toEqual([{ type: 'emit', effect: 'cost_action' }]);
    rerender(view());
    expect(screen.getByText(/1 · Стоимость/)).toBeTruthy();
    expect(document.querySelector('.pay-divider')?.textContent).toContain('Плата');
  });

  it('шаг, зовущий эффект из блока «Стоимость», так и подписан', () => {
    const effect = { label: 'Удар', steps: [{ id: 'стоимость', type: 'emit', effect: 'cost_action' }] } as unknown as Effect;
    render(<Chain id="удар" placeAt={index => ({ part: "steps", index })} effect={effect} system={withCost()} lane="steps" edit={() => {}} />);
    expect(screen.getByText(/1 · Стоимость/)).toBeTruthy();
  });
});

describe('имя одного из списка видно шагам после перебора', () => {
  it('«Атака» D&D открывается без ошибки «цель — нет ни входа, ни шага», а в подсказках результатов перебора нет', async () => {
    const { SAMPLE_SYSTEMS } = await import('@vtt/engine/model/systems');
    const system = SAMPLE_SYSTEMS.find(one => one.id === 'dnd5e')! as System;
    useWorld.setState(state => ({ ...state, system }));
    const effect = system.effects.strike!;
    render(<Chain id="strike" placeAt={index => ({ part: 'steps', index })} effect={effect} system={system} lane="steps" edit={() => {}} />);
    expect(document.body.textContent).not.toContain('нет ни входа, ни шага');
    expect(document.body.textContent).not.toContain('split');
  });
});

describe('блок «Если»: условие строкой, руки, «Стоп»', () => {
  const start = (steps: unknown[], extra: Record<string, unknown> = {}) => {
    useWorld.setState(state => ({
      ...state,
      system: {
        ...emptySystem(),
        ...extra,
        constants: { d20: { label: 'Кость', kind: 'die', dice: [{ count: 1, sides: 20 }] } },
        effects: { удар: { label: 'Удар', activation: 'manual', params: [{ key: 'действующий', label: 'Кто действует', kind: 'sheet' }], steps } },
      } as unknown as System,
    }));
    function Live() {
      const system = useWorld(st => st.system);
      return <EffectEditor id="удар" effect={system.effects.удар!} system={system} />;
    }
    render(<Live />);
    openAll();
  };
  const steps = (): Step[] => useWorld.getState().system.effects.удар!.steps ?? [];
  const checked = [
    { id: 'hit_бросок', type: 'roll', die: 'd20', by: { expr: '@действующий' } },
    { id: 'hit', type: 'check', value: { expr: '@hit_бросок' }, versus: { expr: '10' } },
  ];

  beforeEach(() => { cleanup(); try { localStorage.clear(); } catch { return; } });

  it('«+ если» кладёт блок с обязательным условием; исход проверки выше — двумя пунктами «пройдена / не пройдена», выбранный склеивает блок с проверкой', () => {
    start(checked);
    within().click('+ если');
    expect(steps().slice(2)).toEqual([{ type: 'branch' }, { type: 'end' }]);
    expect(armWord(block(0))).toBe('Если');
    expect(isFused(block(0))).toBe(false);
    const head = within(headOf(block(0)));
    expect(head.whenOptions()).toContain('шаг 1 · Проверка — пройдена');
    expect(head.whenOptions()).toContain('шаг 1 · Проверка — не пройдена');
    expect(head.has('×')).toBe(false);
    head.when('шаг 1 · Проверка — не пройдена');
    expect(steps()[2]).toEqual({ type: 'branch', if: { expr: 'не(@hit.success)' } });
    expect(isFused(block(0))).toBe(true);
    expect(armWord(block(0))).toBe('провал:');
    expect(within(block(0).querySelector<HTMLElement>(':scope > .flow-block__foot')!).has('+ успех')).toBe(true);
  });

  it('проверка и «Если» по её исходу — одна рамка: рука подписана словом исхода, «+ провал» — рука без условия, «Удалить» на проверке сносит и блок', () => {
    start(checked);
    within().click('+ если');
    within(headOf(block(0))).when('шаг 1 · Проверка — пройдена');
    expect(steps().slice(2)).toEqual([{ type: 'branch', if: { expr: '@hit.success' } }, { type: 'end' }]);
    expect(document.querySelectorAll('.flow-block')).toHaveLength(1);
    const frame = block(0);
    expect(isFused(frame)).toBe(true);
    expect(frame.querySelector(':scope > .card')?.textContent).toMatch(/1 · Если/);
    expect(headOf(frame).classList.contains('flow-head--outcome')).toBe(true);
    expect(armWord(frame)).toBe('успех:');
    expect(headOf(frame).querySelector('.cond')).toBeNull();
    expect(within(frame.querySelector<HTMLElement>(':scope > .flow-block__foot')!).has('+ иначе')).toBe(false);

    addToArm(block(0), 0, 'change');
    expect(steps().map(step => step.type)).toEqual(['roll', 'check', 'branch', 'apply', 'end']);
    addArm(block(0), '+ провал');
    expect(steps().map(step => step.type)).toEqual(['roll', 'check', 'branch', 'apply', 'orElse', 'end']);
    expect(steps()[4]).toEqual({ type: 'orElse' });
    expect([0, 1].map(k => armWord(block(0), k))).toEqual(['успех:', 'провал:']);
    expect(headOf(block(0), 1).classList.contains('flow-head--outcome')).toBe(true);
    expect(within(block(0).querySelector<HTMLElement>(':scope > .flow-block__foot')!).has('+ провал')).toBe(false);

    const check = stepCard(/^1 · Если/);
    within(check).click('Удалить');
    within(stepCard(/^1 · Если/)).click('точно убрать');
    expect(steps()).toEqual([]);
    expect(document.querySelectorAll('.flow-block')).toHaveLength(0);
  });

  it('слово исхода берётся из метки броска: «атака» — «попадание: / промах:»', () => {
    const tables = { метки: { label: 'Метки', columns: [{ key: 'успех', label: 'успех' }, { key: 'провал', label: 'провал' }], rows: [{ value: 'атака', cells: { успех: 'попадание', провал: 'промах' } }] } };
    start([{ ...checked[0], tags: ['атака'] }, checked[1], { type: 'branch', if: { expr: 'не(@hit.success)' } }, { type: 'end' }], { tables });
    expect(isFused(block(0))).toBe(true);
    expect(armWord(block(0))).toBe('промах:');
    expect(within(block(0).querySelector<HTMLElement>(':scope > .flow-block__foot')!).has('+ попадание')).toBe(true);
  });

  it('без проверок выше условие задаётся формулой; «+ и» склеивает строки в «все(…)», «×» убирает строку', () => {
    start([]);
    within().click('+ если');
    expect(within(headOf(block(0))).whenOptions()).toEqual(['— что проверяем —', 'формулой…']);
    within(headOf(block(0))).when('=1 > 0', '=2 > 1');
    expect(steps()[0]).toEqual({ type: 'branch', if: { expr: 'все(1 > 0, 2 > 1)' } });
    expect(within(headOf(block(0))).condRows()).toHaveLength(2);
    within(headOf(block(0))).unwhen(1);
    expect(steps()[0]).toEqual({ type: 'branch', if: { expr: '1 > 0' } });
  });

  it('«+ шаг» в руке встаёт перед концом руки; «+ иначе, если» — до «иначе»; «убрать ветку» и «снять «Если»»', () => {
    start([]);
    within().click('+ если');
    within(headOf(block(0))).when('=1 > 0');
    addToArm(block(0), 0, 'change');
    addArm(block(0), '+ иначе');
    addToArm(block(0), 1, 'stop');
    expect(steps().map(step => step.type)).toEqual(['branch', 'apply', 'orElse', 'stop', 'end']);
    expect(within(block(0).querySelector<HTMLElement>(':scope > .flow-block__foot')!).has('+ иначе')).toBe(false);
    addArm(block(0), '+ иначе, если');
    expect(steps().map(step => step.type)).toEqual(['branch', 'apply', 'orElse', 'orElse', 'stop', 'end']);
    expect([0, 1, 2].map(k => armWord(block(0), k))).toEqual(['Если', 'Иначе, если', 'Иначе']);
    within(headOf(block(0), 1)).when('=2 > 1');
    addToArm(block(0), 1, 'number');
    expect(steps()[2]).toEqual({ type: 'orElse', if: { expr: '2 > 1' } });
    expect(steps().map(step => step.type)).toEqual(['branch', 'apply', 'orElse', 'roll', 'orElse', 'stop', 'end']);
    expect(armOf(block(0), 1).textContent).toContain('2 · Число');

    within(headOf(block(0), 2)).click('убрать ветку');
    within(headOf(block(0), 2)).click('точно убрать');
    expect(steps().map(step => step.type)).toEqual(['branch', 'apply', 'orElse', 'roll', 'end']);
    within(headOf(block(0), 1)).click('убрать ветку');
    within(headOf(block(0), 1)).click('точно убрать');
    within(headOf(block(0))).click('снять «Если»');
    expect(steps().map(step => step.type)).toEqual(['apply']);
  });

  it('«в «Если»» оборачивает шаг: условие ставится уже в заголовке блока', () => {
    start([{ type: 'apply', target: { expr: '@действующий.x' }, value: { expr: '1' } }]);
    within(stepCard(/^1 · /)).click('в «Если»');
    expect(steps().map(step => step.type)).toEqual(['branch', 'apply', 'end']);
    within(headOf(block(0))).when('=1 > 0');
    expect(steps()[0]).toEqual({ type: 'branch', if: { expr: '1 > 0' } });
    expect(armOf(block(0)).textContent).toContain('1 · Изменить «x»');
  });

  it('«Стоп»: текст в журнал пишется словами, а хранится формулой-литералом; с @ — формула; пусто — без текста', () => {
    start([]);
    within().click('+ стоп');
    expect(steps()).toEqual([{ type: 'stop' }]);
    expect(stopStrip(1).textContent).toContain('в журнал:');
    stopNote(1, 'не хватает ячейки');
    expect(steps()[0]).toEqual({ type: 'stop', note: { expr: '"не хватает ячейки"' } });
    expect(stopStrip(1).querySelector<HTMLInputElement>('input')!.value).toBe('не хватает ячейки');
    stopNote(1, '@note');
    expect(steps()[0]).toEqual({ type: 'stop', note: { expr: '@note' } });
    stopNote(1, '');
    expect(steps()[0]).toEqual({ type: 'stop' });
  });
});

describe('условие блока «Если» в покое — словами, формула открывается нажатием', () => {
  const show = (condition: unknown, ...more: Step[]) => {
    useWorld.setState(state => ({
      ...state,
      system: {
        ...emptySystem(),
        effects: {
          удар: {
            label: 'Удар', activation: 'manual',
            params: [
              { key: 'действующий', label: 'Кто действует', kind: 'sheet' },
              { key: 'status', label: 'Состояние при попадании', kind: 'effect', optional: true },
            ],
            steps: [{ type: 'branch', ...(condition === undefined ? {} : { if: condition }) }, ...more, { type: 'end' }],
          },
        },
      } as unknown as System,
    }));
    function Live() {
      const system = useWorld(st => st.system);
      return <EffectEditor id="удар" effect={system.effects.удар!} system={system} />;
    }
    render(<Live />);
    openAll();
  };
  const condition = () => (useWorld.getState().system.effects.удар!.steps![0] as { if?: { expr: string } }).if?.expr;
  const face = () => headOf(block(0)).querySelector<HTMLElement>('.formula-words');
  const chipsInHead = () => headOf(block(0)).querySelector<HTMLElement>('.chips');
  const typing = () => [...headOf(block(0)).querySelectorAll<HTMLInputElement>('input.chips__text')].at(-1)!;

  beforeEach(() => { cleanup(); try { localStorage.clear(); } catch { return; } });

  it('в покое — слова, без фишек и без второй строки; нажатие на слова открывает поле, Enter возвращает слова', () => {
    show({ expr: 'не(пусто(@status))' });
    expect(face()!.textContent).toBe('задано «Состояние при попадании»');
    expect(face()!.title).toBe('не(пусто(@status))');
    expect(chipsInHead()).toBeNull();
    expect(headOf(block(0)).querySelector('.cond__words')).toBeNull();
    expect(headOf(block(0)).textContent!.split('Состояние при попадании')).toHaveLength(2);

    within(headOf(block(0))).click('задано «Состояние при попадании»');
    expect(face()).toBeNull();
    expect(chipsInHead()!.getAttribute('data-value')).toBe('не(пусто(@status))');
    fireEvent.keyDown(chipsInHead()!, { key: 'Enter' });
    expect(face()!.textContent).toBe('задано «Состояние при попадании»');
    expect(condition()).toBe('не(пусто(@status))');
  });

  it('правка с Enter меняет условие и слова; Esc отменяет правку — условие прежнее', () => {
    show({ expr: '1 > 0' });
    fireEvent.click(face()!);
    fireEvent.change(typing(), { target: { value: '2 > 1' } });
    fireEvent.keyDown(chipsInHead()!, { key: 'Escape' });
    expect(condition()).toBe('1 > 0');
    expect(face()!.textContent).toBe('1 > 0');

    fireEvent.click(face()!);
    fireEvent.change(typing(), { target: { value: '2 > 1' } });
    fireEvent.keyDown(chipsInHead()!, { key: 'Enter' });
    expect(condition()).toBe('2 > 1');
    expect(face()!.textContent).toBe('2 > 1');
  });

  it('пустое условие — сразу открыто, слов нет; условие с ошибкой — поле открыто и ошибка видна', () => {
    show(undefined);
    expect(face()).toBeNull();
    expect(headOf(block(0)).querySelector('select')).not.toBeNull();
    cleanup();

    show({ expr: '@нет_такого > 1' });
    expect(face()).toBeNull();
    expect(chipsInHead()).not.toBeNull();
    expect(headOf(block(0)).querySelector('.field__error')!.textContent).toContain('нет_такого');
    cleanup();

    show({ expr: '1 >' });
    expect(face()).toBeNull();
    expect(chipsInHead()).not.toBeNull();
    expect(headOf(block(0)).querySelector('.field__error')).not.toBeNull();
  });

  it('после правки с ошибкой поле остаётся открытым, после исправления — снова слова', () => {
    show({ expr: '1 > 0' });
    fireEvent.click(face()!);
    fireEvent.change(typing(), { target: { value: '1 >' } });
    fireEvent.keyDown(chipsInHead()!, { key: 'Enter' });
    expect(condition()).toBe('1 >');
    expect(face()).toBeNull();
    expect(headOf(block(0)).querySelector('.field__error')).not.toBeNull();

    fireEvent.change(typing(), { target: { value: '1 > 3' } });
    fireEvent.keyDown(chipsInHead()!, { key: 'Enter' });
    expect(condition()).toBe('1 > 3');
    expect(headOf(block(0)).querySelector('.field__error')).toBeNull();
    expect(face()!.textContent).toBe('1 > 3');
  });

  it('помощник тестов нажимает на слова, как человек: готовое условие правится через него', () => {
    show({ expr: '1 > 0' });
    expect(face()).not.toBeNull();
    within(headOf(block(0))).formula(headOf(block(0)).querySelector<HTMLElement>('.cond__formula')!, '3 > 2');
    expect(condition()).toBe('3 > 2');
    expect(face()!.textContent).toBe('3 > 2');
  });

  it('«Иначе, если» и «Если» вокруг шагов — те же слова; «Иначе» без условия слов не имеет', () => {
    show({ expr: '1 > 0' }, { type: 'orElse', if: { expr: '2 > 1' } } as unknown as Step, { type: 'orElse' } as unknown as Step);
    expect([0, 1, 2].map(k => headOf(block(0), k).querySelector('.formula-words')?.textContent ?? null)).toEqual(['1 > 0', '2 > 1', null]);
    expect(headOf(block(0), 2).querySelector('.cond')).toBeNull();
  });
});

describe('цепочка: заголовок раздела и розовая черта под «когда»', () => {
  const effect = { label: 'Удар', steps: [] } as unknown as Effect;
  const view = (extra: { title?: string; lined?: boolean } = {}) => render(
    <Chain id="удар" placeAt={index => ({ part: 'steps', index })} effect={effect} system={withCost()} edit={() => {}} {...extra} />,
  );

  beforeEach(() => { cleanup(); });

  it('«Шаги» набраны заголовком раздела — как «Что приходит»; вердикт остаётся справа в той же шапке', () => {
    view();
    const title = screen.getByText('Шаги');
    expect(title.tagName).toBe('H3');
    expect(title.classList.contains('card__title')).toBe(true);
    expect(title.closest('.card__head')!.querySelector('.verdict')).toBeTruthy();
    expect(document.querySelector('.chain-run')).toBeNull();
  });

  it('под «когда»: подпись «делает:», черта вокруг подписи и шагов, палитра шагов — вне черты', () => {
    view({ title: 'делает:', lined: true });
    const run = document.querySelector('.chain-run')!;
    expect(run.querySelector('.chain-run__label')!.textContent).toBe('делает:');
    expect(run.querySelector('.verdict')).toBeTruthy();
    expect(run.querySelector('.steps')).toBeTruthy();
    expect(run.querySelector('.bricks')).toBeNull();
    expect(document.querySelector('.bricks')).toBeTruthy();
    expect(screen.queryByText('Шаги')).toBeNull();
  });
});
