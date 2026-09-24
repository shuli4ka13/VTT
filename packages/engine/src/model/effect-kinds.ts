export const ACTIVATIONS = {
  manual: {
    label: 'Кнопкой',
    icon: '⚔',
    hint: 'Жмёшь сам или зовёт другой эффект: цепочка шагов.',
    payload: 'steps',
  },
  passive: {
    label: 'Висит',
    icon: '✦',
    hint: 'Висит на листе: правит цифры и броски, отзывается на то, что случилось.',
    payload: 'modifiers',
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
  auto: { label: 'Срабатывает сам', hint: 'Слушает чужое действие или момент и запускается: молча или спросив игрока.' },
};

type Launchable = {
  activation?: string | null;
  modifiers?: unknown[] | null;
  on?: { phase?: string; ask?: boolean }[] | null;
} | null | undefined;

export function launchOf(effect: Launchable): Launch {
  if ((effect?.activation ?? 'manual') !== 'passive') return { kind: 'manual', moment: 'after', ask: false };
  const first = effect?.on?.[0];
  if (!first || effect?.modifiers?.length) return { kind: 'passive', moment: 'after', ask: false };
  return { kind: 'auto', moment: first.phase === 'before' ? 'before' : 'after', ask: first.ask === true };
}

export function activationFor(launch: Launch): 'manual' | 'passive' {
  return launch.kind === 'manual' ? 'manual' : 'passive';
}

export const DURATIONS = {
  permanent: {
    label: 'Пока не снимут',
    hint: 'Снимается рукой, шагом «состояние» в режиме «снять» или своим «когда». Выданное вещью живёт, пока вещь на листе.',
    forActivations: ['passive'],
  },
  uses: {
    label: 'Счётчик срабатываний',
    hint: 'Сработал — минус один; на нуле спадает сам.',
    forActivations: ['passive'],
  },
  rounds: {
    label: 'Раунды боя',
    hint: 'Спадает в начале раунда через N раундов. Вне боя висит, пока не снимут.',
    forActivations: ['passive'],
  },
  turns: {
    label: 'Ходы',
    hint: 'Спадает в конце или начале N-го хода — своего или того, кто наложил. Вне боя висит, пока не снимут.',
    forActivations: ['passive'],
  },
  combat: {
    label: 'До конца боя',
    hint: 'Спадает, когда бой кончился. Раунды и ходы тоже спадают с концом боя.',
    forActivations: ['passive'],
  },
  scene: {
    label: 'До конца сцены',
    hint: 'Спадает, когда ведущий закрывает сцену.',
    forActivations: ['passive'],
  },
};

export const STACKING = {
  ignore: { label: 'Не накладывается повторно', hint: 'Уже висит — второй раз ничего не делает.' },
  refresh: { label: 'Обновляется', hint: 'Повторное наложение сбрасывает счётчик заново.' },
  stack: { label: 'Копится', hint: 'Каждое наложение — отдельная запись на листе.' },
};
