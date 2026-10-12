// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { act } from '@vtt/engine/core/act';
import { emptyJournal } from '@vtt/engine/core/external';
import type { Compendium, Sheet, System } from '@vtt/schema';
import { SAMPLE_WORLDS } from '@vtt/engine/model/systems';
import { flattenSystem } from '@vtt/engine/model/inherit';
import { RecordsTab } from './records-tab.tsx';
import { useWorld } from '../../store/world.ts';

const dnd = SAMPLE_WORLDS.find(world => world.system.id === 'dnd5e') as unknown as { system: System; compendium: Compendium; sheets: Sheet[] };

describe('новый тип с нуля: «+ кнопка» → «Атака» → вещь в книге бьёт за столом', () => {
  it('входы пробросились в свойства, вещь этого типа наносит урон', () => {
    const system = structuredClone(dnd.system);
    system.tables!.mag = { shape: 'book', use: 'item', label: 'Магическое оружие', block: 'Снаряжение', bindings: [{ effect: '' }] } as never;
    useWorld.setState(state => ({ ...state, system, compendium: structuredClone(dnd.compendium), activeRecordKind: 'mag' }));

    render(<RecordsTab />);
    fireEvent.change(screen.getByDisplayValue('— какой эффект —'), { target: { value: 'strike' } });

    const kind = useWorld.getState().system.tables!.mag!;
    expect(kind.bindings![0]!.label).toBe('Атака');
    expect((kind.columns ?? []).map(column => column.key)).toEqual(['attack_with', 'damage_dice', 'damage_type', 'damage_source']);

    fireEvent.change(screen.getByLabelText('«Источник урона» — чем заполняет тип'), { target: { value: '"магический"' } });
    expect(useWorld.getState().system.tables!.mag!.bindings![0]!.args).toEqual({ damage_source: { expr: '"магический"' } });

    const built = useWorld.getState().system;
    const compendium = { ...dnd.compendium, records: [...dnd.compendium.records, { id: 'жезл', table: 'mag', label: 'Огненный жезл', cells: { attack_with: 5, damage_dice: '1d8', damage_type: 'огонь' } }] } as Compendium;
    const sheets = structuredClone(dnd.sheets).map(sheet => (sheet.id === 'arven' ? { ...sheet, has: [...(sheet.has ?? []), { of: 'жезл' }] } : sheet));
    const before = Number(sheets.find(sheet => sheet.id === 'goblin')!.values?.hp_current ?? NaN);

    const out = act({
      system: flattenSystem(built), compendium, clock: null, die: (sides: number) => sides, sheets, journal: emptyJournal(), declineAll: true,
    } as never, { actionId: 'жезл:0', fromId: 'arven', toIds: ['goblin'] });

    const after = Number(out.sheets.find(sheet => sheet.id === 'goblin')!.values?.hp_current ?? NaN);
    expect(Number.isFinite(before)).toBe(true);
    expect(after).toBeLessThan(before);
  });
});
