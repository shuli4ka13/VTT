// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { TagsSection } from './tags-section.tsx';
import { CombatSection } from './combat-section.tsx';
import { useWorld, emptySystem } from '../../../store/world.ts';
import { pickCombo } from '../../../testing/cards.ts';
import type { System } from '@vtt/schema';

const base = (): System => ({
  ...emptySystem(),
  constants: { к20: { label: 'к20', kind: 'die', dice: [{ count: 1, sides: 20 }] } },
} as unknown as System);

describe('правила: метки и бой', () => {
  beforeEach(() => { useWorld.setState(state => ({ ...state, system: base() })); });
  afterEach(cleanup);

  const editSystem = (change: (draft: System) => void) => useWorld.getState().editSystem(change);

  it('метку с договором заводят и дают ей обязательный вход', () => {
    const view = () => render(<TagsSection system={useWorld.getState().system} editSystem={editSystem} />);
    view();
    fireEvent.click(screen.getByText('+ метка'));
    cleanup();
    view();
    fireEvent.click(screen.getByText('Новая метка'));
    fireEvent.click(screen.getByText('+ вход'));
    const tag = Object.values(useWorld.getState().system.tags ?? {})[0]!;
    expect(tag.inputs).toEqual([{ key: 'deystvuyuschiy', kind: 'sheet' }]);
    expect(tag.said).toEqual({ deystvuyuschiy: 'действующий' });
  });

  it('итоги договора: «+ итог» заводит да/нет с латинским ключом и словом, вид «выбор» ставит таблицу, «×» убирает итог и слово', () => {
    useWorld.setState(state => ({
      ...state,
      system: {
        ...base(),
        tables: { kinds: { label: 'Виды', rows: [{ value: 'a', label: 'А' }] } },
        tags: { ataka: { label: 'Атака' } },
      } as unknown as System,
    }));
    const tag = () => useWorld.getState().system.tags!.ataka!;
    const shown = render(<TagsSection system={useWorld.getState().system} editSystem={editSystem} />);
    const view = () => shown.rerender(<TagsSection system={useWorld.getState().system} editSystem={editSystem} />);
    fireEvent.click(screen.getByText('Атака'));
    fireEvent.click(screen.getByText('+ итог'));
    expect(tag().outputs).toHaveLength(1);
    const added = tag().outputs![0]!;
    expect(added.kind).toBe('boolean');
    expect(added.key).toMatch(/^[a-z0-9_]+$/);
    expect(tag().said?.[added.key]).toBeTruthy();
    view();
    const kindBox = screen.getAllByRole('combobox').find(box => (box as HTMLInputElement).value === 'да / нет')!;
    pickCombo(kindBox, 'choice');
    expect(tag().outputs![0]).toEqual({ key: added.key, kind: 'choice', from: 'kinds' });
    view();
    fireEvent.click(screen.getByTitle('убрать итог'));
    expect(tag().outputs).toBeUndefined();
    expect(tag().said?.[added.key]).toBeUndefined();
  });

  it('вход-выбор берёт таблицу, признаки броска — метка или строка таблицы; «×» убирает признак и слово', () => {
    useWorld.setState(state => ({
      ...state,
      system: {
        ...base(),
        tables: { reach: { label: 'Дальность', rows: [{ value: 'a', label: 'А' }] } },
        tags: { ataka: { label: 'Атака', inputs: [{ key: 'dalnost', kind: 'choice', from: 'reach' }] } },
      } as unknown as System,
    }));
    const tag = () => useWorld.getState().system.tags!.ataka!;
    const shown = render(<TagsSection system={useWorld.getState().system} editSystem={editSystem} />);
    const view = () => shown.rerender(<TagsSection system={useWorld.getState().system} editSystem={editSystem} />);
    fireEvent.click(screen.getByText('Атака'));
    fireEvent.click(screen.getByText('+ признак'));
    expect(tag().traits).toHaveLength(1);
    const added = tag().traits![0]!;
    expect(added.from).toBeUndefined();
    expect(tag().said?.[added.key]).toBeTruthy();
    view();
    pickCombo(screen.getAllByRole('combobox').find(box => (box as HTMLInputElement).value === 'просто метка')!, 'table');
    expect(tag().traits![0]).toEqual({ key: added.key, from: 'reach' });
    view();
    pickCombo(screen.getAllByRole('combobox').find(box => (box as HTMLInputElement).value === 'одна из строк таблицы')!, 'mark');
    expect(tag().traits![0]).toEqual({ key: added.key });
    view();
    fireEvent.click(screen.getByTitle('убрать признак'));
    expect(tag().traits).toBeUndefined();
    expect(tag().said?.[added.key]).toBeUndefined();
  });

  it('инициатива заводится костью системы, пределы по умолчанию в данные не пишутся', () => {
    render(<CombatSection system={useWorld.getState().system} editSystem={editSystem} />);
    fireEvent.click(screen.getByText('+ инициатива'));
    expect(useWorld.getState().system.initiative).toEqual({ die: 'к20' });
    expect((useWorld.getState().system as { limits?: unknown }).limits).toBeUndefined();
  });
});

describe('правки броска: числа операций — поля', () => {
  afterEach(cleanup);

  it('у ступени кости правится шаг, у «не меньше» — порог', async () => {
    const { numberKeyOf } = await import('./roll-edits-section.tsx');
    expect(numberKeyOf({ op: 'dieStep', by: 1 })).toBe('by');
    expect(numberKeyOf({ op: 'floorDie', least: 10 })).toBe('least');
    expect(numberKeyOf({ op: 'keepBest', n: 1 })).toBe('n');
  });

  it('«добавить кость» берёт число костей формулой: рывок Shadowrun — @edge', async () => {
    const { RollEditsSection } = await import('./roll-edits-section.tsx');
    useWorld.setState(state => ({ ...state, system: { ...base(), roll_edits: { рывок: { label: 'Рывок', ops: [{ op: 'addDie' }] } } } as System }));
    render(<RollEditsSection system={useWorld.getState().system} editSystem={change => useWorld.getState().editSystem(change)} usage={new Map()} />);
    fireEvent.change(screen.getByPlaceholderText('сколько'), { target: { value: '@edge' } });
    expect(useWorld.getState().system.roll_edits!.рывок!.ops[0]).toEqual({ op: 'addDie', count: { expr: '@edge' } });
  });
});
