import { useState } from 'react';
import type { System } from '@vtt/schema';
import { readableFields, NO_BLOCK, blockLabel } from '@vtt/engine';
import type { Field } from '@vtt/engine';
import { byBlock } from '../screens/constructor/field-groups.ts';
import { Combo, type ComboOption } from './combo.tsx';
import { t, useT } from '../i18n/index.ts';

type Option = readonly [string, string, string];

const nameOf = (field: Field): string => (field.label && field.label !== field.tag ? field.label : t('ui:fieldPick.unnamed'));

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

export function FieldPick({ system, value, onChange, fields, extra = [], blank, label }: {
  system: System;
  value: string;
  onChange: (tag: string) => void;
  fields?: readonly Field[];
  extra?: readonly (readonly [string, string])[];
  blank?: string;
  label?: string;
}) {
  const t = useT('ui');
  const unset = blank ?? t('fieldPick.blank');
  const [opened, setOpened] = useState(false);
  const all = fieldOptions(system, fields ?? readableFields(system));
  const service = all.filter(option => option[2] === NO_BLOCK);
  const placed = all.filter(option => option[2] !== NO_BLOCK);
  const showService = opened || service.some(option => option[0] === value);
  const item = (option: Option | readonly [string, string], group?: string): ComboOption =>
    ({ value: option[0], label: option[1], ...(group ? { group } : {}) });

  const options: ComboOption[] = [
    ...(value ? [item(['', unset])] : []),
    ...placed.map(option => item(option, blockLabel(system, option[2]))),
    ...service.map(option => ({ ...item(option, blockLabel(system, option[2])), ...(showService ? {} : { hidden: true }) })),
    ...extra.map(option => item(option)),
  ];

  return (
    <Combo
      value={value}
      blank={unset}
      {...(label ? { label } : {})}
      options={options}
      more={!showService && service.length ? { label: t('fieldPick.service', { n: service.length }), run: () => setOpened(true) } : undefined}
      onChange={onChange}
    />
  );
}
