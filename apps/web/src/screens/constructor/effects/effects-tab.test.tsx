// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { renderOpen } from '../../../testing/render-open.tsx';
import { EffectsTab } from './effects-tab.tsx';
import { useWorld, emptySystem } from '../../../store/world.ts';
import { CREATE_KINDS } from './words.ts';
import { fieldsOf, hasField } from '@vtt/engine/model/sheet-columns';

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
    expect(heads).toEqual(expect.arrayContaining(['Как запускается', 'Блок', 'На основе', 'Описание']));
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
        && t !== '+ вход' && t !== '+ держание' && !t.startsWith('+ в «')
        && !['+ блок', '+ метки', '+ описание для игрока', '+ занимает', '+ какие метки бывают', '+ сколько висит', '+ на основе'].includes(t));
    expect(palette).toEqual(['+ проверка', '+ изменение', '+ таблица', '+ для каждого из списка', '+ число']);
    fireEvent.click(screen.getAllByText('+ проверка')[0]!);
    const card = screen.getByText('1 · Проверка').closest('.step-fold, .card') as HTMLElement;
    expect(card).toBeTruthy();
    expect(within(card).queryByText(/порог/i)).toBeNull();
    fireEvent.click(screen.getAllByText('+ для каждого из списка')[0]!);
    expect(screen.getByText(/2 · Для каждого из/)).toBeTruthy();
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
      system: { ...state.system, effects: { fresh: { label: 'Свежий эффект', activation: 'manual', params: [], steps: [
        { id: 'был_бросок', type: 'roll', by: { expr: '@действующий' } },
        { id: 'был', type: 'check', value: { expr: '@был_бросок' }, versus: { expr: '10' } },
      ] } } },
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
    fireEvent.click(screen.getAllByText('Удалить').at(-1)!);
    fireEvent.click(screen.getByText('точно убрать'));
    expect(useWorld.getState().system.effects.strike!.steps).toHaveLength(0);
    fireEvent.click(screen.getByText('вернуть шаг'));
    expect(useWorld.getState().system.effects.strike!.steps!.map(step => step.type)).toEqual(['roll', 'check']);
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

  it('входы — таблицей: редкое под «ещё», флажки в конце, «правят сопротивления» только у числа', () => {
    renderOpen(<EffectsTab />);
    fireEvent.click(screen.getByText('+ вход'));
    expect(screen.queryByText('Чей лист')).toBeNull();
    expect(screen.queryByText(/можно числом или формулой/)).toBeNull();
    expect(screen.queryByLabelText('«Новый вход» правят сопротивления'), 'редкое спрятано').toBeNull();
    fireEvent.click(screen.getByText('ещё'));
    const heads = [...document.querySelectorAll('.sheet-grid__title')].map(h => h.textContent);
    expect(heads.slice(-4)).toEqual(['Правят сопротивления', 'Обязателен', 'Границы', 'Имя в формулах']);
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
            label: 'Атака', activation: 'manual', params: [{ key: 'цель', kind: 'sheet' }],
            steps: [{ type: 'apply', target: { expr: '@цель.hp_current' }, value: { expr: '1' } }],
          },
        },
      },
      activeEffectId: 'strike',
    }));
    renderOpen(<EffectsTab />);
    const fix = screen.getByText(/взять блок/);
    fireEvent.click(fix);
    expect(hasField(useWorld.getState().system, 'hp_current')).toBe(true);
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
            label: 'Атака', activation: 'manual',
            params: [{ key: 'действующий', label: 'Кто действует', kind: 'sheet' }],
            steps: [
              { id: 'бросок_бросок', type: 'roll', die: 'lead', by: { expr: '@действующий' } },
              { id: 'бросок', type: 'check', value: { expr: '@бросок_бросок' }, versus: { expr: '10' } },
              { id: 'сколько', type: 'roll' },
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

  it('имя проверки задаётся под «ещё» и тянет за собой имя её броска', () => {
    renderOpen(<EffectsTab />);
    fireEvent.click(screen.getAllByText('+ проверка')[0]!);
    const before = useWorld.getState().system.effects.strike!.steps!.map(step => step.id);
    const check = String(before.at(-1));
    fireEvent.click(screen.getAllByText('имя в формулах…').at(-1)!);
    const input = [...document.querySelectorAll('input')].find(i => i.value === check)!;
    fireEvent.change(input, { target: { value: 'hit' } });
    fireEvent.blur(input);
    const ids = useWorld.getState().system.effects.strike!.steps!.map(step => step.id);
    expect(ids).toContain('hit');
    expect(ids).toContain('hit_бросок');
  });

  it('формула «Сколько» предлагает выходы проверки поимённо', () => {
    renderOpen(<EffectsTab />);
    const label = screen.getByText('Сколько');
    const input = label.parentElement!.querySelector('.chips__text') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '@', selectionStart: 1 } });

    const options = [...document.querySelectorAll('.slot__option')].map(o => o.textContent?.trim());
    expect(options).toContain('здесь жешаг 1 · Проверка — на сколько перебил порог');
    expect(options).toContain('здесь жешаг 1 · Проверка — сколько костей легло максимумом');
    expect(options).toContain('здесь жешаг 1 · Проверка — сколько костей легло единицей');
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

  it('имя эффекта задаётся под «имя в формулах…», пока на эффект никто не ссылается', () => {
    renderOpen(<EffectsTab />);
    fireEvent.click(screen.getAllByText('имя в формулах…')[0]!);
    const input = [...document.querySelectorAll('input')].find(i => i.value === 'strike')!;
    fireEvent.change(input, { target: { value: 'удар_мечом' } });
    fireEvent.blur(input);
    const state = useWorld.getState();
    expect(Object.keys(state.system.effects)).toEqual(['удар_мечом']);
    expect(state.activeEffectId).toBe('удар_мечом');
  });

  it('палитра создания предлагает ровно три вида и не знает слов «реакция» и «триггерный»', () => {
    renderOpen(<EffectsTab />);
    const made = screen.getAllByRole('button')
      .map(b => b.textContent!.trim())
      .filter(t => CREATE_KINDS.some(kind => t === `+ ${kind.label.toLowerCase()}`));
    expect(made).toEqual(['+ кнопкой', '+ срабатывает сам', '+ висит и правит']);
    const chrome = document.body.cloneNode(true) as HTMLElement;
    chrome.querySelectorAll('.column--right').forEach(node => node.remove());
    const data = fieldsOf(useWorld.getState().system).map(field => field.label);
    const all = data.reduce((text, label) => text.split(label).join(''), chrome.textContent ?? '');
    expect(all.replace(/Реакции/g, '').match(/.{30}(реакци|триггерн).{30}/i)?.[0] ?? null).toBeNull();
  });

  it('«что случилось» — список видов с «Решением» отдельно: до/после — отдельное поле, вопрос — отдельный выбор', () => {
    renderOpen(<EffectsTab />);
    fireEvent.click(screen.getByText('+ срабатывает сам'));
    const kinds = [...document.querySelectorAll('select')]
      .find(el => [...el.options].some(o => o.value === 'seen'))! as HTMLSelectElement;
    expect([...kinds.options].map(o => o.value)).toEqual(['call', 'seen', 'moment', 'field', 'gained', 'lost']);
    const last = () => Object.values(useWorld.getState().system.effects).at(-1)!;

    fireEvent.change(kinds, { target: { value: 'seen' } });
    expect(last().activation).toBe('passive');
    expect(last().on?.[0]).toMatchObject({ on: 'seen' });

    const decision = screen.getByDisplayValue('срабатывает само') as HTMLSelectElement;
    fireEvent.change(decision, { target: { value: 'ask' } });
    expect(last().on?.[0]).toMatchObject({ on: 'seen', confirm: true });

    fireEvent.change(kinds, { target: { value: 'call' } });
    expect(last().on![0]!.on).toBe('before:*');
    expect(last().on![0]!.confirm).toBe(true);

    const phase = screen.getByDisplayValue(/^до — /) as HTMLSelectElement;
    expect([...phase.options].map(o => o.value)).toEqual(['before', 'after', 'done']);
    fireEvent.change(phase, { target: { value: 'done' } });
    expect(last().on![0]!.on).toBe('done:*');

    fireEvent.change(kinds, { target: { value: 'moment' } });
    const subject = screen.getByDisplayValue('— выберите —') as HTMLSelectElement;
    fireEvent.change(subject, { target: { value: 'turn-start' } });
    expect(last().on![0]!.on).toBe('moment:turn-start');
  });
});

