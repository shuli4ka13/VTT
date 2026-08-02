// Критерии приёмки из технического задания, по одному тесту на пункт.
// Этот файл — то, что показывают на ревью.

import { group, test, eq, ok, deepEq, deepSame, throws } from './harness.js';
import { serializeSheet, deserializeSheet } from '../src/model/serialize.js';
import { calc, calcAll, newPass } from '../src/engine/calc.js';
import { CycleError } from '../src/engine/errors.js';
import { send, receive } from '../src/events/envelope.js';
import { system } from '../src/model/system.js';
import { arven, mirra, sheets } from '../src/model/sheets.js';
import { compendium } from '../src/model/compendium.js';

const all = (sys, sheet, book = compendium) =>
  calcAll(sys, sheet, newPass(sys, sheet, { compendium: book }));

group('критерии приёмки', () => {
  test('1. round-trip JSON даёт идентичный объект, вычисленных значений в нём нет', () => {
    for (const sheet of sheets) {
      const json = serializeSheet(sheet);
      eq(serializeSheet(deserializeSheet(json)), json, 'строка совпадает побайтно');
      deepSame(deserializeSheet(json), sheet, 'объект совпадает по содержимому');

      const raw = JSON.parse(json);
      for (const value of Object.values(raw.values)) {
        ok(['number', 'boolean', 'string'].includes(typeof value), 'в чарнике только скаляры');
      }
    }
  });

  test('2. переименование label любого поля не ломает ни одной формулы', () => {
    const renamed = {
      ...system,
      fields: system.fields.map(f => ({ ...f, label: `Переименовано ${f.tag}` })),
    };
    for (const sheet of sheets) {
      deepEq(all(renamed, sheet), all(system, sheet), `чарник ${sheet.id}`);
    }
  });

  test('3. новый стат и новый предмет с бонусом добавляются только правкой данных', () => {
    // Ни строчки в src/engine, src/formula и src/ui ниже не меняется.
    const extended = {
      ...system,
      fields: [
        ...system.fields,
        { tag: 'initiative', label: 'Инициатива', group: 'Атака', value: { kind: 'formula', expr: '#dex_mod + #prof_bonus' } },
      ],
    };
    const book = {
      items: [...compendium.items, {
        id: 'cloak-of-speed',
        label: 'Плащ скорости',
        slot: 'back',
        modifiers: [{ kind: 'value', target: 'initiative', op: 'add', value: 2, stacking: 'sum', condition: null }],
      }],
      effects: compendium.effects,
    };
    const sheet = { ...mirra, equipped: ['cloak-of-speed'] };

    eq(calc(extended, mirra, 'initiative', newPass(extended, mirra, { compendium: book })), 6);
    eq(calc(extended, sheet, 'initiative', newPass(extended, sheet, { compendium: book })), 8);
  });

  test('4. два чарника разных персонажей считаются по одной и той же системе', () => {
    eq(arven.systemId, mirra.systemId);
    const a = all(system, arven);
    const b = all(system, mirra);
    deepEq(Object.keys(a), Object.keys(b), 'набор полей один и тот же');
    ok(a.ac !== b.ac && a.athletics !== b.athletics, 'а значения разные');
    eq(a.ac, 16);
    eq(b.ac, 14);
  });

  test('5. событие от одного чарника меняет значение у второго, расчёт — у получателя', () => {
    const die = (...values) => { const q = [...values]; return () => q.shift(); };
    const ctx = (sheet, d) => ({ system, sheet, compendium, die: d });

    const envelope = send('longsword', ctx(arven, die(18, 6)));
    ok(!JSON.stringify(envelope).includes('mirra'), 'отправитель о цели не знает');
    ok(!('versusValue' in envelope), 'класс брони цели отправителем не посчитан');

    const before = calc(system, mirra, 'hp_current', newPass(system, mirra, { compendium }));
    const { sheet, report } = receive(envelope, ctx(mirra, die()));
    const after = calc(system, sheet, 'hp_current', newPass(system, sheet, { compendium }));

    eq(report.versus.value, 14, 'класс брони посчитан получателем по его чарнику');
    ok(after < before, `значение у получателя изменилось: ${before} → ${after}`);
  });

  test('7. циклическая формула даёт внятную ошибку, а не зависание', () => {
    const looped = {
      ...system,
      fields: system.fields.map(f => f.tag === 'ac'
        ? { ...f, value: { kind: 'formula', expr: '#ac + 1' } }
        : f),
    };
    const err = throws(() => calc(looped, arven, 'ac'), CycleError);
    ok(err.message.includes('ac → ac'), `путь в сообщении: ${err.message}`);
  });
});

