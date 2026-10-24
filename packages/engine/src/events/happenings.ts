export const PHASES = {
  before: { label: 'до', note: 'может изменить исход', changes: true },
  after: { label: 'после', note: 'исход уже известен', changes: false },
  done: { label: 'завершено', note: 'один раз после всех целей', changes: false },
} as const satisfies Record<string, { label: string; note: string; changes: boolean }>;

export type Phase = keyof typeof PHASES;

export const SEEN = 'seen';

export const SEEN_LABEL = 'кости выпали';

export const ROLLED = 'rolled';

export const ROLLED_LABEL = 'бросок окончен';

export const ANY_ACTION = '*';

export const isPhase = (value: string): value is Phase => Object.prototype.hasOwnProperty.call(PHASES, value);

export function callHappening(on: string | undefined): { phase: Phase; of: string } | null {
  if (!on) return null;
  const at = on.indexOf(':');
  if (at <= 0) return null;
  const phase = on.slice(0, at);
  const of = on.slice(at + 1);
  return isPhase(phase) && of ? { phase, of } : null;
}

export const happeningOf = (phase: Phase, of: string): string => `${phase}:${of}`;

export const BUILT_IN_NAMES = {
  seen: ['бросающий', 'против'],
  rolled: ['бросающий', 'против'],
  moment: ['ходит'],
  lifecycle: ['лист'],
  field: ['лист'],
} as const;
