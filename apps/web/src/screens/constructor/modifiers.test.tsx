import { renderOpen } from '../../testing/render-open.tsx';
import { comboOptions, pickCombo } from '../../testing/cards.ts';
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ModifiersEditor } from './modifiers.tsx';
import { modifierSentence } from './modifier-words.ts';
import { SAMPLE_WORLDS } from '@vtt/engine/model/systems';
import type { System, Modifier } from '@vtt/schema';

const system = {
  tables: { лист: { shape: 'single', columns: [{ key: 'ac', label: 'Класс брони', kind: 'number', default: 10 }] }, rolls: { label: 'Броски', key: 'word', rows: [{ value: 'атака' }, { value: 'спасбросок' }] } },
  roll_edits: { фора: { label: 'Фора', ops: [{ op: 'addDie' }] } },
  effects: {},
} as unknown as System;

const rollMod = [{ kind: 'edit', call: 'roll', param: 'edits', tags: ['атака'], edit: 'фора' }] as Modifier[];

const optionsOf = (combo: HTMLElement) => comboOptions(combo).map(o => o.label);

describe('редактор модификаторов', () => {
  it('кого касается — бросает носитель или бросают против него, а какой именно бросок — метки из строк таблиц', () => {
    renderOpen(<ModifiersEditor system={system} modifiers={rollMod} onEdit={vi.fn()} />);
    expect(screen.getByDisplayValue('Бросок').dataset.value).toBe('roll');
    const whose = screen.getByDisplayValue('всех — без условия');
    expect(optionsOf(whose)).toEqual(['всех — без условия', 'бросает носитель', 'бросают против носителя']);
    expect(screen.getByText('атака', { selector: 'span' })).toBeTruthy();
    const more = screen.getAllByPlaceholderText('+ ещё…')[0]!;
    expect(comboOptions(more).map(o => o.label)).toContain('спасбросок');
    expect(comboOptions(more)[0]?.group).toBe('метки бросков · Броски');
  });

  it('«Кого касается» пишет условие про носителя в if, а записанное условие показывает выбранным', () => {
    const mods = structuredClone(rollMod) as Modifier[];
    const onEdit = vi.fn((change: (d: Modifier[]) => void) => change(mods));
    const { unmount } = renderOpen(<ModifiersEditor system={system} modifiers={mods} onEdit={onEdit} />);
    pickCombo(screen.getByDisplayValue('всех — без условия'), '@против == @носитель');
    expect((mods[0] as { if?: unknown }).if).toEqual({ expr: '@против == @носитель' });
    unmount();

    renderOpen(<ModifiersEditor system={system} modifiers={mods} onEdit={vi.fn()} />);
    expect(screen.getByDisplayValue('бросают против носителя').dataset.value).toBe('@против == @носитель');
  });

  it('условие поверх «Кого касается» хранится как все(…) и очищается вместе с выбором', () => {
    const mods = [{ ...rollMod[0], if: { expr: '@бросающий == @носитель и @носитель.ac > 1' } }] as unknown as Modifier[];
    const onEdit = vi.fn((change: (d: Modifier[]) => void) => change(mods));
    renderOpen(<ModifiersEditor system={system} modifiers={mods} onEdit={onEdit} />);
    const whose = screen.getByDisplayValue('бросает носитель');
    pickCombo(whose, '');
    expect((mods[0] as { if?: { expr: string } }).if).toEqual({ expr: '@носитель.ac > 1' });
  });

  it('«Кроме меток» у правки броска: показывает записанное, выбор пишет notTags, пустой — снимает ключ', () => {
    const mods = [{ kind: 'edit', call: 'roll', param: 'count', op: 'add', value: { expr: '-2' }, notTags: ['атака'] }] as Modifier[];
    const onEdit = vi.fn((change: (d: Modifier[]) => void) => change(mods));
    renderOpen(<ModifiersEditor system={system} modifiers={mods} onEdit={onEdit} />);
    const field = [...document.querySelectorAll('.field__label')].find(el => el.textContent === 'Кроме меток')!.closest('label')!;
    expect(field.textContent).toContain('атака');
    pickCombo(field.querySelector<HTMLElement>('.combo--add [role="combobox"]')!, 'спасбросок');
    expect((mods[0] as { notTags?: string[] }).notTags).toEqual(['атака', 'спасбросок']);
  });

  it('строка правки броска называет кубики и порог числом и говорит «кроме меток»', () => {
    const count = { kind: 'edit', call: 'roll', param: 'count', op: 'add', value: { expr: '-2' }, notTags: ['атака'], if: { expr: '@бросающий == @носитель' } } as Modifier;
    expect(modifierSentence(system, count)).toBe('Бросок кроме «атака», бросает носитель: кубики − 2');
    expect(modifierSentence(system, { kind: 'edit', call: 'roll', param: 'threshold', op: 'add', value: { expr: '1' } } as Modifier)).toContain('порог + 1');
  });

  it('правки предлагаются из словаря автора, а не из зашитого списка', () => {
    renderOpen(<ModifiersEditor system={system} modifiers={rollMod} onEdit={vi.fn()} />);
    const edit = screen.getByDisplayValue('Фора');
    expect(optionsOf(edit)).toEqual(['— выберите слово —', 'Фора']);
    expect(optionsOf(edit)).not.toContain('Преимущество');
  });

  it('правка входа эффекта: что правим — его величина, метки — «любая из»', () => {
    const withDamage = {
      ...system,
      tables: { ...system.tables, типы: { label: 'Типы', key: 'word', rows: [{ value: 'огонь' }, { value: 'холод' }] } },
      effects: { урон: { label: 'Урон', activation: 'manual', params: [{ key: 'сколько', label: 'Сколько', kind: 'number', role: 'amount' }, { key: 'тип', label: 'Тип', kind: 'choice', from: 'типы' }], steps: [] } },
    } as unknown as System;
    const mods = [{ kind: 'edit', call: 'урон', param: 'сколько', op: 'mul', value: { expr: '0.5' }, anyTags: ['огонь'] }] as Modifier[];
    renderOpen(<ModifiersEditor system={withDamage} modifiers={mods} onEdit={vi.fn()} />);
    expect(screen.getByDisplayValue('Урон')).toBeTruthy();
    expect(screen.getByText('Сколько')).toBeTruthy();
    expect(screen.getAllByText('огонь').length).toBeGreaterThan(0);
    expect(screen.queryByText('Чей бросок')).toBeNull();
  });
});

