// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { renderOpen } from '../../../testing/render-open.tsx';
import { EffectsTab } from './effects-tab.tsx';
import { useWorld, emptySystem } from '../../../store/world.ts';
import { CREATE_KINDS } from './words.ts';

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

  it('свойства эффекта — одной строкой; у активируемого нет «сколько висит»', () => {
    renderOpen(<EffectsTab />);
    const heads = [...document.querySelectorAll('.sheet-grid__title')].map(h => h.textContent);
    expect(heads).toEqual(expect.arrayContaining(['Как запускается', 'Блок', 'На основе', 'Описание для игрока']));
    expect(screen.queryByText('+ сколько висит')).toBeNull();
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
    renderOpen(<EffectsTab />);
    expect(screen.getByText('+ сколько висит')).toBeTruthy();
    const heads = [...document.querySelectorAll('.sheet-grid__title')].map(h => h.textContent);
    expect(heads).not.toContain('Занимает');
  });

  it('палитра шагов — только виды движка, клик кладёт шаг', () => {
    renderOpen(<EffectsTab />);
    const palette = screen.getAllByRole('button')
      .filter(b => !b.closest('details'))
      .filter(b => (b.textContent ?? '').trimStart().startsWith('+ '))
      .map(b => b.textContent!.trim())
      .filter(t => !CREATE_KINDS.some(kind => t === `+ ${kind.label.toLowerCase()}`)
        && t !== '+ вызываемый' && t !== '+ новый' && t !== '+ блок'
        && t !== '+ вход' && !t.startsWith('+ в «')
        && !['+ блок', '+ метки', '+ описание для игрока', '+ занимает', '+ какие метки бывают', '+ сколько висит', '+ на основе'].includes(t));
    expect(palette).toEqual(['+ проверка', '+ изменение', '+ таблица', '+ число']);
    fireEvent.click(screen.getAllByText('+ проверка')[0]!);
    expect(screen.getByText('1 · Проверка')).toBeTruthy();
    expect(screen.queryByText(/порог/i)).toBeNull();
  });

  it('шаги сворачиваются: одной строкой с пересказом, по одному и все сразу', () => {
    try { localStorage.clear(); } catch { return; }
    renderOpen(<EffectsTab />);
    fireEvent.click(screen.getAllByText('+ проверка')[0]!);
    fireEvent.click(screen.getAllByText('+ проверка')[0]!);
    fireEvent.click(screen.getByText('свернуть все'));
    expect(document.querySelectorAll('.step-fold__summary')).toHaveLength(2);
    expect(document.querySelectorAll('.step-fold[aria-expanded="false"]')).toHaveLength(2);
    fireEvent.click(document.querySelector('.step-fold')!);
    expect(document.querySelectorAll('.step-fold__summary')).toHaveLength(1);
    fireEvent.click(screen.getByText('развернуть все'));
    expect(document.querySelectorAll('.step-fold__summary')).toHaveLength(0);
  });

  it('изначально шаги свёрнуты, а только что добавленный — открыт', () => {
    useWorld.setState(state => ({
      ...state,
      system: { ...state.system, effects: { fresh: { label: 'Свежий эффект', activation: 'manual', params: [], steps: [{ id: 'был', type: 'threshold', roll: { check: null }, versus: { expr: '10' } }] } } },
      activeEffectId: 'fresh',
    }));
    render(<EffectsTab />);
    expect(document.querySelectorAll('.step-fold[aria-expanded="false"]')).toHaveLength(1);
    fireEvent.click(screen.getAllByText('+ проверка').at(-1)!);
    expect(document.querySelectorAll('.step-fold[aria-expanded="false"]')).toHaveLength(1);
    expect(document.querySelectorAll('.step-fold[aria-expanded="true"]')).toHaveLength(1);
  });

  it('убранный шаг можно вернуть', () => {
    renderOpen(<EffectsTab />);
    fireEvent.click(screen.getAllByText('+ проверка')[0]!);
    fireEvent.click(screen.getByTitle('убрать шаг'));
    fireEvent.click(screen.getByText('убрать'));
    expect(useWorld.getState().system.effects.strike!.steps).toHaveLength(0);
    fireEvent.click(screen.getByText('вернуть шаг'));
    expect(useWorld.getState().system.effects.strike!.steps).toHaveLength(1);
  });

  it('кнопки палитры не знают доменных слов', () => {
    renderOpen(<EffectsTab />);
    const palette = screen.getAllByRole('button')
      .filter(b => (b.textContent ?? '').trimStart().startsWith('+ '));
    expect(palette.length).toBeGreaterThan(0);
    for (const button of palette) {
      expect(button.textContent).not.toMatch(/атак|спасброс|урон|лечени|заклинан/i);
    }
  });

  it('на экране нет слова «дырка»', () => {
    renderOpen(<EffectsTab />);
    expect(screen.queryByText(/дырк/i)).toBeNull();
    expect(screen.getByText('Что приходит')).toBeTruthy();
  });

  it('«Что приходит» — видимая секция с кнопкой', () => {
    renderOpen(<EffectsTab />);
    expect(screen.getByText('Что приходит')).toBeTruthy();
    fireEvent.click(screen.getByText('+ вход'));
    const effect = useWorld.getState().system.effects.strike!;
    expect(effect.params!.length).toBe(1);
  });

  it('входы — таблицей: без подсказок в строке, флажки в конце, «правят сопротивления» только у числа', () => {
    renderOpen(<EffectsTab />);
    fireEvent.click(screen.getByText('+ вход'));
    expect(screen.queryByText('Чей лист')).toBeNull();
    expect(screen.queryByText(/можно числом или формулой/)).toBeNull();
    const heads = [...document.querySelectorAll('.sheet-grid__title')].map(h => h.textContent);
    expect(heads.slice(-2)).toEqual(['Правят сопротивления', 'Обязателен']);
    expect(screen.getByLabelText('«Новый вход» правят сопротивления')).toBeTruthy();

    const params = screen.getByLabelText('«Новый вход» правят сопротивления').closest('.sheet-grid')!;
    const ask = [...params.querySelectorAll('select')].find(el => [...el.options].some(o => o.value === 'gm'))!;
    fireEvent.change(ask, { target: { value: 'gm' } });
    const effect = Object.values(useWorld.getState().system.effects).find(e => e.params?.length)!;
    expect(effect.params![0]!.ask).toEqual({ by: 'gm' });

    fireEvent.change(params.querySelectorAll('select')[0]!, { target: { value: 'dice' } });
    expect(screen.queryByLabelText('«Новый вход» правят сопротивления')).toBeNull();
  });

  it('ошибка про недостающее поле предлагает взять блок донора', () => {
    useWorld.setState(state => ({
      ...state,
      system: {
        ...state.system,
        effects: {
          strike: {
            label: 'Атака', activation: 'manual', params: [],
            steps: [{ type: 'apply', target: { tag: 'hp_current' }, value: { expr: '1' } }],
          },
        },
      },
      activeEffectId: 'strike',
    }));
    renderOpen(<EffectsTab />);
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
                versus: { expr: '10' },
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
    renderOpen(<EffectsTab />);
    expect(screen.queryAllByPlaceholderText('имя')).toHaveLength(0);
    fireEvent.click(screen.getAllByText('+ проверка')[0]!);
    const steps = useWorld.getState().system.effects.strike!.steps!;
    const id = String(steps.at(-1)!.id);
    expect(id).toBeTruthy();
    const shown = [...document.querySelectorAll('input')].map(i => i.value);
    expect(shown).not.toContain(id);
  });

  it('слот «какое превышение» предлагает выходы проверки поимённо', () => {
    renderOpen(<EffectsTab />);
    const label = screen.getByText('какое превышение');
    const input = label.parentElement!.querySelector('.chips__text') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '@', selectionStart: 1 } });

    const options = [...document.querySelectorAll('.slot__option')].map(o => o.textContent?.trim());
    expect(options).toContain('Результаты шаговшаг 1 · Проверка — на сколько перебил порог');
    expect(options).toContain('Результаты шаговшаг 1 · Проверка — сколько костей легло максимумом');
    expect(options).toContain('Результаты шаговшаг 1 · Проверка — сколько костей легло единицей');
  });
});

