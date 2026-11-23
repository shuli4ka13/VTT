import type { System } from '@vtt/schema';
import { sheetPathLabel } from './paths.ts';
import { fieldOf, fieldLinkOf, ROW, typeColumn, nameLabel, saidName, listOf } from '@vtt/engine';
import { shownFormula, everyFunction } from './formula-lang.ts';
import { t } from '../i18n/index.ts';

const known = (system: System, tag: string, names?: ReadonlyMap<string, string>): boolean =>
  Boolean(fieldOf(system, tag)) || sheetPathLabel(system, tag) !== null || Boolean(names?.has(tag));

const onSheet = (system: System, tag: string, names?: ReadonlyMap<string, string>): { head: string; rest: string } | null => {
  const dot = tag.indexOf('.');
  if (dot <= 0 || tag.startsWith(`${ROW}.`) || known(system, tag, names)) return null;
  const rest = tag.slice(dot + 1);
  return known(system, rest, names) || system.effects?.[rest] ? { head: tag.slice(0, dot), rest } : null;
};

const rollPath = (segment: string): string | undefined => {
  switch (segment) {
    case 'dice': return t('ui:labels.roll.dice');
    case 'rolls': return t('ui:labels.roll.rolls');
    case 'natural': return t('ui:labels.roll.natural');
    case 'total': return t('ui:labels.roll.total');
    case 'success': return t('ui:labels.roll.success');
    case 'margin': return t('ui:labels.roll.margin');
    case 'atMax': return t('ui:labels.roll.atMax');
    case 'atMin': return t('ui:labels.roll.atMin');
    case 'degree': return t('ui:labels.roll.degree');
    case 'parts': return t('ui:labels.roll.parts');
    case 'versus': return t('ui:labels.roll.versus');
    case 'tags': return t('ui:labels.roll.tags');
    default: return undefined;
  }
};

const TABLE_CALL = new RegExp(`(?:${everyFunction('table')})\\(\\s*(["'])([^"']*)\\1\\s*,([^,()]*(?:\\([^()]*\\)[^,()]*)*)(?:,\\s*(["'])([^"']*)\\4)?\\s*\\)`, 'gu');

const SAID = new WeakMap<System, Map<string, string>>();

function walkSteps(list: unknown, put: (key: unknown, label: unknown) => void): void {
  if (!Array.isArray(list)) return;
  for (const step of list as Record<string, unknown>[]) {
    if (!step || typeof step !== 'object') continue;
    put(step.id, step.label);
    put(step.as, step.asLabel);
    walkSteps(step.steps, put);
    walkSteps(step.cost, put);
  }
}

function saidIndex(system: System): Map<string, string> {
  const cached = SAID.get(system);
  if (cached) return cached;
  const index = new Map<string, string>();
  const put = (key: unknown, label: unknown): void => {
    if (typeof key !== 'string' || typeof label !== 'string' || !label || label === key) return;
    if (!index.has(key)) index.set(key, label);
  };
  for (const [id, table] of Object.entries(system.tables ?? {})) {
    put(id, table.label);
    for (const column of table.columns ?? []) {
      put(column.key, column.label);
      for (const stage of column.stages ?? []) put(stage.key, stage.label);
    }
    for (const row of table.rows ?? []) put(row.value, row.label);
  }
  for (const [id, effect] of Object.entries(system.effects ?? {})) {
    put(id, effect.label);
    for (const param of effect.params ?? []) {
      put(param.key, param.label);
      for (const stage of param.stages ?? []) put(stage.key, stage.label);
    }
    for (const column of effect.returns ?? []) put(column.key, column.label);
    walkSteps(effect.steps, put);
    walkSteps(effect.cost, put);
    for (const handler of effect.on ?? []) { walkSteps(handler.steps, put); walkSteps(handler.cost, put); }
    walkSteps(effect.attach, put);
    walkSteps(effect.detach, put);
  }
  for (const [id, constant] of Object.entries(system.constants ?? {})) {
    put(id, constant.label);
    for (const part of constant.dice ?? []) put(part.name, part.label);
  }
  for (const [id, tag] of Object.entries(system.tags ?? {})) put(id, tag.label);
  SAID.set(system, index);
  return index;
}

function segmentSaid(system: System, names: ReadonlyMap<string, string> | undefined, segment: string): string | undefined {
  const named = names?.get(segment);
  return (named !== segment ? named : undefined) ?? nameLabel(segment) ?? rollPath(segment) ?? saidIndex(system).get(segment);
}