describe('заглушка говорит словами владельца', () => {
  it('род — про род, а не про эффект', () => {
    renderOpen(<ModifiersEditor
      system={system} modifiers={[]} onEdit={() => {}}
      empty={{ title: 'Род пока ничего не правит', hint: 'проверочная' }}
    />);
    expect(screen.getByText('Род пока ничего не правит')).toBeTruthy();
    expect(screen.queryByText('Эффект пока ничего не делает')).toBeNull();
  });

  it('без своих слов — прежние, эффектные', () => {
    renderOpen(<ModifiersEditor system={system} modifiers={[]} onEdit={() => {}} />);
    expect(screen.getByText('Эффект пока ничего не делает')).toBeTruthy();
  });

  it('пусто — одна бледная строка, а не коробка; пояснение прячется в подсказку', () => {
    render(<ModifiersEditor
      system={system} modifiers={[]} onEdit={() => {}}
      empty={{ title: 'Род пока ничего не правит', hint: 'проверочная' }}
    />);
    const line = screen.getByText('Род пока ничего не правит');
    expect(line.className).toBe('faint');
    expect(line.getAttribute('title')).toBe('проверочная');
    expect(screen.queryByText('проверочная')).toBeNull();
    expect(document.querySelector('.empty')).toBeNull();
  });
});

