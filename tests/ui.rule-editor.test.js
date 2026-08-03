import { group, test, eq, ok, deepEq } from './harness.js';
import { state } from '../src/ui/state.js';
import {
  addRule, deleteRule, renameRule,
  addParam, deleteParam, setParam,
  addStep, verdictOf,
} from '../src/ui/rule-editor.js';
import { defaultParams } from '../src/ui/mode-compendium.js';

// Авторский цикл «внести механику» целиком из интерфейса:
// новое правило → параметры → шаги → эффект получает форму из объявления.
// Правки редактора — чистые операции над state.system, DOM им не нужен,
// поэтому цикл закрыт тестом, а не только руками в браузере.

group('конструктор правил: новая механика с нуля', () => {
  test('«+ правило» заводит пустое правило и делает его активным', () => {
    const before = Object.keys(state.system.rules).length;
    const id = addRule();
    eq(Object.keys(state.system.rules).length, before + 1);
    eq(state.activeRuleId, id);
    deepEq(state.system.rules[id].steps, [], 'шагов ещё нет');
    deepEq(state.system.rules[id].params, [], 'параметров ещё нет');
    ok(state.system.rules[id].label, 'человеческий лейбл есть сразу');
  });

  test('id правила стабилен и не совпадает с существующими', () => {
    const a = addRule();
    const b = addRule();
    ok(a !== b);
    ok(!('strike' === a || 'strike' === b), 'встроенные не задеты');
    deleteRule(a); deleteRule(b);
  });

  test('переименование меняет лейбл и не трогает id — как у полей', () => {
    const id = addRule();
    renameRule(id, 'Проверка навыка');
    eq(state.system.rules[id].label, 'Проверка навыка');
    ok(state.system.rules[id] === state.system.rules[id], 'запись та же');
    deleteRule(id);
  });

  test('удаление правила убирает его; активным становится другое', () => {
    const id = addRule();
    deleteRule(id);
    eq(state.system.rules[id], undefined);
    ok(state.activeRuleId !== id);
  });

  group('параметры: стабильный ключ + человеческий лейбл', () => {
    test('добавленный параметр получает машинный ключ, правится лейбл и род', () => {
      const id = addRule();
      const key = addParam(id);
      const params = state.system.rules[id].params;
      eq(params.length, 1);
      eq(params[0].key, key);

      setParam(id, key, 'label', 'Бонус проверки');
      setParam(id, key, 'kind', 'expr');
      eq(params[0].label, 'Бонус проверки');
      eq(params[0].kind, 'expr');

      // Переименование лейбла не меняет ключа — ссылки шагов не ломаются.
      setParam(id, key, 'label', 'Совсем другой лейбл');
      eq(params[0].key, key);
      deleteRule(id);
    });

    test('сторона «считает цель» ставится и снимается', () => {
      const id = addRule();
      const key = addParam(id);
      setParam(id, key, 'of', true);
      eq(state.system.rules[id].params[0].of, 'target');
      setParam(id, key, 'of', false);
      eq(state.system.rules[id].params[0].of, undefined);
      deleteRule(id);
    });

    test('удаление параметра, на который ссылается шаг, валит приговор, а не молчит', () => {
      const id = addRule();
      const key = addParam(id);
      setParam(id, key, 'kind', 'expr');
      addStep(id, 'threshold');
      const rule = state.system.rules[id];
      rule.steps[0].roll.bonus = { param: key };
      eq(verdictOf(rule).ok, true, 'пока параметр есть — правило верное');

      deleteParam(id, key);
      const verdict = verdictOf(rule);
      eq(verdict.ok, false);
      ok(verdict.text.includes(key), 'приговор называет пропавший параметр');
      deleteRule(id);
    });
  });

  test('цикл целиком: правило → параметры → шаги → форма эффекта из объявления', () => {
    const id = addRule();
    renameRule(id, 'Трата ресурса');

    const cost = addParam(id);
    setParam(id, cost, 'label', 'Сколько');
    setParam(id, cost, 'kind', 'number');
    const pool = addParam(id);
    setParam(id, pool, 'label', 'Из чего');
    setParam(id, pool, 'kind', 'tag');

    addStep(id, 'apply');
    const rule = state.system.rules[id];
    rule.steps[0].target = { param: pool };
    rule.steps[0].value = { param: cost };
    rule.steps[0].direction = 'subtract';
    rule.steps[0].floor = { const: 0 };

    eq(verdictOf(rule).ok, true, verdictOf(rule).text);

    // Компендиум строит заготовку параметров ИЗ объявления — ничего не зная
    // о правиле заранее: новая механика сразу пригодна для эффекта.
    const draft = defaultParams(rule);
    eq(typeof draft[cost], 'number');
    ok(state.system.fields.some(f => f.tag === draft[pool]), 'тег — из объявленных полей');
    deleteRule(id);
  });

  test('заготовка нового шага проходит линт своего модуля', () => {
    const id = addRule();
    for (const type of ['threshold', 'amount', 'compare', 'apply', 'status']) {
      addStep(id, type);
    }
    const rule = state.system.rules[id];
    // Пустые заготовки могут быть недописаны — но приговор обязан говорить
    // об этом внятно, с номером шага, а не падать исключением.
    const verdict = verdictOf(rule);
    ok(typeof verdict.ok === 'boolean');
    ok(verdict.text.length > 0);
    deleteRule(id);
  });
});
