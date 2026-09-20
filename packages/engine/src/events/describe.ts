import { effectLabelOf } from './envelope.ts';
import { breakReasonWord, registry as stepRegistry } from '../engine/steps/index.ts';
import type { Envelope } from './envelope.ts';
import type { System, Sheet } from '../model/types.ts';

export function previewLines(envelope: Envelope, system: System, dry: { report: { trace: Record<string, any>[] } } | null): string[] {
  const lines: string[] = [];
  for (const step of envelope.steps as Record<string, any>[]) {
    if (step.type !== 'threshold' || !step.rolled) continue;
    const tag = step.check ?? step.roll?.check;
    const check = system.rolls?.find(r => r.tag === tag)?.label ?? 'Бросок';
    const bonus = typeof step.bonus?.const === 'number' ? step.bonus.const + (step.modBonus ?? 0) : (step.modBonus ?? 0);
    const rolls = step.rolled.kept != null && step.rolled.rolls.length > 1
      ? `[${step.rolled.rolls.join(', ')}] → ${step.rolled.kept}` : `[${step.rolled.rolls.join(', ')}]`;
    lines.push(`${check}: ${rolls}${bonus ? ` + ${bonus}` : ''} = ${step.rolled.total + bonus}`);
  }
  const packed = new Set((envelope.steps as Record<string, any>[]).filter(s => s.type === 'threshold' && s.rolled).map(s => String(s.id ?? '')));
  for (const trace of dry?.report.trace ?? []) {
    if (trace.type !== 'threshold' || trace.skipped) continue;
    const versus = trace.versus?.tag
      ? system.fields.find(f => f.tag === trace.versus.tag)?.label ?? trace.versus.tag : 'порог';
    const own = !packed.has(String(trace.step ?? '')) && Array.isArray(trace.rolls)
      ? `бросок цели [${trace.rolls.join(', ')}] + ${trace.bonus ?? 0} = ${trace.total} ` : '';
    lines.push(`${own}против ${versus} ${trace.versus?.value}: ${trace.success ? 'попадание' : 'промах'}`);
  }
  return lines;
}

export function describeEntry(
  entry: { fromId: string; toId: string; report: any },
  system: System, sheets: Sheet[],
): string {
  const nameOf = (id: string) => sheets.find(s => s.id === id)?.name ?? id;
  const label = effectLabelOf(system, entry.report.effect);
  const head = entry.fromId === entry.toId
    ? `${nameOf(entry.fromId)} применяет «${label}»`
    : entry.report.reply
      ? `${nameOf(entry.fromId)} отвечает «${label}» по ${nameOf(entry.toId)}`
      : `${nameOf(entry.fromId)} применяет «${label}» по ${nameOf(entry.toId)}`;

  const changes = (entry.report.changes ?? []) as { tag: string; from: unknown; to: unknown }[];
  const shown = changes.map(c => {
    const field = system.fields.find(f => f.tag === c.tag);
    return `${field?.label ?? c.tag}: ${c.from} → ${c.to}`;
  });
  const labelOf = (tag: string) =>
    system.fields.find(f => f.tag === tag)?.label
    ?? system.rolls?.find(r => r.tag === tag)?.label
    ?? tag;
  const effect = system.effects[String(entry.report.effect)] as any;
  const stepOf = (trace: Record<string, unknown>) => (effect?.steps ?? [])
    .find((step: any, index: number) => String(step.id ?? index) === String(trace.step));
  const refLabel = (ref: any): string | null => {
    if (!ref || typeof ref !== 'object') return null;
    if ('param' in ref) return effect?.params?.find((p: any) => p.key === ref.param)?.label ?? String(ref.param);
    if ('tag' in ref) return labelOf(String(ref.tag));
    if ('prop' in ref) {
      for (const kind of Object.values(system.records ?? {}) as any[]) {
        const prop = kind.props?.find((p: any) => p.key === ref.prop);
        if (prop) return prop.label ?? String(ref.prop);
      }
      return String(ref.prop);
    }
    if ('constant' in ref) return system.constants?.[String(ref.constant)]?.label ?? String(ref.constant);
    if ('ref' in ref) {
      const [head, ...path] = String(ref.ref).split('.');
      const source = (effect?.steps ?? []).find((step: any) => String(step.id) === head);
      const outputs = (stepRegistry.get(String(source?.type)) as any)?.outputs as
        { path: string; label: string }[] | undefined;
      const found = outputs?.find(o => o.path === (path.length ? `.${path.join('.')}` : ''));
      return found?.label ?? String(ref.ref);
    }
    if ('expr' in ref) {
      const exact = /^#([\p{L}\p{N}_-]+)$/u.exec(String(ref.expr).trim());
      return exact ? labelOf(exact[1]!) : String(ref.expr).replace(
        /#([\p{L}\p{N}_-]+)/gu, (_: string, tag: string) => labelOf(tag));
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
      const check = system.rolls?.find(r => r.tag === step?.roll?.check)?.label ?? 'Проверка';
      const edits = trace.edits?.length ? ` (${trace.edits.join(', ')})` : '';
      const bonus = step?.roll?.bonus ? ` + ${refLabel(step.roll.bonus) ?? 'Бонус'}: ${trace.bonus}` : '';
      const versus = trace.versus?.tag ? labelOf(String(trace.versus.tag))
        : (refLabel(step?.versus) ?? 'порог');
      const degree = trace.degree !== undefined && trace.degree !== null ? `, степень ${trace.degree}` : '';
      const verdict = (trace.success ? 'успех' : 'промах') + degree;
      return `${check}: ${rolls}${edits}${bonus} = ${trace.total} против ${versus}: ${trace.versus?.value} — ${verdict}`;
    }
    if (trace.type === 'amount') {
      const terms: string[] = [];
      if (trace.rolls?.length) {
        const value = trace.rolls.reduce((sum: number, die: number) => sum + die, 0);
        terms.push(`${refLabel(step?.dice) ?? 'Бросок'}: ${value}`);
      }
      if (step?.fixed !== undefined) terms.push(`${refLabel(step.fixed) ?? 'Значение'}: ${trace.flat}`);
      if (step?.bonus !== undefined) terms.push(`${refLabel(step.bonus) ?? 'Бонус'}: ${trace.bonus}`);
      if (step?.margin !== undefined) terms.push(`${refLabel(step.margin) ?? 'Запас'}: ${trace.margin}`);
      return `${terms.join(' + ') || '0'} = ${trace.total}`;
    }
    return null;
  };
  const eventLabel = (id: string) => system.events?.[id]?.label ?? id;
  const calculation = (entry.report.trace ?? []).flatMap((trace: Record<string, unknown>) => {
    if (trace.skipped) return [`шаг «${trace.step}» пропущен`];
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

  const stopped = entry.report.stopped as { type: string; reason: string } | null;
  const stop = stopped ? breakReasonWord(stopped.type, stopped.reason) : '';

  const tail = [calculation.join(' · '), shown.join(', '), told.join('; '), stop]
    .filter(Boolean).join(' · ');
  if (!tail) return head;
  return `${head} · ${tail}`;
}
