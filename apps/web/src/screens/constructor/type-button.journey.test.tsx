// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { pickCombo } from '../../testing/cards.ts';
import { act, emptyJournal, flattenSystem } from '@vtt/engine';
import type { Compendium, Sheet, System } from '@vtt/schema';
import { SAMPLE_WORLDS } from '@vtt/engine/samples';
import { RecordsTab } from './records-tab.tsx';
import { useWorld } from '../../store/world.ts';

const dnd = SAMPLE_WORLDS.find(world => world.system.id === 'dnd5e') as unknown as { system: System; compendium: Compendium; sheets: Sheet[] };

describe('новый тип с нуля: «+ кнопка» → «Атака» → вещь в книге бьёт за столом', () => {
  it('входы пробросились в свойства, вещь этого типа наносит урон', () => {
    const system = structuredClone(dnd.system);
    system.tables!.mag = { shape: 'book', use: 'item', label: 'Магическое оружие', block: 'Снаряжение', bindings: [{ effect: '' }] } as never;
    useWorld.setState(state => ({ ...state, system, compendium: structuredClone(dnd.compendium), activeRecordKind: 'mag' }));

    render(<RecordsTab />);
    pickCombo(screen.getByPlaceholderText('— какой эффект —'), 'strike');

    const kind = useWorld.getState().system.tables!.mag!;
    expect(kind.bindings![0]!.label).toBe('Атака');
    expect((kind.columns ?? []).map(column => column.key)).toEqual(['attack_with', 'damage_dice', 'damage_type', 'damage_source']);

    pickCombo(screen.getByLabelText('«Источник урона» — чем заполняет тип'), '"magicheskiy"');
    expect(useWorld.getState().system.tables!.mag!.bindings![0]!.args).toEqual({
      attack_with: { expr: '@attack_with' }, damage_dice: { expr: '@damage_dice' }, damage_type: { expr: '@damage_type' },
      damage_source: { expr: '"magicheskiy"' },
    });

    const built = useWorld.getState().system;
    const compendium = { ...dnd.compendium, records: [...dnd.compendium.records, { id: 'жезл', table: 'mag', label: 'Огненный жезл', cells: { attack_with: 5, damage_dice: '1d8', damage_type: 'fire' } }] } as Compendium;
    const sheets = structuredClone(dnd.sheets).map(sheet => (sheet.id === 'arven' ? { ...sheet, has: [...(sheet.has ?? []), { of: 'жезл' }] } : sheet));
    const before = Number(sheets.find(sheet => sheet.id === 'goblin')!.values?.hp_current ?? NaN);

    const out = act({
      system: flattenSystem(built), compendium, clock: null, die: (sides: number) => sides, sheets, journal: emptyJournal(), declineAll: true,
    } as never, { actionId: 'жезл:0', fromId: 'arven', toIds: ['goblin'] });

    const after = Number(out.sheets.find(sheet => sheet.id === 'goblin')!.values?.hp_current ?? NaN);
    expect(Number.isFinite(before)).toBe(true);
    expect(after).toBeLessThan(before);
  });

  it('вход «запись» этого типа или его основы заполняется «этой вещью» и свойства не заводит; запись другого типа — свойством', () => {
    const system = structuredClone(dnd.system);
    system.tables!.mag = { shape: 'book', use: 'item', label: 'Магическое оружие', extends: 'weapon', block: 'Снаряжение', bindings: [{ effect: '' }] } as never;
    system.effects.взмах = { label: 'Взмах', activation: 'manual', params: [
      { key: 'действующий', label: 'Кто действует', kind: 'sheet' },
      { key: 'оружие', label: 'Оружие', kind: 'record', from: 'weapon' },
      { key: 'доспех', label: 'Доспех', kind: 'record', from: 'armor' },
    ], steps: [] } as never;
    useWorld.setState(state => ({ ...state, system, compendium: structuredClone(dnd.compendium), activeRecordKind: 'mag' }));

    render(<RecordsTab />);
    pickCombo(screen.getByPlaceholderText('— какой эффект —'), 'взмах');

    const kind = useWorld.getState().system.tables!.mag!;
    expect(kind.bindings![0]!.args).toEqual({ оружие: { expr: '@item' }, доспех: { expr: '@доспех' } });
    expect((kind.columns ?? []).map(column => column.key)).toEqual(['доспех']);
  });
});
