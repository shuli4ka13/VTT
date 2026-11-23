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

export const DIE_MARK = 'd';

export const dice = (count: number | string | null | undefined, sides: number | string): string =>
  `${count ?? 1}${DIE_MARK}${sides}`;

export const diceSaid = (count: number | string | null | undefined, sides: number | string): string =>
  `${count ?? 1}${DIE_LETTER}${sides}`;

export const diceExample = diceSaid(1, 20);

export const DICE_TEXT = /^(\d+)?\s*d\s*(\d+)$/iu;

const DICE_BARE = new Map<string, RegExp>();

const bareOf = (letters: string): RegExp => {
  if (!DICE_BARE.has(letters)) DICE_BARE.set(letters, new RegExp(`(\\d*)[${letters}](\\d+)`, 'iuy'));
  return DICE_BARE.get(letters)!;
};

export function bareDiceAt(src: string, at: number, letters = 'd'): { end: number; count: number; sides: number } | null {
  const bare = bareOf(letters);
  bare.lastIndex = at;
  const m = bare.exec(src);
  if (!m) return null;
  const end = at + m[0].length;
  if (end < src.length && /[\p{L}\p{N}_.]/u.test(src[end]!)) return null;
  return { end, count: m[1] ? Number(m[1]) : 1, sides: Number(m[2]) };
}

const DICE_TYPED = /^(\d+)?\s*[dдк]\s*(\d+)$/iu;

export const asDice = (text: string): string => {
  const m = DICE_TYPED.exec(text.trim());
  return m ? diceSaid(m[1] ?? 1, m[2]!) : text;
};

export const toDice = (text: string): string => {
  const m = DICE_TYPED.exec(text.trim());
  return m ? dice(m[1] ?? 1, m[2]!) : text;
};

export const FORBIDDEN_STEMS = ['слушател', 'карточк', 'карточе', 'кирпич', 'чарник', 'Шаблон Компендиума', 'рода записей', 'родов записей', 'род записи', 'без рода', 'родов ещё', 'род неизвестен', 'событи', 'потребност', 'отправител', 'получател'] as const;

export const OUTCOME_COLUMNS: Readonly<Record<'success' | 'fail', readonly string[]>> = { success: ['uspeh', 'success'], fail: ['proval', 'fail'] };

export const OUTCOME_WORDS = { success: 'успех', fail: 'провал' } as const;

export const COST_BLOCK = 'plata';

export const COST_BLOCK_LABEL = 'Плата';

export const GEAR_BLOCK = 'snaryazhenie';

export const GEAR_BLOCK_LABEL = 'Снаряжение';

export const SHEET_LISTS = { hanging: 'Висит сейчас', things: 'Снаряжение', actions: 'Действия' } as const;

export const WIDTH_WORDS: Record<number, string> = { 3: 'четверть', 4: 'треть', 6: 'половина', 8: 'две трети', 9: 'три четверти', 12: 'вся ширина' };

export const widthWords = (width: number): string => WIDTH_WORDS[width] ?? `${width}/12`;

const pluralRu = (n: number, one: string, few: string, many: string): string => {
  const tens = n % 100;
  const ones = n % 10;
  if (tens >= 11 && tens <= 14) return many;
  if (ones === 1) return one;
  if (ones >= 2 && ones <= 4) return few;
  return many;
};

export const splitWords = (n: number): string => (n <= 1 ? 'одним списком' : `в ${n} ${pluralRu(n, 'столбец', 'столбца', 'столбцов')}`);

export const perRowWords = (n: number): string => (n === 1 ? 'по одному в строку' : `по ${n} в строку`);

export const DICE_BY_STEP = 'кости бросает шаг «Бросок»: поставьте его перед этим шагом и возьмите его итог по имени шага';
