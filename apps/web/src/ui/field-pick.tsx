import { useState } from 'react';
import type { System } from '@vtt/schema';
import type { Field } from '@vtt/engine/model/types';
import { fieldsOf } from '@vtt/engine/model/sheet-columns';
import { NO_BLOCK } from '@vtt/engine/model/blocks';
import { byBlock } from '../screens/constructor/field-groups.ts';
import { Input, Select } from './primitives.tsx';

const SEARCH_FROM = 20;
const SERVICE = '\u0000service';
const UNNAMED = 'без названия';

type Option = readonly [string, string, string];

const nameOf = (field: Field): string => (field.label && field.label !== field.tag ? field.label : UNNAMED);

export function fieldOptions(system: System, fields: readonly Field[]): Option[] {
  const groupOf = (field: Field) => field.placements?.[0]?.group ?? NO_BLOCK;
  const seen = new Map<string, number>();
  for (const field of fields) {
    const key = `${groupOf(field)}\u0000${nameOf(field)}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  const home = (field: Field) => system.tables?.[field.home]?.label || field.home;
  return byBlock(system, fields.map(field => {
    const name = nameOf(field);
    const twin = (seen.get(`${groupOf(field)}\u0000${name}`) ?? 0) > 1;
    return [field.tag, twin ? `${name} · ${home(field)}` : name, groupOf(field)] as const;
  }));
}

export function FieldPick({ system, value, onChange, fields, extra = [], blank = '— какое поле —', label }: {
  system: System;
  value: string;
  onChange: (tag: string) => void;
  fields?: readonly Field[];
  extra?: readonly (readonly [string, string])[];
  blank?: string;
  label?: string;
}) {
  const [needle, setNeedle] = useState('');
  const [opened, setOpened] = useState(false);
  const all = fieldOptions(system, fields ?? fieldsOf(system));
  const service = all.filter(option => option[2] === NO_BLOCK);
  const placed = all.filter(option => option[2] !== NO_BLOCK);
  const total = all.length + extra.length;
  const searching = total > SEARCH_FROM;
  const query = needle.trim().toLowerCase();
  const fits = (text: string, tag: string) => !query || text.toLowerCase().includes(query) || tag === value;
  const showService = opened || Boolean(query) || service.some(option => option[0] === value);

  const shown: (readonly [string, string] | Option)[] = [
    ['', blank],
    ...placed.filter(option => fits(option[1], option[0])),
    ...(showService ? service.filter(option => fits(option[1], option[0])) : []),
    ...extra.filter(option => fits(option[1], option[0])),
  ];
  const hidden = !showService && service.length;
  const options = hidden
    ? [...shown, [SERVICE, `служебные поля (${service.length})…`] as const]
    : shown;

  return (
    <div className="stack stack--tight">
      {searching ? <Input value={needle} placeholder="поиск по названию" onChange={setNeedle} /> : null}
      <Select<string>
        value={value}
        {...(label ? { label } : {})}
        options={options as never}
        onChange={next => {
          if (next === SERVICE) { setOpened(true); return; }
          onChange(next);
        }}
      />
    </div>
  );
}
