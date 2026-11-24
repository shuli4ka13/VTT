import { describe, it, expect } from 'vitest';
import { world as W } from '@vtt/schema';
import { withColumn, lintSystem } from '@vtt/engine';
import type { LaunchKind } from '@vtt/engine';
import { SAMPLE_SYSTEMS } from '@vtt/engine/samples';
import { emptySystem } from '../../store/world.ts';
import {
  newEffect, newColumn, newRecordKind, newBinding, newProp, newDie, newRollEdit, newTable, newCost, namedStep,
  BRICKS, SEEN_BRICKS, giveContractReturns,
} from './factory.ts';
import { newGroup } from './groups.ts';
import { useLocale } from '../../store/locale.ts';
import type { System } from '@vtt/schema';

const BASES: [string, () => System][] = [
  ['пустая система', emptySystem],
  ...SAMPLE_SYSTEMS.map((s): [string, () => System] => [String(s.name ?? s.id), () => structuredClone(s) as System]),
];

const issuesOf = (system: System): string[] => {
  const parsed = W.system.safeParse(system);
  return parsed.success ? [] : parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
};

const KINDS: LaunchKind[] = ['manual', 'auto', 'passive'];

for (const [name, base] of BASES) {
  describe(`фабрики конструктора поверх «${name}»`, () => {
    it('основа сама проходит схему', () => {
      expect(issuesOf(base())).toEqual([]);
    });

    for (const kind of KINDS) {
      const check = () => {
        const system = base();
        const made = newEffect(system, kind);
        system.effects[made.key] = made.value;
        expect(issuesOf(system)).toEqual([]);
      };
      it(`новый эффект «${kind}» проходит схему`, check);
    }

    it('новый вид «auto» — висит с одной подпиской на любое действие', () => {
      const system = base();
      const made = newEffect(system, 'auto');
      expect(made.value.activation).toBe('passive');
      expect(made.value.on).toEqual([{ on: 'before:*', steps: [] }]);
    });

    it('новое поле проходит схему', () => {
      const system = base();
      system.tables = withColumn(system, newColumn(system).value).tables;
      expect(issuesOf(system)).toEqual([]);
    });

    it('новая колонка без блока', () => {
      expect(newColumn(base()).value).not.toHaveProperty('block');
    });

    it('новый тип записи со свойством проходит схему', () => {
      const system = base();
      const made = newRecordKind(system);
      made.value.columns = [newProp(made.value, system)];
      (system.tables ??= {})[made.key] = made.value;
      expect(issuesOf(system)).toEqual([]);
    });

    it('новая привязка проходит схему', () => {
      const system = base();
      const effect = newEffect(system, 'manual');
      system.effects[effect.key] = effect.value;
      const made = newRecordKind(system);
      made.value.bindings = [newBinding()];
      (system.tables ??= {})[made.key] = made.value;
      expect(issuesOf(system)).toEqual([]);
    });

    it('записи словарей проходят схему', () => {
      const system = base();
      const die = newDie(system); (system.constants ??= {})[die.key] = die.value;
      const edit = newRollEdit(system); (system.roll_edits ??= {})[edit.key] = edit.value;
      const table = newTable(system); (system.tables ??= {})[table.key] = table.value;
      expect(issuesOf(system)).toEqual([]);
    });

    it('каждый шаг палитры проходит схему', () => {
      for (const brick of BRICKS) {
        const system = base();
        const effect = newEffect(system, 'manual');
        effect.value.steps = brick.make(system, []);
        system.effects[effect.key] = effect.value;
        expect(issuesOf(system), brick.key).toEqual([]);
      }
    });
  });
}