describe('три вида создания, два вида запуска', () => {
  beforeEach(() => {
    useWorld.setState(state => ({
      ...state,
      system: { ...state.system, effects: { strike: { label: 'Атака', activation: 'manual', params: [], steps: [] } } },
      activeEffectId: 'strike',
    }));
  });
  afterEach(() => { cleanup(); });

  it('палитра создания предлагает ровно три вида и не знает слов «реакция» и «триггерный»', () => {
    renderOpen(<EffectsTab />);
    const made = screen.getAllByRole('button')
      .map(b => b.textContent!.trim())
      .filter(t => CREATE_KINDS.some(kind => t === `+ ${kind.label.toLowerCase()}`));
    expect(made).toEqual(['+ кнопкой', '+ срабатывает сам', '+ висит и правит']);
    const chrome = document.body.cloneNode(true) as HTMLElement;
    chrome.querySelectorAll('.column--right').forEach(node => node.remove());
    const data = useWorld.getState().system.fields.map(field => field.label);
    const all = data.reduce((text, label) => text.split(label).join(''), chrome.textContent ?? '');
    expect(all.replace(/Реакции/g, '').match(/.{30}(реакци|триггерн).{30}/i)?.[0] ?? null).toBeNull();
  });

  it('у «когда» роль и фаза собраны в один список: после молча или до с вопросом', () => {
    renderOpen(<EffectsTab />);
    fireEvent.click(screen.getByText('+ срабатывает сам'));
    const moment = [...document.querySelectorAll('select')]
      .find(el => [...el.options].some(o => o.value === 'ask-target'))!;
    expect([...moment.options].map(o => o.value))
      .toEqual(['after-in', 'after-out', 'before-in', 'ask-target', 'ask-sender', 'ask-after']);

    fireEvent.change(moment, { target: { value: 'ask-sender' } });
    const effect = Object.values(useWorld.getState().system.effects).at(-1)!;
    expect(effect.activation).toBe('passive');
    expect(effect.on?.[0]).toMatchObject({ role: 'sender', phase: 'before', ask: true });

    fireEvent.change(moment, { target: { value: 'after-out' } });
    const again = Object.values(useWorld.getState().system.effects).at(-1)!.on![0]!;
    expect(again.role).toBe('sender');
    expect(again.ask).toBeUndefined();
    expect(again.phase).toBeUndefined();
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
    renderOpen(<EffectsTab />);
    fireEvent.click(screen.getByText('+ вызываемый'));
    const key = useWorld.getState().activeEffectId!;
    const made = useWorld.getState().system.effects[key]!;
    expect(made.steps).toEqual([
      { type: 'apply', target: { tag: 'hp' }, direction: 'subtract', value: { expr: '@event.amount' }, targetModifiers: true },
    ]);
    expect(key.startsWith('event:')).toBe(false);
  });

  it('правится тем же редактором: те же шаги, а входы заводит автор', () => {
    renderOpen(<EffectsTab />);
    fireEvent.click(screen.getByText('+ вызываемый'));
    expect(screen.getByText('Цепочка шагов')).toBeTruthy();
    expect(screen.getByText('Что приходит')).toBeTruthy();

    fireEvent.click(screen.getAllByText('+ проверка')[0]!);
    const key = useWorld.getState().activeEffectId!;
    expect(useWorld.getState().system.effects[key]!.steps).toHaveLength(2);

    fireEvent.click(screen.getByText('+ вход'));
    const params = useWorld.getState().system.effects[key]!.params ?? [];
    expect(params.map(p => [p.kind, (p as { role?: string }).role ?? null])).toEqual([['number', 'amount'], ['number', null]]);
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

  it('в «что случилось» есть моменты хода, и выбор сохраняется', () => {
    renderOpen(<EffectsTab />);
    fireEvent.click(screen.getByText('+ срабатывает сам'));

    const listens = [...document.querySelectorAll('select')]
      .find(el => [...el.options].some(o => o.value.startsWith('moment:')))!;
    const options = [...listens.options].map(o => o.textContent ?? '');
    expect(options.some(text => text.includes('в начале своего хода'))).toBe(true);

    fireEvent.change(listens, { target: { value: 'moment:turn-start' } });
    const effect = Object.values(useWorld.getState().system.effects).at(-1)!;
    expect(effect.on?.[0]?.on).toBe('moment:turn-start');
    expect(screen.getByText(/У времени, поля и появления эффекта нет исходов/)).toBeTruthy();
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
              { id: 'проверка', type: 'threshold', roll: { die: { constant: 'к20' } }, versus: { expr: '10' } },
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
    renderOpen(<EffectsTab />);
    expect(screen.queryByText('удвоить кости, если')).toBeNull();
    expect(screen.queryByText('переписать одной строкой')).toBeNull();
    expect(screen.queryByText('сколько раз кинуть')).toBeNull();
    expect(screen.queryByText('прибавка')).toBeNull();

    expect(screen.getByText('Сколько')).toBeTruthy();
    expect(строка()).toBeTruthy();
  });

  it('правка строки переносит старые поля в формулу', () => {
    renderOpen(<EffectsTab />);
    набрать("кинуть('2d6') + @хиты");

    const шаг = useWorld.getState().system.effects.удар!.steps![1]! as Record<string, unknown>;
    expect(шаг.dice, 'старые поля ушли').toBeUndefined();
    expect(шаг.source).toBe('item');
    expect((шаг.fixed as { expr: string }).expr).toBe("кинуть('2d6') + @хиты");
  });

  it('набор не пишется в систему, пока строку не отпустили', () => {
    renderOpen(<EffectsTab />);
    fireEvent.change(строка(), { target: { value: 'кинуть(@кос' } });

    const шаг = useWorld.getState().system.effects.удар!.steps![1]! as Record<string, unknown>;
    expect(шаг.fixed, 'недобранное имя в систему не попало').toBeUndefined();
    expect(шаг.dice).toEqual({ const: '2d6' });
  });

  it('незнакомое имя в строке предлагается взять из записи под тем же ключом', () => {
    renderOpen(<EffectsTab />);
    набрать('кинуть(@кость_врага)');
    fireEvent.click(screen.getByText('взять «кость_врага» из записи'));

    const effect = useWorld.getState().system.effects.удар!;
    expect(effect.params!.map(p => p.key)).toContain('кость_врага');
  });
});

describe('шаг отправителя — один раз, до остальных', () => {
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

  it('«чей лист: отправителя» переносит шаг в верхний блок и обратно', () => {
    renderOpen(<EffectsTab />);
    fireEvent.click(screen.getAllByText('+ изменение')[0]!);
    expect(useWorld.getState().system.effects.снаряд!.steps).toHaveLength(1);

    fireEvent.change(screen.getByDisplayValue('получателя — у каждой цели'), { target: { value: 'sender' } });
    const moved = useWorld.getState().system.effects.снаряд!;
    expect(moved.self).toHaveLength(1);
    expect(moved.steps ?? []).toHaveLength(0);
    expect(screen.getByText('У отправителя — один раз, до остальных шагов')).toBeTruthy();

    fireEvent.change(screen.getByDisplayValue('отправителя — один раз, до остальных шагов'), { target: { value: 'receiver' } });
    const back = useWorld.getState().system.effects.снаряд!;
    expect(back.self).toBeUndefined();
    expect(back.steps).toHaveLength(1);
  });
});

