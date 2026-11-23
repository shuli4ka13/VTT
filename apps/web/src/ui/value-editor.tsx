import type { System, Compendium, ValueKind } from '@vtt/schema';
import { listOf, rowTables, recordsOf } from '@vtt/engine';
import { Input, Select } from './primitives.tsx';
import { MultiChoice } from './multi-choice.tsx';
import { DiceProp } from './dice-prop.tsx';
import { FormulaField } from './formula-field.tsx';
import { FieldPick } from './field-pick.tsx';

export interface ValueType {
  kind?: ValueKind;
  from?: string;
  many?: boolean;
}

export function ValueEditor({ type, value, system, compendium, onlyWorn, except, blank, onChange }: {
  type: ValueType;

  blank?: string;
  value: unknown;
  system: System;
  compendium?: Compendium;

  onlyWorn?: boolean;

  except?: string;
  onChange: (value: unknown) => void;
}) {
  const kind = type.kind ?? 'text';
  if (kind === 'number') {
    const formula = value && typeof value === 'object' && 'expr' in (value as object) ? String((value as { expr: unknown }).expr) : null;
    return (
      <FormulaField
        value={formula ?? (value === undefined || value === null ? '' : String(value))}
        system={system}
        where="клетка"
        placeholder="число или формула"
        onCommit={text => {
          const clean = text.trim();
          if (!clean) { onChange(undefined); return; }
          onChange(/^-?\d+(\.\d+)?$/.test(clean) ? Number(clean) : { expr: clean });
        }}
      />
    );
  }
  if (kind === 'boolean') {
    const empty = value === undefined || value === null || value === '';
    return (
      <Select
        value={blank && empty ? '' : value === true ? 'да' : 'нет'}
        options={[...(blank ? [['', blank] as const] : []), ['да', 'да'] as const, ['нет', 'нет'] as const] as never}
        onChange={next => onChange(next === '' ? '' : next === 'да')}
      />
    );
  }
  if (kind === 'dice') return <DiceProp value={String(value ?? '')} onChange={onChange} />;
  if (kind === 'effect' && type.many) {
    const effects = Object.entries(system.effects ?? {})
      .filter(([, e]) => !onlyWorn || (e.activation ?? 'manual') === 'passive')
      .map(([key, e]) => ({ value: key, label: e.label || key }));
    return <MultiChoice value={value} options={effects} onChange={onChange} />;
  }
  if (kind === 'effect') {
    return (
      <Select
        value={String(value ?? '')}
        options={[['', '— какой эффект —'],
          ...Object.entries(system.effects ?? {})
            .filter(([, e]) => !onlyWorn || (e.activation ?? 'manual') === 'passive')
            .map(([key, e]) => [key, e.label || key] as const)] as never}
        onChange={next => onChange(next)}
      />
    );
  }
  if (kind === 'record') {
    return (
      <Select
        value={String(value ?? '')}
        options={[['', '— какая запись —'],
          ...recordsOf(compendium)
            .filter(other => other.id !== except)
            .map(other => [other.id, other.label ?? other.id] as const)] as never}
        onChange={next => onChange(next)}
      />
    );
  }
  if (kind === 'table') {
    return (
      <Select
        value={String(value ?? '')}
        options={[['', '— какая таблица —'], ...rowTables(system).map(([key, table]) => [key, table.label || key] as const)] as never}
        onChange={next => onChange(next)}
      />
    );
  }
  if (kind === 'column') {
    const target = type.from ? system.tables?.[type.from] : undefined;
    return (
      <Select
        value={String(value ?? '')}
        options={[['', target ? '— какая колонка —' : '— таблица не выбрана —'],
          ...(target?.columns ?? []).map(c => [c.key, c.label || c.key] as const)] as never}
        onChange={next => onChange(next)}
      />
    );
  }
  if (kind === 'field') {
    return (
      <FieldPick system={system} value={String(value ?? '')} onChange={onChange} />
    );
  }
  if (kind === 'choice') {
    const options = listOf(system, type.from) ?? [];
    if (type.many) return <MultiChoice value={value} options={options} onChange={onChange} />;
    return (
      <Select
        value={String(value ?? '')}
        options={[['', blank ?? (options.length ? '— выберите —' : '— таблица не выбрана —')],
          ...options.map(o => [String(o.value), o.label] as const)] as never}
        onChange={next => onChange(options.find(o => String(o.value) === next)?.value ?? next)}
      />
    );
  }
  return <Input placeholder="слово" value={String(value ?? '')} onChange={onChange} />;
}
