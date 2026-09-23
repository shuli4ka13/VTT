export const SHEET = { one: 'лист', gen: 'листа', dat: 'листу', prep: 'листе', many: 'листы', manyGen: 'листов' } as const;
export const STEP = { one: 'шаг', gen: 'шага', prep: 'шаге', many: 'шаги', manyGen: 'шагов', manyPrep: 'шагах' } as const;
export const EFFECT = { one: 'эффект', gen: 'эффекта', many: 'эффекты', manyGen: 'эффектов' } as const;
export const RECORD = { one: 'запись', gen: 'записи', many: 'записи', manyGen: 'записей' } as const;
export const RECORD_KIND = { one: 'тип записи', many: 'типы записей', manyGen: 'типов записей' } as const;

export const TABS = {
  sheet: 'Лист',
  rules: 'Правила',
  effects: 'Эффекты',
  records: 'Типы записей',
} as const;

export const DIE_LETTER = 'к';

export const dice = (count: number | string | null | undefined, sides: number | string): string =>
  `${count ?? 1}${DIE_LETTER}${sides}`;

export const diceExample = dice(1, 20);

const DICE_TEXT = /^(\d+)?\s*[dдк]\s*(\d+)$/iu;

export const asDice = (text: string): string => {
  const m = DICE_TEXT.exec(text.trim());
  return m ? dice(m[1] ?? 1, m[2]!) : text;
};

export const FORBIDDEN_STEMS = ['карточк', 'карточе', 'кирпич', 'чарник', 'Шаблон Компендиума', 'рода записей', 'родов записей', 'род записи', 'без рода', 'родов ещё', 'род неизвестен', 'событи'] as const;

export const OUTCOME_COLUMNS = { success: 'успех', fail: 'провал' } as const;
