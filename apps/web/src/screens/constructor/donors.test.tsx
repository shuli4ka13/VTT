// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DonorPalette } from './donors.tsx';
import { useWorld, emptySystem } from '../../store/world.ts';
import { SAMPLE_SYSTEMS } from '@vtt/engine/model/systems';
import { bringIn, blockParts } from '@vtt/engine/model/bring';
import { fieldsOf } from '@vtt/engine/model/sheet-columns';
import { effectStanding, fieldsStanding, defaultDonor, ownWords } from './donor-compare.ts';
import type { System } from '@vtt/schema';
import { pickCombo } from '../../testing/cards.ts';

const showAll = () => pickCombo(screen.getAllByRole('combobox')[0]!, '*');

describe('доноры-образцы', () => {
  beforeEach(() => {
    useWorld.setState(state => ({ ...state, system: emptySystem(), activeEffectId: null }));
  });

  it('эффект с правкой броска привозит и саму правку, и ту, которой она гасится', () => {
    render(<DonorPalette kind="effects" />);
    showAll();

    fireEvent.click(screen.getByText(/^Отравлен$/));

    const system = useWorld.getState().system;
    const mods = Object.values(system.effects).flatMap(e => e.modifiers ?? []);
    const named = mods.filter(m => m.kind === 'edit' && m.edit).map(m => m.edit);

    expect(named.length, 'эффект приехал со ссылкой на правку').toBeGreaterThan(0);
    for (const key of named) {
      expect(system.roll_edits?.[key], `правка «${key}» приехала вместе с эффектом`).toBeTruthy();
    }

    const cancels = Object.values(system.roll_edits ?? {}).flatMap(e => e.cancels ?? []);
    for (const key of cancels) {
      expect(system.roll_edits?.[key as string], 'встречная правка приехала тоже').toBeTruthy();
    }
  });

  it('своя правка с тем же ключом не затирается донором', () => {
    useWorld.setState(state => ({
      ...state,
      system: {
        ...emptySystem(),
        roll_edits: { disadvantage: { label: 'Моя помеха', ops: [{ op: 'dieStep', by: -1 }] } },
      },
      activeEffectId: null,
    }));
    render(<DonorPalette kind="effects" />);
    showAll();
    fireEvent.click(screen.getByText(/^Отравлен$/));

    expect(useWorld.getState().system.roll_edits!.disadvantage!.label).toBe('Моя помеха');
  });
});

describe('«уже в системе» — по содержимому', () => {
  const donor = SAMPLE_SYSTEMS.find(one => fieldsOf(one).some(f => f.placements?.length))!;
  const group = fieldsOf(donor).find(f => f.placements?.length)!.placements![0]!.group;
  const fields = fieldsOf(donor).filter(f => f.placements?.some(place => place.group === group));

  it('чего нет — можно добавить', () => {
    expect(fieldsStanding(emptySystem(), donor, fields)).toBe('new');
  });

  it('привезённый блок после добавления — «уже в системе»', () => {
    const brought = bringIn(emptySystem(), donor, blockParts(donor, group)).system;
    expect(fieldsStanding(brought, donor, fields)).toBe('same');
  });

  it('поле с тем же тегом, но другой колонкой — «есть своё», а не «уже в системе»', () => {
    const brought = structuredClone(bringIn(emptySystem(), donor, blockParts(donor, group)).system) as System;
    const home = fields[0]!.home;
    const column = brought.tables![home]!.columns!.find(one => one.key === (fields[0]!.cell?.column ?? fields[0]!.tag))!;
    (column as { label?: string }).label = 'Совсем другое название';
    (column as { expr?: unknown }).expr = { expr: '777' };
    expect(fieldsStanding(brought, donor, fields)).toBe('own');
  });

  it('эффект: тот же ключ и содержимое — «уже в системе», другое содержимое — «есть своё»', () => {
    const id = Object.keys(donor.effects)[0]!;
    const brought = bringIn(emptySystem(), donor, [{ kind: 'effect', key: id }]).system;
    expect(effectStanding(emptySystem(), donor, id)).toBe('new');
    expect(effectStanding(brought, donor, id)).toBe('same');
    const own = structuredClone(brought) as System;
    own.effects[id] = { ...own.effects[id]!, label: 'Мой собственный' };
    expect(effectStanding(own, donor, id)).toBe('own');
    expect(ownWords('X')).toBe('в системе уже есть своё «X» — готовое не заменит его');
  });

  it('каждый блок и эффект каждого донора после добавления в пустую систему — «уже в системе»', () => {
    for (const one of SAMPLE_SYSTEMS) {
      const names = new Set(fieldsOf(one).flatMap(f => (f.placements ?? []).map(place => place.group)));
      for (const name of names) {
        const brought = bringIn(emptySystem(), one, blockParts(one, name)).system;
        const inBlock = fieldsOf(one).filter(f => f.placements?.some(place => place.group === name));
        expect(fieldsStanding(brought, one, inBlock), `${one.name} · ${name}`).toBe('same');
      }
      for (const id of Object.keys(one.effects)) {
        const brought = bringIn(emptySystem(), one, [{ kind: 'effect', key: id }]).system;
        expect(effectStanding(brought, one, id), `${one.name} · ${id}`).toBe('same');
      }
    }
  });
});

describe('каталог открывается на нужном доноре', () => {
  const [first, second] = SAMPLE_SYSTEMS as [System, System];

  it('донор, из которого система сделана, — первым', () => {
    expect(defaultDonor({ ...emptySystem(), id: second.id } as System, SAMPLE_SYSTEMS)).toBe(second.id);
    expect(defaultDonor(emptySystem(), SAMPLE_SYSTEMS, second.id)).toBe(second.id);
  });

  it('иначе — тот, у кого больше совпавших таблиц; при нуле — первый', () => {
    expect(defaultDonor(emptySystem(), SAMPLE_SYSTEMS)).toBe(first.id);
    const shared = (d: System, mine: System) => Object.keys(d.tables ?? {}).filter(key => key in (mine.tables ?? {})).length;
    const mine = { ...emptySystem(), tables: Object.fromEntries(Object.entries(second.tables ?? {}).slice(0, 3)) } as System;
    const best = SAMPLE_SYSTEMS.reduce((top, one) => (shared(one, mine) > shared(top, mine) ? one : top));
    expect(defaultDonor(mine, SAMPLE_SYSTEMS)).toBe(best.id);
  });

  it('палитра показывает одного донора, а «все системы» — выбор', () => {
    useWorld.setState(state => ({ ...state, system: emptySystem(), activeEffectId: null }));
    render(<DonorPalette kind="effects" />);
    const select = screen.getAllByRole('combobox')[0]!;
    expect(select.dataset.value).toBe(first.id);
    expect(screen.queryByText(second.name!, { selector: 'span.field__label' })).toBeNull();
  });
});
