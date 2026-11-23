import { group, test, deepEq, eq, ok } from './harness.ts';
import '../src/index.ts';
import '../src/samples.ts';
import { EN } from '../src/words/en/index.ts';
import { inTongue, live, liveWords, said, setTongue, sourceOf, tongue, tr } from '../src/words/tongue.ts';
import { NAME_LABELS, everyLabel } from '../src/words/names.ts';
import { scan, places } from './tongue.scan.ts';

const found = scan();
const wanted = new Set([...found.phrases.map(phrase => phrase.id), ...liveWords()]);

group('второй язык движка: русская фраза в коде, английская — по ней', () => {
  test('каждый русский литерал движка помечен: шаблон tr, таблица live или названное исключение', () => {
    deepEq(found.unmarked, []);
  });

  test('помеченная фраза считается при вызове, а не при загрузке модуля', () => {
    deepEq(found.frozen, []);
  });

  test('у каждой фразы есть английская', () => {
    const missing = [...wanted].filter(id => !EN[id]?.trim());
    deepEq(missing.slice(0, 40), [], `без перевода фраз: ${missing.length}`);
  });

  test('в английской таблице нет фраз, которых в коде уже нет', () => {
    deepEq(Object.keys(EN).filter(id => !wanted.has(id)).slice(0, 40), []);
  });

  test('места подстановки в английской фразе те же, что в русской', () => {
    const off = Object.entries(EN).filter(([id, text]) => places(id).join() !== places(text).join()).map(([id]) => id);
    deepEq(off.slice(0, 40), []);
  });

  test('в английской фразе нет русских букв', () => {
    deepEq(Object.entries(EN).filter(([, text]) => /[\u0400-\u04FF]/u.test(text)).map(([id]) => id).slice(0, 40), []);
  });
});

group('второй язык движка: как он выбирается', () => {
  test('по умолчанию русский; inTongue ставит язык на время вызова и возвращает прежний, даже при отказе', () => {
    eq(tongue(), 'ru');
    eq(inTongue('en', () => tongue()), 'en');
    eq(inTongue('de', () => tongue()), 'en');
    eq(inTongue(undefined, () => tongue()), 'ru');
    try { inTongue('en', () => { throw new Error('x'); }); } catch { ok(true); }
    eq(tongue(), 'ru');
  });

  test('фраза без перевода остаётся русской, места подстановки переставляются', () => {
    const name = 'A';
    const n = 2;
    eq(tr`нет такой фразы для ${name}: ${n}`, 'нет такой фразы для A: 2');
    eq(inTongue('en', () => tr`нет такой фразы для ${name}: ${n}`), 'нет такой фразы для A: 2');
  });

  test('таблица слов следует за языком сама, исходная русская достаётся отдельно', () => {
    const table = live({ key: 'roll', label: 'нет такой подписи', inner: [{ label: 'и такой нет' }] });
    eq(table.key, 'roll');
    eq(table.label, 'нет такой подписи');
    eq(sourceOf(table).label, 'нет такой подписи');
    deepEq(JSON.parse(JSON.stringify(table)), { key: 'roll', label: 'нет такой подписи', inner: [{ label: 'и такой нет' }] });
    eq(said('нет такой подписи'), 'нет такой подписи');
  });

  test('служебное имя знает свои названия на всех языках', () => {
    eq(NAME_LABELS.holder, 'носитель');
    ok(everyLabel('holder').includes('носитель'));
    deepEq(everyLabel('нет такого'), []);
  });

  test('умолчание ставит только браузер и снимает сам', () => {
    setTongue('en');
    eq(tongue(), 'en');
    setTongue('ru');
    eq(tongue(), 'ru');
  });
});
