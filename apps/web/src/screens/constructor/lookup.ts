import { emittedChoices, tagWords, splitPath, choiceTableOf, recordsOf, argsWithProps, propKeysOf, recordKinds, isUnder, kindWord, fieldOf, rowSteps, ROW, NAMES, nameLabel } from '@vtt/engine';
import type { RefKind } from '@vtt/engine';
import { TABS } from '../../words.ts';
import type { System, Compendium, Effect } from '@vtt/schema';
import { fieldPaths } from '../../ui/paths.ts';
import { formulaAsLabels } from '../../ui/formula.tsx';
import { asDice } from '../../words.ts';
import { outputLabel, EVENT_NAMES } from './slots.tsx';
import type { EarlierStep } from './slots.tsx';
import { usersOf } from './usage.ts';
import type { UsageIndex } from './usage.ts';
import type { WorldState } from '../../store/world.ts';
import { t } from '../../i18n/author.ts';

type Pick = Parameters<WorldState['pick']>[0];

export interface Explained {
  kind: string;
  title: string;
  facts: [string, string][];
  from: string[];
  shown: string[];
  users: string[];
  field?: string;
  go?: { label: string; pick: Pick };
}

const askWord = (by: string): string =>
  (by === 'actor' ? t('phrases:lookup.ask.actor') : by === 'gm' ? t('phrases:lookup.ask.gm') : t('phrases:lookup.ask.table'));


type Loose = Record<string, any>;

function stepsOf(effect: Effect | undefined): EarlierStep[] {
  const out: EarlierStep[] = [];
  const all = [...(effect?.cost ?? []), ...(effect?.steps ?? [])] as Loose[];
  all.forEach(step => { if (step.id) out.push({ id: String(step.id), ...(step.label ? { label: String(step.label) } : {}), type: String(step.type), ...((step as { field?: unknown }).field ? { fielded: true } : {}) }); });
  return out;
}

const argText = (arg: unknown, props: ReadonlySet<string> = new Set()): string => {
  if (arg === null || arg === undefined || arg === '') return '';
  if (typeof arg !== 'object') return String(arg);
  const a = arg as Loose;
  if ('expr' in a) {
    const lone = /^\s*@([\p{L}\p{N}_]+)\s*$/u.exec(String(a.expr));
    return lone && props.has(lone[1]!) ? t('phrases:lookup.arg.prop', { name: lone[1] }) : String(a.expr);
  }
  if ('table' in a) return t('phrases:lookup.arg.table', { table: a.table, column: a.column ?? t('phrases:lookup.arg.value') });
  return JSON.stringify(a);
};

function callersOf(system: System, effectId: string, key: string): string[] {
  const out: string[] = [];
  for (const [kindKey, kind] of recordKinds(system)) {
    for (const binding of kind.bindings ?? []) {
      if (binding.effect !== effectId) continue;
      const props = propKeysOf(kind);
      const text = argText(argsWithProps(system, binding, props)?.[key], props);
      const said = text || t('phrases:lookup.caller.none');
      out.push(binding.label
        ? t('phrases:lookup.caller.recordBinding', { kind: kind.label ?? kindKey, binding: binding.label, text: said })
        : t('phrases:lookup.caller.record', { kind: kind.label ?? kindKey, text: said }));
    }
  }
  for (const [id, effect] of Object.entries(system.effects ?? {})) {
    for (const step of [...(effect.cost ?? []), ...(effect.steps ?? [])] as Loose[]) {
      if (step.type !== 'emit' || !emittedChoices(system, id, step.effect).includes(effectId)) continue;
      const text = argText(step.args?.[key]);
      out.push(t('phrases:lookup.caller.effect', { name: effect.label ?? id, text: text || t('phrases:lookup.caller.none') }));
    }
  }
  return out;
}

const usersBy = (usage: UsageIndex, kind: RefKind, key: string, system: System) => usersOf(usage, kind, key, system);

