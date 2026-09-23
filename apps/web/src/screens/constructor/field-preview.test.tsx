// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { FieldPreview } from './field-preview.tsx';
import type { System, Compendium, Field } from '@vtt/schema';

const стойкость: Field = {
  tag: 'огонь', label: 'Огонь', optionsFrom: 'стойкость', control: 'choice',
  value: { kind: 'stored', type: 'number', default: 1 },
} as Field;

const system = {
  fields: [стойкость], constants: {}, effects: {},
  tables: {
    стойкость: {
      label: 'Стойкость', key: 'number',
      rows: [{ value: 0.5, label: 'сопротивление' }, { value: 1, label: 'как есть' }, { value: 2, label: 'уязвимость' }],
    },
  },
} as unknown as System;

describe('предпросмотр поля в конструкторе', () => {
  afterEach(() => { cleanup(); });

  it('рисует поле так, как увидит игрок, и откликается на клик', () => {
    render(<FieldPreview field={стойкость} system={system} compendium={{ items: [], actions: [] } as unknown as Compendium} />);
    const уязвимость = screen.getByText('уязвимость');
    fireEvent.click(уязвимость);
    expect(уязвимость.closest('button')?.className).toContain('primary');
    expect(system.fields[0]!.value).toEqual({ kind: 'stored', type: 'number', default: 1 });
  });
});

describe('поле со ссылкой на таблицу без особого вида', () => {
  afterEach(() => { cleanup(); });

  it('выбирается из списка, а не вписывается', () => {
    const раса = { tag: 'раса', label: 'Раса', optionsFrom: 'расы', value: { kind: 'stored', type: 'text', default: '' } } as Field;
    const мир = {
      fields: [раса], constants: {}, effects: {},
      tables: { расы: { label: 'Расы', key: 'word', rows: [{ value: 'дварф', label: 'дварф' }, { value: 'эльф', label: 'эльф' }] } },
    } as unknown as System;
    render(<FieldPreview field={раса} system={мир} compendium={{ items: [], actions: [] } as unknown as Compendium} />);
    const список = screen.getByRole('combobox') as HTMLSelectElement;
    fireEvent.change(список, { target: { value: 'эльф' } });
    expect(список.value).toBe('эльф');
  });
});
