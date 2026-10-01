export const ACTION_MOMENTS = {
  acting: { before: true, label: 'я действую — до того, как уйдёт цели', asks: 'only', replies: null },
  acted: { before: false, label: 'я подействовал на цель', asks: 'never', replies: 'цели моего действия' },
  done: { before: false, label: 'я совершил действие', note: 'один раз на все цели', asks: 'never', replies: null },
  targeted: { before: true, label: 'на меня действуют — до того, как решится', asks: 'any', replies: null },
  affected: { before: false, label: 'на меня подействовали', asks: 'any', replies: 'тому, кто действовал — ответкой' },
} as const satisfies Record<string, {
  before: boolean; label: string; note?: string; asks: 'only' | 'never' | 'any'; replies: string | null;
}>;

export type ActionMoment = keyof typeof ACTION_MOMENTS;

export const isActionMoment = (on: string | undefined): on is ActionMoment =>
  Boolean(on && Object.prototype.hasOwnProperty.call(ACTION_MOMENTS, on));
