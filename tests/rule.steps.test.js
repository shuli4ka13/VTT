import { group, test, eq, ok, deepEq, throws } from './harness.js';
import { registerStepType, registry } from '../src/engine/steps/index.js';
import { packRule, resolveRule } from '../src/engine/rule.js';

// Ядро правил — общий цикл над реестром типов шагов. Эти тесты держат два
// обещания расширяемости:
//   1) новый тип шага добавляется, не тронув ни одного существующего файла,
//      кроме реестра — здесь это доказывается заглушками, которые регистрируются
//      прямо из теста и проходят через ядро без единой правки в нём;
//   2) в ядре нет ни одного ветвления по конкретному типу — сканер ниже ищет
//      имена зарегистрированных типов в исходниках ядра и падает на первом же
//      if (type === '...').

// Минимальная система и чарник: ядру всё равно, что считать, но write должен
// уметь читать текущее значение и умолчание.
const sys = {
  id: 'stub-sys',
  fields: [
    { tag: 'x', label: 'Икс', value: { kind: 'stored', type: 'number', default: 7 } },
    { tag: 'y', label: 'Игрек', value: { kind: 'stored', type: 'number', default: 0 } },
  ],
  // Ядро вешает только ОБЪЯВЛЕННЫЕ эффекты: id из ниоткуда — ошибка,
  // а не тихая ссылка в пустоту. Заглушке тоже нужна библиотека.
  effects: {
    poisoned: { label: 'Отравлен', activation: 'passive', modifiers: [] },
  },
};
const sheet = { id: 'болванчик', systemId: 'stub-sys', values: { x: 5 }, effects: [] };

// ── заглушки: регистрируются здесь, ядро о них не знает ─────────────────────

const echo = {
  type: 'эхо-заглушка',
  label: 'Эхо',
  slots: [],
  pack: step => ({ note: step.note }),
  resolve: step => ({ value: step.note, trace: { note: step.note } }),
};

const stop = {
  type: 'стоп-заглушка',
  label: 'Стоп',
  slots: [],
  pack: () => ({}),
  resolve: () => ({ value: null, trace: { до: 'сюда дошли' }, break: { reason: 'заглушка сказала хватит' } }),
};

const reader = {
  type: 'читатель-заглушка',
  label: 'Читатель',
  slots: [],
  pack: step => ({ of: step.of }),
  resolve: (step, ctx) => ({ value: ctx.results[step.of] * 2, trace: { взял: step.of } }),
};

const writer = {
  type: 'писатель-заглушка',
  label: 'Писатель',
  slots: [],
  pack: step => ({ target: step.target, to: step.to }),
  resolve: (step, ctx) => {
    const from = ctx.read(step.target);
    ctx.write(step.target, step.to);
    return { value: step.to, trace: { было: from, стало: step.to } };
  },
};

const sticker = {
  type: 'наклейка-заглушка',
  label: 'Наклейка',
  slots: [],
  pack: step => ({ status: step.status }),
  resolve: (step, ctx) => { ctx.attach(step.status); return { value: step.status, trace: { повесил: step.status } }; },
};

for (const mod of [echo, stop, reader, writer, sticker]) registerStepType(mod);

const run = steps => {
  const rule = { label: 'Правило из заглушек', steps };
  const packed = packRule(rule, { system: sys, sheet, params: {}, item: null });
  deepEq(JSON.parse(JSON.stringify(packed)), packed, 'упакованная цепочка — чистые данные');
  return resolveRule(packed, { system: sys, sheet });
};