describe('строка правки — «пока»', () => {
  const mods = [...rollMod, { kind: 'value', target: 'ac', op: 'add', value: { expr: '1' } }] as Modifier[];

  it('у типа и записи строка начинается с фразы: ни слова «пока», ни метки «вызов» / «поле»', () => {
    render(<ModifiersEditor system={system} modifiers={mods} onEdit={vi.fn()} />);
    const rows = [...document.querySelectorAll('.mod-row')];
    expect(rows).toHaveLength(2);
    expect(rows.every(row => row.classList.contains('mod-row--while'))).toBe(true);
    expect(document.querySelector('.mod-row__kind')).toBeNull();
    expect(document.querySelector('.mod-row__tag')).toBeNull();
    expect(rows.map(row => row.querySelector('.mod-row__phrase')!.textContent)).toEqual([
      'Бросок с метками «атака», бросает кто угодно: Фора',
      '«Класс брони» + 1',
    ]);
  });

  it('строки — одна таблица: на каждую правку своя строка с линией, без коробок', () => {
    const { container } = render(<ModifiersEditor system={system} modifiers={mods} onEdit={vi.fn()} />);
    expect(container.querySelectorAll('.mod-table')).toHaveLength(1);
    expect(container.querySelectorAll('.mod-table > .mod-item')).toHaveLength(2);
    expect(container.querySelector('.mod-table .card')).toBeNull();
  });

  it('крестик внутри строки, подтверждение сохранено', () => {
    const onEdit = vi.fn();
    render(<ModifiersEditor system={system} modifiers={mods} onEdit={onEdit} />);
    const row = document.querySelector('.mod-row') as HTMLElement;
    expect(row.lastElementChild!.textContent).toBe('×');
    fireEvent.click(screen.getAllByText('×')[0]!);
    expect(onEdit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('точно убрать'));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });
});

describe('один редактор — шесть механизмов', () => {
  it('с правом писать в систему список правок предлагает готовые механизмы, выбор заводит их в словарь', () => {
    const draft = structuredClone({ ...system, roll_edits: {} }) as unknown as System;
    const editSystem = vi.fn((change: (d: System) => void) => change(draft));
    const mods = [{ kind: 'edit', call: 'roll', param: 'edits', edit: '' }] as Modifier[];
    const onEdit = vi.fn((change: (d: Modifier[]) => void) => change(mods));
    renderOpen(<ModifiersEditor system={draft} modifiers={mods} onEdit={onEdit} editSystem={editSystem} />);

    const edit = [...document.querySelectorAll<HTMLElement>('[role="combobox"]')]
      .find(el => comboOptions(el).some(o => o.value.startsWith('recipe:')))!;
    expect(optionsOf(edit)).toContain('+ Преимущество · Переброс кости и выбор лучшего/худшего броска');
    pickCombo(edit, 'recipe:rerollBest:advantage');

    expect(draft.roll_edits?.advantage?.cancels).toEqual(['disadvantage']);
    expect(draft.roll_edits?.disadvantage).toBeTruthy();
    expect(mods[0]!.edit).toBe('advantage');
  });

  it('без права писать в систему готовых механизмов в списке нет', () => {
    renderOpen(<ModifiersEditor system={system} modifiers={rollMod} onEdit={vi.fn()} />);
    const edit = screen.getByDisplayValue('Фора');
    expect(comboOptions(edit).some(o => o.value.startsWith('recipe:'))).toBe(false);
  });

  it('у значения есть пол и потолок', () => {
    const valueMod = [{ kind: 'value', target: 'ac', op: 'add', value: { expr: '1' } }] as Modifier[];
    renderOpen(<ModifiersEditor system={system} modifiers={valueMod} onEdit={vi.fn()} />);
    const how = screen.getByDisplayValue('прибавить');
    expect(optionsOf(how)).toEqual(['прибавить', 'умножить', 'задать', 'не меньше', 'не больше']);
  });
});

