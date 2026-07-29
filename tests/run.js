// Точка входа тестов. Одна и та же для браузера (tests.html) и для node (node tests/run.js).
// Порядок импортов = порядок вывода. Новый тест-файл добавлять сюда.

import './formula.lex.test.js';
import './formula.parse.test.js';
import './formula.deps.test.js';
import './formula.evaluate.test.js';
import './formula.api.test.js';
import './model.serialize.test.js';
import './engine.calc.test.js';
import './engine.modifiers.test.js';
import './events.test.js';
import './ui.formula-text.test.js';
import './ui.suggest.test.js';
import './acceptance.test.js';

import { report } from './harness.js';

const { failed } = report();

if (typeof process !== 'undefined' && process.exitCode !== undefined) {
  process.exitCode = failed ? 1 : 0;
}
