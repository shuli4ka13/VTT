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
