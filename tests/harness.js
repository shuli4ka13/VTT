// Крошечный тест-харнесс. Работает и в браузере (tests.html), и в node (tests/run.js).
// Фреймворков нет намеренно — см. жёсткие запреты стека в CLAUDE.md.

const results = [];
let currentGroup = null;

export function group(name, fn) {
  const prev = currentGroup;
  currentGroup = prev ? `${prev} › ${name}` : name;
  try { fn(); } finally { currentGroup = prev; }
}

export function test(name, fn) {
  const full = currentGroup ? `${currentGroup} › ${name}` : name;
  try {
    fn();
    results.push({ ok: true, name: full });
  } catch (err) {
    results.push({ ok: false, name: full, err });
  }
}

class AssertionError extends Error {}

function fail(message) {
  throw new AssertionError(message);
}

function show(v) {
  if (typeof v === 'string') return JSON.stringify(v);
  if (v instanceof Error) return `${v.name}: ${v.message}`;
  try { return JSON.stringify(v); } catch { return String(v); }
}

export function eq(actual, expected, note) {
  if (!Object.is(actual, expected)) {
    fail(`${note ? note + ': ' : ''}ожидалось ${show(expected)}, получено ${show(actual)}`);
  }
}

export function deepEq(actual, expected, note) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) fail(`${note ? note + ': ' : ''}ожидалось ${b}, получено ${a}`);
}

// Структурное равенство БЕЗ учёта порядка ключей.
// deepEq сравнивает через JSON.stringify и потому чувствителен к порядку —
// это удобно для деревьев разбора и вредно для сравнения данных чарника.
export function deepSame(actual, expected, note) {
  const path = diff(actual, expected, '');
  if (path) fail(`${note ? note + ': ' : ''}расхождение в ${path}`);
}

function diff(a, b, path) {
  if (Object.is(a, b)) return null;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    return `${path || 'значении'} (${show(a)} против ${show(b)})`;
  }
  if (Array.isArray(a) !== Array.isArray(b)) return `${path} (массив против объекта)`;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return `${path}.length (${a.length} против ${b.length})`;
    for (let i = 0; i < a.length; i++) {
      const inner = diff(a[i], b[i], `${path}[${i}]`);
      if (inner) return inner;
    }
    return null;
  }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (!(key in a)) return `${path}.${key} (нет слева)`;
    if (!(key in b)) return `${path}.${key} (нет справа)`;
    const inner = diff(a[key], b[key], `${path}.${key}`);
    if (inner) return inner;
  }
  return null;
}

export function ok(value, note) {
  if (!value) fail(note || `ожидалось истинное значение, получено ${show(value)}`);
}

// Проверяет, что fn бросает. match — подстрока сообщения или класс ошибки.
export function throws(fn, match, note) {
  let thrown = null;
  try { fn(); } catch (err) { thrown = err; }
  if (!thrown) fail(`${note ? note + ': ' : ''}ожидалась ошибка, но её не было`);
  if (typeof match === 'function' && !(thrown instanceof match)) {
    fail(`${note ? note + ': ' : ''}ожидалась ошибка ${match.name}, получена ${show(thrown)}`);
  }
  if (typeof match === 'string' && !String(thrown.message).includes(match)) {
    fail(`${note ? note + ': ' : ''}сообщение должно содержать ${show(match)}, получено ${show(thrown.message)}`);
  }
  return thrown;
}

export function report() {
  const failed = results.filter(r => !r.ok);
  for (const r of results) {
    if (r.ok) console.log(`  ✓ ${r.name}`);
    else console.log(`  ✗ ${r.name}\n      ${r.err && r.err.message}`);
  }
  console.log(`\n${results.length - failed.length}/${results.length} прошло`);
  if (failed.length) console.log(`ПРОВАЛЕНО: ${failed.length}`);
  else console.log('ВСЁ ЗЕЛЁНОЕ');
  return { total: results.length, failed: failed.length };
}
