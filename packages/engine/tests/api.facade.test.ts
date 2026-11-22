import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import * as api from '../src/index.ts';
import * as samples from '../src/samples.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const root = join(here, '..', '..', '..');
const read = (path: string): string => readFileSync(join(root, path), 'utf8');

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (/\.(ts|tsx|mts)$/.test(entry.name)) yield path;
  }
}

const RUBRICS = ['calc', 'turn', 'lint', 'vocabulary', 'registries', 'format'];

describe('фасад движка', () => {
  it('у фасада есть версия, и она та же, что у пакета', () => {
    const pack = JSON.parse(read('packages/engine/package.json')) as { version: string };
    expect(api.ENGINE_VERSION).toBe(pack.version);
  });

  it('шесть рубрик на месте: расчёт, ход, проверка, словарь, реестры, форматирование', () => {
    const surface = api as Record<string, unknown>;
    for (const name of ['calc', 'calcAll', 'dependenciesOf', 'newPass']) expect(typeof surface[name], name).toBe('function');
    for (const name of ['perform', 'authorize', 'availableActions', 'costRefusal']) expect(typeof surface[name], name).toBe('function');
    for (const name of ['lintSystem', 'lintCompendium', 'errorsOf']) expect(typeof surface[name], name).toBe('function');
    for (const name of ['fieldsOf', 'fieldOf', 'recordKinds', 'namesAt']) expect(typeof surface[name], name).toBe('function');
    expect(surface.registry, 'registry').toBeTruthy();
    expect(Array.isArray(surface.VIEW_KINDS), 'VIEW_KINDS').toBe(true);
    for (const name of ['compile', 'printFormula', 'stepLabel']) expect(typeof surface[name], name).toBe('function');
  });

  it('рубрика — только явный перечень имён: «export *» из внутренностей нет', () => {
    for (const rubric of RUBRICS) {
      const lines = read(`packages/engine/src/api/${rubric}.ts`).split('\n').filter(line => line.trim());
      expect(lines.length, rubric).toBeGreaterThan(0);
      for (const line of lines) expect(line, `${rubric}: ${line}`).toMatch(/^export (type )?\{ [^}]+ \} from '\.\.\/[\w/-]+\.ts';$/);
    }
  });

  it('вход пакета — сам фасад: в index.ts только рубрики и версия', () => {
    const lines = read('packages/engine/src/index.ts').split('\n').filter(line => line.trim());
    expect(lines).toEqual([...RUBRICS.map(rubric => `export * from './api/${rubric}.ts';`), "export { ENGINE_VERSION } from './api/version.ts';"]);
  });

  it('образцы — отдельный вход с данными, а не часть фасада', () => {
    expect(samples.SAMPLE_WORLDS.length).toBeGreaterThan(0);
    expect((api as Record<string, unknown>).SAMPLE_WORLDS).toBeUndefined();
  });

  it('пакет отдаёт наружу только фасад и образцы', () => {
    const pack = JSON.parse(read('packages/engine/package.json')) as { exports: Record<string, unknown> };
    expect(Object.keys(pack.exports).sort()).toEqual(['.', './samples']);
  });

  it('снаружи пакета никто не импортирует внутренности движка', () => {
    const deep: string[] = [];
    for (const dir of ['apps/web/src', 'apps/server/src', 'apps/server/test', 'packages/schema/src']) {
      for (const file of walk(join(root, dir))) {
        const found = readFileSync(file, 'utf8').match(/['"]@vtt\/engine\/(?!samples['"])[^'"]*['"]/g);
        if (found) deep.push(`${file.slice(root.length + 1)}: ${found.join(', ')}`);
      }
    }
    expect(deep).toEqual([]);
  });
});
