// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { EffectsTab } from './effects-tab.tsx';
import { useWorld, emptySystem } from '../../../store/world.ts';
import { LAUNCH_KINDS } from './words.ts';

describe('EffectsTab: палитра трёх понятий', () => {
  beforeEach(() => {
    useWorld.setState(state => ({
      ...state,
      system: {
        ...state.system,
        effects: { strike: { label: 'Атака', activation: 'manual', params: [], steps: [] } },
      },
      activeEffectId: 'strike',
    }));
  });

  it('у активируемого нет «Сколько держится» и есть «Чего стоит»', () => {
    render(<EffectsTab />);
    expect(screen.queryByText('Сколько держится')).toBeNull();
    expect(screen.getByText('Чего стоит')).toBeTruthy();
  });

  it('у пассивного — наоборот: длительность есть, стоимости нет', () => {
    useWorld.setState(state => ({
      ...state,
      system: {
        ...state.system,
        effects: { poison: { label: 'Хворь', activation: 'passive', modifiers: [] } },
      },
      activeEffectId: 'poison',
    }));
    render(<EffectsTab />);
    expect(screen.getByText('Сколько держится')).toBeTruthy();
    expect(screen.queryByText('Чего стоит')).toBeNull();
  });

  it('палитра шагов — только виды движка, клик кладёт шаг', () => {
    render(<EffectsTab />);
    const palette = screen.getAllByRole('button')
      .filter(b => (b.textContent ?? '').trimStart().startsWith('+ '))
      .map(b => b.textContent!.trim())
      .filter(t => !LAUNCH_KINDS.some(kind => t === `+ ${kind.label.toLowerCase()}`)
        && t !== '+ общий' && !t.startsWith('+ брать'));
    expect(palette).toEqual(['+ проверка', '+ изменение', '+ таблица', '+ число']);
    fireEvent.click(screen.getByText('+ проверка'));
    expect(screen.getByText('1 · Проверка')).toBeTruthy();
    expect(screen.queryByText(/порог/i)).toBeNull();
  });

  it('кнопки палитры не знают доменных слов', () => {
    render(<EffectsTab />);
    const palette = screen.getAllByRole('button')
      .filter(b => (b.textContent ?? '').trimStart().startsWith('+ '));
    expect(palette.length).toBeGreaterThan(0);
    for (const button of palette) {
      expect(button.textContent).not.toMatch(/атак|спасброс|урон|лечени|заклинан/i);
    }
  });

  it('на экране нет слова «дырка»', () => {
    render(<EffectsTab />);
    expect(screen.queryByText(/дырк/i)).toBeNull();
    expect(screen.getByText('Что эффект берёт из записи')).toBeTruthy();
  });

  it('«Берёт из записи» — видимая секция с кнопкой', () => {
    render(<EffectsTab />);
    expect(screen.getByText('Что эффект берёт из записи')).toBeTruthy();
    fireEvent.click(screen.getByText('+ брать из записи'));
    const effect = useWorld.getState().system.effects.strike!;
    expect(effect.params!.length).toBe(1);
  });

  it('сторона — выбор у формулы и факт у костей', () => {
    render(<EffectsTab />);
    fireEvent.click(screen.getByText('+ брать из записи'));
    expect(screen.getByText('Чей лист')).toBeTruthy();

    const need = document.querySelector('.need')!;
    const sides = [...need.querySelectorAll('select')].at(-1)!;
    expect([...sides.options].map(o => o.textContent)).toEqual(['отправителя', 'цели']);

    fireEvent.change(need.querySelectorAll('select')[0]!, { target: { value: 'dice' } });
    expect(screen.getByText('бросает отправитель')).toBeTruthy();
  });

  it('ошибка про недостающее поле предлагает взять блок донора', () => {
    useWorld.setState(state => ({
      ...state,
      system: {
        ...state.system,
        effects: {
          strike: {
            label: 'Атака', activation: 'manual', params: [],
            steps: [{ type: 'apply', target: { tag: 'hp_current' }, value: { const: 1 } }],
          },
        },
      },
      activeEffectId: 'strike',
    }));
    render(<EffectsTab />);
    const fix = screen.getByText(/взять блок/);
    fireEvent.click(fix);
    expect(useWorld.getState().system.fields.some(f => f.tag === 'hp_current')).toBe(true);
  });
});

