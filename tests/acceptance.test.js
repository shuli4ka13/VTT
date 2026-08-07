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
import { SAMPLE_SYSTEMS, SAMPLE_WORLDS } from '../src/model/systems.js';

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

    const envelope = send('longsword-item:0', ctx(arven, die(18, 6)));
    ok(!JSON.stringify(envelope).includes('mirra'), 'отправитель о цели не знает');
    deepEq(envelope.steps[0].versus, { tag: 'ac' }, 'класс брони цели отправителем не посчитан — уехал тег');

    const before = calc(system, mirra, 'hp_current', newPass(system, mirra, { compendium }));
    const { sheet, report } = receive(envelope, ctx(mirra, die()));
    const after = calc(system, sheet, 'hp_current', newPass(system, sheet, { compendium }));

    eq(report.trace[0].versus.value, 14, 'класс брони посчитан получателем по его чарнику');
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

    test('в приложении партии нет НИЧЕГО от конструктора — граница по страницам', () => {
      // Раньше граница шла по вкладкам одного файла, теперь — по приложениям:
      // vtt.html вообще не содержит конструктора, не спрятанного, а не подключённого.
      const html = readFileSync(join(repo, 'vtt.html'), 'utf8');
      for (const trace of ['pane-author', 'author-editor', 'uiAddField', 'uiAddGroup', 'uiDelField', 'uiRuleSlot', 'uiKindAdd']) {
        eq(html.includes(trace), false, `${trace} не должен встречаться в приложении партии`);
      }
    });

    test('редактор полей живёт только в приложении автора', () => {
      const html = readFileSync(join(repo, 'constructor.html'), 'utf8');
      ok(html.includes('author-editor'), 'редактор поля — часть конструктора');
      eq(html.includes('pane-player'), false, 'а экрана игрока в конструкторе нет');
      eq(html.includes('pane-table'), false, 'и стола нет');
    });

    test('стол ничего не правит: ни полей, ни правил — только выбирает пару листов', () => {
      const tableCode = readFileSync(join(repo, 'src/ui/mode-table.js'), 'utf8');
      eq(/from\s+'\.\/field-editor\.js'/.test(tableCode), false, 'стол не знает редактора полей');
      eq(/from\s+'\.\/effect-editor\.js'/.test(tableCode), false, 'и конструктора эффектов не знает');
      eq(tableCode.includes('uiEffSlot'), false, 'правка шагов со стола невозможна');
      const html = readFileSync(join(repo, 'vtt.html'), 'utf8');
      const tablePane = html.slice(html.indexOf('id="pane-table"'), html.indexOf('<script'));
      for (const handler of ['uiAddField', 'uiAddGroup', 'uiDelField']) {
        eq(tablePane.includes(handler), false, `${handler} не должен встречаться в разметке стола`);
      }
    });

    test('шаги эффекта правятся в конструкторе систем, и только там', () => {
      // Смена шага меняет ФОРМУ разрешения — по границе режимов это автор.
      const authorCode = readFileSync(join(repo, 'src/ui/mode-author.js'), 'utf8');
      const effectEditorCode = readFileSync(join(repo, 'src/ui/effect-editor.js'), 'utf8');
      const compendiumCode = readFileSync(join(repo, 'src/ui/mode-compendium.js'), 'utf8');

      ok(/from\s+'\.\/effect-editor\.js'/.test(authorCode),
        'конструктор эффектов — часть режима автора');
      ok(/from\s+'\.\.\/model\/amount-sources\.js'/.test(effectEditorCode),
        'словарь источников величины — часть конструктора эффектов');
      ok(effectEditorCode.includes('uiEffSlot'), 'правка слота шага есть у автора');
      for (const [file, code] of [['mode-player.js', playerCode], ['mode-compendium.js', compendiumCode]]) {
        eq(code.includes('uiEffSlot'), false, `${file}: правки шагов нет — негативный контроль`);
        eq(code.includes('uiEffAddStep'), false, `${file}: и добавления шагов нет`);
      }
      // Редактор эффекта рисует ТОЛЬКО параметры: реестр шагов ему не нужен,
      // и первым признаком протечки станет вот этот импорт.
      eq(/from\s+'\.\.\/engine\/steps\//.test(compendiumCode), false,
        'mode-compendium.js не знает реестра шагов');
    });
  });

  group('одна модель, а не две', () => {
    // Перекройка на эффекты закончена только тогда, когда СТАРЫХ секций нет
    // ни в одном образце. Пока они лежат рядом, легко незаметно начать жить
    // на двух форматах: одно место читает `rules`, другое `effects`.
    test('в образцовых системах нет ни rules, ни modifiers', () => {
      for (const sys of SAMPLE_SYSTEMS) {
        eq(sys.rules, undefined, `${sys.name}: конвейеры живут в effects`);
        eq(sys.modifiers, undefined, `${sys.name}: правила комнаты — это room_rules`);
        ok(sys.effects, `${sys.name}: библиотека эффектов обязательна`);
      }
    });

    test('в образцовых компендиумах нет полки эффектов', () => {
      for (const { system: sys, compendium: book } of SAMPLE_WORLDS) {
        eq(book.effects, undefined, `${sys.name}: эффект — закон системы, не запись`);
      }
    });

    test('каждая ссылка образцов бьёт по объявленному эффекту', () => {
      for (const { system: sys, compendium: book } of SAMPLE_WORLDS) {
        for (const id of sys.room_rules || []) {
          ok(sys.effects[id], `${sys.name}: правило комнаты «${id}» ссылается в пустоту`);
        }
        for (const decl of Object.values(sys.records || {})) {
          for (const binding of decl.bindings || []) {
            ok(sys.effects[binding.effect],
              `${sys.name}: привязка рода зовёт эффект «${binding.effect}», которого нет`);
          }
        }
        for (const record of [...book.items, ...book.actions]) {
          for (const act of record.activities || []) {
            ok(sys.effects[act.effect],
              `${sys.name}: активность «${record.id}» зовёт эффект «${act.effect}», которого нет`);
          }
        }
      }
    });

    test('движок не читает старых секций: их нет ни в одном модуле', () => {
      const stale = [
        { name: 'system.rules', re: /\bsystem\.rules\b/ },
        { name: 'system.modifiers', re: /\bsystem\.modifiers\b/ },
        { name: 'compendium.effects', re: /\bcompendium\.effects\b/ },
      ];
      const hits = [];
      for (const file of walk(join(repo, 'src'))) {
        if (file.endsWith('migrate.js')) continue; // единственный, кому положено
        const text = readFileSync(file, 'utf8');
        for (const { name, re } of stale) {
          if (re.test(text)) hits.push(`${file.slice(repo.length + 1)}: ${name}`);
        }
      }
      deepEq(hits, [], 'старый формат читает только миграция');
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
