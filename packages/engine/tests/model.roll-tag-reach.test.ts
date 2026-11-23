import { group, test, ok, eq } from './harness.ts';
import { lintSystem } from '../src/model/lint.ts';
import { rollTagReach, claimWords } from '../src/model/roll-reach.ts';
import { rollGroupsOf } from '../src/model/roll-groups.ts';
import { rollTitle } from '../src/engine/roll-tags.ts';
import { SAMPLE_WORLDS } from '../src/model/systems.ts';
import { flattenSystem } from '../src/model/inherit.ts';
import type { System, Compendium } from '../src/model/types.ts';

const holder = { expr: '@roller == @holder' };

const edit = (tags: string[], extra: Record<string, unknown> = {}) => ({ kind: 'edit', call: 'roll', param: 'count', op: 'add', value: { expr: '-2' }, tags, if: holder, ...extra });

const system = (effects: Record<string, unknown>, more: Record<string, unknown> = {}) => ({
  id: 'x', name: 'x',
  constants: { d6: { label: 'к6', kind: 'die', dice: [{ sides: 6, count: 1 }] } },
  tables: {
    лист: { shape: 'single', columns: [{ key: 'ловкость', label: 'Ловкость', kind: 'number' }] },
    броски: { label: 'Броски', key: 'word', columns: [{ key: 'claim', label: 'Заявляет игрок', kind: 'boolean' }], rows: [
      { value: 'атака' }, { value: 'зрение' }, { value: 'слух', cells: { claim: true } },
    ] },
    стихии: { label: 'Стихии', key: 'word', rows: [{ value: 'огонь' }, { value: 'холод' }] },
  },
  rolls: { проверка: { label: 'Проверка', die: 'd6', number: 'count', fields: [{ table: 'лист', column: 'ловкость' }] } },
  effects,
  ...more,
}) as unknown as System;

const unreached = (s: System, book?: Compendium): string[] => lintSystem(s, book).filter(p => p.text.includes('не ставит ни правило броска')).map(p => p.text);

const strike = (tags: unknown[]) => ({ label: 'Удар', params: [{ key: 'стихия', label: 'Стихия', kind: 'choice', from: 'стихии' }], steps: [{ type: 'roll', die: 'd6', tags }] });

