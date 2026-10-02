import type { System } from '../model/types.ts';

export interface Limits {
  handlerDepth: number;
  budget: number;
  settleRounds: number;
  callDepth: number;
}

export const DEFAULT_LIMITS: Limits = { handlerDepth: 4, budget: 32, settleRounds: 8, callDepth: 16 };

export const limitsOf = (system: System): Limits => {
  const own = (system as { limits?: Partial<Limits> }).limits ?? {};
  return { ...DEFAULT_LIMITS, ...own };
};

export const CUT_WORDS = 'цепочка ответов оборвана: дальше отвечать нельзя — предел';
