import { group, test, eq, ok, deepEq, throws } from './harness.ts';
import { registerStepType, registry } from '../src/engine/steps/index.ts';
import { Runner, newSink } from '../src/lang/run.ts';
import { State } from '../src/lang/state.ts';
import { External, emptyJournal } from '../src/lang/journal.ts';

const sys = {
  id: 'stub-sys',
  tables: { лист: { shape: 'single', columns: [
    { key: 'x', label: 'Икс', kind: 'number', default: 7 },
    { key: 'y', label: 'Игрек', kind: 'number' },
  ] } },

  effects: {
    poisoned: { label: 'Отравлен', activation: 'passive', modifiers: [] },
  },
};
const sheet = { id: 'болванчик', systemId: 'stub-sys', values: { x: 5 }, effects: [] };

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
  const state = new State([sheet], sys, { records: [] }, null);
  const runner = new Runner(state, new External(emptyJournal(), () => 1));
  const sink = newSink();
  const ran = runner.exec({
    scope: 'rule', me: sheet.id, here: sheet.id, target: sheet.id, effectId: 'e', owner: 'Правило из заглушек',
    args: {}, paramDefs: [], props: null, source: sheet.id, hop: 0, names: 'here',
  }, steps, sink);
  return { results: ran.results, stopped: ran.stopped, trace: sink.trace, changes: sink.changes, effects: sink.effects, sheet: state.get(sheet.id) };
};

group('ядро правил', () => {
  group('реестр типов шагов', () => {
    test('неизвестный тип шага — внятная ошибка с перечнем известных', () => {
      const err = throws(() => run([{ type: 'котик' }]), 'котик');
      ok(err.message.includes('эхо-заглушка'), 'ошибка перечисляет, что реестр знает');
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

  group('изменения листа идут только через ядро', () => {
    test('write ведёт журнал изменений и возвращает НОВЫЙ лист', () => {
      const out = run([{ id: 'w', type: 'писатель-заглушка', target: 'x', to: 1 }]);
      deepEq(out.changes, [{ tag: 'x', from: 5, to: 1 }]);
      eq(out.sheet.values.x, 1);
      eq(sheet.values.x, 5, 'исходный лист не мутирован');
    });

    test('read видит умолчание системы, когда в листе значения нет', () => {
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

    test('без изменений возвращается тот же лист', () => {
      const out = run([{ id: 'a', type: 'эхо-заглушка', note: 1 }]);
      ok(out.sheet === sheet);
    });
  });
});

const inNode = typeof process !== 'undefined' && !!(process.versions && process.versions.node);

if (inNode) {
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { join, dirname } = await import('node:path');
  const repo = dirname(dirname(fileURLToPath(import.meta.url)));

  group('ядро правил › ядро не знает типов шагов', () => {

    const CORE = ['src/engine/rule.ts', 'src/lang/run.ts', 'src/lang/act.ts', 'src/lang/journal.ts', 'src/lang/state.ts'];

    test('в исходниках ядра нет ни одного имени зарегистрированного типа', () => {
      const hits = [];
      for (const file of CORE) {
        const text = readFileSync(join(repo, file), 'utf8');
        for (const type of registry.keys()) {
          if (type.includes('заглушка')) continue;
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
