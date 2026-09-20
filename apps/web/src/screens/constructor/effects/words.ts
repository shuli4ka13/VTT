import type { Step } from '@vtt/schema';

export const ACTIVATIONS = [
  { key: 'manual' as const, label: 'Активируемый', title: 'Жмёшь сам — кнопкой на листе' },
  { key: 'triggered' as const, label: 'Триггерный', title: 'Срабатывает сам' },
  { key: 'reaction' as const, label: 'Реакция', title: 'Стол делает паузу и спрашивает игрока' },
  { key: 'passive' as const, label: 'Пассивный', title: 'Просто висит и правит цифры' },
];

export type EditFn = (slotIndexInGroup: number, change: (draft: Step) => void) => void;
export type WithNumber = (change: (amount: Step, apply: Step, id: string) => void) => void;
