export type RollKind = 'one' | 'sum' | 'best' | 'hits' | 'parts';

export const ROLL_KINDS: readonly RollKind[] = ['one', 'sum', 'best', 'hits', 'parts'];

export const ROLL_KIND_WORDS: Readonly<Record<RollKind, string>> = {
  one: 'одна кость',
  sum: 'несколько костей в сумму',
  best: 'набор: берём лучшую',
  hits: 'набор: считаем успехи',
  parts: 'кости с именами',
};

export const ROLL_NUMBER_WORDS = [
  ['bonus', 'прибавка к выпавшему'],
  ['count', 'сколько костей бросить'],
  ['sides', 'сколько граней у кости'],
  ['under', 'порог: выпало не больше'],
  ['over', 'порог: выпало не меньше'],
] as const;

export const rollNumberWord = (number: string): string => ROLL_NUMBER_WORDS.find(([key]) => key === number)?.[1] ?? number;

export const COUNT_BY_ROLL = (rolls: readonly string[]): string =>
  `в ${rolls.length > 1 ? 'бросках' : 'броске'} ${rolls.map(name => `«${name}»`).join(', ')} число костей задаёт поле`;

export const NUMBER_MISFIT = (roll: string, number: string, kind: string): string =>
  `бросок «${roll}»: «${number}» не подходит кости «${kind}» — выберите другое «Число поля — это»`;

export const EDIT_MISFIT = (edit: string, action: string, kinds: readonly string[]): string =>
  `правка броска «${edit}»: «${action}» подходит костям ${kinds.map(kind => `«${kind}»`).join(', ')}, а в системе таких бросков нет — она ничего не изменит`;

export const COUNT_UNREAD = (die: string, rolls: readonly string[]): string =>
  `у кости «${die}» счётчик никто не читает: ${COUNT_BY_ROLL(rolls)}`;

export const EDIT_SIDES_MISFIT = (edit: string, action: string): string =>
  `правка броска «${edit}»: «${action}» не подходит граням ни одной кости системы — она ничего не изменит`;

export const WORD_MISFITS_ROLLS = (word: string, rolls: readonly string[], kinds: readonly string[]): string =>
  `слово «${word}» не подходит броскам, к которым привязана правка (${rolls.map(roll => `«${roll}»`).join(', ')}: ${kinds.join(', ')}) — на них оно ничего не изменит`;

export const TWO_RULES = (rules: readonly string[]): string =>
  `правка ждёт бросок сразу двух правил (${rules.map(rule => `«${rule}»`).join(', ')}) — так не бывает; возьмите «Или хотя бы одно из»`;
