import { describe, it, expect } from 'vitest';
import { lintSystem } from '../src/model/lint.ts';
import { SAMPLE_WORLDS, LITE_WORLDS } from '../src/model/systems.ts';
import { flattenSystem } from '../src/model/inherit.ts';

const CYRILLIC = /[а-яё]/iu;
const LATIN = /[a-z]/iu;
const AUTHOR_NOTE = /в оригинале|образец (ведёт|спрашивает|считает|не |берёт)|по книге решать|переводчик/iu;
const KNOWN_REMARKS = new Map<string, RegExp[]>([
  ['Fabula Ultima', [/сравнивается внутри формулы/u]],
  ['Daggerheart', [/виду «Точки» не хватает — верх/u]],
  ['Shadowrun: Шестой мир', [/^метк[уи] «(?:зрение|слух|осязание|вкус|обоняние|лечение|взлом замков|матрица)»(?:, «(?:зрение|слух|осязание|вкус|обоняние)»)* не ставит ни правило броска/u]],
]);

const worlds = [...SAMPLE_WORLDS, ...LITE_WORLDS];

describe('данные образцов: то, что видит автор и игрок', () => {
  for (const world of worlds) {
    const system = world.system;
    const records = [...(system.library ?? []), ...(world.compendium.records ?? [])];

    it(`${world.title}: «Проблемы» без замечаний, кроме записанных`, () => {
      const known = KNOWN_REMARKS.get(system.name ?? '') ?? [];
      const remarks = lintSystem(flattenSystem(system), world.compendium).map(one => one.text).filter(text => !known.some(pattern => pattern.test(text)));
      expect(remarks).toEqual([]);
    });

    it(`${world.title}: названия таблиц, колонок, эффектов, входов и записей — словами, не латиницей`, () => {
      const foreign: string[] = [];
      const check = (what: string, label: unknown): void => {
        if (typeof label === 'string' && LATIN.test(label) && !CYRILLIC.test(label)) foreign.push(`${what}: ${label}`);
      };
      for (const [key, table] of Object.entries(system.tables ?? {})) {
        check(`таблица ${key}`, table.label);
        for (const column of table.columns ?? []) check(`колонка ${key}.${column.key}`, column.label);
      }
      for (const [key, effect] of Object.entries(system.effects ?? {})) {
        check(`эффект ${key}`, effect.label);
        for (const param of effect.params ?? []) check(`вход ${key}.${param.key}`, param.label);
      }
      for (const record of records) check(`запись ${record.id}`, record.label);
      expect(foreign).toEqual([]);
    });

    it(`${world.title}: в текстах для игрока нет заметок автора и переводчика`, () => {
      const notes: string[] = [];
      const walk = (value: unknown, path: string): void => {
        if (typeof value === 'string') { if (AUTHOR_NOTE.test(value)) notes.push(`${path}: ${value.slice(0, 80)}`); return; }
        if (!value || typeof value !== 'object') return;
        for (const [key, inner] of Object.entries(value)) if (key !== 'note') walk(inner, `${path}.${key}`);
      };
      walk(system, 'система');
      walk(records, 'записи');
      expect(notes).toEqual([]);
    });
  }
});
