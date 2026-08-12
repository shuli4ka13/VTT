// apps/web/src/screens/constructor/records-tab.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RecordsTab } from './records-tab.tsx';
import { useWorld } from '../../store/world.ts';

describe('RecordsTab: род видит потребности эффекта', () => {
  beforeEach(() => {
    useWorld.setState(state => ({
      ...state,
      system: {
        ...state.system,
        effects: {
          hit: { label: 'Удар', activation: 'manual', params: [{ key: 'кость', label: 'Кость урона', kind: 'dice' }], steps: [] },
        },
        records: {
          weapon: {
            kind: 'item', label: 'Оружие', group: 'Снаряжение',
            props: [],
            bindings: [{ label: 'Удар', effect: 'hit', args: {} }],
          },
        },
      },
      activeRecordKind: 'weapon',
    }));
  });

  it('незакрытая потребность заводит свойство кнопкой и закрывается', () => {
    render(<RecordsTab />);
    expect(screen.getByText(/не закрыто/).textContent).toContain('Кость урона');

    fireEvent.click(screen.getByText('+ завести свойство «Кость урона»'));

    const kind = useWorld.getState().system.records!.weapon!;
    expect(kind.props!.some(p => p.label === 'Кость урона' && p.kind === 'dice')).toBe(true);
    expect((kind.bindings![0] as any).args['кость']).toEqual({ prop: kind.props![0]!.key });
    expect(screen.queryByText(/не закрыто/)).toBeNull();
  });

  it('на экране нет слов «дырка», «параметр», «привязка»', () => {
    render(<RecordsTab />);
    expect(screen.queryByText(/дырк/i)).toBeNull();
    expect(screen.queryByText(/параметр/i)).toBeNull();
    expect(screen.queryByText(/привязк/i)).toBeNull();
  });

  // Свойство закрывает потребность конкретного рода (весь смысл «протягивания» —
  // у меча спрашивают кость, у доспеха защиту), поэтому выпадашка «свойство
  // записи» обязана предлагать props ТОЛЬКО того рода, чью привязку правят —
  // иначе привязку «Оружия» можно было закрыть свойством «Доспеха», которого
  // у мечей нет и не будет.
  it('в привязке рода «Оружие» не предлагается свойство рода «Доспех»', () => {
    useWorld.setState(state => ({
      ...state,
      system: {
        ...state.system,
        effects: {
          hit: { label: 'Удар', activation: 'manual', params: [{ key: 'кость', label: 'Кость урона', kind: 'dice' }], steps: [] },
        },
        records: {
          weapon: {
            kind: 'item', label: 'Оружие', group: 'Снаряжение',
            props: [{ key: 'кость', label: 'Кость урона' }],
            bindings: [{ label: 'Удар', effect: 'hit', args: {} }],
          },
          armor: {
            kind: 'item', label: 'Доспех', group: 'Снаряжение',
            props: [{ key: 'защита', label: 'Класс защиты' }],
            bindings: [],
          },
        },
      },
      activeRecordKind: 'weapon',
    }));

    const { container } = render(<RecordsTab />);
    const need = container.querySelector('.need-fill') as HTMLElement;

    // Первый select — выбор вида ссылки; переключаем на «свойство записи»,
    // тогда рядом появляется второй select — сам выбор свойства.
    fireEvent.change(need.querySelectorAll('select')[0]!, { target: { value: 'prop' } });
    const propSelect = need.querySelectorAll('select')[1] as HTMLSelectElement;
    const options = Array.from(propSelect.options).map(o => o.textContent);

    expect(options).toContain('Кость урона');
    expect(options).not.toContain('Класс защиты');
  });
});
