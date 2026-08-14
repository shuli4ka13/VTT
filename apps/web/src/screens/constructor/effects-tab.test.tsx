// apps/web/src/screens/constructor/effects-tab.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EffectsTab } from './effects-tab.tsx';
import { useWorld } from '../../store/world.ts';

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

  // Оси висения показываются только тем, кого вешают: активируемый эффект
  // не висит, его «постоянность» — это владение записью, а не длительность.
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

  it('палитра — только три кирпича, клик кладёт карточку', () => {
    render(<EffectsTab />);
    const palette = screen.getAllByRole('button')
      .filter(b => (b.textContent ?? '').trimStart().startsWith('+ '))
      .map(b => b.textContent!.trim())
      .filter(t => !t.startsWith('+ актив') && !t.startsWith('+ триггер')
        && !t.startsWith('+ пассив') && !t.startsWith('+ брать'));
    expect(palette).toEqual(['+ проверка', '+ изменение', '+ число']);
    fireEvent.click(screen.getByText('+ проверка'));
    expect(screen.getByText('1 · Проверка')).toBeTruthy();
    expect(screen.queryByText(/порог/i)).toBeNull();
  });

  // Домен («атака», «урон») — слова автора: им место в лейблах эффектов и в
  // образцах-донорах. Кнопки же палитры — механика, и говорят только на ней.
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

// Криты и глитчи собираются из счёта по натурально выпавшему. Чтобы это
// было возможно, до слота должны доехать три вещи разом: у проверки есть
// ИМЯ (иначе на неё не сослаться), карточка знает ТИП шага выше по цепочке
// (иначе не спросить его выходы), и выпадашка предлагает выходы поимённо,
// а не «результат целиком». Раньше рвалось в каждом из трёх мест.
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

  it('у проверки есть поле имени — без него на неё не сослаться', () => {
    render(<EffectsTab />);
    expect(screen.getAllByPlaceholderText('имя').length).toBeGreaterThan(1);
  });

  it('слот «какое превышение» предлагает выходы проверки поимённо', () => {
    render(<EffectsTab />);
    const label = screen.getByText('какое превышение');
    const input = label.parentElement!.querySelector('.chips__text') as HTMLInputElement;
    fireEvent.focus(input);

    const options = [...document.querySelectorAll('.slot__option')].map(o => o.textContent?.trim());
    expect(options).toContain('Результаты шагов«бросок» — превышение');
    expect(options).toContain('Результаты шагов«бросок» — костей на максимуме');
    expect(options).toContain('Результаты шагов«бросок» — костей на единице');
  });
});