describe('ссылка на результат шага', () => {
  beforeEach(() => {
    useWorld.setState(state => ({
      ...state,
      system: {
        ...state.system,
        constants: { lead: { label: 'к20', kind: 'die', dice: [{ count: 1, sides: 20 }] } },
        effects: {
          strike: {
            label: 'Атака', activation: 'manual', params: [],
            steps: [
              {
                id: 'бросок', type: 'threshold',
                roll: { die: { constant: 'lead' }, check: null },
                versus: { const: 10 },
              },
              { id: 'сколько', type: 'amount', source: 'margin' },
            ],
          },
        },
      },
      activeEffectId: 'strike',
    }));
  });

  it('машинного имени шага на экране нет, а сослаться на шаг всё равно можно', () => {
    render(<EffectsTab />);
    expect(screen.queryAllByPlaceholderText('имя')).toHaveLength(0);
    fireEvent.click(screen.getByText('+ проверка'));
    const steps = useWorld.getState().system.effects.strike!.steps!;
    const id = String(steps.at(-1)!.id);
    expect(id).toBeTruthy();
    const shown = [...document.querySelectorAll('input')].map(i => i.value);
    expect(shown).not.toContain(id);
  });

  it('слот «какое превышение» предлагает выходы проверки поимённо', () => {
    render(<EffectsTab />);
    const label = screen.getByText('какое превышение');
    const input = label.parentElement!.querySelector('.chips__text') as HTMLInputElement;
    fireEvent.focus(input);

    const options = [...document.querySelectorAll('.slot__option')].map(o => o.textContent?.trim());
    expect(options).toContain('Результаты шаговшаг 1 · Проверка — превышение');
    expect(options).toContain('Результаты шаговшаг 1 · Проверка — костей на максимуме');
    expect(options).toContain('Результаты шаговшаг 1 · Проверка — костей на единице');
  });
});

describe('три вида запуска вместо четырёх', () => {
  beforeEach(() => {
    useWorld.setState(state => ({
      ...state,
      system: { ...state.system, effects: { strike: { label: 'Атака', activation: 'manual', params: [], steps: [] } } },
      activeEffectId: 'strike',
    }));
  });
  afterEach(() => { cleanup(); });

  it('палитра создания предлагает ровно три вида и не знает слов «реакция» и «триггерный»', () => {
    render(<EffectsTab />);
    const made = screen.getAllByRole('button')
      .map(b => b.textContent!.trim())
      .filter(t => LAUNCH_KINDS.some(kind => t === `+ ${kind.label.toLowerCase()}`));
    expect(made).toEqual(['+ кнопкой', '+ срабатывает сам', '+ висит и правит']);
    const all = document.body.textContent ?? '';
    expect(/реакци|триггерн/i.test(all.replace(/Реакции/g, ''))).toBe(false);
  });

  it('у «срабатывает сам» момент собран в один список: после молча или до с вопросом', () => {
    render(<EffectsTab />);
    fireEvent.click(screen.getByText('+ срабатывает сам'));
    const moment = [...document.querySelectorAll('select')]
      .find(el => [...el.options].some(o => o.value === 'ask-target'))!;
    expect([...moment.options].map(o => o.value))
      .toEqual(['after-in', 'after-out', 'ask-target', 'ask-sender']);

    fireEvent.change(moment, { target: { value: 'ask-sender' } });
    const effect = Object.values(useWorld.getState().system.effects).at(-1)!;
    expect(effect.activation).toBe('reaction');
    expect(effect.trigger?.window).toBe('sender');

    fireEvent.change(moment, { target: { value: 'after-out' } });
    const again = Object.values(useWorld.getState().system.effects).at(-1)!;
    expect(again.activation).toBe('triggered');
    expect(again.trigger?.direction).toBe('out');
    expect(again.trigger?.window).toBeUndefined();
  });
});

describe('общий эффект вместо «события»', () => {
  beforeEach(() => {
    useWorld.setState(state => ({
      ...state,
      system: {
        ...emptySystem(),
        fields: [{ tag: 'hp', label: 'Хиты', value: { kind: 'stored', type: 'number', default: 10 } }],
      },
      activeEffectId: null,
    }));
  });
  afterEach(() => { cleanup(); });

  it('«+ общий» заводит его с приёмом в первое числовое поле и открывает редактор', () => {
    render(<EffectsTab />);
    fireEvent.click(screen.getByText('+ общий'));
    const commons = Object.values(useWorld.getState().system.events ?? {});
    expect(commons).toHaveLength(1);
    expect(commons[0]!.receive).toEqual([
      { type: 'apply', target: { tag: 'hp' }, direction: 'subtract', value: { ref: 'event.amount' }, targetModifiers: true },
    ]);
    expect(useWorld.getState().activeEffectId!.startsWith('event:')).toBe(true);
    expect(screen.getByText(/Общий эффект: его вызывают другие/)).toBeTruthy();
  });

  it('правится обычной цепочкой шагов и обычными тегами', () => {
    render(<EffectsTab />);
    fireEvent.click(screen.getByText('+ общий'));
    expect(screen.getByText('Цепочка шагов')).toBeTruthy();

    fireEvent.click(screen.getByText('+ проверка'));
    const key = useWorld.getState().activeEffectId!.slice('event:'.length);
    expect(useWorld.getState().system.events![key]!.receive).toHaveLength(2);

    fireEvent.change(screen.getByPlaceholderText('огонь, холод, яд — через запятую'), { target: { value: 'огонь, яд' } });
    expect(useWorld.getState().system.events![key]!.tags).toEqual(['огонь', 'яд']);
  });
});