function explainRow(system: System, tableId: string, name: string): Explained | null {
  const table = system.tables?.[tableId];
  const path = name.split('.').slice(1);
  if (!table || name.split('.')[0] !== ROW) return null;
  const rows = table.rows ?? [];
  const first = rows[0];
  const steps = rowSteps(system, tableId, path, first);
  if (path.length && !steps.length) return null;
  const tableName = table.label || tableId;
  const facts: [string, string][] = [[t('phrases:lookup.fact.row'), t('phrases:lookup.row.same', { table: tableName })]];
  steps.forEach((step, index) => {
    const linked = index < steps.length - 1;
    facts.push([step.column, linked
      ? t('phrases:lookup.row.link', { table: step.table })
      : t('phrases:lookup.row.column', { table: step.table })]);
  });
  const example = first && steps.length
    ? t('phrases:lookup.row.example', { row: first.label ?? String(first.value), via: [...steps].reverse().find(step => step.via)?.via ?? first.label ?? String(first.value), column: steps[steps.length - 1]!.column })
    : null;
  const target = steps.length ? steps[steps.length - 1]!.key : tableId;
  return {
    kind: t('phrases:lookup.row.kind'),
    title: steps.length ? steps.map(step => step.column).join(' · ') : t('phrases:lookup.row.title'),
    facts: example ? [...facts, [t('phrases:lookup.fact.example'), example]] : facts,
    from: [t('phrases:lookup.row.from', { table: tableName })],
    shown: [], users: [],
    ...(target ? { go: { label: t('phrases:lookup.go.openTable'), pick: { activeTab: 'dictionaries', activeTableId: target } } } : {}),
  };
}

