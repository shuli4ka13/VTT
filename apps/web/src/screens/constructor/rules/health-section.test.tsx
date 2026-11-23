// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { HealthSection } from './health-section.tsx';
import { pickCombo } from '../../../testing/cards.ts';
import { useWorld, emptySystem } from '../../../store/world.ts';
import { lintSystem } from '@vtt/engine';
import type { System } from '@vtt/schema';

const base = (): System => ({
  ...emptySystem(),
  tables: {
    лист: { shape: 'single', owner: 'sheet', label: 'Лист', columns: [
      { key: 'раны', label: 'Раны', kind: 'number' },
      { key: 'предел', label: 'Предел ран', kind: 'number', default: 10 },
      { key: 'имя', label: 'Имя', kind: 'text' },
    ] },
  },
  blocks: [{ key: 'Основа', parts: [{ table: 'лист' }] }],
} as unknown as System);

function Live() {
  const system = useWorld(state => state.system);
  const editSystem = useWorld(state => state.editSystem);
  return <HealthSection system={system} editSystem={editSystem} />;
}

const now = () => useWorld.getState().system;

describe('правила: здоровье', () => {
  beforeEach(() => { useWorld.setState(state => ({ ...state, system: base(), compendium: { records: [] } })); });
  afterEach(cleanup);

  it('«+ здоровье» объявляет здоровье и предел первыми числовыми полями; поля меняются выбором', () => {
    render(<Live />);
    fireEvent.click(screen.getByText('+ здоровье'));
    expect(now().health).toEqual({ value: 'раны', max: 'предел' });
    pickCombo(screen.getByLabelText('поле здоровья'), 'Предел ран');
    expect(now().health).toEqual({ value: 'предел', max: 'предел' });
  });

  it('«+ таблица ступеней» заводит справочник «цел / ранен / тяжело ранен» и ссылается на него; «Проблем» нет', () => {
    render(<Live />);
    fireEvent.click(screen.getByText('+ здоровье'));
    fireEvent.click(screen.getByText('+ таблица ступеней'));
    const { health, tables } = now();
    expect(health?.steps).toEqual({ table: 'health_steps', from: 'from', state: 'state' });
    expect(tables!.health_steps!.rows!.map(row => [row.value, row.cells?.from])).toEqual([['цел', 100], ['ранен', 50], ['тяжело ранен', 0]]);
    expect(lintSystem(now()).filter(problem => problem.where.section === 'vitals')).toEqual([]);
  });

  it('«убрать здоровье» снимает объявление', () => {
    render(<Live />);
    fireEvent.click(screen.getByText('+ здоровье'));
    fireEvent.click(screen.getByText('убрать здоровье'));
    expect(now()).not.toHaveProperty('health');
  });
});