describe('вызываемый эффект — обычный эффект', () => {
  beforeEach(() => {
    useWorld.setState(state => ({
      ...state,
      system: {
        ...emptySystem(),
        tables: { лист: { shape: 'single', columns: [{ key: 'hp', label: 'Хиты', kind: 'number', default: 10 }] } },
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
    expect(made.params!.map(p => [p.key, p.kind])).toEqual([['лист', 'sheet'], ['amount', 'number']]);
    expect(made.steps).toEqual([
      { type: 'apply', target: { expr: '@лист.hp' }, direction: 'subtract', value: { expr: '@amount' } },
    ]);
    expect(key.startsWith('event:')).toBe(false);
  });

  it('правится тем же редактором: те же шаги, а входы заводит автор', () => {
    renderOpen(<EffectsTab />);
    fireEvent.click(screen.getByText('+ вызываемый'));
    expect(screen.getByText('Шаги')).toBeTruthy();
    expect(screen.getByText('Что приходит')).toBeTruthy();

    fireEvent.click(screen.getAllByText('+ проверка')[0]!);
    const key = useWorld.getState().activeEffectId!;
    expect(useWorld.getState().system.effects[key]!.steps).toHaveLength(3);

    fireEvent.click(screen.getByText('+ вход'));
    const params = useWorld.getState().system.effects[key]!.params ?? [];
    expect(params.map(p => [p.kind, (p as { role?: string }).role ?? null])).toEqual([['sheet', null], ['number', 'amount'], ['number', null]]);
  });
});

describe('эффект слушает время', () => {
  beforeEach(() => {
    useWorld.setState(state => ({
      ...state,
      system: {
        ...emptySystem(),
        tables: { лист: { shape: 'single', columns: [{ key: 'хиты', label: 'Хиты', kind: 'number', default: 10 }] } },
      },
      activeEffectId: null,
    }));
  });
  afterEach(() => { cleanup(); });

  it('в «что случилось» есть «время», моменты хода в списке, и выбор сохраняется', () => {
    renderOpen(<EffectsTab />);
    fireEvent.click(screen.getByText('+ срабатывает сам'));

    const kinds = [...document.querySelectorAll('select')]
      .find(el => [...el.options].some(o => o.value === 'moment'))! as HTMLSelectElement;
    fireEvent.change(kinds, { target: { value: 'moment' } });

    const listens = [...document.querySelectorAll('select')]
      .find(el => [...el.options].some(o => o.value === 'turn-start'))! as HTMLSelectElement;
    const options = [...listens.options].map(o => o.textContent ?? '');
    expect(options.some(text => text.includes('в начале своего хода'))).toBe(true);

    fireEvent.change(listens, { target: { value: 'turn-start' } });
    const effect = Object.values(useWorld.getState().system.effects).at(-1)!;
    expect(effect.on?.[0]?.on).toBe('moment:turn-start');

    const condition = [...document.querySelectorAll('select')]
      .find(el => [...el.options].some(o => o.textContent === 'формулой…'))! as HTMLSelectElement;
    expect([...condition.options].map(o => o.value), 'у времени нет исходов шага, только формула').toEqual(['', ':формула']);
  });
});

describe('крит — обычная формула, а не особый слот', () => {
  beforeEach(() => {
    useWorld.setState(state => ({
      ...state,
      system: {
        ...emptySystem(),
        tables: { лист: { shape: 'single', columns: [{ key: 'хиты', label: 'Хиты', kind: 'number', default: 10 }] } },
        constants: { к20: { label: 'Кость', kind: 'die', dice: [{ count: 1, sides: 20 }] } },
        effects: {
          удар: {
            label: 'Удар', activation: 'manual',
            params: [{ key: 'действующий', label: 'Кто действует', kind: 'sheet' }],
            steps: [
              { id: 'проверка_бросок', type: 'roll', die: 'к20', by: { expr: '@действующий' } },
              { id: 'проверка', type: 'check', value: { expr: '@проверка_бросок' }, versus: { expr: '10' } },
              { id: 'урон', type: 'roll', die: { expr: '"2d6"' } },
            ],
          },
        },
      },
      activeEffectId: 'удар',
    }));
  });
  afterEach(() => { cleanup(); });

  const строка = () => screen.getByDisplayValue('кинуть("2d6")') as HTMLInputElement;

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

    const шаг = useWorld.getState().system.effects.удар!.steps![2]! as Record<string, unknown>;
    expect(шаг.die, 'старые поля ушли').toBeUndefined();
    expect((шаг.fixed as { expr: string }).expr).toBe("кинуть('2d6') + @хиты");
  });

  it('набор не пишется в систему, пока строку не отпустили', () => {
    renderOpen(<EffectsTab />);
    fireEvent.change(строка(), { target: { value: 'кинуть(@кос' } });

    const шаг = useWorld.getState().system.effects.удар!.steps![2]! as Record<string, unknown>;
    expect(шаг.fixed, 'недобранное имя в систему не попало').toBeUndefined();
    expect(шаг.die).toEqual({ expr: '"2d6"' });
  });

  it('незнакомое имя в строке предлагается взять из записи под тем же ключом', () => {
    renderOpen(<EffectsTab />);
    набрать('кинуть(@кость_врага)');
    fireEvent.click(screen.getByText('взять «кость_врага» из записи'));

    const effect = useWorld.getState().system.effects.удар!;
    expect(effect.params!.map(p => p.key)).toContain('кость_врага');
  });
});

describe('шаг цены — один раз, до остальных', () => {
  beforeEach(() => {
    useWorld.setState(state => ({
      ...state,
      system: {
        ...emptySystem(),
        tables: { лист: { shape: 'single', columns: [{ key: 'ячейки', label: 'Ячейки', kind: 'number', default: 3 }] } },
        effects: { снаряд: { label: 'Снаряд', activation: 'manual', params: [], steps: [] } },
      },
      activeEffectId: 'снаряд',
    }));
  });
  afterEach(() => { cleanup(); });

  it('«цена» в шапке шага переносит его в начало цепочки и обратно', () => {
    renderOpen(<EffectsTab />);
    fireEvent.click(screen.getAllByText('+ изменение')[0]!);
    expect(useWorld.getState().system.effects.снаряд!.steps).toHaveLength(1);

    fireEvent.click(screen.getByText('цена'));
    const moved = useWorld.getState().system.effects.снаряд!;
    expect(moved.cost).toHaveLength(1);
    expect(moved.steps ?? []).toHaveLength(0);
    expect(document.querySelector('.chip--on')?.textContent).toBe('цена');

    fireEvent.click(screen.getByText('цена'));
    const back = useWorld.getState().system.effects.снаряд!;
    expect(back.cost).toBeUndefined();
    expect(back.steps).toHaveLength(1);
  });
});

describe('EffectsTab: унаследованное видно', () => {
  beforeEach(() => {
    useWorld.setState(state => ({
      ...state,
      system: {
        ...state.system,
        effects: {
          spell: { label: 'Заклинание', activation: 'manual', params: [{ key: 'slot', label: 'Круг ячейки', kind: 'number' }], cost: [{ type: 'emit', effect: 'cost' }], steps: [] },
          bless: { label: 'Благословение', activation: 'manual', extends: 'spell', steps: [] },
        },
      },
      activeEffectId: 'bless',
    }));
  });
  afterEach(() => { cleanup(); });

  it('у потомка свёрнуто «От основы» с её входами и ценой, и ссылка в основу', () => {
    renderOpen(<EffectsTab />);
    expect(screen.getByText('От основы «Заклинание»')).toBeTruthy();
    expect(screen.getAllByText('Круг ячейки').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByText('править в основе →'));
    expect(useWorld.getState().activeEffectId).toBe('spell');
  });
});
