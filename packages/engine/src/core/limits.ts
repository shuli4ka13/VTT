import type { System } from '../model/types.ts';

export interface Limits {
  handlerDepth: number;
  budget: number;
  settleRounds: number;
  callDepth: number;
  probes: number;
}

export const DEFAULT_LIMITS: Limits = { handlerDepth: 4, budget: 32, settleRounds: 8, callDepth: 16, probes: 8 };

export const limitsOf = (system: System): Limits => {
  const own = (system as { limits?: Partial<Limits> }).limits ?? {};
  return { ...DEFAULT_LIMITS, ...own };
};

export const CUT_WORDS = 'цепочка ответов оборвана: дальше отвечать нельзя — предел';

export const PROBES_WORDS = 'остальным реакции в этом окне не предлагаются: предел пересчётов';
