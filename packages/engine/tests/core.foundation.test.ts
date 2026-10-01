import { describe, it, expect } from 'vitest';
import { Path } from '../src/core/path.ts';
import { External, Pause, emptyJournal } from '../src/core/external.ts';
import { State } from '../src/core/state.ts';
import type { Question } from '../src/core/external.ts';
import type { Sheet } from '../src/model/types.ts';

const sheet = (id: string, hp = 10): Sheet => ({ id, systemId: 's', name: id, values: { hp }, has: [], effects: [] } as Sheet);

const question = (key: string): Question => ({ key, sheetId: 'а', window: 'target', label: '', offers: [{ id: 'щит', label: 'Щит' }], results: {}, preview: [] });

describe('путь', () => {
  it('части экранируются: id с разделителями не склеиваются в чужой путь', () => {
    const a = Path.op('act', 'а/б').step('x');
    const b = Path.op('act', 'а').step('б/s:x');
    expect(a.key).not.toBe(b.key);
    expect(Path.op('act', 'a:b').key).toBe('act:a%3ab');
  });

  it('номер повтора добавляется только со второго', () => {
    expect(Path.op('x').nth(0).key).toBe('x');
    expect(Path.op('x').nth(2).key).toBe('x/n:2');
  });

  it('кость — путь и номер; разные шаги не делят кости', () => {
    const root = Path.op('act');
    expect(root.step('атака').die(0)).not.toBe(root.step('урон').die(0));
  });
});

describe('внешнее', () => {
  it('повтор берёт кости из журнала и не бросает новых', () => {
    let rolled = 0;
    const first = new External(emptyJournal(), { die: () => { rolled++; return 4; } });
    const die = first.dice(Path.op('act').step('a'));
    expect([die(6), die(6)]).toEqual([4, 4]);
    const again = new External(first.settled(), { die: () => { throw new Error('новая кость'); } });
    const replay = again.dice(Path.op('act').step('a'));
    expect([replay(6), replay(6)]).toEqual([4, 4]);
    expect(rolled).toBe(2);
  });

  it('предпросмотр: известные кости из журнала, новые — середина, в журнал не пишутся', () => {
    const known = { ...emptyJournal(), dice: { 'act/s:a#0': 2 } };
    const ext = new External(known, { die: () => { throw new Error('предпросмотр бросил'); } }, 'preview');
    const die = ext.dice(Path.op('act').step('a'));
    expect([die(20), die(20), die(6)]).toEqual([2, 11, 4]);
    expect(Object.keys(ext.settled().dice)).toEqual(['act/s:a#0']);
  });

  it('вопрос без ответа в настоящем прогоне — пауза; в пробе — «нет» не от человека', () => {
    expect(() => new External(emptyJournal(), { die: () => 1 }).ask(question('q'))).toThrow(Pause);
    expect(new External(emptyJournal(), { die: () => 1 }, 'trial').ask(question('q'))).toEqual({ chosen: [], byPerson: false });
    const answered = { ...emptyJournal(), answers: { q: [] } };
    expect(new External(answered, { die: () => 1 }).ask(question('q'))).toEqual({ chosen: [], byPerson: true });
  });

  it('id по пути: один раз выдан — при повторе тот же', () => {
    let n = 0;
    const ext = new External(emptyJournal(), { die: () => 1, newId: () => `id${++n}` });
    const path = Path.op('act').call('наложить');
    expect(ext.id(path)).toBe('id1');
    expect(ext.id(path)).toBe('id1');
    const again = new External(ext.settled(), { die: () => 1, newId: () => 'другой' });
    expect(again.id(path)).toBe('id1');
  });

  it('в итоговый журнал попадает только то, до чего дошёл путь', () => {
    const journal = { dice: { 'старое#0': 3 }, answers: { 'старый вопрос': ['x'] }, ids: {} };
    const ext = new External(journal, { die: () => 5 });
    ext.dice(Path.op('новое'))(6);
    expect(ext.settled()).toEqual({ dice: { 'новое#0': 5 }, answers: {}, ids: {} });
  });
});

describe('состояние и транзакции', () => {
  it('откат возвращает листы, память, бюджет и хвост журнала', () => {
    const state = new State([sheet('а')], 32);
    state.write({ text: 'до' });
    state.begin();
    state.put({ ...sheet('а', 3) });
    state.remember('атака', 17);
    state.budget -= 1;
    state.write({ text: 'внутри' });
    state.rollback();
    expect(state.get('а').values.hp).toBe(10);
    expect(state.memo('атака')).toBeUndefined();
    expect(state.budget).toBe(32);
    expect(state.log).toEqual([{ text: 'до' }]);
  });

  it('вложенные транзакции: внутренний откат не трогает внешнее', () => {
    const state = new State([sheet('а')], 32);
    state.begin();
    state.put(sheet('а', 7));
    state.begin();
    state.put(sheet('а', 1));
    state.rollback();
    state.commit();
    expect(state.get('а').values.hp).toBe(7);
    expect(state.depth).toBe(0);
  });

  it('проба всегда откатывается, даже на исключении', () => {
    const state = new State([sheet('а')], 32);
    expect(state.probe(() => { state.put(sheet('а', 1)); return state.get('а').values.hp; })).toBe(1);
    expect(state.get('а').values.hp).toBe(10);
    expect(() => state.probe(() => { state.put(sheet('а', 1)); throw new Error('x'); })).toThrow('x');
    expect(state.get('а').values.hp).toBe(10);
    expect(state.depth).toBe(0);
  });

  it('atomic: решение «оставить» принимает итог работы', () => {
    const state = new State([sheet('а')], 32);
    const kept = state.atomic(() => { state.put(sheet('а', 2)); return 'отказ'; }, outcome => outcome !== 'отказ');
    expect(kept).toBe('отказ');
    expect(state.get('а').values.hp).toBe(10);
  });
});
