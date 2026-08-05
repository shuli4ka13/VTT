import { group, test, eq } from './harness.js';
import { state, field } from '../src/ui/state.js';
import { addField, setDefault, setType } from '../src/ui/field-editor.js';

// Движок читает value.default, когда в чарнике значения ещё нет (calc.js,
// rule.js) — образец 5e задаёт его данными (характеристики по умолчанию 10),
// но поле, заведённое из конструктора, было обречено на 0/''/false без пути
// это поправить.

group('значение по умолчанию хранимого поля', () => {
  test('numeric поле: default пишется числом', () => {
    const tag = addField('Тест');
    setDefault(tag, '10');
    eq(field(tag).value.default, 10);
    state.system.fields = state.system.fields.filter(f => f.tag !== tag);
  });

  test('boolean поле: default приводится к да/нет', () => {
    const tag = addField('Тест');
    setType(tag, 'boolean');
    setDefault(tag, true);
    eq(field(tag).value.default, true);
    setDefault(tag, false);
    eq(field(tag).value.default, false);
    state.system.fields = state.system.fields.filter(f => f.tag !== tag);
  });

  test('text поле: default — строка', () => {
    const tag = addField('Тест');
    setType(tag, 'text');
    setDefault(tag, 'Человек');
    eq(field(tag).value.default, 'Человек');
    state.system.fields = state.system.fields.filter(f => f.tag !== tag);
  });

  test('нечисловой ввод у числового поля не ломает default — остаётся 0', () => {
    const tag = addField('Тест');
    setDefault(tag, 'абракадабра');
    eq(field(tag).value.default, 0);
    state.system.fields = state.system.fields.filter(f => f.tag !== tag);
  });
});
