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
import './rule.steps.test.js';
import './rule.refs.test.js';
import './rule.lead-die.test.js';
import './rule.step-types.test.js';
import './rule.weapon.test.js';
import './rule.two-systems.test.js';
import './rule.threshold-direction.test.js';
import './rule.break-line.test.js';
import './ui.formula-text.test.js';
import './ui.suggest.test.js';
import './ui.rule-editor.test.js';
import './ui.table.test.js';
import './model.records.test.js';
import './model.advantage.test.js';
import './ui.records-editor.test.js';
import './ui.compendium-defaults.test.js';
import './ui.rolls-editor.test.js';
import './ui.constants-editor.test.js';
import './ui.system-name.test.js';
import './ui.field-default.test.js';
import './ui.tables-editor.test.js';
import './ui.system-templates.test.js';
import './ui.blank-world.test.js';
import './ui.world.test.js';
import './server.test.js';
import './acceptance.test.js';

import { report } from './harness.js';

const { failed } = report();

if (typeof process !== 'undefined' && process.exitCode !== undefined) {
  process.exitCode = failed ? 1 : 0;
}
