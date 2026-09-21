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

  it('активируемому предлагают «занимает», но не «сколько висит»', () => {
    render(<EffectsTab />);
    expect(screen.queryByText('+ сколько висит')).toBeNull();
    expect(screen.getByText('+ занимает')).toBeTruthy();
  });

  it('висящему — наоборот: «сколько висит» есть, стоимости нет', () => {
    useWorld.setState(state => ({
      ...state,
      system: {
        ...state.system,
        effects: { poison: { label: 'Хворь', activation: 'passive', modifiers: [] } },
      },
      activeEffectId: 'poison',
    }));
    render(<EffectsTab />);
    expect(screen.getByText('+ сколько висит')).toBeTruthy();
    expect(screen.queryByText('+ занимает')).toBeNull();
  });

  it('палитра шагов — только виды движка, клик кладёт шаг', () => {
    render(<EffectsTab />);
    const palette = screen.getAllByRole('button')
      .filter(b => !b.closest('details'))
      .filter(b => (b.textContent ?? '').trimStart().startsWith('+ '))
      .map(b => b.textContent!.trim())
      .filter(t => !LAUNCH_KINDS.some(kind => t === `+ ${kind.label.toLowerCase()}`)
        && t !== '+ вызываемый' && t !== '+ новый' && t !== '+ блок'
        && !t.startsWith('+ брать') && !t.startsWith('+ в «')
        && !['+ блок', '+ метки', '+ описание для игрока', '+ занимает', '+ какие метки бывают', '+ сколько висит', '+ на основе'].includes(t));
    expect(palette).toEqual(['+ проверка', '+ изменение', '+ таблица', '+ число']);
    fireEvent.click(screen.getAllByText('+ проверка')[0]!);
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
    fireEvent.click(screen.getAllByText('+ проверка')[0]!);
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
    expect(options).toContain('Результаты шаговшаг 1 · Проверка — на сколько перебил порог');
    expect(options).toContain('Результаты шаговшаг 1 · Проверка — сколько костей легло максимумом');
    expect(options).toContain('Результаты шаговшаг 1 · Проверка — сколько костей легло единицей');
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
      .toEqual(['after-in', 'after-out', 'before-in', 'ask-target', 'ask-sender', 'ask-after']);

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

describe('вызываемый эффект — обычный эффект', () => {
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

  it('«+ вызываемый» заводит обычный эффект с шагом в первое числовое поле', () => {
    render(<EffectsTab />);
    fireEvent.click(screen.getByText('+ вызываемый'));
    const key = useWorld.getState().activeEffectId!;
    const made = useWorld.getState().system.effects[key]!;
    expect(made.steps).toEqual([
      { type: 'apply', target: { tag: 'hp' }, direction: 'subtract', value: { ref: 'event.amount' }, targetModifiers: true },
    ]);
    expect(key.startsWith('event:')).toBe(false);
  });

  it('правится тем же редактором: те же шаги, те же метки', () => {
    render(<EffectsTab />);
    fireEvent.click(screen.getByText('+ вызываемый'));
    expect(screen.getByText('Цепочка шагов')).toBeTruthy();

    fireEvent.click(screen.getAllByText('+ проверка')[0]!);
    const key = useWorld.getState().activeEffectId!;
    expect(useWorld.getState().system.effects[key]!.steps).toHaveLength(2);

    fireEvent.click(screen.getByText('+ какие метки бывают'));
    fireEvent.change(screen.getByPlaceholderText('новая метка'), { target: { value: 'огонь' } });
    fireEvent.keyDown(screen.getByPlaceholderText('новая метка'), { key: 'Enter' });
    expect(useWorld.getState().system.effects[key]!.tags).toEqual(['огонь']);
  });
});

describe('эффект слушает время', () => {
  beforeEach(() => {
    useWorld.setState(state => ({
      ...state,
      system: {
        ...emptySystem(),
        fields: [{ tag: 'хиты', label: 'Хиты', value: { kind: 'stored', type: 'number', default: 10 } }],
      },
      activeEffectId: null,
    }));
  });
  afterEach(() => { cleanup(); });

  it('в списке «Слушает» есть моменты хода, и выбор сохраняется', () => {
    render(<EffectsTab />);
    fireEvent.click(screen.getByText('+ срабатывает сам'));

    const listens = [...document.querySelectorAll('select')]
      .find(el => [...el.options].some(o => o.value.startsWith('moment:')))!;
    const options = [...listens.options].map(o => o.textContent ?? '');
    expect(options.some(text => text.includes('в начале своего хода'))).toBe(true);

    fireEvent.change(listens, { target: { value: 'moment:turn-start' } });
    const effect = Object.values(useWorld.getState().system.effects).at(-1)!;
    expect(effect.trigger?.on).toBe('moment:turn-start');
    expect(screen.getByText(/У времени и поля нет исходов/)).toBeTruthy();
  });
});

describe('крит — обычная формула, а не особый слот', () => {
  beforeEach(() => {
    useWorld.setState(state => ({
      ...state,
      system: {
        ...emptySystem(),
        fields: [{ tag: 'хиты', label: 'Хиты', value: { kind: 'stored', type: 'number', default: 10 } }],
        constants: { к20: { label: 'Кость', kind: 'die', dice: [{ count: 1, sides: 20 }] } },
        effects: {
          удар: {
            label: 'Удар', activation: 'manual', params: [],
            steps: [
              { id: 'проверка', type: 'threshold', roll: { die: { constant: 'к20' } }, versus: { const: 10 } },
              { id: 'урон', type: 'amount', source: 'roll', dice: { const: '2d6' } },
            ],
          },
        },
      },
      activeEffectId: 'удар',
    }));
  });
  afterEach(() => { cleanup(); });

  const строка = () => screen.getByDisplayValue("кинуть('2d6')") as HTMLInputElement;

  const набрать = (текст: string) => {
    const поле = строка();
    fireEvent.change(поле, { target: { value: текст } });
    fireEvent.keyDown(поле, { key: 'Enter' });
  };

  it('старый шаг сразу показан одной строкой, трёх полей больше нет', () => {
    render(<EffectsTab />);
    expect(screen.queryByText('удвоить кости, если')).toBeNull();
    expect(screen.queryByText('переписать одной строкой')).toBeNull();
    expect(screen.queryByText('сколько раз кинуть')).toBeNull();
    expect(screen.queryByText('прибавка')).toBeNull();

    expect(screen.getByText('Сколько')).toBeTruthy();
    expect(строка()).toBeTruthy();
  });

  it('правка строки переносит старые поля в формулу', () => {
    render(<EffectsTab />);
    набрать("кинуть('2d6') + @хиты");

    const шаг = useWorld.getState().system.effects.удар!.steps![1]! as Record<string, unknown>;
    expect(шаг.dice, 'старые поля ушли').toBeUndefined();
    expect(шаг.source).toBe('item');
    expect((шаг.fixed as { expr: string }).expr).toBe("кинуть('2d6') + @хиты");
  });

  it('набор не пишется в систему, пока строку не отпустили', () => {
    render(<EffectsTab />);
    fireEvent.change(строка(), { target: { value: 'кинуть(@кос' } });

    const шаг = useWorld.getState().system.effects.удар!.steps![1]! as Record<string, unknown>;
    expect(шаг.fixed, 'недобранное имя в систему не попало').toBeUndefined();
    expect(шаг.dice).toEqual({ const: '2d6' });
  });

  it('незнакомое имя в строке предлагается взять из записи под тем же ключом', () => {
    render(<EffectsTab />);
    набрать('кинуть(@кость_врага)');
    fireEvent.click(screen.getByText('взять «кость_врага» из записи'));

    const effect = useWorld.getState().system.effects.удар!;
    expect(effect.params!.map(p => p.key)).toContain('кость_врага');
  });
});

describe('стоимость собирается отдельно от цепочки', () => {
  beforeEach(() => {
    useWorld.setState(state => ({
      ...state,
      system: {
        ...emptySystem(),
        fields: [{ tag: 'ячейки', label: 'Ячейки', value: { kind: 'stored', type: 'number', default: 3 } }],
        effects: { снаряд: { label: 'Снаряд', activation: 'manual', params: [], steps: [] } },
      },
      activeEffectId: 'снаряд',
    }));
  });
  afterEach(() => { cleanup(); });

  it('шаг, добавленный в дорожку, ложится в self, а не в steps', () => {
    render(<EffectsTab />);
    fireEvent.click(screen.getByText('Стоимость'));

    const adders = screen.getAllByText('+ изменение');
    fireEvent.click(adders[adders.length - 1]!);

    const effect = useWorld.getState().system.effects.снаряд!;
    expect(effect.self).toHaveLength(1);
    expect(effect.steps ?? []).toHaveLength(0);
  });
});
