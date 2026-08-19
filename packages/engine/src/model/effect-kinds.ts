export const ACTIVATIONS = {
  manual: {
    label: 'Активируемый',
    icon: '⚔',
    hint: 'Жмёшь сам: кнопка на чарнике. Конвейер шагов.',
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
};

export const DURATIONS = {
  permanent: {
    label: 'Постоянный',
    hint: 'Живёт, пока жив источник: снял предмет — ушёл, выключил из правил комнаты — ушёл.',
    forActivations: ['passive', 'triggered'],
  },
  temporary: {
    label: 'Временный',
    hint: 'Снимается рукой или шагом «состояние» в режиме «снять».',
    forActivations: ['passive', 'triggered'],
  },
  uses: {
    label: 'Счётчик срабатываний',
    hint: 'Сработал — минус один; на нуле спадает сам.',
    forActivations: ['triggered'],
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
