import { tagTablesOf } from '../src/model/lists.ts';
import { group, test, eq, ok } from './harness.ts';
import { PLAYABLE_WORLDS } from '../src/model/systems.ts';
import { listUsers } from '../src/model/lists.ts';
import { danglingRows } from '../src/model/integrity.ts';
import type { System, Compendium } from '../src/model/types.ts';

type Loose = Record<string, unknown>;

const troublesOf = (system: System): string[] => {
  const lists = system.tables ?? {};
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
    for (const tagsFrom of tagTablesOf(effect)) {
      if (!lists[tagsFrom]) out.push(`эффект «${effect.label ?? id}»: словаря меток «${tagsFrom}» нет`);
    }
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

const listValuesOf = (system: System, book: Compendium): string[] =>
  danglingRows(system, book).map(d => d.text);

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
      tables: {},
    } as unknown as System;
    eq(troublesOf(кривая).length, 2, troublesOf(кривая).join(' | '));
  });
});

group('словарь знает, кто им пользуется', () => {
  const dnd = PLAYABLE_WORLDS[0]!.system as System;

  test('словарь, который берёт свойство записи, не считается ничейным', () => {
    const кто = listUsers(dnd, 'wield');
    ok(кто.length > 0, 'у «Способа атаки» должны быть потребители');
    ok(кто.some(с => с.includes('Оружие')), кто.join(' | '));
  });

  test('видны и метки эффекта, и потребности, и свойства', () => {
    const кто = listUsers(dnd, 'damage_types');
    ok(кто.some(с => с.includes('Урон')), `метки эффекта: ${кто.join(' | ')}`);
    ok(кто.some(с => с.includes('Тип урона')), `потребности и свойства: ${кто.join(' | ')}`);
  });

  test('ничейный словарь так и остаётся ничейным', () => {
    eq(listUsers(dnd, 'нет_такого').length, 0);
  });
});
