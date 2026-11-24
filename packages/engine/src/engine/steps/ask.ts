import { EngineError } from '../errors.ts';
import { isBlank } from '../../model/blank.ts';
import type { StepModule } from './index.ts';
import { STEP_WORDS, ASK_YES, ASK_NO, askDesk, type StepWords } from '../../words/steps.ts';
import { tr } from '../../words/tongue.ts';

export const type = 'ask';
const words: StepWords = STEP_WORDS.ask;
export const { slots, outputs } = words;

export const mayBreak = false;

export const asks = true;

export const icon = '?';
export const stage = (): string => 'check';

const text = (value: unknown, fallback: string): string => (typeof value === 'string' && value.trim() ? value.trim() : fallback);

export function traceLine(t: any, h: any) {
  const who = t.to ? (typeof h?.sheetName === 'function' ? h.sheetName(t.to) : t.to) : askDesk();
  return `${who} — «${t.question}»: ${t.answer ?? '…'}`;
}

export const problems = (step: { question?: unknown }): string | null => (text(step.question, '') ? null : tr`шагу «${words.label}» не вписан вопрос`);

const runner: Pick<StepModule, 'finish'> = {
  finish(step, ctx) {
    const question = text(step.question, '');
    if (!question) throw new EngineError(tr`${ctx.owner || tr`правило`}: шагу «${words.label}» не вписан вопрос`);
    const to = isBlank(step.to) ? null : ctx.sheet(step.to, tr`кого спросить`);
    const yes = text(step.yes, ASK_YES);
    const no = text(step.no, ASK_NO);
    const chosen = ctx.question(to, question, [{ id: ASK_YES, label: yes }, { id: ASK_NO, label: no }]);
    return { value: chosen === ASK_YES, trace: { question, ...(to ? { to } : {}), answer: chosen === null ? null : chosen === ASK_YES ? yes : no }, break: null };
  },
};

export const { finish } = runner;
