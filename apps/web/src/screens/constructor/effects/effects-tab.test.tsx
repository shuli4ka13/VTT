// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { renderOpen } from '../../../testing/render-open.tsx';
import { EffectsTab } from './effects-tab.tsx';
import { useWorld, emptySystem } from '../../../store/world.ts';
import { CREATE_KINDS } from './words.ts';
import { fieldsOf, hasField } from '@vtt/engine/model/sheet-columns';
import { SAMPLE_WORLDS } from '@vtt/engine/model/systems';
import type { Effect } from '@vtt/schema';

describe('EffectsTab: палитра трёх понятий', () => {
  const ACTOR = { key: 'действующий', label: 'Кто действует', kind: 'sheet' };

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

  const withActor = () => useWorld.getState().editEffect('strike', draft => { draft.params = [ACTOR] as never; });

  it('свойства эффекта — одной строкой; у активируемого нет «сколько висит»', () => {
    renderOpen(<EffectsTab />);
    const heads = [...document.querySelectorAll('[data-field]')].map(h => h.getAttribute('data-field'));
    expect(heads).toEqual(expect.arrayContaining(['Как запускается', 'Блок', 'Описание']));
    expect(heads).not.toContain('На основе');
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
    withActor();
    renderOpen(<EffectsTab />);
    const palette = screen.getAllByRole('button')
      .filter(b => !b.closest('details'))
      .filter(b => (b.textContent ?? '').trimStart().startsWith('+ '))
      .map(b => b.textContent!.trim())
      .filter(t => !CREATE_KINDS.some(kind => t === `+ ${kind.label.toLowerCase()}`)
        && t !== '+ шаг для других' && t !== '+ новый' && t !== '+ блок'
        && t !== '+ ещё одно' && t !== '+ вход' && t !== '+ итог' && t !== '+ держание' && !t.startsWith('+ в «')
        && !['+ блок', '+ метки', '+ описание для игрока', '+ занимает', '+ какие метки бывают', '+ сколько висит', '+ на основе'].includes(t));
    expect(palette).toEqual(['+ проверка', '+ изменение', '+ вызов', '+ таблица', '+ для каждого из списка', '+ если', '+ стоп', '+ число']);
    fireEvent.click(screen.getAllByText('+ проверка')[0]!);
    const card = screen.getByText('1 · Проверка').closest('.step-fold, .card') as HTMLElement;
    expect(card).toBeTruthy();
    expect(within(card).queryByText(/порог/i)).toBeNull();
    fireEvent.click(screen.getAllByText('+ для каждого из списка')[0]!);
    expect(screen.getByText(/2 · Для каждого из/)).toBeTruthy();
  });

  it('шаги сворачиваются: одной строкой с пересказом, по одному и все сразу', () => {
    try { localStorage.clear(); } catch { return; }
    withActor();
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
      system: { ...state.system, effects: { fresh: { label: 'Свежий эффект', activation: 'manual', params: [ACTOR], steps: [
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
    withActor();
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

  it('«Что приходит» — видимая секция с кнопкой: без входов «+ вход», с входами «+ ещё одно»', () => {
    renderOpen(<EffectsTab />);
    expect(screen.getByText('Что приходит')).toBeTruthy();
    expect(screen.getByText('Входов нет — эффект берёт всё с листов.')).toBeTruthy();
    expect(screen.queryByText('+ ещё одно')).toBeNull();
    fireEvent.click(screen.getByText('+ вход'));
    const effect = useWorld.getState().system.effects.strike!;
    expect(effect.params!.length).toBe(1);
    expect(screen.getByText('+ ещё одно')).toBeTruthy();
    expect(screen.queryByText('+ вход')).toBeNull();
    expect(screen.queryByText('Входов нет — эффект берёт всё с листов.')).toBeNull();
  });

  it('входы — списком словами: форма по клику, редкое под «ещё», «правят сопротивления» только у числа', () => {
    renderOpen(<EffectsTab />);
    fireEvent.click(screen.getByText('+ вход'));
    expect(screen.getByText('Новый вход')).toBeTruthy();
    const form = () => document.querySelector('.param-form') as HTMLElement;
    expect(screen.queryByLabelText('«Новый вход» — величина'), 'редкое спрятано').toBeNull();
    fireEvent.click(within(form()).getByText('ещё'));
    const heads = [...form().querySelectorAll('.field__label')].map(h => h.textContent);
    expect(heads.slice(-3)).toEqual(['Величина', 'Границы', 'Имя в формулах']);
    expect(screen.getByLabelText('«Новый вход» — величина')).toBeTruthy();

    const ask = [...form().querySelectorAll('select')].find(el => [...el.options].some(o => o.value === 'gm'))!;
    fireEvent.change(ask, { target: { value: 'gm' } });
    const effect = Object.values(useWorld.getState().system.effects).find(e => e.params?.length)!;
    expect(effect.params![0]!.ask).toEqual({ by: 'gm' });
    expect(document.querySelector('.param-line__sum')!.textContent).toContain('число, если не сказано — спросить ведущего');

    fireEvent.change(form().querySelectorAll('select')[0]!, { target: { value: 'dice' } });
    expect(screen.queryByLabelText('«Новый вход» — величина')).toBeNull();
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

  it('машинного имени проверки на экране нет (своё имя видно только у «Числа»), а сослаться на шаг всё равно можно', () => {
    renderOpen(<EffectsTab />);
    expect(screen.queryAllByPlaceholderText('имя').map(input => (input as HTMLInputElement).value)).toEqual(['сколько']);
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
    fireEvent.click(screen.getAllByText(/^имя в формулах/).at(-1)!);
    const input = [...document.querySelectorAll('input')].find(i => i.value === check)!;
    fireEvent.change(input, { target: { value: 'hit' } });
    fireEvent.blur(input);
    const ids = useWorld.getState().system.effects.strike!.steps!.map(step => step.id);
    expect(ids).toContain('hit');
    expect(ids).toContain('hit_бросок');
  });

  it('формула числа предлагает выходы проверки поимённо', () => {
    renderOpen(<EffectsTab />);
    const input = document.querySelector('.number-line__formula .chips__text') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '@', selectionStart: 1 } });

    const options = () => [...document.querySelectorAll('.slot__option')].map(o => o.textContent?.trim());
    expect(options()).toContain('здесь жебросок — на сколько перебил порог');
    fireEvent.change(input, { target: { value: '@легло', selectionStart: 6 } });
    expect(options()).toContain('здесь жебросок — сколько костей легло максимумом');
    expect(options()).toContain('здесь жебросок — сколько костей легло единицей');
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

    const phase = screen.getByDisplayValue('до') as HTMLSelectElement;
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

  it('«+ шаг для других» заводит обычный эффект с шагом в первое числовое поле', () => {
    renderOpen(<EffectsTab />);
    fireEvent.click(screen.getByText('+ шаг для других'));
    const key = useWorld.getState().activeEffectId!;
    const made = useWorld.getState().system.effects[key]!;
    expect(made.params!.map(p => [p.key, p.kind])).toEqual([['лист', 'sheet'], ['amount', 'number']]);
    expect(made.steps).toEqual([
      { type: 'apply', target: { expr: '@лист.hp' }, value: { expr: '@amount' } },
    ]);
    expect(key.startsWith('event:')).toBe(false);
  });

  it('правится тем же редактором: те же шаги, а входы заводит автор', () => {
    renderOpen(<EffectsTab />);
    fireEvent.click(screen.getByText('+ шаг для других'));
    expect(screen.getByText('Шаги')).toBeTruthy();
    expect(screen.getByText('Что приходит')).toBeTruthy();

    fireEvent.click(screen.getAllByText('+ проверка')[0]!);
    const key = useWorld.getState().activeEffectId!;
    expect(useWorld.getState().system.effects[key]!.steps).toHaveLength(3);

    fireEvent.click(screen.getByText('+ ещё одно'));
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

    fireEvent.click(screen.getByText('+ условие'));
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

    expect(document.querySelector('.number-line [data-field="Формула"]')).toBeTruthy();
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

  it('↑ у первого шага переносит его в плату, ↓ у последнего шага платы — обратно под черту', () => {
    renderOpen(<EffectsTab />);
    fireEvent.click(screen.getAllByText('+ изменение')[0]!);
    expect(useWorld.getState().system.effects.снаряд!.steps).toHaveLength(1);

    fireEvent.click(screen.getByText('↑'));
    const moved = useWorld.getState().system.effects.снаряд!;
    expect(moved.cost).toHaveLength(1);
    expect(moved.steps ?? []).toHaveLength(0);
    expect(document.querySelector('.pay-divider')?.textContent).toContain('Плата');

    fireEvent.click(screen.getByText('↓'));
    const back = useWorld.getState().system.effects.снаряд!;
    expect(back.cost).toBeUndefined();
    expect(back.steps).toHaveLength(1);
    expect(document.querySelector('.pay-divider')).toBeNull();
  });
});

describe('«пока» и «когда» — одна таблица', () => {
  afterEach(cleanup);

  const open = (effect: Record<string, unknown>) => {
    useWorld.setState(state => ({
      ...state,
      system: { ...state.system, effects: { aura: { label: 'Аура', activation: 'passive', ...effect } } },
      activeEffectId: 'aura',
    }));
    render(<EffectsTab />);
  };

  const adders = () => [...screen.getByText('+ когда').parentElement!.querySelectorAll('button')].map(button => button.textContent!.trim());

  it('ничего нет — одна бледная строка и один ряд кнопок, старых разделов и коробок нет', () => {
    open({});
    expect(screen.getByText('Что делает, пока висит')).toBeTruthy();
    const empty = screen.getByText('Пока ничего не делает.');
    expect(empty.className).toBe('faint');
    expect(screen.queryByText('Пока висит — правит')).toBeNull();
    expect(screen.queryByText('Когда')).toBeNull();
    expect(screen.queryByText('Ничего не правит')).toBeNull();
    expect(screen.queryByText('Ни на что не отзывается')).toBeNull();
    expect(empty.parentElement!.querySelector('.empty')).toBeNull();
    expect(adders()).toEqual(['+ правит поле', '+ правка вызова', '+ когда', '+ при наложении', '+ при спадании']);
  });

  it('правка, подписка, наложение и спадание — строки одного списка: «пока», потом «когда»', () => {
    open({
      modifiers: [{ kind: 'value', target: 'ac', op: 'add', value: { expr: '1' } }],
      on: [{ on: 'moment:turn-start', steps: [] }],
      attach: [],
      detach: [],
    });
    expect(screen.queryByText('Пока ничего не делает.')).toBeNull();
    const rows = [...document.querySelectorAll('.mod-row')];
    expect(rows.map(row => row.querySelector('.mod-row__kind')!.textContent)).toEqual(['пока', 'когда', 'когда', 'когда']);
    expect(rows.map(row => row.classList.contains('mod-row--when'))).toEqual([false, true, true, true]);
    expect(document.querySelector('.mod-row__tag')).toBeNull();
    expect(document.querySelectorAll('.mod-table > .mod-item')).toHaveLength(4);
    expect(screen.getByText('повесили')).toBeTruthy();
    expect(screen.getByText('спало')).toBeTruthy();
    expect(document.querySelectorAll('.when-body')).toHaveLength(3);
    expect([...document.querySelectorAll('.when-body .chain-run__label')].map(label => label.textContent)).toEqual(['делает:', 'делает:', 'делает:']);
    expect(screen.queryByText('→ делает')).toBeNull();
    for (const body of document.querySelectorAll('.when-body')) {
      expect(body.querySelector('.chain-run')).toBeTruthy();
      expect(body.querySelector('.bricks')).toBeTruthy();
      expect(body.querySelector('.chain-run .bricks'), 'палитра шагов — вне розовой черты').toBeNull();
    }
    expect(adders()).toEqual(['+ правит поле', '+ правка вызова', '+ когда']);
  });

  it('«+ при наложении» ставит пустое наложение, крестик у его строки убирает наложение после подтверждения', () => {
    open({ modifiers: [{ kind: 'value', target: 'ac', op: 'add', value: { expr: '1' } }] });
    fireEvent.click(screen.getByText('+ при наложении'));
    expect(useWorld.getState().system.effects.aura!.attach).toEqual([]);
    expect(screen.queryByText('+ при наложении')).toBeNull();
    expect(screen.getByText('+ при спадании')).toBeTruthy();

    const hook = screen.getByText('повесили').closest('.mod-row') as HTMLElement;
    expect(hook.querySelector('button.mod-row__text')).toBeNull();
    fireEvent.click(within(hook).getByText('×'));
    expect(useWorld.getState().system.effects.aura!.attach).toEqual([]);
    fireEvent.click(within(hook).getByText('точно убрать'));
    expect(useWorld.getState().system.effects.aura!.attach).toBeUndefined();
    expect(screen.getByText('+ при наложении')).toBeTruthy();
  });
});

describe('подписка видит имена вызова', () => {
  afterEach(cleanup);

  it('шаги подписок образцов не помечены сломанными ссылками', () => {
    const broken: string[] = [];
    for (const world of SAMPLE_WORLDS) {
      for (const [id, effect] of Object.entries(world.system.effects ?? {})) {
        if (!(effect.on ?? []).length) continue;
        useWorld.setState(state => ({ ...state, system: world.system, compendium: world.compendium, activeEffectId: id }));
        renderOpen(<EffectsTab />);
        if (/со сломанными ссылками/.test(document.body.textContent ?? '')) broken.push(`${world.system.name} · ${effect.label ?? id}`);
        if (document.querySelector('button button')) broken.push(`${world.system.name} · ${effect.label ?? id}: кнопка внутри кнопки`);
        cleanup();
      }
    }
    expect(broken).toEqual([]);
  }, 300000);
});

describe('список слева: «ничего не делает» знает про наложение и спадание', () => {
  afterEach(cleanup);

  const metaOf = (name: string): string => {
    const item = [...document.querySelectorAll('.list__item')].find(one => one.querySelector('.list__name')?.textContent === name);
    return item!.querySelector('.list__meta')!.textContent!;
  };

  it('«Без сознания» при наложении кладёт «Лежит», у «Недееспособен» наложение снимает концентрацию — оба при деле; пустые наложение и спадание — нет', () => {
    const world = structuredClone(SAMPLE_WORLDS.find(one => one.system.name === 'D&D 5e')!);
    const effects = world.system.effects as Record<string, Effect>;
    effects.leaving = { label: 'Только спадание', activation: 'passive', detach: effects.unconscious!.attach } as Effect;
    effects.hollow = { label: 'Пустое наложение', activation: 'passive', attach: [], detach: [] } as Effect;
    useWorld.setState(state => ({ ...state, system: world.system, compendium: world.compendium, activeEffectId: 'charmed' }));
    renderOpen(<EffectsTab />);
    expect(metaOf('Без сознания')).not.toContain('ничего не делает');
    expect(metaOf('Недееспособен')).not.toContain('ничего не делает');
    expect(metaOf('Только спадание')).not.toContain('ничего не делает');
    expect(metaOf('Ошеломлён')).not.toContain('ничего не делает');
    expect(metaOf('Очарован')).toContain('ничего не делает');
    expect(metaOf('Пустое наложение')).toContain('ничего не делает');
  });
});

describe('одно правило «шаг для других»', () => {
  afterEach(cleanup);

  it('подпись в библиотеке совпадает с палитрой шагов: D&D — «Урон», «Лечение», «Бросок атаки», «Спасбросок», «Повторный спасбросок», «Новый ход»', () => {
    const world = SAMPLE_WORLDS.find(one => one.system.name === 'D&D 5e')!;
    const strike = Object.entries(world.system.effects).find(([, effect]) => effect.label === 'Атака')![0];
    useWorld.setState(state => ({ ...state, system: world.system, compendium: world.compendium, activeEffectId: strike }));
    renderOpen(<EffectsTab />);
    const listed = [...document.querySelectorAll('.list__item')]
      .filter(item => item.textContent?.includes('шаг для других'))
      .map(item => item.querySelector('.list__name')?.textContent).sort();
    const palette = [...document.querySelectorAll('.bricks__row:not(.bricks__row--plain) button')].map(button => button.textContent).sort();
    expect(palette).toEqual(['Бросок атаки', 'Лечение', 'Новый ход', 'Повторный спасбросок', 'Спасбросок', 'Урон']);
    expect(listed).toEqual(palette);
  });
});
