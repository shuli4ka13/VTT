import { translateFormula, diceText, wordsOf, functionSpec, NEUTRAL_WORDS, FORMULA_WORDS, IF } from '@vtt/engine';
import type { FormulaWords, FunctionSpec } from '@vtt/engine';
import { useLocale } from '../store/locale.ts';

export const formulaWords = (): FormulaWords => wordsOf(useLocale.getState().lang);

const escaped = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const everyFunction = (...ids: (keyof FormulaWords['functions'])[]): string =>
  [...new Set(Object.values(FORMULA_WORDS).flatMap(words => ids.map(id => words.functions[id])))].map(escaped).join('|');

export const DIE_LETTERS: string = [...new Set(Object.values(FORMULA_WORDS).flatMap(words => [...words.dieLetters]))].join('');

export const spokenDie = (): string[] => Object.values(FORMULA_WORDS).map(words => words.die).filter(letter => letter !== NEUTRAL_WORDS.die);

export const useFormulaWords = (): FormulaWords => wordsOf(useLocale(state => state.lang));

export const shownFormula = (text: string, words: FormulaWords = formulaWords()): string => translateFormula(text, NEUTRAL_WORDS, words);

export const storedFormula = (text: string, words: FormulaWords = formulaWords()): string => translateFormula(text, words, NEUTRAL_WORDS);

export const shownDice = (text: string, words: FormulaWords = formulaWords()): string => diceText(text, words);

export const functionIdOf = (name: string, words: FormulaWords = formulaWords()): string | null => {
  const low = name.toLowerCase();
  if (low === words.if.toLowerCase() || low === IF) return IF;
  const found = Object.entries(words.functions).find(([id, local]) => local.toLowerCase() === low || id === low);
  return found ? found[0] : null;
};

export const localName = (id: string, words: FormulaWords = formulaWords()): string =>
  (id === IF ? words.if : (words.functions as Record<string, string>)[id] ?? id);

export const localSpec = (name: string, words: FormulaWords = formulaWords()): FunctionSpec | undefined => {
  const id = functionIdOf(name, words);
  const spec = id ? functionSpec(id) : undefined;
  return spec ? { ...spec, name: localName(spec.name, words) } : undefined;
};