describe('новый эффект подходит под договор метки образца', () => {
  it('D&D «Атака»: эффект, собранный заготовками конструктора, не получает замечаний договора', () => {
    const dnd = structuredClone(SAMPLE_SYSTEMS.find(one => one.name === 'D&D 5e')!) as System;
    const made = newEffect(dnd, 'manual');
    const effect = made.value;
    const brick = (key: string) => BRICKS.find(one => one.key === key)!;
    const taken = (): string[] => (effect.steps ?? []).map(step => step.id).filter((id): id is string => Boolean(id));
    effect.steps = [...brick('each').make(dnd, taken(), effect, [])];
    effect.steps.push(...brick('roll').make(dnd, taken(), effect, []));
    effect.tags = ['ataka'];
    giveContractReturns(dnd, effect);
    dnd.effects[made.key] = effect;
    const told = lintSystem(dnd).filter(problem => problem.where.tab === 'effects' && problem.where.effect === made.key).map(problem => problem.text);
    expect(told.filter(text => text.startsWith('метка «Атака» требует'))).toEqual([]);
    expect(lintSystem(dnd).filter(problem => problem.where.tab === 'effects' && problem.where.effect === made.key && (problem.where as { part?: string }).part === 'returns')).toEqual([]);
  });
});


describe('подписи новых вещей идут за основным языком системы, а не за языком интерфейса', () => {
  const made = (system: System): unknown => {
    const effect = newEffect(system, 'manual');
    const steps = [...BRICKS, ...SEEN_BRICKS].map(brick => {
      const holder = newEffect(system, 'manual').value;
      const steps = brick.make(structuredClone(system), [], holder, []);
      return { key: brick.key, steps, params: holder.params };
    });
    const kind = newRecordKind(system);
    return {
      effects: KINDS.map(launch => newEffect(system, launch)),
      column: newColumn(system), kind, prop: newProp(kind.value, system),
      dice: (['one', 'sum', 'hits', 'best', 'percent', 'parts'] as const).map(shape => newDie(system, shape)),
      edit: newRollEdit(system), table: newTable(system), cost: newCost(system), block: newGroup(system),
      steps, named: (['roll', 'check', 'table', 'ask', 'number'] as const).map(step => namedStep(system, [], step)),
      effect,
    };
  };

  const under = (lang: 'ru' | 'en', system: System): unknown => {
    useLocale.getState().setLang(lang);
    try { return structuredClone(made(structuredClone(system))); } finally { useLocale.getState().setLang('ru'); }
  };

  const dnd = (): System => structuredClone(SAMPLE_SYSTEMS.find(one => one.name === 'D&D 5e')!) as System;

  it('русская система: при русском и английском интерфейсе фабрики дают одно и то же', () => {
    expect(under('en', dnd())).toEqual(under('ru', dnd()));
  });

  it('система с английским основным языком: подписи английские при любом интерфейсе, ключи те же, что у русской', () => {
    const english = { ...dnd(), langs: ['en'] } as System;
    const shown = under('ru', english);
    expect(under('en', english)).toEqual(shown);
    expect(JSON.stringify(shown)).not.toMatch(/[А-Яа-яЁё]/u);
    const keysOf = (value: unknown): string[] => JSON.stringify({ ...(value as object), block: null }).match(/"(key|id|of)":"[^"]*"/g) ?? [];
    expect(keysOf(shown)).toEqual(keysOf(under('ru', dnd())));
    expect((shown as { block: { key: string; title: string } }).block).toEqual({ key: 'new_block', title: 'New block' });
  });

  it('основной язык без словаря интерфейса — подписи по-английски', () => {
    const german = { ...dnd(), langs: ['de'] } as System;
    expect(newEffect(german, 'manual').value.label).toBe('New effect');
  });

  it('новая система берёт основным языком язык интерфейса автора; русский не пишется', () => {
    expect(emptySystem()).not.toHaveProperty('langs');
    expect(emptySystem().name).toBe('Новая система');
    useLocale.getState().setLang('en');
    try {
      expect(emptySystem().langs).toEqual(['en']);
      expect(emptySystem().name).toBe('New system');
    } finally { useLocale.getState().setLang('ru'); }
  });

  it('подписи и подсказки заготовок шагов — на языке интерфейса', () => {
    const labels = (): string[] => BRICKS.map(brick => `${brick.label} ${brick.hint}`);
    const ru = labels();
    useLocale.getState().setLang('en');
    try {
      const en = labels().filter((_, at) => BRICKS[at]!.key !== 'ask');
      expect(en.join(' ')).not.toMatch(/[А-Яа-яЁё]/u);
    } finally { useLocale.getState().setLang('ru'); }
    expect(labels()).toEqual(ru);
  });
});