group('«Проблемы»: метку, которую ждёт правка броска, не ставит ни один бросок', () => {
  test('«зрение» не ставит никто — замечание у правки, без книги — «если метку поставит запись книги»', () => {
    const found = unreached(system({ слепота: { label: 'Слепота', activation: 'passive', modifiers: [edit(['зрение'])] } }));
    eq(found.length, 1);
    ok(found[0]!.startsWith('метку «зрение» не ставит'), found[0]);
    ok(found[0]!.includes('сработает, только если метку поставит запись книги'), found[0]);
  });

  test('с книгой, где метку тоже никто не ставит, — «правка не сработает»', () => {
    const book = { id: 'b', records: [{ id: 'фонарь', table: 'вещи', cells: {} }] } as unknown as Compendium;
    const found = unreached(system({ слепота: { label: 'Слепота', activation: 'passive', modifiers: [edit(['зрение'])] } }), book);
    ok(found[0]!.endsWith('правка не сработает'), found[0]);
  });

  test('ключ правила, строка, заявляемая за столом, и метка шага «Бросок» — замечаний нет', () => {
    const s = system({
      удар: { label: 'Удар', steps: [{ type: 'roll', die: 'd6', tags: ['атака'] }] },
      чары: { label: 'Чары', activation: 'passive', modifiers: [edit(['проверка']), edit(['слух']), edit(['атака'])] },
    });
    eq(unreached(s).join(' | '), '');
  });

  test('метка формулой из входа-выбора разворачивается в строки справочника', () => {
    const fire = system({ удар: strike([{ expr: '@стихия' }]), жар: { label: 'Жар', activation: 'passive', modifiers: [edit(['огонь'])] } });
    eq(unreached(fire).join(' | '), '');
    const water = system({ удар: strike([{ expr: '@стихия' }]), сырость: { label: 'Сырость', activation: 'passive', modifiers: [edit(['вода'])] } });
    eq(unreached(water).length, 1);
  });

  test('метку «если(…, "текст", "")» видно; формулу, которую не развернуть, — система «открыта», замечаний нет', () => {
    const literal = system({ удар: strike([{ expr: 'if(@стихия == "огонь", "жаркий", "")' }]), жар: { label: 'Жар', activation: 'passive', modifiers: [edit(['жаркий'])] } });
    eq(unreached(literal).join(' | '), '');
    const open = system({ удар: strike([{ expr: '@holder.ловкость' }]), слепота: { label: 'Слепота', activation: 'passive', modifiers: [edit(['зрение'])] } });
    eq(rollTagReach(open).open, true);
    eq(unreached(open).join(' | '), '');
  });

  test('правка «метка броску» ставит метку: та, что ждёт её, замечания не получает', () => {
    const s = system({
      прицел: { label: 'Прицел', activation: 'passive', modifiers: [{ kind: 'edit', call: 'roll', param: 'tags', value: { expr: '"зрение"' }, tags: ['атака'], if: holder }] },
      удар: { label: 'Удар', steps: [{ type: 'roll', die: 'd6', tags: ['атака'] }] },
      слепота: { label: 'Слепота', activation: 'passive', modifiers: [edit(['зрение'])] },
    });
    eq(unreached(s).join(' | '), '');
  });

  test('метку ставит запись книги — без книги замечание, с книгой — нет', () => {
    const s = system({ слепота: { label: 'Слепота', activation: 'passive', modifiers: [edit(['зрение'])] } });
    const book = { id: 'b', records: [{ id: 'очки', table: 'вещи', cells: {}, modifiers: [{ kind: 'edit', call: 'roll', param: 'tags', value: { expr: '"зрение"' }, if: holder }] }] } as unknown as Compendium;
    eq(unreached(s).length, 1);
    eq(unreached(s, book).join(' | '), '');
  });

  test('«хотя бы одна из» — замечание, только если не ставят ни одну', () => {
    const none = system({ ч: { label: 'Чутьё', activation: 'passive', modifiers: [edit([], { anyTags: ['зрение', 'вкус'] })] } });
    ok(unreached(none)[0]!.startsWith('метки «зрение», «вкус» не ставит'), unreached(none)[0]);
    const some = system({ ч: { label: 'Чутьё', activation: 'passive', modifiers: [edit([], { anyTags: ['зрение', 'слух'] })] } });
    eq(unreached(some).join(' | '), '');
  });

  test('подписка «кости выпали» с меткой, которую никто не ставит, — замечание у подписки', () => {
    const s = system({ удача: { label: 'Удача', activation: 'passive', on: [{ on: 'seen', tags: ['зрение'], if: { expr: '@roller == @holder' }, steps: [] }] } });
    const found = lintSystem(s).filter(p => p.text.includes('не ставит ни правило броска'));
    eq(found.length, 1);
    ok(found[0]!.text.includes('подписка сработает, только если'), found[0]!.text);
    eq((found[0]!.where as { handler?: number }).handler, 0);
  });

  test('список «метки, которые несут броски» берёт и метки формулой: свойства оружия и дальность в D&D', () => {
    const world = SAMPLE_WORLDS.find(one => one.system.name === 'D&D 5e')!;
    const kinds = rollGroupsOf(flattenSystem(world.system)).kinds.map(kind => kind.value);
    ok(kinds.includes('двуручное') && kinds.includes('ближний'), kinds.join(', '));
  });

  test('правка «метка броску» у типа листа «стол» ставит метку — замечания нет', () => {
    const s = system({ ночь: { label: 'Ночь', activation: 'passive', modifiers: [edit(['ночь'])] } }, {
      sheets: { desk: { label: 'Стол', modifiers: [{ kind: 'edit', call: 'roll', param: 'tags', value: { expr: '"ночь"' }, if: holder }] } },
    });
    eq(unreached(s).join(' | '), '');
  });

  test('«метка броску» записи по её свойству: выбор — строки справочника, свободный текст — система «открыта»', () => {
    const kinds = (kind: string) => ({ чары: { label: 'Чары', shape: 'book', columns: [{ key: 'вид', label: 'Вид', kind, ...(kind === 'choice' ? { from: 'стихии' } : {}) }] } });
    const mark = { kind: 'edit', call: 'roll', param: 'tags', value: { expr: '@row.вид' }, if: holder };
    const book = { id: 'b', records: [{ id: 'искра', table: 'чары', cells: { вид: 'огонь' }, modifiers: [mark] }] } as unknown as Compendium;
    const make = (kind: string) => {
      const s = system({ холод: { label: 'Холод', activation: 'passive', modifiers: [edit(['холод'])] } });
      Object.assign(s.tables as object, kinds(kind));
      return s;
    };
    eq(unreached(make('choice'), book).join(' | '), '');
    eq(rollTagReach(make('text'), book).open, true);
  });

  test('свойство записи-подтипа: метка из умолчания подтипа видна, клетка-формула делает систему «открытой»', () => {
    const s = system({
      удар: { label: 'Удар', params: [{ key: 'оружие', label: 'Оружие', kind: 'record', from: 'оружие' }], steps: [{ type: 'roll', die: 'd6', tags: [{ expr: '@оружие.стихия' }] }] },
      пламя: { label: 'Пламя', activation: 'passive', modifiers: [edit(['пламя'])] },
    });
    Object.assign(s.tables as object, {
      оружие: { label: 'Оружие', shape: 'book', columns: [{ key: 'стихия', label: 'Стихия', kind: 'text', default: 'огонь' }] },
      огнемёт: { label: 'Огнемёт', shape: 'book', extends: 'оружие', columns: [{ key: 'стихия', label: 'Стихия', kind: 'text', default: 'пламя' }] },
    });
    const book = (cell: unknown) => ({ id: 'b', records: [{ id: 'меч', table: 'оружие', cells: {} }, { id: 'ог', table: 'огнемёт', cells: cell === undefined ? {} : { стихия: cell } }] }) as unknown as Compendium;
    eq(unreached(s, book(undefined)).join(' | '), '');
    eq(rollTagReach(s, book({ expr: '"жар"' })).open, true);
    eq(rollTagReach(s).open, true);
  });

  test('заголовок броска называет правило по имени и не повторяет заголовок', () => {
    const s = { rolls: { проверка: { label: 'Проверка' }, действие: { label: 'Бросок' } } } as unknown as System;
    eq(rollTitle('Бросок', ['проверка', 'сила'], s), 'Бросок (Проверка, сила)');
    eq(rollTitle('Бросок', ['действие'], s), 'Бросок');
    eq(rollTitle('Проверка', ['проверка', 'сила'], s), 'Проверка (сила)');
  });

  test('во вход-выбор передан текст не из справочника — «Проблемы» называют ошибкой сам вход', () => {
    const s = system({
      удар: strike([{ expr: '@стихия' }]),
      залп: { label: 'Залп', steps: [{ type: 'emit', effect: 'удар', args: { стихия: { expr: '"плазма"' } } }] },
    });
    const texts = lintSystem(s).filter(p => p.level === 'error').map(p => p.text);
    ok(texts.some(text => text.includes('передано «плазма» — в таблице «Стихии» такой строки нет')), texts.join(' | '));
  });

  test('метку из выбора слова словаря не ставит никто — замечание у слова', () => {
    const s = { ...system({}), roll_edits: { wild: { label: 'Дикий кубик', ops: [{ op: 'wild' }], tags: ['зрение'] } } } as unknown as System;
    const found = lintSystem(s).filter(p => p.text.includes('не ставит ни правило броска'));
    eq(found.length, 1);
    ok(found[0]!.text.includes('«зрение»') && found[0]!.text.includes('слово сработает, только если'), found[0]!.text);
    eq(JSON.stringify(found[0]!.where), JSON.stringify({ tab: 'rules', section: 'roll_edits', key: 'wild' }));
  });

  test('за столом заявляют слова словаря правок и строки с галочкой «заявляют» — один список для листа и действий', () => {
    const s = { ...system({}), roll_edits: { wild: { label: 'Дикий кубик', ops: [{ op: 'wild' }] } } } as unknown as System;
    eq(JSON.stringify(claimWords(s)), JSON.stringify([['wild', 'Дикий кубик'], ['слух', 'слух']]));
  });
});

