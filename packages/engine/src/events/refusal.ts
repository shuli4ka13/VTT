import { breakReasonWord } from '../engine/steps/index.ts';
import type { System } from '../model/types.ts';
import { fieldOf } from '../model/sheet-columns.ts';

interface Stopped { type: string; reason?: string; note?: string }

export function refusalWords(
  report: { stopped: unknown; trace: Record<string, unknown>[] } | null | undefined, system: System,
): string | null {
  const stopped = report?.stopped as Stopped | null | undefined;
  if (!stopped) return null;
  if (stopped.note) return stopped.note;
  const short = [...(report?.trace ?? [])].reverse()
    .find(entry => entry.passed === false && typeof entry.of === 'string') as { of: string; value?: number } | undefined;
  if (short) {
    const label = fieldOf(system, short.of)?.label ?? short.of;
    return `не хватает «${label}» (сейчас ${short.value})`;
  }
  return breakReasonWord(stopped.type, String(stopped.reason ?? ''));
}
