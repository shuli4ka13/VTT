import { group, test, eq, ok } from './harness.js';
import { state } from '../src/ui/state.js';
import { addRoll, renameRoll, deleteRoll } from '../src/ui/mode-author.js';

// Мишени бросков (system.rolls: атака, спасбросок...) читались в полудюжине
// мест — слот «Мишень модификаторов» шага «порог», правила комнаты,
// заготовки эффектов — но объявить свою из интерфейса было нельзя. Как
// у поля: стабильный тег генерируется при создании, правится только лейбл,
// удаление проверяет ссылки — иначе конвейер молча ссылался бы в никуда.

group('редактор мишеней бросков (system.rolls)', () => {
  test('новая мишень получает стабильный тег и редактируемый лейбл', () => {
    const before = state.system.rolls.length;
    const tag = addRoll();
    eq(state.system.rolls.length, before + 1);
    ok(state.system.rolls.some(r => r.tag === tag));

    renameRoll(tag, 'Проверка инициативы');
    eq(state.system.rolls.find(r => r.tag === tag).label, 'Проверка инициативы');

    // Переименование не трогает тег — как у полей.
    renameRoll(tag, 'Совсем другое имя');
    ok(state.system.rolls.some(r => r.tag === tag), 'тег тот же, запись на месте');

    deleteRoll(tag);
    ok(!state.system.rolls.some(r => r.tag === tag));
  });

  test('тег новой мишени не сталкивается с существующими и с полями', () => {
    const a = addRoll();
    const b = addRoll();
    ok(a !== b);
    ok(!state.system.fields.some(f => f.tag === a), 'своя область имён, не полевая');
    deleteRoll(a); deleteRoll(b);
  });

  test('удаление мишени, на которую нацелено правило комнаты, отказано', () => {
    const tag = addRoll();
    state.system.modifiers.push({
      id: 'rule_test_roll_guard', label: '', kind: 'roll',
      target: tag, effect: 'advantage', method: 'rerollBest', condition: '',
    });
    deleteRoll(tag);
    ok(state.system.rolls.some(r => r.tag === tag), 'запись жива — правило комнаты ссылается на неё');

    state.system.modifiers = state.system.modifiers.filter(m => m.id !== 'rule_test_roll_guard');
    deleteRoll(tag);
    ok(!state.system.rolls.some(r => r.tag === tag), 'ссылок не осталось — удаление прошло');
  });

  test('удаление мишени, на которую нацелен модификатор записи компендиума, отказано', () => {
    const tag = addRoll();
    state.compendium.effects.push({
      id: 'roll-guard-test-effect', rk: 'effect', label: 'Тест', description: '',
      modifiers: [{ kind: 'roll', target: tag, effect: 'disadvantage', method: 'rerollBest', condition: null }],
    });
    deleteRoll(tag);
    ok(state.system.rolls.some(r => r.tag === tag), 'запись компендиума держит ссылку');

    state.compendium.effects = state.compendium.effects.filter(e => e.id !== 'roll-guard-test-effect');
    deleteRoll(tag);
    ok(!state.system.rolls.some(r => r.tag === tag));
  });

  test('удаление мишени, на которую ссылается слот «Мишень модификаторов» шага правила, отказано', () => {
    const tag = addRoll();
    const ruleId = Object.keys(state.system.rules)[0];
    const rule = state.system.rules[ruleId];
    const step = rule.steps.find(s => s.type === 'threshold');
    const savedCheck = step.roll.check;
    step.roll.check = tag;

    deleteRoll(tag);
    ok(state.system.rolls.some(r => r.tag === tag), 'шаг правила ссылается на мишень');

    step.roll.check = savedCheck;
    deleteRoll(tag);
    ok(!state.system.rolls.some(r => r.tag === tag));
  });
});