describe('правка по умолчанию касается носителя, а без условия это видно', () => {
  const withDamage = {
    ...system,
    effects: { урон: { label: 'Урон', activation: 'manual', params: [
      { key: 'кто', label: 'Кто', kind: 'sheet', role: 'actor' },
      { key: 'лист', label: 'Лист', kind: 'sheet', role: 'target' },
      { key: 'сколько', label: 'Сколько', kind: 'number', role: 'amount' },
    ], steps: [] } },
  } as unknown as System;

  it('«+ правка вызова» сразу ставит «бросает носитель»', () => {
    const mods: Modifier[] = [];
    const onEdit = vi.fn((change: (d: Modifier[]) => void) => change(mods));
    renderOpen(<ModifiersEditor system={system} modifiers={mods} onEdit={onEdit} />);
    fireEvent.click(screen.getByText('+ правка вызова'));
    expect((mods[0] as { if?: unknown }).if).toEqual({ expr: '@бросающий == @носитель' });
  });

  it('смена вызова ставит условие про носителя этого вызова — вход-цель, а не первый лист', () => {
    const mods = [{ kind: 'edit', call: 'roll', param: 'edits', edit: 'фора', if: { expr: '@бросающий == @носитель' } }] as unknown as Modifier[];
    const onEdit = vi.fn((change: (d: Modifier[]) => void) => change(mods));
    renderOpen(<ModifiersEditor system={withDamage} modifiers={mods} onEdit={onEdit} />);
    pickCombo(screen.getByDisplayValue('Бросок'), 'урон');
    expect(mods[0]).toMatchObject({ call: 'урон', param: 'сколько', if: { expr: '@лист == @носитель' } });
  });

  it('строка без условия — «бросает кто угодно» и «на всех листах»; условие не про носителя — тоже', () => {
    expect(modifierSentence(system, rollMod[0]!)).toBe('Бросок с метками «атака», бросает кто угодно: Фора');
    expect(modifierSentence(system, { ...rollMod[0]!, if: { expr: '@бросающий == @носитель' } } as Modifier)).toBe('Бросок с метками «атака», бросает носитель: Фора');
    expect(modifierSentence(system, { ...rollMod[0]!, if: { expr: '@носитель.ac > 1' } } as Modifier)).toContain('бросает кто угодно, если');
    expect(modifierSentence(system, { ...rollMod[0]!, if: { expr: '@бросающий == @носитель и @носитель.ac > 1' } } as Modifier)).not.toContain('кто угодно');
    expect(modifierSentence(system, { ...rollMod[0]!, if: { expr: '1 > 0' } } as Modifier)).toContain('бросает кто угодно, если');
    const damage = { kind: 'edit', call: 'урон', param: 'сколько', op: 'mul', value: { expr: '0.5' } } as unknown as Modifier;
    expect(modifierSentence(withDamage, damage)).toContain('«Урон» · Сколько, на всех листах:');
    expect(modifierSentence(withDamage, { ...damage, if: { expr: '@лист == @носитель' } } as Modifier)).toContain('«Урон» · Сколько, «Лист» — носитель:');
  });
});

describe('правка типа говорит подписями колонок, а не ключами', () => {
  const gear = {
    ...system,
    tables: {
      ...system.tables,
      лист: { shape: 'single', columns: [{ key: 'ac', label: 'Класс брони', kind: 'number', default: 10 }, { key: 'ac_base', label: 'База доспеха', kind: 'number', default: 0 }] },
      gear: { shape: 'book', use: 'item', label: 'Снаряжение', columns: [{ key: 'heaviness', label: 'Тяжесть', kind: 'text' }] },
      armor: {
        shape: 'book', use: 'item', label: 'Доспех', extends: 'gear',
        columns: [{ key: 'ac', label: 'База класса брони', kind: 'number' }, { key: 'stealth', label: 'Помеха на Скрытность', kind: 'boolean' }],
      },
    },
  } as unknown as System;
  const set = (expr: string) => ({ kind: 'value', target: 'ac_base', op: 'set', value: { expr } }) as Modifier;

  it('колонка с тем же ключом, что у поля листа, зовётся своей подписью, а не «Класс брони (строка)»', () => {
    expect(modifierSentence(gear, set('@строка.ac'), 'armor')).toBe('«База доспеха» = «База класса брони»');
    expect(modifierSentence(gear, set('@строка.ac'))).not.toContain('(строка)');
  });

  it('колонка основы называется по подписи основы', () => {
    expect(modifierSentence(gear, set('@строка.heaviness'), 'armor')).toBe('«База доспеха» = «Тяжесть»');
  });

  it('условие правки поля и условие правки вызова читаются так же', () => {
    const guarded = { ...set('1'), if: { expr: '@строка.stealth == да' } } as Modifier;
    expect(modifierSentence(gear, guarded, 'armor')).toBe('«База доспеха» = 1 — если «Помеха на Скрытность» = да');
    const roll = { kind: 'edit', call: 'roll', param: 'edits', tags: ['скрытность'], edit: 'фора', if: { expr: '@бросающий == @носитель и @строка.stealth == да' } } as unknown as Modifier;
    expect(modifierSentence(gear, roll, 'armor')).toContain('если «бросающий» = «носитель» и «Помеха на Скрытность» = да');
  });

  it('образцы всех систем: в словах правок типов и листов нет ни «строка.», ни «(строка)»', () => {
    const found: string[] = [];
    let total = 0;
    for (const { system: sample } of SAMPLE_WORLDS) {
      const sentences = [
        ...Object.entries(sample.tables ?? {}).flatMap(([id, table]) => ((table as { modifiers?: Modifier[] }).modifiers ?? []).map(modifier => modifierSentence(sample, modifier, id))),
        ...Object.values(sample.sheets ?? {}).flatMap(kind => (kind.modifiers ?? []).map(modifier => modifierSentence(sample, modifier))),
      ];
      total += sentences.length;
      for (const sentence of sentences) if (/строка|undefined/.test(sentence)) found.push(`${sample.name}: ${sentence}`);
    }
    expect(total).toBeGreaterThan(8);
    expect(found).toEqual([]);
  });

  it('D&D «Доспех»: четыре правки читаются подписями колонок', () => {
    const dnd = SAMPLE_WORLDS.find(one => one.system.name === 'D&D 5e')!.system;
    const armor = (dnd.tables!.armor as { modifiers: Modifier[] }).modifiers;
    expect(armor.map(modifier => modifierSentence(dnd, modifier, 'armor'))).toEqual([
      '«База доспеха» = «База класса брони»',
      '«Тяжесть доспеха» = «Тяжесть»',
      '«Скорость, футов» − 10 — если «Сила» < («Нужна Сила» или 0) и «Раса → Тяжёлый доспех не замедляет» ≠ да',
      'Бросок с метками «скрытность», если «бросающий» = «носитель» и «Помеха на Скрытность» = да: Помеха',
    ]);
  });

  it('раскрытая правка типа показывает те же подписи', () => {
    renderOpen(<ModifiersEditor system={gear} table="armor" modifiers={[set('@строка.ac')]} onEdit={vi.fn()} />);
    expect(document.body.textContent).toContain('База класса брони');
    expect(document.body.textContent).not.toContain('строка.ac');
  });
});

