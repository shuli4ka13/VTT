import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { playScenario, check } from './scenarios/run.ts';
import type { Scenario } from './scenarios/run.ts';

const dir = fileURLToPath(new URL('./scenarios/', import.meta.url));
const only = process.env.SCENARIOS?.split(',').map(name => `${name.trim()}.scenarios.ts`);
const files = readdirSync(dir).filter(name => name.endsWith('.scenarios.ts') && (!only || only.includes(name))).sort();

for (const file of files) {
  const { scenarios } = await import(`./scenarios/${file}`) as { scenarios: Scenario[] };
  describe(`сценарии по правилам: ${file.replace('.scenarios.ts', '')}`, () => {
    for (const scenario of scenarios) {
      const run = it;
      run(scenario.name, async () => {
        const played = await playScenario(scenario);
        expect(check(scenario, played), played.log.join('\n')).toEqual([]);
      });
    }
  });
}
