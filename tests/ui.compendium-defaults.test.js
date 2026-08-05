import { group, test, eq, ok, deepEq } from './harness.js';
import { state } from '../src/ui/state.js';
import { createRecord, addMod, deleteRecord, find } from '../src/ui/mode-compendium.js';
import { enabledMethods } from '../src/model/advantage-methods.js';

// Заготовки записей раньше зашивали конкретную механику (rerollBest) и мишень
// (rolls[0]) кодом UI — в системе, не объявившей ни одной, рождалась запись
// с необъявленной механикой. Заодно заготовки писали мёртвые поля черновика
// (slot, duration, kind), которых ничто не читает. Правильное поведение:
// умолчание выводится из объявлений системы, а при их отсутствии заготовка
// падает на честный value-модификатор, а не на несуществующую механику.

group('заготовки компендиума выводятся из объявлений системы', () => {
  test('enabledMethods(system) — тот же фильтр, что рисует режим автора', () => {
    deepEq(enabledMethods(state.system).map(m => m.id), ['rerollBest']);
    const bare = { ...state.system, advantage: undefined };
    deepEq(enabledMethods(bare), [], 'без объявления — пусто, а не падение');
  });

  test('новый предмет не пишет мёртвый slot', () => {
    const rk = Object.entries(state.system.records).find(([, d]) => d.kind === 'item')[0];
    createRecord(rk);
    const record = find(state.activeRecordId);
    ok(!('slot' in record), 'слот экипировки — рудимент черновика, никем не читается');
    deleteRecord(record.id);
  });

  test('новый эффект не пишет мёртвую длительность и рождается ЖИВЫМ модификатором', () => {
    const rk = Object.entries(state.system.records).find(([, d]) => d.kind === 'effect')[0];
    createRecord(rk);
    const record = find(state.activeRecordId);
    ok(!('duration' in record), 'длительность-рудимент никем не читается и не тикает');

    const mod = record.modifiers[0];
    eq(mod.kind, 'roll', '5e объявляет rerollBest и мишени бросков — заготовка полноценна');
    eq(mod.method, 'rerollBest', 'механика — первая ОБЪЯВЛЕННАЯ, не зашитая строка');
    ok(state.system.rolls.some(r => r.tag === mod.target), 'мишень — объявленный бросок системы');
    deleteRecord(record.id);
  });

  test('система без объявленных механик преимущества получает value-заготовку, а не сломанную roll', () => {
    const bareId = 'bare-test-sys';
    const saved = state.system;
    state.system = { ...saved, advantage: undefined, rolls: [] };
    const rk = Object.entries(state.system.records).find(([, d]) => d.kind === 'effect')[0];
    createRecord(rk);
    const record = find(state.activeRecordId);
    const mod = record.modifiers[0];
    eq(mod.kind, 'value', 'без механики и без мишени бросков roll-заготовка была бы нерабочей');
    ok(state.system.fields.some(f => f.tag === mod.target));
    deleteRecord(record.id);
    state.system = saved;
    void bareId;
  });

  test('addMod на свежем эффекте (baseOf, а не мёртвый record.kind) даёт roll первым добавлением', () => {
    const rk = Object.entries(state.system.records).find(([, d]) => d.kind === 'effect')[0];
    createRecord(rk);
    const record = find(state.activeRecordId);
    record.modifiers = []; // как будто автор стёр заготовку

    addMod(record.id);
    eq(find(record.id).modifiers[0].kind, 'roll', 'первый модификатор эффекта — roll (baseOf распознаёт эффект)');

    addMod(record.id);
    eq(find(record.id).modifiers[1].kind, 'value', 'второй — уже обычное значение');
    deleteRecord(record.id);
  });

  test('addMod на предмете всегда даёт value — предметы roll-заготовку не получают', () => {
    const rk = Object.entries(state.system.records).find(([, d]) => d.kind === 'item')[0];
    createRecord(rk);
    const record = find(state.activeRecordId);
    record.modifiers = [];
    addMod(record.id);
    eq(find(record.id).modifiers[0].kind, 'value');
    deleteRecord(record.id);
  });
});
