import { callHappening } from '../events/happenings.ts';
import { live } from '../words/tongue.ts';
export type LaunchKind = 'manual' | 'passive' | 'auto';

export interface Launch {
  kind: LaunchKind;
  moment: 'before' | 'after';
  confirm: boolean;
}

export const LAUNCHES: Record<LaunchKind, { label: string; hint: string }> = live({
  manual: { label: 'Кнопкой', hint: 'Игрок нажимает сам: кнопка на листе из записи или самого эффекта.' },
  passive: { label: 'Висит и правит', hint: 'Ничего не делает сам — пока надет или наложен, правит цифры и броски.' },
  auto: { label: 'Срабатывает сам', hint: 'Слушает чужое действие или момент и запускается: молча или спросив игрока.' },
});

type Launchable = {
  activation?: string | null;
  modifiers?: unknown[] | null;
  on?: { on?: string; confirm?: boolean }[] | null;
} | null | undefined;

export function launchOf(effect: Launchable): Launch {
  if ((effect?.activation ?? 'manual') !== 'passive') return { kind: 'manual', moment: 'after', confirm: false };
  const first = effect?.on?.[0];
  if (!first || effect?.modifiers?.length) return { kind: 'passive', moment: 'after', confirm: false };
  return { kind: 'auto', moment: callHappening(first.on)?.phase === 'before' || first.on === 'seen' ? 'before' : 'after', confirm: first.confirm === true };
}

export function activationFor(launch: Launch): 'manual' | 'passive' {
  return launch.kind === 'manual' ? 'manual' : 'passive';
}

export const DURATIONS = live({
  permanent: { label: 'пока не снимут', hint: 'Снимается рукой, шагом «состояние» в режиме «снять» или своим «когда». Выданное вещью живёт, пока вещь на листе.' },
  uses: { label: 'на N срабатываний', hint: 'Сработал — минус один; на нуле спадает сам.' },
  rounds: { label: 'на N раундов боя', hint: 'Спадает в начале раунда через N раундов. Вне боя висит, пока не снимут.' },
  turns: { label: 'на N ходов', hint: 'Спадает в конце или начале N-го хода — носителя или листа из входа, который указан. Вне боя висит, пока не снимут.' },
  combat: { label: 'до конца боя', hint: 'Спадает, когда бой кончился. Раунды и ходы тоже спадают с концом боя.' },
  scene: { label: 'до конца сцены', hint: 'Спадает, когда ведущий закрывает сцену.' },
  minutes: { label: 'на N минут', hint: 'Игровое время: раунд боя — 3 секунды, остальное двигает ведущий «Прошло время».' },
  hours: { label: 'на N часов', hint: 'Игровое время: двигает ведущий «Прошло время».' },
  days: { label: 'на N дней', hint: 'Игровое время: двигает ведущий «Прошло время».' },
});

export const REAPPLY = live({
  ignore: { label: 'второй раз ничего не делает', hint: 'Уже висит — второй раз ничего не делает.' },
  refresh: { label: 'обновляется', hint: 'Повторное наложение сбрасывает счётчик заново.' },
  stack: { label: 'копится', hint: 'Каждое наложение — отдельная запись на листе.' },
});
