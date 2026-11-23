import { NAMES } from '../words/names.ts';
import { parseItemTag } from '../model/item-ref.ts';
import { translateFormula, NEUTRAL_WORDS, RU_WORDS } from '../formula/words.ts';
import { recordKinds } from '../model/owned.ts';
import { loopOf } from '../engine/steps/each.ts';
import { effectLabelOf } from './actions.ts';
import { breakReasonWord, registry as stepRegistry, splitsTargets } from '../engine/steps/index.ts';
import { outcomeWords, rollTitle as titleOf } from '../engine/roll-tags.ts';
import type { System, Sheet } from '../model/types.ts';
import { hasField, valueWord, fieldOf } from '../model/sheet-columns.ts';
import { isSecret } from '../model/roles.ts';
import { walkSheet } from '../model/paths.ts';
import { typeColumn } from '../model/inherit.ts';
import { labelsAt } from '../model/names-at.ts';
import { forcedWords } from '../words/steps.ts';
import { addendsText, verdictText } from '../core/dice.ts';
import type { Addend } from '../core/dice.ts';
import { facedText } from '../core/against.ts';
import type { FacedTrace } from '../core/against.ts';
import { CALL_WORDS } from '../words/calls.ts';

const addsOf = (trace: Record<string, unknown>): Addend[] => (Array.isArray(trace.adds) ? trace.adds as Addend[] : []);

const addedOf = (trace: Record<string, unknown>): number => addsOf(trace).reduce((sum, one) => sum + one.value, 0);

const tagsOfStep = (step: Record<string, any> | undefined, trace?: Record<string, any>): string[] =>
  (trace?.tags ?? step?.tags ?? (step?.roll?.tags ?? []).filter((t: unknown) => typeof t === 'string')) as string[];

const rollTitle = (system: System, tags: string[], fallback: string): string => titleOf(fallback, tags, system);

const tagLabel = (system: System, tag: string, params: readonly { kind?: string; from?: unknown }[] = []): string | null => {
  const walked = walkSheet(system, tag);
  if (walked?.ok) return walked.label;
  for (const param of params) {
    if (param.kind !== 'record' || typeof param.from !== 'string') continue;
    const column = typeColumn(system, param.from, tag);
    if (column) return column.label || column.key;
  }
  return null;
};

const rollsText = (trace: Record<string, unknown>): string => {
  const rolls = (trace.rolls as number[]) ?? [];
  return trace.kept != null && rolls.length > 1 ? `[${rolls.join(', ')}] → ${trace.kept}` : `[${rolls.join(', ')}]`;
};

const rolled = (one: Record<string, unknown>): boolean => one.type === 'check' || (one.type === 'roll' && Boolean(one.by));

export function previewLines(system: System, effectId: string, trace: Record<string, unknown>[]): string[] {
  const shown = trace.filter(one => !one.skipped && (!one.within || rolled(one)));
  const lines: string[] = [];
  for (const one of shown) {
    if (one.type !== 'roll' || !one.by) continue;
    const tags = (one.tags as string[] | undefined) ?? [];
    const title = titleOf('Бросок', tags, system);
    lines.push(`${title}: ${rollsText(one)}${addendsText(addsOf(one))}${one.bonus ? ` + ${one.bonus}` : ''} = ${one.total}`);
  }
  for (const one of shown) {
    if (one.type !== 'check') continue;
    const words = outcomeWords(system, (one.tags as string[] | undefined) ?? []);
    const forced = one.forced != null ? ` (${forcedWords(Number(one.forced), Boolean(one.success))})` : '';
    const named = typeof one.versusTag === 'string' ? `${tagLabel(system, one.versusTag, system.effects?.[effectId]?.params) ?? one.versusTag} ` : '';
    const against = typeof one.versusTag === 'string' && isSecret(fieldOf(system, one.versusTag)) ? named.trim() : `${named}${one.versus}`;
    lines.push(`против ${against}: ${one.success ? words.success : words.fail}${forced}`);
  }
  return lines;
}

export function describeEntry(
  entry: { fromId: string; toId: string; report: any },
  system: System, sheets: Sheet[],
): string {
  const { head, lines } = describeParts(entry, system, sheets);
  return lines.length ? `${head} · ${lines.join(' · ')}` : head;
}

