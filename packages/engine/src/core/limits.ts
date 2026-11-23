import type { System } from '../model/types.ts';
import { tr } from '../words/tongue.ts';

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

export const cutWords = (): string => tr`цепочка ответов оборвана: дальше отвечать нельзя — предел`;

export const probesWords = (): string => tr`остальным реакции в этом окне не предлагаются: предел пересчётов`;
