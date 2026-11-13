export const ROLL_CALL = 'roll';

export const CALL_WORDS = {
  roll: {
    label: 'Бросок',
    params: { edits: 'слово из «Правил»', bonus: 'прибавка', count: 'кубики', threshold: 'порог', tags: 'метка броску' },
    canceled: (labels: readonly string[]): string => (labels.length ? ` · погасили друг друга: ${labels.join(', ')}` : ''),
  },
} as const;