export function describeParts(
  entry: { fromId: string; toId: string; report: any },
  system: System, sheets: Sheet[],
): { head: string; lines: string[] } {
  const nameOf = (id: string) => sheets.find(s => s.id === id)?.name ?? id;
  const label = String(entry.report.label ?? '') || effectLabelOf(system, entry.report.effect);
  const head = entry.fromId === entry.toId
    ? `${nameOf(entry.fromId)} применяет «${label}»`
    : entry.report.reply
      ? `${nameOf(entry.fromId)} отвечает «${label}» по ${nameOf(entry.toId)}`
      : `${nameOf(entry.fromId)} применяет «${label}» по ${nameOf(entry.toId)}`;

  const changes = ((entry.report.changes ?? []) as { tag: string; from: unknown; to: unknown }[]).filter(c => !isSecret(fieldOf(system, c.tag)));
  const shown = changes.map(c => `${labelOf(c.tag)}: ${valueWord(c.from)} → ${valueWord(c.to)}`);
  function labelOf(tag: string): string {
    const item = parseItemTag(tag);
    if (item) {
      const column = recordKinds(system).flatMap(([, kind]) => kind.columns ?? []).find(one => one.key === item.column);
      return `${column?.label ?? item.column} (вещь ${item.key})`;
    }
    return tagLabel(system, tag, system.effects?.[String(entry.report.effect)]?.params) ?? tag;
  }
  const effect = system.effects[String(entry.report.effect)] as any;
  const stepOf = (trace: Record<string, unknown>) => (((trace.within ? system.effects[String(trace.within)] : effect) as any)?.steps ?? [])
    .find((step: any, index: number) => String(step.id ?? index) === String(trace.step));
  const params: { key: string; label?: string; kind?: string }[] = effect?.params ?? [];
  const sheetHeads = new Set([
    ...params.filter(p => p.kind === 'sheet').map(p => p.key),
    ...(effect?.steps ?? []).filter((step: any) => splitsTargets(step)).map((step: any) => loopOf(params as never, step)?.key).filter(Boolean) as string[],
    NAMES.holder,
  ]);
  const known = new Map<string, Map<string, string>>();
  const labelsFor = (id: string): Map<string, string> => {
    if (!known.has(id)) {
      const one = system.effects?.[id];
      known.set(id, one ? labelsAt(system, id, { part: 'steps', index: (one.steps ?? []).length }) : new Map());
    }
    return known.get(id)!;
  };
  const labels = labelsFor(String(entry.report.effect));
  const nameLabel = (name: string): string => {
    const dot = name.indexOf('.');
    const rest = dot > 0 ? name.slice(dot + 1) : '';
    const sheet = dot > 0 && !hasField(system, name) && (sheetHeads.has(name.slice(0, dot)) || hasField(system, rest));
    if (sheet) return nameLabel(rest);
    if (name.includes('.') && !hasField(system, name)) {
      const known = labels.get(name);
      if (known) return known;
      const output = outputLabel(name);
      return output !== name ? output : name.split('.').map(labelOf).join(' · ');
    }
    const param = params.find(p => p.key === name);
    if (param) return String(param.label ?? name);
    const source = (effect?.steps ?? []).find((step: any) => String(step.id) === name);
    if (source?.type === 'roll') return rollTitle(system, ((source.tags ?? []) as unknown[]).filter((tag): tag is string => typeof tag === 'string'), source.by || source.field ? 'бросок' : 'расчёт');
    return labelOf(name);
  };
  const outputLabel = (name: string): string => {
    const [head, ...path] = name.split('.');
    const source = (effect?.steps ?? []).find((step: any) => String(step.id) === head);
    const outputs = (stepRegistry.get(String(source?.type)) as any)?.outputs as
      { path: string; label: string }[] | undefined;
    const found = outputs?.find(o => o.path === (path.length ? `.${path.join('.')}` : ''));
    return found?.label ?? name;
  };
  const refLabel = (ref: any, within?: unknown): string | null => {
    const own = within ? system.effects[String(within)] as any : null;
    const local = own && ref && typeof ref === 'object' && 'expr' in ref ? /^[@#]([\p{L}\p{N}_]+)((?:\.[\p{L}\p{N}_]+)*)$/u.exec(String(ref.expr).trim()) : null;
    if (local) {
      const param = ((own.params ?? []) as { key: string; label?: string; kind?: string }[]).find(p => p.key === local[1]);
      const tail = local[2] ? local[2].slice(1).split('.') : [];
      if (param && !tail.length) return String(param.label ?? param.key);
      if (param?.kind === 'sheet' && tail.length) return labelsFor(String(within)).get(tail.join('.'))?.split(' → ').pop() ?? labelOf(tail[tail.length - 1]!);
      if (param && tail.length) {
        const path = labelsFor(String(within)).get(`${local[1]}${local[2]}`);
        if (path) return path;
      }
    }
    if (typeof ref === 'string') return system.constants?.[ref]?.label ?? system.effects?.[ref]?.label ?? system.tables?.[ref]?.label ?? ref;
    if (!ref || typeof ref !== 'object') return null;
    if ('expr' in ref) {
      const exact = /^[@#]([\p{L}\p{N}_.-]+)$/u.exec(String(ref.expr).trim());
      if (exact) return nameLabel(exact[1]!);
      if (String(ref.expr).includes('(')) return null;
      const needs = new Map<string, string>(
        ((effect?.params ?? []) as { key: string; label?: string }[]).map(p => [String(p.key), String(p.label ?? p.key)]));
      return translateFormula(String(ref.expr), NEUTRAL_WORDS, RU_WORDS).replace(/[@#]([\p{L}\p{N}_.-]+)|[\p{L}\p{N}_-]+/gu,
        (word: string, name?: string) => (name ? nameLabel(name) : needs.get(word) ?? word));
    }
    return null;
  };
  const namedTrace = (trace: Record<string, any>): string | null => {
    const step = stepOf(trace);
    if (trace.type === 'roll' && trace.by) {
      const raw: number[] = Array.isArray(trace.raw) ? trace.raw : [];
      const shown = ((trace.rolls ?? []) as number[])
        .map((v, i) => (raw.length === trace.rolls.length && raw[i] !== v ? `${raw[i]}→${v}` : String(v)))
        .join(', ');
      const rolls = trace.read === 'count' ? `[${shown}] → успехов ${trace.total - trace.bonus - addedOf(trace)}`
        : trace.kept != null && trace.rolls?.length > 1 ? `[${shown}] → ${trace.kept}` : `[${shown}]`;
      const title = rollTitle(system, tagsOfStep(step, trace), 'Бросок');
      const edits = trace.edits?.length ? ` (${trace.edits.join(', ')})` : '';
      const gone = CALL_WORDS.roll.canceled(trace.canceled ?? []);
      const bonus = step?.bonus ? ` + ${refLabel(step.bonus, trace.within) ?? 'Бонус'}: ${trace.bonus}` : trace.bonus ? ` + ${trace.bonus}` : '';
      const parts = trace.parts && Object.keys(trace.parts).length
        ? ' · ' + Object.entries(trace.parts).map(([k, v]) => `${k}: ${v}`).join(', ') : '';
      const verdict = verdictText({ threshold: trace.threshold, under: trace.under === true, success: trace.success, margin: trace.said, degree: trace.degree });
      return `${title}: ${rolls}${edits}${addendsText(addsOf(trace))}${bonus} = ${trace.total}${parts}${verdict}${gone}`;
    }
    if (trace.type === 'check') {
      const versus = typeof trace.versusTag === 'string' ? labelOf(trace.versusTag) : refLabel(step?.versus, trace.within) ?? 'порог';
      const degree = trace.degree !== undefined && trace.degree !== null ? `, степень ${trace.degree}` : '';
      const words = outcomeWords(system, (trace.tags as string[] | undefined) ?? []);
      const forced = trace.forced != null ? ` (${forcedWords(trace.forced, Boolean(trace.success))})` : '';
      const verdict = (trace.success ? words.success : words.fail) + forced + degree;
      const tags = (trace.tags as string[] | undefined) ?? [];
      const title = tags.length ? rollTitle(system, tags, 'Проверка') : refLabel(step?.value) ?? 'Проверка';
      const faced = Array.isArray(trace.faced) ? (trace.faced as FacedTrace[]).map(facedText) : [];
      const secret = typeof trace.versusTag === 'string' && isSecret(fieldOf(system, trace.versusTag));
      const closed = typeof trace.of === 'string' && isSecret(fieldOf(system, trace.of));
      return [...faced, `${title}${closed ? '' : `: ${trace.total}`} против ${versus}${secret ? '' : `: ${trace.versus}`} — ${verdict}`].join(' · ');
    }
    return null;
  };
  const eventLabel = (id: string) => system.effects?.[id]?.label ?? id;
  const idle = (trace: Record<string, unknown>): boolean =>
    (trace.type === 'apply' && trace.from === trace.to) || stepRegistry.get(String(trace.type))?.idle?.(trace, system) === true;
  const secret = (trace: Record<string, unknown>): boolean => typeof trace.target === 'string' && isSecret(fieldOf(system, trace.target));
  const calculation = (entry.report.trace ?? []).flatMap((trace: Record<string, unknown>) => {
    if (trace.skipped || idle(trace) || secret(trace)) return [];
    const named = trace.within && !rolled(trace) ? null : namedTrace(trace);
    if (named) return [named];
    const line = stepRegistry.get(String(trace.type))?.traceLine;
    if (!line) return [];
    const helpers = {
      labelOf, eventLabel,
      tableLabel: (id: string) => system.tables?.[id]?.label ?? id,
      effectLabel: (id: string) => effectLabelOf(system, id),
    };
    try { return [String((line as any)(trace, helpers))]; }
    catch { return []; }
  });

  const reactions = (entry.report.reactions ?? []) as {
    label: string; stopped?: { reason?: string } | null; effects?: string[];
  }[];
  const told = reactions
    .filter(r => !r.stopped)
    .map(r => {
      const hung = (r.effects ?? []).map(id => effectLabelOf(system, id)).join(', ');
      return hung ? `${r.label}: ${hung}` : r.label;
    });

  const stopped = entry.report.stopped as { type: string; reason: string; note?: string } | null;
  const stop = stopped ? (stopped.note || breakReasonWord(stopped.type, stopped.reason)) : '';

  return { head, lines: [...calculation, shown.join(', '), told.join('; '), stop].filter(Boolean) };
}
