import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import '../src/index.ts';
import '../src/samples.ts';
import { liveWords, sourceOf } from '../src/words/tongue.ts';
import { NAME_LABELS } from '../src/words/names.ts';
import { scan, SRC } from './tongue.scan.ts';

const GROUPS = ['names', 'tablesA', 'tablesB', 'formula', 'steps', 'core', 'events', 'lint', 'model'] as const;
type Group = typeof GROUPS[number];

const constOf = (group: string): string => group.replace(/[A-Z]/g, letter => `_${letter}`).toUpperCase();

const groupOf = (file: string): Group => {
  if (file === 'model/lint.ts') return 'lint';
  if (file.startsWith('formula/')) return 'formula';
  if (file.startsWith('engine/')) return 'steps';
  if (file.startsWith('core/')) return 'core';
  if (file.startsWith('events/')) return 'events';
  if (file.startsWith('words/')) return 'tablesB';
  return 'model';
};

const found = scan();
const sites = new Map<string, string[]>();
const owner = new Map<string, Group>();
const NAMED = new Set(Object.values(sourceOf(NAME_LABELS) as Record<string, string>));
const spoken = [...liveWords()];
spoken.forEach((word, at) => {
  owner.set(word, NAMED.has(word) ? 'names' : at < spoken.length / 2 ? 'tablesA' : 'tablesB');
  sites.set(word, ['таблица слов']);
});
for (const phrase of found.phrases) {
  if (!owner.has(phrase.id)) owner.set(phrase.id, groupOf(phrase.file));
  sites.set(phrase.id, [...(sites.get(phrase.id) ?? []), `${phrase.file}:${phrase.line}`]);
}

const dir = join(SRC, 'words', 'en');
const report: string[] = [];
for (const group of GROUPS) {
  const path = join(dir, `${group}.ts`);
  const before: Record<string, string> = existsSync(path)
    ? JSON.parse(`{${readFileSync(path, 'utf8').split('\n').filter(line => line.startsWith('  "')).join('\n').replace(/,\s*$/, '')}}`)
    : {};
  const ids = [...owner].filter(([, at]) => at === group).map(([id]) => id);
  const lines = ids.map(id => `  ${JSON.stringify(id)}: ${JSON.stringify(before[id] ?? '')},`);
  writeFileSync(path, `export const ${constOf(group)}: Record<string, string> = {\n${lines.join('\n')}\n};\n`);
  report.push(`${group}\t${ids.length}\tбез перевода ${ids.filter(id => !before[id]).length}`);
  const out = process.argv[2];
  if (out) writeFileSync(join(out, `en-${group}.tsv`), ids.map(id => `${JSON.stringify(id)}\t${(sites.get(id) ?? []).slice(0, 3).join(' ')}`).join('\n') + '\n');
}
writeFileSync(join(dir, 'index.ts'),
  `${GROUPS.map(group => `import { ${constOf(group)} } from './${group}.ts';`).join('\n')}\n\nexport const EN: Readonly<Record<string, string>> = { ${GROUPS.map(group => `...${constOf(group)}`).join(', ')} };\n`);
const many = [...sites].filter(([, at]) => at.length > 1 && !at.includes('таблица слов')).length;
const shared = [...sites].filter(([, at]) => at.length > 1 && at.includes('таблица слов'));
console.log(report.join('\n'));
console.log(`фраз в нескольких местах: ${many}; слов таблиц, встреченных ещё и в сообщениях: ${shared.length}`);
if (process.argv[2]) writeFileSync(join(process.argv[2], 'en-repeats.tsv'), [...sites].filter(([, at]) => at.length > 1).map(([id, at]) => `${JSON.stringify(id)}\t${at.join(' ')}`).join('\n') + '\n');
