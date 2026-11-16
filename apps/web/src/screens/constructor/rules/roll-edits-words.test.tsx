// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import { SAMPLE_WORLDS } from '@vtt/engine/model/systems';
import { comboOptions, pickCombo } from '../../../testing/cards.ts';
import { renderOpen } from '../../../testing/render-open.tsx';
import { RollEditsSection } from './roll-edits-section.tsx';
import { RollsSection } from './rolls-section.tsx';
import { ModifiersEditor } from '../modifiers.tsx';
import type { System, Modifier } from '@vtt/schema';

const system = {
  tables: {}, effects: {},
  roll_edits: { фора: { label: 'Фора', ops: [{ op: 'addDie' }] } },
} as unknown as System;

const fieldOf = (container: ParentNode, label: string): HTMLElement =>
  [...container.querySelectorAll<HTMLElement>('.field__label')].find(el => el.textContent === label)!.closest('label')!;

describe('правка броска говорит, что складывается, а что нет', () => {
  afterEach(cleanup);

  it('«Что правим» — числа в одной группе, слово из «Правил» — в другой, метка — в «ещё»', () => {
    const mods = [{ kind: 'edit', call: 'roll', param: 'count', op: 'add', value: { expr: '-2' } }] as Modifier[];
    const view = renderOpen(<ModifiersEditor system={system} modifiers={mods} onEdit={vi.fn()} />);
    const combo = fieldOf(view.container, 'Что правим').querySelector<HTMLElement>('[role="combobox"]')!;
    const groups = comboOptions(combo).map(one => `${one.group}: ${one.label}`);
    expect(groups).toEqual([
      'число — складывается: кубики',
      'число — складывается: прибавка',
      'число — складывается: порог',
      'слово из «Правил» — одно на бросок: слово из «Правил»',
      'ещё: метка броску',
    ]);
    expect(fieldOf(view.container, 'Что правим').textContent).toContain('Складывается: каждый висящий эффект и каждая его копия');
  });

  it('у слова подсказка — «один раз», поле зовётся «Какое слово»', () => {
    const mods = [{ kind: 'edit', call: 'roll', param: 'edits', edit: 'фора' }] as Modifier[];
    const view = renderOpen(<ModifiersEditor system={system} modifiers={mods} onEdit={vi.fn()} />);
    expect(fieldOf(view.container, 'Что правим').textContent).toContain('«Фора» действует на бросок один раз');
    expect(fieldOf(view.container, 'Какое слово')).toBeTruthy();
  });

  it('слово, которое считается по разу от каждого эффекта, так и подписано, и названо, с чем гасится', () => {
    const stacking = {
      tables: {}, effects: {},
      roll_edits: {
        кураж: { label: 'Кураж', stacks: true, cancels: ['уныние'], ops: [{ op: 'addDie' }] },
        уныние: { label: 'Уныние', stacks: true, ops: [{ op: 'removeDie' }] },
      },
    } as unknown as System;
    const mods = [{ kind: 'edit', call: 'roll', param: 'edits', edit: 'кураж' }] as Modifier[];
    const view = renderOpen(<ModifiersEditor system={stacking} modifiers={mods} onEdit={vi.fn()} />);
    const hint = fieldOf(view.container, 'Что правим').textContent ?? '';
    expect(hint).toContain('«Кураж» считается по разу от каждого разного эффекта; копии одного эффекта — один раз');
    expect(hint).toContain('Встретится с «Уныние» — погасят друг друга по одному');
    const combo = fieldOf(view.container, 'Что правим').querySelector<HTMLElement>('[role="combobox"]')!;
    expect(comboOptions(combo).find(one => one.value === 'edits')?.group).toBe('слово из «Правил» — считается, как задано там');
  });

  it('«Какое слово» у правки на «Проверку» (набор успехов): сначала подходящие, «Кость выше» — в «не подходят этим броскам»', () => {
    const pools = {
      constants: { pool: { label: 'набор к6', kind: 'die', dice: [{ sides: 6, count: 1 }], read: { kind: 'count', atLeast: 5 } } },
      tables: { лист: { shape: 'single', columns: [{ key: 'ловкость', label: 'Ловкость', kind: 'number' }] } },
      rolls: { проверка: { label: 'Проверка', die: 'pool', number: 'count', fields: [{ table: 'лист', column: 'ловкость' }] } },
      roll_edits: { step_up: { label: 'Кость выше', ops: [{ op: 'dieStep', by: 1 }] }, lucky: { label: 'Переброс', ops: [{ op: 'reroll', n: 1 }] } },
      effects: {},
    } as unknown as System;
    const mods = [{ kind: 'edit', call: 'roll', param: 'edits', edit: 'lucky', tags: ['проверка'] }] as Modifier[];
    const view = renderOpen(<ModifiersEditor system={pools} modifiers={mods} onEdit={vi.fn()} />);
    const combo = fieldOf(view.container, 'Какое слово').querySelector<HTMLElement>('[role="combobox"]')!;
    const lines = comboOptions(combo).filter(one => one.value).map(one => `${one.group}: ${one.label}`);
    expect(lines).toEqual(['подходят этим броскам: Переброс', 'не подходят этим броскам: Кость выше']);
  });

  it('у правила броска — «Правят эти броски»: по его метке и на любые броски', () => {
    const pools = {
      constants: { pool: { label: 'набор к6', kind: 'die', dice: [{ sides: 6, count: 1 }], read: { kind: 'count', atLeast: 5 } } },
      tables: { лист: { shape: 'single', columns: [{ key: 'ловкость', label: 'Ловкость', kind: 'number' }] } },
      rolls: { проверка: { label: 'Проверка', die: 'pool', number: 'count', fields: [{ table: 'лист', column: 'ловкость' }] } },
      effects: {
        sustain: { label: 'Поддержание', activation: 'passive', modifiers: [{ kind: 'edit', call: 'roll', param: 'count', op: 'add', value: { expr: '-2' }, tags: ['проверка'], if: { expr: '@бросающий == @носитель' } }] },
        luck: { label: 'Удача', activation: 'passive', modifiers: [{ kind: 'edit', call: 'roll', param: 'bonus', op: 'add', value: { expr: '1' }, if: { expr: '@бросающий == @носитель' } }] },
        other: { label: 'Чужое', activation: 'passive', modifiers: [{ kind: 'edit', call: 'roll', param: 'bonus', op: 'add', value: { expr: '1' }, tags: ['атака'] }] },
        skip: { label: 'Мимо', activation: 'passive', modifiers: [{ kind: 'edit', call: 'roll', param: 'bonus', op: 'add', value: { expr: '1' }, notTags: ['проверка'] }] },
      },
    } as unknown as System;
    const view = render(<RollsSection system={pools} editSystem={vi.fn()} />);
    const row = [...view.container.querySelectorAll<HTMLElement>('.dict-row')].find(one => one.textContent?.startsWith('Правят эти броски'))!;
    expect(row.textContent).toContain('«Поддержание» — кубики − 2');
    expect(row.textContent).toContain('на любые броски: «Удача»');
    expect(row.textContent).not.toContain('Чужое');
    expect(row.textContent).not.toContain('Мимо');
  });

  it('в словаре выбор говорит «одно на бросок» и «по разу от каждого разного эффекта», подсказка — про копии', () => {
    const view = render(<RollEditsSection system={system} editSystem={vi.fn()} usage={new Map()} />);
    const combo = [...view.container.querySelectorAll<HTMLElement>('[role="combobox"]')]
      .find(one => comboOptions(one).some(item => item.label === 'по разу от каждого разного эффекта'))!;
    expect(comboOptions(combo).map(one => one.label)).toEqual(['одно на бросок', 'по разу от каждого разного эффекта']);
    expect(combo.closest('[title]')?.getAttribute('title') ?? combo.getAttribute('title')).toContain('копии одного и того же эффекта считаются одним');
  });

  it('у слова без выбора в «Какие броски» стоит «все броски»', () => {
    const view = render(<RollEditsSection system={system} editSystem={vi.fn()} usage={new Map()} />);
    const combo = fieldOf(view.container, 'Какие броски').querySelector<HTMLInputElement>('[role="combobox"]')!;
    expect(combo.placeholder || combo.textContent).toBe('все броски');
  });

  it('выбор метки пишет tags слова, снятие последней метки убирает ключ', () => {
    const pools = {
      constants: { pool: { label: 'набор к6', kind: 'die', dice: [{ sides: 6, count: 1 }], read: { kind: 'count', atLeast: 5 } } },
      tables: { лист: { shape: 'single', columns: [{ key: 'ловкость', label: 'Ловкость', kind: 'number' }] } },
      rolls: { проверка: { label: 'Проверка', die: 'pool', number: 'count', fields: [{ table: 'лист', column: 'ловкость' }] } },
      roll_edits: { фора: { label: 'Фора', ops: [{ op: 'addDie' }] } },
      effects: {},
    } as unknown as System;
    let current = pools;
    const Host = () => {
      const [sys, setSys] = useState(pools);
      current = sys;
      return <RollEditsSection system={sys} usage={new Map()} editSystem={change => setSys(prev => {
        const next = JSON.parse(JSON.stringify(prev)) as System;
        change(next);
        return next;
      })} />;
    };
    const view = render(<Host />);
    const combo = () => fieldOf(view.container, 'Какие броски').querySelector<HTMLElement>('[role="combobox"]')!;
    pickCombo(combo(), 'проверка', 'Какие броски');
    expect(current.roll_edits!.фора!.tags).toEqual(['проверка']);
    const remove = fieldOf(view.container, 'Какие броски').querySelector<HTMLElement>('.chip__x')!;
    fireEvent.click(remove);
    expect(current.roll_edits!.фора).not.toHaveProperty('tags');
  });

  it('у «Бой большим оружием» в D&D выбраны «урон», «оружие», «ближний»', () => {
    const dnd = SAMPLE_WORLDS.find(world => world.system.roll_edits?.great_weapon)!.system as System;
    const view = render(<RollEditsSection system={dnd} editSystem={vi.fn()} usage={new Map()} />);
    const row = [...view.container.querySelectorAll<HTMLElement>('.roll-word')]
      .find(one => (one.querySelector('input') as HTMLInputElement | null)?.value === 'Бой большим оружием')!;
    const text = fieldOf(row, 'Какие броски').textContent ?? '';
    for (const word of ['урон', 'оружие', 'ближний']) expect(text).toContain(word);
  });
});