group('ядро правил', () => {
  group('реестр типов шагов', () => {
    test('неизвестный тип шага — внятная ошибка с перечнем известных', () => {
      const err = throws(() => run([{ type: 'котик' }]), 'котик');
      ok(err.message.includes('эхо-заглушка'), 'ошибка перечисляет, что реестр знает');
    });

    test('подделанный тип в пришедшей цепочке ловится и при исполнении', () => {
      const packed = packRule({ steps: [{ id: 'a', type: 'эхо-заглушка', note: 1 }] },
        { system: sys, sheet, params: {}, item: null });
      const forged = JSON.parse(JSON.stringify(packed));
      forged[0].type = 'котик';
      throws(() => resolveRule(forged, { system: sys, sheet }), 'котик');
    });

    test('регистрация неполного модуля — ошибка, а не тихая бомба на потом', () => {
      throws(() => registerStepType({ type: 'половинка' }), 'половинка');
    });

    test('тип-заглушка проходит через ядро целиком: pack, resolve, результат по имени', () => {
      const out = run([{ id: 'a', type: 'эхо-заглушка', note: 42 }]);
      eq(out.results.a, 42);
      eq(out.stopped, null);
    });
  });

  group('цикл цепочки', () => {
    test('каждый шаг оставляет запись трассировки — всегда, а не только при обрыве', () => {
      const out = run([
        { id: 'a', type: 'эхо-заглушка', note: 1 },
        { id: 'b', type: 'эхо-заглушка', note: 2 },
      ]);
      eq(out.trace.length, 2, 'две записи на два шага');
      eq(out.trace[0].step, 'a');
      eq(out.trace[0].type, 'эхо-заглушка');
      eq(out.trace[1].note, 2, 'тело записи — от модуля шага');
    });

    test('результат шага доступен следующим по имени', () => {
      const out = run([
        { id: 'a', type: 'эхо-заглушка', note: 21 },
        { id: 'b', type: 'читатель-заглушка', of: 'a' },
      ]);
      eq(out.results.b, 42);
    });

    test('обрыв останавливает цепочку: последующие шаги не исполняются', () => {
      const out = run([
        { id: 'a', type: 'эхо-заглушка', note: 1 },
        { id: 'стоп', type: 'стоп-заглушка' },
        { id: 'после', type: 'писатель-заглушка', target: 'x', to: 999 },
      ]);
      deepEq(out.stopped, { step: 'стоп', type: 'стоп-заглушка', reason: 'заглушка сказала хватит' });
      eq(out.trace.length, 2, 'шаг после обрыва трассы не оставил');
      eq(out.sheet.values.x, 5, 'и ничего не записал');
    });

    test('шаг без id получает в трассе свой номер', () => {
      const out = run([{ type: 'эхо-заглушка', note: 1 }]);
      eq(out.trace[0].step, 0);
    });
  });

  group('изменения чарника идут только через ядро', () => {
    test('write ведёт журнал изменений и возвращает НОВЫЙ чарник', () => {
      const out = run([{ id: 'w', type: 'писатель-заглушка', target: 'x', to: 1 }]);
      deepEq(out.changes, [{ tag: 'x', from: 5, to: 1 }]);
      eq(out.sheet.values.x, 1);
      eq(sheet.values.x, 5, 'исходный чарник не мутирован');
    });

    test('read видит умолчание системы, когда в чарнике значения нет', () => {
      const out = run([{ id: 'w', type: 'писатель-заглушка', target: 'y', to: 3 }]);
      deepEq(out.changes, [{ tag: 'y', from: 0, to: 3 }]);
    });

    test('два шага пишут в два разных поля — оба изменения в журнале', () => {
      const out = run([
        { id: 'w1', type: 'писатель-заглушка', target: 'x', to: 1 },
        { id: 'w2', type: 'писатель-заглушка', target: 'y', to: 2 },
      ]);
      deepEq(out.changes.map(c => c.tag), ['x', 'y']);
      eq(out.sheet.values.x, 1);
      eq(out.sheet.values.y, 2);
    });

    test('второй шаг видит запись первого: величины считаются от текущего, а не исходного', () => {
      const out = run([
        { id: 'w1', type: 'писатель-заглушка', target: 'x', to: 1 },
        { id: 'w2', type: 'писатель-заглушка', target: 'x', to: 2 },
      ]);
      deepEq(out.changes, [{ tag: 'x', from: 5, to: 1 }, { tag: 'x', from: 1, to: 2 }]);
    });

    test('attach вешает эффект без дублей', () => {
      const out = run([
        { id: 's1', type: 'наклейка-заглушка', status: 'poisoned' },
        { id: 's2', type: 'наклейка-заглушка', status: 'poisoned' },
      ]);
      deepEq(out.sheet.effects, [{ effectId: 'poisoned' }]);
      deepEq(out.effects, ['poisoned'], 'в отчёте эффект один раз');
    });

    test('без изменений возвращается тот же чарник', () => {
      const out = run([{ id: 'a', type: 'эхо-заглушка', note: 1 }]);
      ok(out.sheet === sheet);
    });
  });
});

// ── сканер: ядро не знает ни одного конкретного типа шага ───────────────────
// Тот же приём, что у критерия №6: читает исходники, поэтому только в node.

const inNode = typeof process !== 'undefined' && !!(process.versions && process.versions.node);

if (inNode) {
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { join, dirname } = await import('node:path');
  const repo = dirname(dirname(fileURLToPath(import.meta.url)));

  group('ядро правил › ядро не знает типов шагов', () => {
    // Ядро — цикл и реестр. Первый же if (type === 'threshold') в этих файлах
    // означает, что новый тип шага больше не добавляется одним модулем.
    const CORE = ['src/engine/rule.js', 'src/events/envelope.js'];

    test('в исходниках ядра нет ни одного имени зарегистрированного типа', () => {
      const hits = [];
      for (const file of CORE) {
        const text = readFileSync(join(repo, file), 'utf8');
        for (const type of registry.keys()) {
          if (type.includes('заглушка')) continue; // тестовые типы в исходниках и так не встречаются
          if (text.includes(`'${type}'`) || text.includes(`"${type}"`)) {
            hits.push(`${file}: '${type}'`);
          }
        }
      }
      deepEq(hits, [], 'ветвление по типу шага живёт только в реестре');
    });

    test('реестр знает все встроенные типы из ТЗ', () => {
      for (const type of ['threshold', 'amount', 'compare', 'apply']) {
        ok(registry.has(type), `в реестре нет «${type}»`);
      }
    });
  });
}
