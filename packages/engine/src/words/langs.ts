export const LANG_WORDS: Readonly<Record<string, string>> = {
  ru: 'русский', en: 'английский', de: 'немецкий', fr: 'французский', es: 'испанский', it: 'итальянский',
  pt: 'португальский', pl: 'польский', uk: 'украинский', be: 'белорусский', cs: 'чешский', tr: 'турецкий',
  zh: 'китайский', ja: 'японский', ko: 'корейский',
};

export const langWord = (code: string): string => LANG_WORDS[code] ?? code;

export const MAIN_LANG = 'ru';
