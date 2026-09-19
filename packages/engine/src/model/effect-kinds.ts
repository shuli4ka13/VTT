export const ACTIVATIONS = {
  manual: {
    label: 'Активируемый',
    icon: '⚔',
    hint: 'Жмёшь сам: кнопка на листе. Конвейер шагов.',
    payload: 'steps',
  },
  triggered: {
    label: 'Триггерный',
    icon: '⚡',
    hint: 'Срабатывает сам на чужое событие. Конвейер шагов.',
    payload: 'steps',
  },
  passive: {
    label: 'Пассивный',
    icon: '✦',
    hint: 'Висит и правит цифры: бонусы, помеха, сопротивление.',
    payload: 'modifiers',
  },
  reaction: {
    label: 'Реакция',
    icon: '🛡',
    hint: 'Стол делает паузу и спрашивает игрока: применить? Перед чужим действием или после своего броска.',
    payload: 'steps',
  },
};

export type LaunchKind = 'manual' | 'passive' | 'auto';

export interface Launch {
  kind: LaunchKind;
  moment: 'before' | 'after';
  ask: boolean;
}

export const LAUNCHES: Record<LaunchKind, { label: string; hint: string }> = {
  manual: { label: 'Кнопкой', hint: 'Игрок нажимает сам: кнопка на листе из записи или самого эффекта.' },
  passive: { label: 'Висит и правит', hint: 'Ничего не делает сам — пока надет или наложен, правит цифры и броски.' },
  auto: { label: 'Срабатывает сам', hint: 'Слушает чужое действие или событие и запускается: молча или спросив игрока.' },
};

export function launchOf(effect: { activation?: string | null; trigger?: { when?: string; window?: string } | null } | null | undefined): Launch {
  const activation = effect?.activation ?? 'manual';
  if (activation === 'passive') return { kind: 'passive', moment: 'after', ask: false };
  if (activation === 'triggered') return { kind: 'auto', moment: 'after', ask: false };
  if (activation === 'reaction') return { kind: 'auto', moment: 'before', ask: true };
  return { kind: 'manual', moment: 'after', ask: false };
}

export function activationFor(launch: Launch): 'manual' | 'passive' | 'triggered' | 'reaction' {
  if (launch.kind === 'manual') return 'manual';
  if (launch.kind === 'passive') return 'passive';
  return launch.ask ? 'reaction' : 'triggered';
}

export const DURATIONS = {
  permanent: {
    label: 'Постоянный',
    hint: 'Живёт, пока жив источник: снял предмет — ушёл, выключил из правил комнаты — ушёл.',
    forActivations: ['passive', 'triggered', 'reaction'],
  },
  temporary: {
    label: 'Временный',
    hint: 'Снимается рукой или шагом «состояние» в режиме «снять».',
    forActivations: ['passive', 'triggered', 'reaction'],
  },
  uses: {
    label: 'Счётчик срабатываний',
    hint: 'Сработал — минус один; на нуле спадает сам.',
    forActivations: ['triggered', 'reaction'],
  },
  rounds: {
    label: 'Раунды боя',
    hint: 'Спадает в начале раунда через N раундов. Вне боя висит, пока не снимут.',
    forActivations: ['passive', 'triggered'],
  },
  turns: {
    label: 'Ходы владельца',
    hint: 'Спадает в конце N-го своего хода. Вне боя висит, пока не снимут.',
    forActivations: ['passive', 'triggered'],
  },
  scene: {
    label: 'До конца сцены',
    hint: 'Спадает, когда ведущий закрывает сцену.',
    forActivations: ['passive', 'triggered'],
  },
};

export const STACKING = {
  ignore: { label: 'Не накладывается повторно', hint: 'Уже висит — второй раз ничего не делает.' },
  refresh: { label: 'Обновляется', hint: 'Повторное наложение сбрасывает счётчик заново.' },
  stack: { label: 'Копится', hint: 'Каждое наложение — отдельная запись на листе.' },
};

export const TRIGGER_MOMENTS = {
  resolved: {
    label: 'После разрешения на мне',
    hint: 'Событие уже случилось и посчитано; триггер отвечает, но отменить его не может.',
  },
};
