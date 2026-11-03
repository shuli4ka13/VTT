export const SHEET = { one: 'лист', gen: 'листа', dat: 'листу', prep: 'листе', many: 'листы', manyGen: 'листов' } as const;
export const STEP = { one: 'шаг', gen: 'шага', prep: 'шаге', many: 'шаги', manyGen: 'шагов', manyPrep: 'шагах' } as const;
export const EFFECT = { one: 'эффект', gen: 'эффекта', many: 'эффекты', manyGen: 'эффектов' } as const;
export const RECORD = { one: 'запись', gen: 'записи', many: 'записи', manyGen: 'записей' } as const;
export const RECORD_KIND = { one: 'тип записи', many: 'типы записей', manyGen: 'типов записей' } as const;

export const TABS = {
  sheet: 'Лист',
  rules: 'Правила',
  effects: 'Эффекты',
  records: 'Вещи и умения',
} as const;

export const DIE_LETTER = 'к';

export const dice = (count: number | string | null | undefined, sides: number | string): string =>
  `${count ?? 1}${DIE_LETTER}${sides}`;

export const diceExample = dice(1, 20);

export const DICE_TEXT = /^(\d+)?\s*[dдк]\s*(\d+)$/iu;

const DICE_BARE = /(\d*)[dдк](\d+)/iuy;

export function bareDiceAt(src: string, at: number): { end: number; count: number; sides: number } | null {
  DICE_BARE.lastIndex = at;
  const m = DICE_BARE.exec(src);
  if (!m) return null;
  const end = at + m[0].length;
  if (end < src.length && /[\p{L}\p{N}_.]/u.test(src[end]!)) return null;
  return { end, count: m[1] ? Number(m[1]) : 1, sides: Number(m[2]) };
}

export const asDice = (text: string): string => {
  const m = DICE_TEXT.exec(text.trim());
  return m ? dice(m[1] ?? 1, m[2]!) : text;
};

export const FORBIDDEN_STEMS = ['карточк', 'карточе', 'кирпич', 'чарник', 'Шаблон Компендиума', 'рода записей', 'родов записей', 'род записи', 'без рода', 'родов ещё', 'род неизвестен', 'событи', 'потребност', 'отправител', 'получател'] as const;

export const OUTCOME_COLUMNS = { success: 'успех', fail: 'провал' } as const;

export const COST_BLOCK = 'Плата';

export const SHEET_LISTS = { hanging: 'Висит сейчас', things: 'Снаряжение', actions: 'Действия' } as const;
