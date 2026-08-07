import { group, test, eq, ok } from './harness.js';
import { state } from '../src/ui/state.js';
import { addConstant, renameConstant, deleteConstant, renderConstants } from '../src/ui/dictionaries-editor.js';

// Константы системы (ведущая кость и любая другая) — правились только по
// составу костей УЖЕ существующей записи: завести новую, переименовать
// или удалить было нельзя, а при системе без единой константы секция
// не рисовалась вовсе. Ключ стабилен, как у поля и мишени броска.

group('редактор констант системы', () => {
  test('новая константа-кость получает стабильный ключ и умолчание 1к6', () => {
    const before = Object.keys(state.system.constants).length;
    const name = addConstant();
    eq(Object.keys(state.system.constants).length, before + 1);
    const c = state.system.constants[name];
    eq(c.kind, 'die');
    ok(Array.isArray(c.dice) && c.dice.length === 1);

    renameConstant(name, 'Кость урона');
    eq(state.system.constants[name].label, 'Кость урона');

    deleteConstant(name);
    ok(!(name in state.system.constants));
  });

  test('ключ новой константы не сталкивается с существующей ведущей костью', () => {
    ok('lead_die' in state.system.constants);
    const name = addConstant();
    ok(name !== 'lead_die');
    deleteConstant(name);
  });

  test('удаление константы, на которую ссылается шаг эффекта (roll.die.constant), отказано', () => {
    const name = addConstant();
    const withSteps = Object.values(state.system.effects).find(e => (e.steps || []).some(x => x.type === 'threshold'));
    const step = withSteps.steps.find(s => s.type === 'threshold');
    const saved = step.roll.die.constant;
    step.roll.die.constant = name;

    deleteConstant(name);
    ok(name in state.system.constants, 'шаг правила ссылается на константу');

    step.roll.die.constant = saved;
    deleteConstant(name);
    ok(!(name in state.system.constants));
  });

  test('секция рисуется и без единой константы — с кнопкой добавления', () => {
    const saved = state.system.constants;
    state.system.constants = {};
    const html = renderConstants();
    ok(html.includes('+ константа'), 'кнопка добавления есть даже при пустом словаре');
    state.system.constants = saved;
  });
});