describe('входы правимого вызова — словами', () => {
  const withDamage = {
    ...system,
    effects: { урон: { label: 'Урон', activation: 'manual', params: [{ key: 'amount', label: 'Сколько урона', kind: 'number', role: 'amount' }, { key: 'electric', label: 'Электричество', kind: 'boolean' }], steps: [] } },
  } as unknown as System;
  const mods = [{ kind: 'edit', call: 'урон', param: 'amount', op: 'add', value: { expr: '0 - @amount' }, if: { expr: 'не @electric и @amount <= 3' } }] as Modifier[];

  it('пересказ строки и поле условия называют входы по подписи, без ключей', () => {
    expect(modifierSentence(withDamage, mods[0]!)).toContain('Сколько урона');
    const { container } = renderOpen(<ModifiersEditor system={withDamage} modifiers={mods} onEdit={vi.fn()} />);
    expect(container.textContent).toContain('Электричество');
    expect(container.textContent).toContain('Сколько урона');
    expect(container.textContent).not.toMatch(/amount|electric/);
  });
});

describe('кнопки добавления правок', () => {
  it('у типа листа — только «+ правит поле», у остальных обе', () => {
    const { unmount } = renderOpen(<ModifiersEditor system={system} modifiers={[]} onEdit={vi.fn()} fieldsOnly />);
    expect(screen.getByText('+ правит поле')).toBeTruthy();
    expect(screen.queryByText('+ правка вызова')).toBeNull();
    unmount();
    renderOpen(<ModifiersEditor system={system} modifiers={[]} onEdit={vi.fn()} />);
    expect(screen.getByText('+ правка вызова')).toBeTruthy();
  });
});

describe('«На сколько» правки вызова знает листы-входы', () => {
  const withTarget = {
    ...system,
    effects: { урон: { label: 'Урон', activation: 'manual', params: [
      { key: 'цель', label: 'Цель', kind: 'sheet', role: 'target' },
      { key: 'сколько', label: 'Сколько', kind: 'number', role: 'amount' },
    ], steps: [] } },
  } as unknown as System;

  it('@цель.ac рисуется фишкой с названием поля, а не сырым текстом', () => {
    const mods = [{ kind: 'edit', call: 'урон', param: 'сколько', op: 'add', value: { expr: '@цель.ac' } }] as Modifier[];
    renderOpen(<ModifiersEditor system={withTarget} modifiers={mods} onEdit={vi.fn()} />);
    expect(screen.getByText('Класс брони')).toBeTruthy();
    expect(screen.queryByDisplayValue('@цель.ac')).toBeNull();
  });
});
