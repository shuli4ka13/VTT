import { describe, it, expect } from 'vitest';
import { rollsGive } from '../src/model/rolled.ts';
import type { System } from '../src/model/types.ts';

const rule = (extra: Record<string, unknown>) => ({ label: 'Р', die: 'd', number: 'sides', fields: [{ table: 'лист', column: 'a' }], ...extra });
const sys = (rolls: Record<string, unknown>) => ({ rolls }) as unknown as System;

describe('rollsGive: что дают все правила броска вместе', () => {
  it('нет правил — неизвестно', () => {
    expect(rollsGive(sys({}))).toBeNull();
  });

  it('правила ждут порог или не считают итог — ничего не даётся', () => {
    const give = rollsGive(sys({ a: rule({ success: { expr: '@rolled >= @threshold' } }), b: rule({}) }));
    expect(give).toEqual({ success: false, margin: false, degree: false });
  });

  it('порог у правила или у поля — успех и степени есть; расходятся — да', () => {
    expect(rollsGive(sys({ a: rule({ number: 'under' }), b: rule({}) }))).toMatchObject({ success: true, margin: true });
    expect(rollsGive(sys({ a: rule({ fields: [{ table: 'лист', column: 'a', threshold: 3 }] }) }))).toMatchObject({ success: true });
    expect(rollsGive(sys({ a: rule({ success: { expr: '@rolled >= 5' } }) }))).toMatchObject({ success: true, margin: false });
  });
});
