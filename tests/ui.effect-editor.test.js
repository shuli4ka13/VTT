import { group, test, eq, ok, deepEq } from './harness.js';
import { state } from '../src/ui/state.js';
import {
  addEffect, deleteEffect, renameEffect, setActivation, setEffect, setTrigger, setArg,
  addParam, deleteParam, setParam, addStep, verdictOf,
} from '../src/ui/effect-editor.js';

// Авторский цикл «внести механику» целиком из интерфейса:
// новый эффект → род → параметры → шаги. Правки редактора — чистые операции
// над state.system, DOM им не нужен, поэтому цикл закрыт тестом, а не только
// руками в браузере.

const eff = id => state.system.effects[id];

group('конструктор эффектов: новая механика с нуля', () => {
  test('«+ активируемый» заводит пустой эффект и делает его активным', () => {
    const before = Object.keys(state.system.effects).length;
    const id = addEffect('manual');
    eq(Object.keys(state.system.effects).length, before + 1);
    eq(state.activeRuleId, id);
    deepEq(eff(id).steps, [], 'шагов ещё нет');
    deepEq(eff(id).params, [], 'параметров ещё нет');
    ok(eff(id).label, 'человеческий лейбл есть сразу');
    deleteEffect(id);
  });

  test('три рода дают три разные нагрузки', () => {
    const manual = addEffect('manual');
    const triggered = addEffect('triggered');
    const passive = addEffect('passive');

    ok(Array.isArray(eff(manual).steps), 'у активируемого — конвейер');
    ok(!eff(manual).modifiers, 'и никаких модификаторов');

    ok(Array.isArray(eff(triggered).steps), 'у триггерного тоже конвейер');
    ok(eff(triggered).trigger, 'и описание, на что он отвечает');

    ok(Array.isArray(eff(passive).modifiers), 'у пассивного — модификаторы');
    ok(!eff(passive).steps, 'и никакого конвейера');

    for (const id of [manual, triggered, passive]) deleteEffect(id);
  });

  test('id эффекта стабилен и не совпадает с существующими', () => {
    const a = addEffect('manual');
    const b = addEffect('manual');
    ok(a !== b);
    ok(a !== 'strike' && b !== 'strike', 'встроенные не задеты');
    deleteEffect(a); deleteEffect(b);
  });

  test('переименование меняет лейбл и не трогает id — как у полей', () => {
    const id = addEffect('manual');
    renameEffect(id, 'Проверка навыка');
    eq(eff(id).label, 'Проверка навыка');
    ok(state.system.effects[id], 'запись на месте под тем же id');
    deleteEffect(id);
  });

  test('удаление эффекта убирает его и вычёркивает из правил комнаты', () => {
    const id = addEffect('passive');
    state.system.room_rules = [...(state.system.room_rules || []), id];
    deleteEffect(id);
    eq(state.system.effects[id], undefined);
    ok(!state.system.room_rules.includes(id), 'висячей ссылки не осталось');
    ok(state.activeRuleId !== id);
  });

  test('смена рода не выбрасывает чужую нагрузку — вернул род, вернулась и она', () => {
    const id = addEffect('manual');
    addStep(id, 'apply');
    eq(eff(id).steps.length, 1);

    setActivation(id, 'passive');
    ok(Array.isArray(eff(id).modifiers), 'появились модификаторы');
    eq(eff(id).steps.length, 1, 'а шаги никуда не делись');

    setActivation(id, 'manual');
    eq(eff(id).steps.length, 1, 'вернулись как были');
    deleteEffect(id);
  });

  group('параметры: стабильный ключ + человеческий лейбл', () => {
    test('добавленный параметр получает машинный ключ, правится лейбл и род', () => {
      const id = addEffect('manual');
      const key = addParam(id);
      const params = eff(id).params;
      eq(params.length, 1);
      eq(params[0].key, key);

      setParam(id, key, 'label', 'Бонус проверки');
      setParam(id, key, 'kind', 'expr');
      eq(params[0].label, 'Бонус проверки');
      eq(params[0].kind, 'expr');

      // Переименование лейбла не меняет ключа — ссылки шагов не ломаются.
      setParam(id, key, 'label', 'Совсем другой лейбл');
      eq(params[0].key, key);
      deleteEffect(id);
    });

    test('сторона «считает цель» ставится и снимается', () => {
      const id = addEffect('manual');
      const key = addParam(id);
      setParam(id, key, 'of', true);
      eq(eff(id).params[0].of, 'target');
      setParam(id, key, 'of', false);
      eq(eff(id).params[0].of, undefined);
      deleteEffect(id);
    });

    test('удаление параметра, на который ссылается шаг, валит приговор, а не молчит', () => {
      const id = addEffect('manual');
      const key = addParam(id);
      setParam(id, key, 'kind', 'expr');
      addStep(id, 'threshold');
      eff(id).steps[0].roll.bonus = { param: key };
      eq(verdictOf(eff(id)).ok, true, 'пока параметр есть — эффект верный');

      deleteParam(id, key);
      const verdict = verdictOf(eff(id));
      eq(verdict.ok, false);
      ok(verdict.text.includes(key), 'приговор называет пропавший параметр');
      deleteEffect(id);
    });
  });

  group('приговор о разборе', () => {
    test('пассивный без модификаторов — не «верный», а внятно пустой', () => {
      const id = addEffect('passive');
      eff(id).modifiers = [];
      const verdict = verdictOf(eff(id));
      eq(verdict.ok, false);
      ok(verdict.text.includes('ничего не делает'));
      deleteEffect(id);
    });

    test('триггер без источника — ошибка: молчащий эффект выглядит рабочим', () => {
      const id = addEffect('triggered');
      const verdict = verdictOf(eff(id));
      eq(verdict.ok, false);
      ok(verdict.text.includes('слушать'), verdict.text);
      deleteEffect(id);
    });

    test('триггер с источником и заполненными аргументами — верный', () => {
      const id = addEffect('triggered');
      setTrigger(id, 'on', 'strike');
      const key = addParam(id);
      setParam(id, key, 'kind', 'dice');
      setArg(id, key, '1d4');
      const verdict = verdictOf(eff(id));
      eq(verdict.ok, true, verdict.text);
      deleteEffect(id);
    });

    test('заготовка нового шага проходит линт своего модуля', () => {
      const id = addEffect('manual');
      for (const type of ['threshold', 'amount', 'compare', 'apply', 'status']) {
        addStep(id, type);
      }
      // Пустые заготовки могут быть недописаны — но приговор обязан говорить
      // об этом внятно, с номером шага, а не падать исключением.
      const verdict = verdictOf(eff(id));
      ok(typeof verdict.ok === 'boolean');
      ok(verdict.text.length > 0);
      deleteEffect(id);
    });
  });

  test('счётчик срабатываний правится числом и не опускается ниже единицы', () => {
    const id = addEffect('triggered');
    setEffect(id, 'duration', 'uses');
    setEffect(id, 'uses', '3');
    deepEq(eff(id).duration, { kind: 'uses', max: 3 });
    setEffect(id, 'uses', '0');
    eq(eff(id).duration.max, 1, 'ноль срабатываний — это не эффект, а пустышка');
    deleteEffect(id);
  });
});