function byAddress(system: System, segments: readonly string[]): (string | undefined)[] {
  const out: (string | undefined)[] = [];
  let table: NonNullable<System['tables']>[string] | undefined;
  let stage: 'row' | 'column' = 'row';
  for (const segment of segments) {
    const next = system.tables?.[segment];
    if (!table && next) { out.push(next.label || undefined); table = next; stage = next.rows?.length ? 'row' : 'column'; continue; }
    if (!table) { out.push(undefined); continue; }
    const row = stage === 'row' ? (table.rows ?? []).find(one => slugOfRow(one.value) === segment) : undefined;
    if (row) { out.push(row.label || undefined); stage = 'column'; continue; }
    const column = (table.columns ?? []).find(one => one.key === segment);
    if (!column) { out.push(undefined); stage = 'column'; continue; }
    out.push(column.label || undefined);
    const linked = column.kind === 'choice' && typeof column.from === 'string' ? system.tables?.[column.from] : undefined;
    if (linked) { table = linked; stage = 'column'; }
  }
  return out;
}

const slugOfRow = (value: unknown): string => String(value ?? '').replace(/[^\p{L}\p{N}_]+/gu, '_');

export function pathSaid(system: System, tag: string, names?: ReadonlyMap<string, string>, strict = false): string | null {
  const segments = tag.replace(/^cell:/u, '').split('.');
  const placed = byAddress(system, segments);
  const said = segments.map((segment, at) => {
    const named = names?.get(segment);
    return (named !== segment ? named : undefined) ?? placed[at] ?? segmentSaid(system, names, segment);
  });
  if (strict ? said.some(one => one === undefined) : said.every(one => one === undefined)) return null;
  return said.map((one, at) => one ?? segments[at]!).join(' → ');
}

export const plainLabel = (system: System, tag: string, names?: ReadonlyMap<string, string>): string =>
  fieldOf(system, tag)?.label ?? (names?.get(tag) !== tag ? names?.get(tag) : undefined) ?? sheetPathLabel(system, tag) ?? system.effects?.[tag]?.label ?? pathSaid(system, tag, names) ?? saidName(tag);

export const pickTail = (system: System, tag: string, rest: string): string =>
  typeColumn(system, fieldLinkOf(system, fieldOf(system, tag)), rest)?.label || pathSaid(system, rest) || rest;

export function labelOfTag(system: System, tag: string, names?: ReadonlyMap<string, string>): string {
  const owned = onSheet(system, tag, names);
  if (owned) return `${labelOfTag(system, owned.rest, names)} (${names?.get(owned.head) ?? nameLabel(owned.head) ?? pathSaid(system, owned.head) ?? owned.head})`;
  return plainLabel(system, tag, names);
}

export function literalSaid(system: System, value: string): string | undefined {
  const said = new Set<string>();
  for (const table of Object.values(system.tables ?? {})) {
    for (const row of table.rows ?? []) if (row.value === value && row.label) said.add(row.label);
  }
  return said.size ? [...said][0] : undefined;
}

export function defaultSaid(system: System, param: { kind?: unknown; from?: unknown }, value: unknown): string {
  if (value === true) return t('ui:labels.yes');
  if (value === false) return t('ui:labels.no');
  if (typeof value !== 'string') return String(value);
  if (String(param.kind) === 'effect') return system.effects?.[value]?.label || value;
  const row = typeof param.from === 'string' ? listOf(system, param.from)?.find(one => one.value === value)?.label : undefined;
  return row ?? system.effects?.[value]?.label ?? literalSaid(system, value) ?? value;
}

export const formulaAsLabels = (system: System, source: string, names?: ReadonlyMap<string, string>): string =>
  labels(system, shownFormula(source), names);

function labels(
  system: System,
  source: string,
  names?: ReadonlyMap<string, string>,
): string {
  const lookups = source.replace(TABLE_CALL,
    (whole, _q, table: string, arg: string, _q2, column?: string) => {
      const found = system.tables?.[table];
      if (!found) return whole;
      const col = column ? typeColumn(system, table, column) : undefined;
      return col
        ? t('ui:labels.tableColumn', { table: found.label || table, column: col.label || col.key, arg: arg.trim() })
        : t('ui:labels.table', { table: found.label || table, arg: arg.trim() });
    });
  const picks = lookups.replace(/[@#]([\p{L}\p{N}_]+(?:\.[\p{L}\p{N}_]+)*)\.\[([^[\]]*)\]((?:\.[\p{L}\p{N}_]+)*)/gu,
    (_, tag: string, by: string, rest: string) =>
      rest
        ? t('ui:labels.pickTail', { tag: labelOfTag(system, tag, names), by: labels(system, by, names), tail: pickTail(system, tag, rest.slice(1)) })
        : t('ui:labels.pick', { tag: labelOfTag(system, tag, names), by: labels(system, by, names) }));
  return picks
    .replace(/[@#]([\p{L}\p{N}_.]+)/gu, (_, name: string) => labelOfTag(system, name, names))
    .replace(/"([A-Za-z][A-Za-z0-9_]*)"/gu, (whole, value: string) => { const said = literalSaid(system, value); return said ? `«${said}»` : whole; });
}
