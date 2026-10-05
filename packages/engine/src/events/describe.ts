import { effectLabelOf } from './actions.ts';
import { breakReasonWord, registry as stepRegistry } from '../engine/steps/index.ts';
import { outcomeWords, rollName } from '../engine/roll-tags.ts';
import type { System, Sheet } from '../model/types.ts';
import { fieldOf, hasField, valueWord } from '../model/sheet-columns.ts';
import { forcedWords } from '../words/steps.ts';

const tagsOfStep = (step: Record<string, any> | undefined, trace?: Record<string, any>): string[] =>
  (trace?.tags ?? step?.tags ?? (step?.roll?.tags ?? []).filter((t: unknown) => typeof t === 'string')) as string[];

const rollTitle = (tags: string[], fallback: string): string => (tags.length ? `${fallback} (${rollName(tags)})` : fallback);

const columnLabel = (system: System, key: string): string | null => {
  for (const table of Object.values(system.tables ?? {})) {
    const column = table.columns?.find(c => c.key === key);
    if (column?.label) return column.label;
  }
  return null;
};

const rollsText = (trace: Record<string, unknown>): string => {
  const rolls = (trace.rolls as number[]) ?? [];
  return trace.kept != null && rolls.length > 1 ? `[${rolls.join(', ')}] → ${trace.kept}` : `[${rolls.join(', ')}]`;
};

export function previewLines(system: System, effectId: string, trace: Record<string, unknown>[]): string[] {
  const shown = trace.filter(one => !one.skipped && !one.within);
  const lines: string[] = [];
  for (const one of shown) {
    if (one.type !== 'roll' || !one.by) continue;
    const tags = (one.tags as string[] | undefined) ?? [];
    const title = tags.length ? `Бросок (${rollName(tags)})` : 'Бросок';
    lines.push(`${title}: ${rollsText(one)}${one.bonus ? ` + ${one.bonus}` : ''} = ${one.total}`);
  }
  for (const one of shown) {
    if (one.type !== 'check') continue;
    const words = outcomeWords(system, (one.tags as string[] | undefined) ?? []);
    const forced = one.forced != null ? ` (${forcedWords(Number(one.forced), Boolean(one.success))})` : '';
    const named = typeof one.versusTag === 'string' ? `${fieldOf(system, one.versusTag)?.label ?? columnLabel(system, one.versusTag) ?? one.versusTag} ` : '';
    lines.push(`против ${named}${one.versus}: ${one.success ? words.success : words.fail}${forced}`);
  }
  void effectId;
  return lines;
}

