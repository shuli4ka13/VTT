import { group, test, eq, ok, deepEq, deepSame, throws } from './harness.ts';
import { serializeSheet, deserializeSheet } from '../src/model/serialize.ts';
import { calc, calcAll, newPass } from '../src/engine/calc.ts';
import { CycleError } from '../src/engine/errors.ts';
import { send, receive } from '../src/events/envelope.ts';
import { system, arven, mirra, sheets, compendium } from './fixtures.ts';
import { SAMPLE_SYSTEMS, SAMPLE_WORLDS } from '../src/model/systems.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

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
        ok(['number', 'boolean', 'string'].includes(typeof value), 'в листе только скаляры');
      }
    }
  });

  test('2. переименование label любого поля не ломает ни одной формулы', () => {
    const renamed = {
      ...system,
      fields: system.fields.map(f => ({ ...f, label: `Переименовано ${f.tag}` })),
    };
    for (const sheet of sheets) {
      deepEq(all(renamed, sheet), all(system, sheet), `лист ${sheet.id}`);
    }
  });

  test('3. новый стат и новый предмет с бонусом добавляются только правкой данных', () => {

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

  test('4. два листа разных персонажей считаются по одной и той же системе', () => {
    eq(arven.systemId, mirra.systemId);
    const a = all(system, arven);
    const b = all(system, mirra);
    deepEq(Object.keys(a), Object.keys(b), 'набор полей один и тот же');
    ok(a.ac !== b.ac && a.athletics !== b.athletics, 'а значения разные');
    eq(a.ac, 16);
    eq(b.ac, 14);
  });

  test('5. событие от одного листа меняет значение у второго, расчёт — у получателя', () => {
    const die = (...values) => { const q = [...values]; return () => q.shift(); };
    const ctx = (sheet, d) => ({ system, sheet, compendium, die: d });

    const envelope = send('longsword-item:0', ctx(arven, die(18, 6)));
    ok(!JSON.stringify(envelope).includes('mirra'), 'отправитель о цели не знает');
    deepEq(envelope.steps[0].versus, { tag: 'ac' }, 'класс брони цели отправителем не посчитан — уехал тег');

    const before = calc(system, mirra, 'hp_current', newPass(system, mirra, { compendium }));
    const { sheet, report } = receive(envelope, ctx(mirra, die()));
    const after = calc(system, sheet, 'hp_current', newPass(system, sheet, { compendium }));

    eq(report.trace[0].versus.value, 14, 'класс брони посчитан получателем по его листу');
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

const inNode = typeof process !== 'undefined' && !!(process.versions && process.versions.node);

if (inNode) {
  const { readdirSync, readFileSync, statSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { join, dirname } = await import('node:path');

  const repo = dirname(dirname(fileURLToPath(import.meta.url)));

  const FORBIDDEN = [
    { name: 'ev' + 'al()', re: new RegExp('\\b' + 'ev' + 'al' + '\\s*\\(') },
    { name: 'new Func' + 'tion()', re: new RegExp('new\\s+' + 'Func' + 'tion' + '\\s*\\(') },
    { name: 'Func' + 'tion() как конструктор кода', re: new RegExp('[^.\\w]' + 'Func' + 'tion' + '\\s*\\(\\s*[\'"`]') },
  ];

  const SKIP_DIRS = new Set(['reference', 'files', 'node_modules', '.git', 'docs']);

  group('одна модель, а не две', () => {

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
        if (file.endsWith('migrate.ts')) continue;
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

group('образец D&D: урон сперва съедает временные хиты', () => {
  const world = SAMPLE_WORLDS[0]!;
  const dnd = world.system as System;

  const hurt = (values: Record<string, number>, amount: number) => {
    const mirra = (world.sheets as Sheet[]).find(s => s.id === 'mirra')!;
    const target = { ...mirra, values: { ...mirra.values, ...values } };
    const sender = (world.sheets as Sheet[]).find(s => s.id === 'arven')!;
    const out = receive(
      {
        kind: 'effect', effect: 'урон', from: sender.id, action: 'проба', label: 'Урон',
        steps: [{ type: 'emit', event: 'damage', amount: { const: amount }, tags: ['рубящий'] }],
      } as never,
      { system: dnd, compendium: world.compendium as Compendium, die: () => 1, sheet: target },
    );
    return out.sheet.values;
  };

  test('временные хиты уходят первыми, остаток бьёт по текущим', () => {
    const little = hurt({ hp_temp: 10, hp_current: 20 }, 4);
    eq(little.hp_temp, 6, 'урон 4 съел четыре временных');
    eq(little.hp_current, 20, 'до текущих не дошло');

    const big = hurt({ hp_temp: 3, hp_current: 20 }, 10);
    eq(big.hp_temp, 0);
    eq(big.hp_current, 13, 'перебор 7 ушёл в текущие');
  });

  test('без временных хитов урон идёт прямо в текущие', () => {
    const plain = hurt({ hp_temp: 0, hp_current: 20 }, 6);
    eq(plain.hp_current, 14);
  });
});
