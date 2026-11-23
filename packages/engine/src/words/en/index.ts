import { NAMES } from './names.ts';
import { TABLES_A } from './tablesA.ts';
import { TABLES_B } from './tablesB.ts';
import { FORMULA } from './formula.ts';
import { STEPS } from './steps.ts';
import { CORE } from './core.ts';
import { EVENTS } from './events.ts';
import { LINT } from './lint.ts';
import { MODEL } from './model.ts';

export const EN: Readonly<Record<string, string>> = { ...NAMES, ...TABLES_A, ...TABLES_B, ...FORMULA, ...STEPS, ...CORE, ...EVENTS, ...LINT, ...MODEL };
