import type { System, Compendium, ValueKind } from '@vtt/schema';
import { listOf } from '@vtt/engine/model/lists';
import { fieldsOf } from '@vtt/engine/model/sheet-columns';
import { recordsOf } from '@vtt/engine/model/owned';
import { Input, NumInput, Select } from './primitives.tsx';
import { MultiChoice } from './multi-choice.tsx';
import { DiceProp } from './dice-prop.tsx';
import { FormulaField } from './formula-field.tsx';

export interface ValueType {
  kind?: ValueKind;
  from?: string;
  many?: boolean;
}

export function ValueEditor({ type, value, system, compendium, onlyWorn, except, onChange }: {
  type: ValueType;
  value: unknown;
  system: System;
  compendium?: Compendium;

  onlyWorn?: boolean;

  except?: string;
  onChange: (value: unknown) => void;
}) {
  const kind = type.kind ?? 'text';
  if (kind === 'number') return <NumInput value={Number(value ?? 0)} onCommit={onChange} />;
  if (kind === 'boolean') {
    return (
      <Select
        value={value === true ? 'да' : 'нет'}
        options={[['да', 'да'], ['нет', 'нет']] as const}
        onChange={next => onChange(next === 'да')}
      />
    );
  }
  if (kind === 'dice') return <DiceProp value={String(value ?? '')} onChange={onChange} />;
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
  if (kind === 'tag') {
    return (
      <Select
        value={String(value ?? '')}
        options={[['', '— какое поле —'], ...fieldsOf(system).map(f => [f.tag, f.label] as const)] as never}
        onChange={next => onChange(next)}
      />
    );
  }
  if (kind === 'choice') {
    const options = listOf(system, type.from) ?? [];
    if (type.many) return <MultiChoice value={value} options={options} onChange={onChange} />;
    return (
      <Select
        value={String(value ?? '')}
        options={[['', options.length ? '— выберите —' : '— таблица не выбрана —'],
          ...options.map(o => [String(o.value), o.label] as const)] as never}
        onChange={next => onChange(options.find(o => String(o.value) === next)?.value ?? next)}
      />
    );
  }
  if (kind === 'expr') {
    return <FormulaField value={String(value ?? '')} system={system} where="формула свойства" placeholder="формула" onCommit={onChange} />;
  }
  return <Input placeholder="слово" value={String(value ?? '')} onChange={onChange} />;
}
