import { effectLabelOf } from './actions.ts';
import { breakReasonWord, registry as stepRegistry } from '../engine/steps/index.ts';
import { ownerOf, OWNER_WORDS } from '../engine/owners.ts';
import { outcomeWords, rollName } from '../engine/roll-tags.ts';
import type { System, Sheet } from '../model/types.ts';
import { fieldOf, hasField } from '../model/sheet-columns.ts';
import { recordKinds } from '../model/owned.ts';
import { forcedWords } from '../words/steps.ts';

const tagsOfStep = (step: Record<string, any> | undefined, trace?: Record<string, any>): string[] =>
  (trace?.tags ?? step?.tags ?? (step?.roll?.tags ?? []).filter((t: unknown) => typeof t === 'string')) as string[];

const rollTitle = (tags: string[], fallback: string): string => (tags.length ? `${fallback} (${rollName(tags)})` : fallback);

export function previewLines(system: System, effectId: string, trace: Record<string, unknown>[]): string[] {
  const steps = (system.effects[effectId]?.steps ?? []) as { id?: string | null; side?: string }[];
  const traces = trace.filter(trace => trace.type === 'threshold' && !trace.skipped && !trace.within);
  const sideOf = (trace: Record<string, unknown>): string => {
    const step = steps.find((one, index) => String(one.id ?? index) === String(trace.step));
    return String(step?.side ?? 'sender');
  };
  const rollsOf = (trace: Record<string, unknown>): string => {
    const rolls = (trace.rolls as number[]) ?? [];
    return trace.kept != null && rolls.length > 1 ? `[${rolls.join(', ')}] → ${trace.kept}` : `[${rolls.join(', ')}]`;
  };
  const lines: string[] = [];
  for (const trace of traces) {
    if (sideOf(trace) === 'target') continue;
    const tags = (trace.tags as string[] | undefined) ?? [];
    const title = tags.length ? `Бросок (${rollName(tags)})` : 'Бросок';
    lines.push(`${title}: ${rollsOf(trace)}${trace.bonus ? ` + ${trace.bonus}` : ''} = ${trace.total}`);
  }
  for (const trace of traces) {
    const versus = trace.versus as { tag?: string; value?: number } | undefined;
    const named = versus?.tag ? fieldOf(system, versus.tag)?.label ?? versus.tag : 'порог';
    const own = sideOf(trace) === 'target' ? `бросок цели ${rollsOf(trace)} + ${trace.bonus ?? 0} = ${trace.total} ` : '';
    const words = outcomeWords(system, (trace.tags as string[] | undefined) ?? []);
    const forced = trace.forced != null ? ` (${forcedWords(Number(trace.forced), Boolean(trace.success))})` : '';
    lines.push(`${own}против ${named} ${versus?.value}: ${trace.success ? words.success : words.fail}${forced}`);
  }
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
    return `${field?.label ?? c.tag}: ${c.from} → ${c.to}`;
  });
  const labelOf = (tag: string) =>
    fieldOf(system, tag)?.label ?? tag;
  const effect = system.effects[String(entry.report.effect)] as any;
  const stepOf = (trace: Record<string, unknown>) => (effect?.steps ?? [])
    .find((step: any, index: number) => String(step.id ?? index) === String(trace.step));
  const nameLabel = (name: string): string => {
    const owned = ownerOf(name);
    if (owned) return `${nameLabel(owned.rest)} ${OWNER_WORDS[owned.owner]}`;
    if (name.includes('.') && !hasField(system, name)) return outputLabel(name);
    const params: { key: string; label?: string }[] = effect?.params ?? [];
    const param = params.find(p => p.key === name);
    return param ? String(param.label ?? name) : labelOf(name);
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
    if (!ref || typeof ref !== 'object') return null;
    if ('param' in ref) return effect?.params?.find((p: any) => p.key === ref.param)?.label ?? String(ref.param);
    if ('tag' in ref) return labelOf(String(ref.tag));
    if ('prop' in ref) {
      for (const [, kind] of recordKinds(system)) {
        const prop = kind.columns?.find(p => p.key === ref.prop);
        if (prop) return prop.label ?? String(ref.prop);
      }
      return String(ref.prop);
    }
    if ('constant' in ref) return system.constants?.[String(ref.constant)]?.label ?? String(ref.constant);
    if ('expr' in ref) {
      const exact = /^[@#]([\p{L}\p{N}_.-]+)$/u.exec(String(ref.expr).trim());
      if (exact) return nameLabel(exact[1]!);
      const needs = new Map<string, string>(
        ((effect?.params ?? []) as { key: string; label?: string }[]).map(p => [String(p.key), String(p.label ?? p.key)]));
      return String(ref.expr).replace(/[@#]([\p{L}\p{N}_.-]+)|[\p{L}\p{N}_-]+/gu,
        (word: string, name?: string) => (name ? nameLabel(name) : needs.get(word) ?? word));
    }
    return null;
  };
  const namedTrace = (trace: Record<string, any>): string | null => {
    const step = stepOf(trace);
    if (trace.type === 'threshold') {
      const raw: number[] = Array.isArray(trace.raw) ? trace.raw : [];
      const shown = ((trace.rolls ?? []) as number[])
        .map((v, i) => (raw.length === trace.rolls.length && raw[i] !== v ? `${raw[i]}→${v}` : String(v)))
        .join(', ');
      const rolls = trace.kept != null && trace.rolls?.length > 1 ? `[${shown}] → ${trace.kept}` : `[${shown}]`;
      const check = rollTitle(tagsOfStep(step, trace), 'Проверка');
      const edits = trace.edits?.length ? ` (${trace.edits.join(', ')})` : '';
      const bonus = step?.roll?.bonus ? ` + ${refLabel(step.roll.bonus) ?? 'Бонус'}: ${trace.bonus}` : '';
      const versus = trace.versus?.tag ? labelOf(String(trace.versus.tag))
        : (refLabel(step?.versus) ?? 'порог');
      const degree = trace.degree !== undefined && trace.degree !== null ? `, степень ${trace.degree}` : '';
      const words = outcomeWords(system, tagsOfStep(step, trace));
      const forced = trace.forced != null ? ` (${forcedWords(trace.forced, Boolean(trace.success))})` : '';
      const verdict = (trace.success ? words.success : words.fail) + forced + degree;
      return `${check}: ${rolls}${edits}${bonus} = ${trace.total} против ${versus}: ${trace.versus?.value} — ${verdict}`;
    }
    if (trace.type === 'amount') {
      const terms: string[] = [];
      const own = trace.rolls?.length && trace.notation;
      if (own) {
        const value = trace.rolls.reduce((sum: number, die: number) => sum + die, 0);
        terms.push(`${refLabel(step?.dice) ?? 'Бросок'}: ${value}`);
      }
      const thrown = trace.rolls?.length && !own ? ` [${trace.rolls.join(', ')}]` : '';
      if (step?.fixed !== undefined) terms.push(`${refLabel(step.fixed) ?? 'Значение'}${thrown}: ${trace.flat}`);
      if (step?.bonus !== undefined) terms.push(`${refLabel(step.bonus) ?? 'Бонус'}: ${trace.bonus}`);
      if (step?.margin !== undefined) terms.push(`${refLabel(step.margin) ?? 'Запас'}: ${trace.margin}`);
      const sum = terms.join(' + ') || '0';
      if (trace.share === undefined || trace.share === null) {
        return terms.length === 1 && trace.total === trace.rolls?.reduce?.((a: number, b: number) => a + b, 0)
          ? sum : `${sum} = ${trace.total}`;
      }
      const share = trace.share === 0.5 ? 'половина' : `доля ${trace.share}`;
      return `${sum} = ${trace.full} → ${share}: ${trace.total}`;
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