export function explainName(
  system: System, compendium: Compendium | undefined, effectId: string | null, name: string, usage: UsageIndex, tableId?: string,
): Explained {
  const own = tableId ? explainRow(system, tableId, name) : null;
  if (own) return own;
  const effect = effectId ? system.effects?.[effectId] : undefined;
  const params = effect?.params ?? [];
  const dot = name.indexOf('.');
  const head0 = dot > 0 ? name.slice(0, dot) : '';
  const item = params.find(p => p.kind === 'sheet' && p.many && p.item?.key === head0)?.item;
  const sheet = dot > 0
    ? params.find(p => p.kind === 'sheet' && p.key === head0)
      ?? (item ? { key: item.key, label: item.label ?? item.key }
        : ([NAMES.holder, NAMES.desk] as string[]).includes(head0) ? { key: head0, label: nameLabel(head0) ?? head0 } : undefined)
    : undefined;
  const rest = sheet ? name.slice(dot + 1) : name;
  const owner = sheet ? t('phrases:lookup.owner.sheet', { name: sheet.label ?? sheet.key }) : null;
  const head = splitPath(rest)?.head ?? rest;
  const earlier = stepsOf(effect);
  const ownerFact: [string, string][] = owner ? [[t('phrases:lookup.fact.whose'), owner]] : [];

  const event = EVENT_NAMES.find(([key]) => key === rest);
  if (event) {
    return {
      kind: t('phrases:lookup.kind.call'), title: event[1], facts: [], users: [], shown: [],
      from: [t('phrases:lookup.from.call')],
    };
  }

  if (earlier.some(step => step.id === head) && !params.some(p => p.key === head)) {
    return {
      kind: t('phrases:lookup.kind.stepResult'), title: outputLabel(rest, earlier), facts: [], users: [], shown: [],
      from: [t('phrases:lookup.from.stepResult')],
    };
  }

  const param = params.find(p => p.key === head);
  if (param && effectId) {
    const decl = param as Loose;
    const table = decl.from ? system.tables?.[decl.from] : undefined;
    if (rest !== head) {
      const columnKey = rest.slice(head.length + 1);
      const chain: string[] = [];
      let at = table;
      let column: { label?: string; expr?: unknown; from?: string } | undefined;
      for (const key of columnKey.split('.')) {
        column = at?.columns?.find(c => c.key === key) as typeof column;
        chain.push(column?.label ?? key);
        at = column?.from ? system.tables?.[column.from] : undefined;
      }
      return {
        kind: t('phrases:lookup.kind.pickedColumn'),
        title: [table?.label ?? decl.from, ...chain].join(' → '),
        facts: [...ownerFact, [t('phrases:lookup.fact.row'), t('phrases:lookup.pickedRow.input', { name: param.label ?? param.key })],
          ...(column?.expr ? [[t('phrases:lookup.fact.computed'), owner ? t('phrases:lookup.computedBy.owner', { owner }) : t('phrases:lookup.computedBy.anon')] as [string, string]] : [])],
        from: callersOf(system, effectId, param.key),
        shown: [], users: [],
        ...(decl.from ? { go: { label: t('phrases:lookup.go.openTableNamed', { name: table?.label ?? decl.from }), pick: { activeTab: 'dictionaries', activeTableId: decl.from } } } : {}),
      };
    }
    const asks = decl.ask ? askWord(String(decl.ask.by ?? 'actor')) : null;
    return {
      kind: t('phrases:lookup.kind.input'),
      title: param.label ?? param.key,
      facts: [
        [t('phrases:lookup.fact.type'), kindWord(decl.kind)],
        ...(table ? [[t('phrases:lookup.fact.table'), table.label ?? String(decl.from)] as [string, string]] : []),
        [t('phrases:lookup.fact.ifMissing'), asks ?? (decl.optional ? t('phrases:lookup.ifMissing.empty') : t('phrases:lookup.ifMissing.fails'))],
      ],
      from: callersOf(system, effectId, param.key),
      shown: asks ? [decl.ask?.hint ? t('phrases:lookup.shown.askHint', { ask: asks, hint: decl.ask.hint }) : t('phrases:lookup.shown.ask', { ask: asks })] : [],
      users: [],
    };
  }

  const field = fieldOf(system, rest);
  if (field) {
    const value = field.value as Loose;
    const how = value.kind === 'formula' ? t('phrases:lookup.how.formula', { expr: formulaAsLabels(system, String(value.expr)) })
      : value.kind === 'table' ? t('phrases:lookup.how.table', { name: system.tables?.[value.table]?.label ?? value.table })
        : t('phrases:lookup.how.stored', { value: String(value.default ?? '—') });
    return {
      kind: field.lives === 'desk' ? t('phrases:lookup.kind.deskColumn') : field.lives === 'group' ? t('phrases:lookup.kind.groupColumn') : t('phrases:lookup.kind.sheetColumn'),
      title: field.label ?? field.tag,
      facts: [...ownerFact, [t('phrases:lookup.fact.how'), how]],
      from: [value.kind === 'stored' ? t('phrases:lookup.from.stored') : t('phrases:lookup.from.computed')],
      shown: [field.lives === 'desk' ? t('phrases:lookup.shown.desk') : field.lives === 'group' ? t('phrases:lookup.shown.group') : t('phrases:lookup.shown.block', { group: field.group ?? t('phrases:lookup.shown.noBlock') })],
      users: usersBy(usage, 'field', field.tag, system),
      field: field.tag,
      go: { label: t('phrases:lookup.go.sheet'), pick: { activeTab: 'sheet', activeFieldTag: field.tag } },
    };
  }

  const path = fieldPaths(system).get(rest);
  if (path) {
    const base = fieldOf(system, head);
    const table = choiceTableOf(base);
    return {
      kind: t('phrases:lookup.kind.fieldColumn'),
      title: path,
      facts: [...ownerFact, [t('phrases:lookup.fact.row'), t('phrases:lookup.pickedRow.field', { name: base?.label ?? head })]],
      from: [t('phrases:lookup.from.table', { name: system.tables?.[table ?? '']?.label ?? table })],
      shown: [], users: [],
      ...(table ? { go: { label: t('phrases:lookup.go.openTable'), pick: { activeTab: 'dictionaries', activeTableId: table } } } : {}),
    };
  }

  const hung = system.effects?.[rest];
  if (hung && rest !== effectId) {
    return {
      kind: t('phrases:lookup.kind.hanging'),
      title: hung.label ?? rest,
      facts: [...ownerFact, [t('phrases:lookup.fact.number'), t('phrases:lookup.hung.count')]],
      from: [t('phrases:lookup.from.hanging')],
      shown: [t('phrases:lookup.shown.hanging')],
      users: usersBy(usage, 'field', rest, system),
      go: { label: t('phrases:lookup.go.open', { name: hung.label ?? rest }), pick: { activeTab: 'effects', activeEffectId: rest } },
    };
  }

  const constant = system.constants?.[rest];
  if (constant) {
    const dice = (constant.dice ?? []).map(d => asDice(`${typeof d.count === 'number' ? d.count : 1}d${d.sides}`)).join(' + ');
    return {
      kind: t('phrases:lookup.kind.systemDie'),
      title: constant.label ?? rest,
      facts: [...ownerFact, [t('phrases:lookup.fact.dice'), dice || '—'], ...(sheet ? [[t('phrases:lookup.fact.whoRolls'), `«${sheet.label ?? sheet.key}»`] as [string, string]] : [])],
      from: [t('phrases:lookup.from.die')],
      shown: [], users: usersBy(usage, 'constant', rest, system),
      go: { label: t('phrases:lookup.go.rules'), pick: { activeTab: 'dictionaries' } },
    };
  }

  const ownRoll = system.rolls?.[rest];
  if (ownRoll && !Object.values(system.tables ?? {}).some(t => (t.rows ?? []).some(r => r.value === rest))) {
    return {
      kind: t('phrases:lookup.kind.rollTag'),
      title: ownRoll.label || rest,
      facts: [[t('phrases:lookup.fact.systemRoll'), ownRoll.label || rest]],
      from: [t('phrases:lookup.from.roll')],
      shown: [], users: [...new Set([...usersBy(usage, 'roll', rest, system), ...usersBy(usage, 'tag', rest, system)])],
      go: { label: t('phrases:lookup.go.rules'), pick: { activeTab: 'dictionaries' } },
    };
  }

  const table = tagWords(system).get(rest);
  if (table) {
    const [tableKey, spec] = Object.entries(system.tables ?? {}).find(([, t]) => (t.rows ?? []).some(r => r.value === rest))!;
    const row = (spec.rows ?? []).find(r => r.value === rest);
    const cells = (spec.columns ?? []).map(c => [c.label ?? c.key, String((row?.cells ?? {})[c.key] ?? '—')] as [string, string]);
    return {
      kind: t('phrases:lookup.kind.rollTag'),
      title: rest,
      facts: [[t('phrases:lookup.fact.table'), table], ...cells],
      from: [t('phrases:lookup.from.tag')],
      shown: [], users: [...new Set([...usersBy(usage, 'roll', rest, system), ...usersBy(usage, 'tag', rest, system)])],
      go: { label: t('phrases:lookup.go.openTableNamed', { name: table }), pick: { activeTab: 'dictionaries', activeTableId: tableKey } },
    };
  }

  for (const [kindKey, kind] of recordKinds(system)) {
    const prop = (kind.columns ?? []).find(p => p.key === head);
    if (!prop) continue;
    const records = recordsOf(compendium).filter(r => isUnder(system, r.table, kindKey));
    return {
      kind: t('phrases:lookup.kind.recordProp'),
      title: t('phrases:lookup.prop.title', { prop: prop.label ?? prop.key, kind: kind.label ?? kindKey }),
      facts: [[t('phrases:lookup.fact.type'), kindWord(prop.kind)]],
      from: [t('phrases:lookup.from.records', { kind: kind.label ?? kindKey, n: records.length })],
      shown: [], users: [],
      go: { label: t('phrases:lookup.go.open', { name: TABS.records }), pick: { activeTab: 'records', activeRecordKind: kindKey } },
    };
  }

  return {
    kind: t('phrases:lookup.kind.notFound'), title: name, facts: [], users: [], shown: [],
    from: [t('phrases:lookup.from.notFound')],
  };
}