export function describeEntry(
  entry: { fromId: string; toId: string; report: any },
  system: System, sheets: Sheet[],
): string {
  const nameOf = (id: string) => sheets.find(s => s.id === id)?.name ?? id;
  const label = String(entry.report.label ?? '') || effectLabelOf(system, entry.report.effect);
  const head = entry.fromId === entry.toId
    ? `${nameOf(entry.fromId)} применяет «${label}»`
    : entry.report.reply
      ? `${nameOf(entry.fromId)} отвечает «${label}» по ${nameOf(entry.toId)}`
      : `${nameOf(entry.fromId)} применяет «${label}» по ${nameOf(entry.toId)}`;

  const changes = (entry.report.changes ?? []) as { tag: string; from: unknown; to: unknown }[];
  const shown = changes.map(c => {
    const field = fieldOf(system, c.tag);
    return `${field?.label ?? c.tag}: ${valueWord(c.from)} → ${valueWord(c.to)}`;
  });
  const labelOf = (tag: string) =>
    fieldOf(system, tag)?.label ?? columnLabel(system, tag) ?? tag;
  const effect = system.effects[String(entry.report.effect)] as any;
  const stepOf = (trace: Record<string, unknown>) => (effect?.steps ?? [])
    .find((step: any, index: number) => String(step.id ?? index) === String(trace.step));
  const params: { key: string; label?: string; kind?: string }[] = effect?.params ?? [];
  const sheetHeads = new Set([
    ...params.filter(p => p.kind === 'sheet').map(p => p.key),
    ...(effect?.steps ?? []).filter((step: any) => step.type === 'each' && step.as).map((step: any) => String(step.as)),
    'носитель',
  ]);
  const nameLabel = (name: string): string => {
    const dot = name.indexOf('.');
    const rest = dot > 0 ? name.slice(dot + 1) : '';
    const sheet = dot > 0 && !hasField(system, name) && (sheetHeads.has(name.slice(0, dot)) || hasField(system, rest));
    if (sheet) return nameLabel(rest);
    if (name.includes('.') && !hasField(system, name)) {
      const output = outputLabel(name);
      return output !== name ? output : name.split('.').map(labelOf).join(' · ');
    }
    const param = params.find(p => p.key === name);
    if (param) return String(param.label ?? name);
    const source = (effect?.steps ?? []).find((step: any) => String(step.id) === name);
    if (source?.type === 'roll') return rollTitle((source.tags ?? []) as string[], source.by ? 'бросок' : 'расчёт');
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
  const refLabel = (ref: any): string | null => {
    if (typeof ref === 'string') return system.constants?.[ref]?.label ?? system.effects?.[ref]?.label ?? system.tables?.[ref]?.label ?? ref;
    if (!ref || typeof ref !== 'object') return null;
    if ('expr' in ref) {
      const exact = /^[@#]([\p{L}\p{N}_.-]+)$/u.exec(String(ref.expr).trim());
      if (exact) return nameLabel(exact[1]!);
      if (String(ref.expr).includes('(')) return null;
      const needs = new Map<string, string>(
        ((effect?.params ?? []) as { key: string; label?: string }[]).map(p => [String(p.key), String(p.label ?? p.key)]));
      return String(ref.expr).replace(/[@#]([\p{L}\p{N}_.-]+)|[\p{L}\p{N}_-]+/gu,
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
      const rolls = trace.read === 'count' ? `[${shown}] → успехов ${trace.total - trace.bonus}`
        : trace.kept != null && trace.rolls?.length > 1 ? `[${shown}] → ${trace.kept}` : `[${shown}]`;
      const title = rollTitle(tagsOfStep(step, trace), 'Бросок');
      const edits = trace.edits?.length ? ` (${trace.edits.join(', ')})` : '';
      const bonus = step?.bonus ? ` + ${refLabel(step.bonus) ?? 'Бонус'}: ${trace.bonus}` : trace.bonus ? ` + ${trace.bonus}` : '';
      const parts = trace.parts && Object.keys(trace.parts).length
        ? ' · ' + Object.entries(trace.parts).map(([k, v]) => `${k}: ${v}`).join(', ') : '';
      return `${title}: ${rolls}${edits}${bonus} = ${trace.total}${parts}`;
    }
    if (trace.type === 'check') {
      const versus = typeof trace.versusTag === 'string' ? labelOf(trace.versusTag) : refLabel(step?.versus) ?? 'порог';
      const degree = trace.degree !== undefined && trace.degree !== null ? `, степень ${trace.degree}` : '';
      const words = outcomeWords(system, (trace.tags as string[] | undefined) ?? []);
      const forced = trace.forced != null ? ` (${forcedWords(trace.forced, Boolean(trace.success))})` : '';
      const verdict = (trace.success ? words.success : words.fail) + forced + degree;
      const tags = (trace.tags as string[] | undefined) ?? [];
      const title = tags.length ? rollTitle(tags, 'Проверка') : refLabel(step?.value) ?? 'Проверка';
      return `${title}: ${trace.total} против ${versus}: ${trace.versus} — ${verdict}`;
    }
    return null;
  };
  const eventLabel = (id: string) => system.effects?.[id]?.label ?? id;
  const idle = (trace: Record<string, unknown>): boolean =>
    trace.type === 'apply' && trace.from === trace.to;
  const calculation = (entry.report.trace ?? []).flatMap((trace: Record<string, unknown>) => {
    if (trace.skipped || idle(trace)) return [];
    const named = trace.within ? null : namedTrace(trace);
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

  const tail = [calculation.join(' · '), shown.join(', '), told.join('; '), stop]
    .filter(Boolean).join(' · ');
  if (!tail) return head;
  return `${head} · ${tail}`;
}
