import { group, test, ok, eq } from './harness.ts';
import { lintSystem } from '../src/model/lint.ts';
import { placesMatching, wordFits } from '../src/model/die-kinds.ts';
import type { System } from '../src/model/types.ts';

const word = (key: string, tags: string[]) => ({
  label: 'Чары', activation: 'passive',
  modifiers: [{ kind: 'edit', call: 'roll', param: 'edits', edit: key, tags, if: { expr: '@бросающий == @носитель' } }],
});

const system = (tags: string[], key = 'step_up') => ({
  id: 'x', name: 'x',
  constants: {
    pool: { label: 'набор к6', kind: 'die', dice: [{ sides: 6, count: 1 }], read: { kind: 'count', atLeast: 5 } },
    d20: { label: 'к20', kind: 'die', dice: [{ sides: 20 }] },
  },
  tables: { лист: { shape: 'single', columns: [{ key: 'ловкость', label: 'Ловкость', kind: 'number' }, { key: 'воля', label: 'Воля', kind: 'number' }] } },
  rolls: {
    проверка: { label: 'Проверка', die: 'pool', number: 'count', fields: [{ table: 'лист', column: 'ловкость' }] },
    спас: { label: 'Спасбросок', die: 'd20', fields: [{ table: 'лист', column: 'воля' }] },
  },
  roll_edits: {
    step_up: { label: 'Кость выше', ops: [{ op: 'dieStep', by: 1 }] },
    lucky: { label: 'Переброс', ops: [{ op: 'reroll', n: 1 }] },
  },
  effects: { чары: word(key, tags) },
}) as unknown as System;

const texts = (s: System): string[] => lintSystem(s).map(p => p.text);

group('слово правки броска сверяется с бросками, к которым правка привязана', () => {
  test('«Кость выше» на «Проверке» (набор к6, считаем успехи) — замечание с именем правила', () => {
    const found = texts(system(['проверка'])).filter(text => text.includes('не подходит броскам, к которым привязана правка'));
    eq(found.length, 1);
    ok(found[0]!.includes('«Проверка»'), found[0]);
  });

  test('«Кость выше» на «Спасброске» (одна к20) — подходит, замечания нет', () => {
    eq(texts(system(['спас'])).some(text => text.includes('не подходит броскам, к которым')), false);
  });

  test('«Переброс» подходит любому броску — замечания нет', () => {
    eq(texts(system(['проверка'], 'lucky')).some(text => text.includes('не подходит броскам, к которым')), false);
  });

  test('без меток правка на все броски — проверяется только против всей системы, как прежде', () => {
    eq(texts(system([])).some(text => text.includes('не подходит броскам, к которым')), false);
  });

  test('два правила сразу в «Какие броски» — замечание', () => {
    ok(texts(system(['проверка', 'спас'], 'lucky')).some(text => text.includes('сразу двух правил')));
  });

  test('правило, которое само несёт ключ другого правила, — пара законна, замечания нет', () => {
    const s = system(['проверка', 'спас'], 'lucky');
    (s.rolls as Record<string, { tags?: string[] }>).спас!.tags = ['проверка'];
    eq(texts(s).some(text => text.includes('сразу двух правил')), false);
  });

  test('слово не подходит ни одному броску системы — только прежнее замечание словаря, без второго', () => {
    const s = system(['проверка'], 'flip');
    (s.roll_edits as Record<string, unknown>).flip = { label: 'Переворот', ops: [{ op: 'flip' }] };
    (s.rolls as Record<string, unknown>).спас = { label: 'Спасбросок', die: 'pool', number: 'count', fields: [{ table: 'лист', column: 'воля' }] };
    eq(texts(s).some(text => text.includes('не подходит броскам, к которым')), false);
  });

  test('отбор мест: правило берёт свою метку-ключ, шаг — свои метки', () => {
    const s = system(['проверка']);
    (s.effects as Record<string, unknown>).удар = { label: 'Удар', steps: [{ type: 'roll', die: 'd20', tags: ['проверка'] }] };
    const names = placesMatching(s, { tags: ['проверка'] }).map(place => place.name);
    eq(names.join(', '), 'Проверка, Удар');
    eq(wordFits({ ops: [{ op: 'dieStep' }] }, placesMatching(s, { tags: ['проверка'] })), true);
  });
});