// ── критерий 6: поиск по репозиторию ────────────────────────────────────────
// Читает файлы, поэтому выполним только в node. В браузере пункт пропускается —
// об этом сказано вслух, чтобы «зелёное» не выглядело полнее, чем оно есть.

const inNode = typeof process !== 'undefined' && !!(process.versions && process.versions.node);

if (inNode) {
  const { readdirSync, readFileSync, statSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { join, dirname } = await import('node:path');

  const repo = dirname(dirname(fileURLToPath(import.meta.url)));

  // Шаблоны собраны склейкой, чтобы этот файл не находил сам себя по литералу.
  const FORBIDDEN = [
    { name: 'ev' + 'al()', re: new RegExp('\\b' + 'ev' + 'al' + '\\s*\\(') },
    { name: 'new Func' + 'tion()', re: new RegExp('new\\s+' + 'Func' + 'tion' + '\\s*\\(') },
    { name: 'Func' + 'tion() как конструктор кода', re: new RegExp('[^.\\w]' + 'Func' + 'tion' + '\\s*\\(\\s*[\'"`]') },
  ];

  // reference/ — черновик тимлида, он там и есть, ради него всё и затевалось.
  // files/ — исходные документы. Оба к нашему коду отношения не имеют.
  const SKIP_DIRS = new Set(['reference', 'files', 'node_modules', '.git', 'docs']);

  group('граница режимов', () => {
    // Граница проведена импортами, а не стилями: если экран игрока однажды
    // потянет к себе правку состава полей, тест упадёт раньше, чем это заметят
    // на демо.
    const playerCode = readFileSync(join(repo, 'src/ui/mode-player.js'), 'utf8');

    test('экран игрока не импортирует редактор полей', () => {
      eq(/from\s+'\.\/field-editor\.js'/.test(playerCode), false,
        'mode-player.js не должен знать модуль, который правит состав полей');
    });

    test('экран игрока не трогает system.fields', () => {
      eq(/system\.fields\s*(=|\.push|\.splice|\.filter\s*\()/.test(playerCode), false,
        'состав полей правит только режим автора');
    });

    test('в разметке игрока нет ни одной кнопки добавления или удаления поля', () => {
      const html = readFileSync(join(repo, 'index.html'), 'utf8');
      const player = html.slice(html.indexOf('id="pane-player"'), html.indexOf('id="pane-compendium"'));
      for (const handler of ['uiAddField', 'uiAddGroup', 'uiDelField']) {
        eq(player.includes(handler), false, `${handler} не должен встречаться в разметке игрока`);
      }
    });

    test('редактор полей живёт только в разметке автора', () => {
      const html = readFileSync(join(repo, 'index.html'), 'utf8');
      const author = html.slice(html.indexOf('id="pane-author"'), html.indexOf('id="pane-player"'));
      ok(author.includes('author-editor'), 'редактор поля — часть экрана автора');
    });

    test('слот источника урона выбирается в конструкторе систем, и только там', () => {
      // Смена слота меняет ФОРМУ разрешения — по границе режимов это автор.
      const authorCode = readFileSync(join(repo, 'src/ui/mode-author.js'), 'utf8');
      const compendiumCode = readFileSync(join(repo, 'src/ui/mode-compendium.js'), 'utf8');
      ok(/from\s+'\.\.\/model\/damage-sources\.js'/.test(authorCode),
        'словарь источников урона — часть конструктора систем');
      ok(authorCode.includes('uiSetDamageSource'), 'выбор слота есть у автора');
      eq(playerCode.includes('uiSetDamageSource'), false, 'у игрока его нет — негативный контроль');
      eq(compendiumCode.includes('uiSetDamageSource'), false, 'и в компендиуме нет: запись не правит закон');
    });
  });

  group('критерии приёмки', () => {
    test('6. поиск по репозиторию не находит eval и new Function', () => {
      const hits = [];
      for (const file of walk(repo)) {
        const text = readFileSync(file, 'utf8');
        for (const { name, re } of FORBIDDEN) {
          if (re.test(text)) hits.push(`${file.slice(repo.length + 1)}: ${name}`);
        }
      }
      deepEq(hits, [], 'исполнение пользовательского текста как кода запрещено');
    });
  });

  function* walk(dir) {
    for (const entry of readdirSync(dir)) {
      if (entry.startsWith('.') || SKIP_DIRS.has(entry)) continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) yield* walk(full);
      else if (/\.(js|html|css)$/.test(entry)) yield full;
    }
  }
} else {
  console.log('  · критерий 6 (поиск eval по репозиторию) проверяется только через `node tests/run.js`');
}
