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

  test('шаг «Бросок» по полю — место с костями правила этого поля и метками шага: «Кость выше» на «атаке» с набора к6 — замечание', () => {
    const s = system(['атака']);
    (s.effects as Record<string, unknown>).выстрел = { label: 'Выстрел', steps: [{ type: 'roll', field: { expr: '@действующий.ловкость' }, tags: ['атака'] }] };
    const places = placesMatching(s, { tags: ['атака'] });
    eq(places.map(place => `${place.name}: ${place.kind}`).join(', '), 'Выстрел: hits');
    ok(texts(s).some(text => text.includes('слово «Кость выше» не подходит броскам, к которым привязана правка («Выстрел»')), texts(s).join(' | '));
  });

  test('отбор мест: правило берёт свою метку-ключ, шаг — свои метки', () => {
    const s = system(['проверка']);
    (s.effects as Record<string, unknown>).удар = { label: 'Удар', steps: [{ type: 'roll', die: 'd20', tags: ['проверка'] }] };
    const names = placesMatching(s, { tags: ['проверка'] }).map(place => place.name);
    eq(names.join(', '), 'Проверка, Удар');
    eq(wordFits({ ops: [{ op: 'dieStep' }] }, placesMatching(s, { tags: ['проверка'] })), true);
  });
});

group('у слова свой выбор бросков: «Проблемы» сверяют его, как у правки', () => {
  const scoped = (filter: Record<string, string[]>, key = 'step_up', tags: string[] = []) => {
    const s = system(tags, key);
    Object.assign((s.roll_edits as Record<string, object>)[key]!, filter);
    return s;
  };

  test('форма костей сверяется только с бросками слова: «Кость выше» на одной «Проверке» (набор, успехи) — замечание', () => {
    ok(texts(scoped({ tags: ['проверка'] })).some(text => text.includes('у бросков, к которым она относится, таких бросков нет')), texts(scoped({ tags: ['проверка'] })).join(' | '));
    eq(texts(scoped({ tags: ['спас'] })).some(text => text.includes('ничего не изменит')), false);
  });

  test('правка зовёт слово на броски, которые слово исключает своим «Кроме», — замечание с именем броска', () => {
    const found = texts(scoped({ notTags: ['проверка'] }, 'lucky', ['проверка'])).filter(text => text.includes('не касается бросков'));
    eq(found.length, 1);
    ok(found[0]!.includes('слово «Переброс»') && found[0]!.includes('«Проверка»'), found[0]);
    eq(texts(scoped({ notTags: ['спас'] }, 'lucky', ['проверка'])).some(text => text.includes('не касается бросков')), false);
  });

  test('метку из «Какие броски» слова могут добавить заявка или формула — замечания нет', () => {
    eq(texts(scoped({ tags: ['спас'] }, 'lucky', ['проверка'])).some(text => text.includes('не касается бросков')), false);
  });

  test('два правила сразу в выборе слова — замечание', () => {
    ok(texts(scoped({ tags: ['проверка', 'спас'] }, 'lucky')).some(text => text.includes('сразу двух правил')));
  });
});
