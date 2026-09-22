import { group, test, eq } from './harness.ts';
import { PLAYABLE_WORLDS } from '../src/model/systems.ts';
import type { System, Compendium } from '../src/model/types.ts';

type Loose = Record<string, unknown>;

const troublesOf = (system: System): string[] => {
  const lists = system.lists ?? {};
  const out: string[] = [];
  const look = (where: string, p: Loose) => {
    const ask = p.ask as Loose | undefined;
    const from = p.from as string | undefined;
    if (p.kind === 'choice' && !from) out.push(`${where}: вид «выбор», а словаря нет`);
    if (from && !lists[from]) out.push(`${where}: словаря «${from}» нет`);
    if (ask?.kind === 'choice' && !from && !(ask.options as string[] | undefined)?.length) {
      out.push(`${where}: спрашивают выбором, но вариантов нет`);
    }
    if (from && Array.isArray(ask?.options)) out.push(`${where}: список и в словаре, и в вопросе — два места правды`);
  };
  for (const [id, effect] of Object.entries(system.effects ?? {})) {
    for (const p of (effect.params ?? [])) look(`эффект «${effect.label ?? id}» · ${p.label ?? p.key}`, p as Loose);
    const tagsFrom = (effect as Loose).tagsFrom as string | undefined;
    if (tagsFrom && !lists[tagsFrom]) out.push(`эффект «${effect.label ?? id}»: словаря меток «${tagsFrom}» нет`);
  }
  for (const [rk, kind] of Object.entries(system.records ?? {})) {
    for (const p of (kind.props ?? [])) look(`тип «${kind.label ?? rk}» · ${p.label ?? p.key}`, p as Loose);
  }
  for (const field of system.fields ?? []) {
    const from = (field as Loose).optionsFrom as string | undefined;
    if (from && !lists[from]) out.push(`поле «${field.label}»: словаря «${from}» нет`);
  }
  return out;
};

const unfilledOf = (system: System, book: Compendium): string[] => {
  const out: string[] = [];
  for (const record of [...(book.items ?? []), ...(book.actions ?? [])]) {
    const kind = system.records?.[String(record.rk)];
    if (!kind) continue;
    const must = new Set<string>();
    for (const binding of (kind.bindings ?? [])) {
      const params = new Map((system.effects[binding.effect!]?.params ?? []).map(p => [p.key, p as Loose]));
      for (const [key, arg] of Object.entries(binding.args ?? {})) {
        const ref = arg as Loose & { by?: Loose };
        if (ref?.optional || params.get(key)?.optional) continue;
        if (typeof ref?.prop === 'string') must.add(ref.prop);
        if (typeof ref?.by?.prop === 'string') must.add(ref.by.prop as string);
      }
    }
    for (const prop of (kind.props ?? [])) {
      if (!must.has(prop.key)) continue;
      const value = (record.props ?? {})[prop.key];
      if (value === undefined || value === '') out.push(`«${record.label}» · ${prop.label ?? prop.key}`);
    }
  }
  return out;
};

const listValuesOf = (system: System, book: Compendium): string[] => {
  const out: string[] = [];
  for (const record of [...(book.items ?? []), ...(book.actions ?? [])]) {
    const kind = system.records?.[String(record.rk)];
    for (const prop of (kind?.props ?? [])) {
      const from = (prop as Loose).from as string | undefined;
      if (prop.kind !== 'choice' || !from) continue;
      const value = (record.props ?? {})[prop.key];
      if (value === undefined || value === '') continue;
      const known = (system.lists?.[from]?.values ?? []).map(o => String(o.value));
      if (!known.includes(String(value))) {
        out.push(`«${record.label}» · ${prop.label}: «${String(value)}» не из словаря «${from}»`);
      }
    }
  }
  return out;
};

group('словарь — одно место правды', () => {
  for (const world of PLAYABLE_WORLDS) {
    const system = world.system as System;
    const book = world.compendium as Compendium;

    test(`${world.title}: выбор всегда опирается на словарь`, () => {
      const found = troublesOf(system);
      eq(found.length, 0, found.join('\n'));
    });

    test(`${world.title}: что нужно кнопке — заполнено в книге`, () => {
      const found = unfilledOf(system, book);
      eq(found.length, 0, found.join('\n'));
    });

    test(`${world.title}: в записях стоят значения из словаря, а не свои`, () => {
      const found = listValuesOf(system, book);
      eq(found.length, 0, found.join('\n'));
    });
  }

  test('негативный контроль: проверки видят подделку', () => {
    const кривая = {
      fields: [], effects: { бой: { label: 'Бой', params: [{ key: 'тип', label: 'Тип', kind: 'choice' }] } },
      records: { меч: { label: 'Меч', props: [{ key: 'тип', label: 'Тип', kind: 'choice', from: 'нетути' }] } },
      lists: {},
    } as unknown as System;
    eq(troublesOf(кривая).length, 2, troublesOf(кривая).join(' | '));
  });
});
