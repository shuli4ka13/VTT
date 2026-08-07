import { group, test, eq, ok, deepEq } from './harness.js';
import { state } from '../src/ui/state.js';
import { createRecord, deleteRecord, find } from '../src/ui/mode-compendium.js';
import { addMod, ownerKey } from '../src/ui/modifiers-editor.js';
import { addEffect, deleteEffect } from '../src/ui/effect-editor.js';
import { enabledMethods } from '../src/model/advantage-methods.js';

// Заготовки раньше зашивали конкретную механику (rerollBest) и мишень
// (rolls[0]) кодом UI — в системе, не объявившей ни одной, рождалась запись
// с необъявленной механикой. Заодно заготовки писали мёртвые поля черновика
// (slot, duration, kind), которых ничто не читает. Правильное поведение:
// умолчание выводится из объявлений системы, а при их отсутствии заготовка
// падает на честный value-модификатор, а не на несуществующую механику.

const firstRk = base => Object.entries(state.system.records).find(([, d]) => d.kind === base)[0];

group('заготовки выводятся из объявлений системы', () => {
  test('enabledMethods(system) — тот же фильтр, что рисует режим автора', () => {
    deepEq(enabledMethods(state.system).map(m => m.id), ['rerollBest']);
    const bare = { ...state.system, advantage: undefined };
    deepEq(enabledMethods(bare), [], 'без объявления — пусто, а не падение');
  });

  test('новый предмет не пишет мёртвый slot', () => {
    createRecord(firstRk('item'));
    const record = find(state.activeRecordId);
    ok(!('slot' in record), 'слот экипировки — рудимент черновика, никем не читается');
    deleteRecord(record.id);
  });

  test('запись рода со свойствами получает пустую форму, а не мёртвый модификатор', () => {
    const rk = Object.entries(state.system.records)
      .find(([, d]) => d.kind === 'item' && d.props && d.props.length)[0];
    createRecord(rk);
    const record = find(state.activeRecordId);
    deepEq(record.props, {}, 'форма пуста — циферки введёт человек');
    deepEq(record.modifiers, [], 'бонусов у оружия по умолчанию нет: его дело — кость урона');
    deleteRecord(record.id);
  });

  test('новый пассивный эффект рождается ЖИВЫМ модификатором', () => {
    const id = addEffect('passive');
    const effect = state.system.effects[id];
    ok(!('kind' in effect), 'мёртвого базиса черновика в эффекте нет');

    const mod = effect.modifiers[0];
    eq(mod.kind, 'roll', '5e объявляет rerollBest и мишени бросков — заготовка полноценна');
    eq(mod.method, 'rerollBest', 'механика — первая ОБЪЯВЛЕННАЯ, не зашитая строка');
    ok(state.system.rolls.some(r => r.tag === mod.target), 'мишень — объявленный бросок системы');
    deleteEffect(id);
  });

  test('система без объявленных механик получает value-заготовку, а не сломанную roll', () => {
    const saved = state.system;
    state.system = { ...saved, advantage: undefined, rolls: [], effects: { ...saved.effects } };
    const id = addEffect('passive');
    const mod = state.system.effects[id].modifiers[0];
    eq(mod.kind, 'value', 'без механики и без мишени бросков roll-заготовка была бы нерабочей');
    ok(state.system.fields.some(f => f.tag === mod.target));
    deleteEffect(id);
    state.system = saved;
  });

  test('addMod на свежем эффекте даёт roll первым добавлением', () => {
    const id = addEffect('passive');
    const key = ownerKey('effect', id);
    state.system.effects[id].modifiers = []; // как будто автор стёр заготовку

    addMod(key);
    eq(state.system.effects[id].modifiers[0].kind, 'roll', 'первый модификатор эффекта — roll');

    addMod(key);
    eq(state.system.effects[id].modifiers[1].kind, 'value', 'второй — уже обычное значение');
    deleteEffect(id);
  });

  test('addMod на предмете всегда даёт value — предметы roll-заготовку не получают', () => {
    createRecord(firstRk('item'));
    const record = find(state.activeRecordId);
    record.modifiers = [];
    addMod(ownerKey('item', record.id));
    eq(find(record.id).modifiers[0].kind, 'value');
    deleteRecord(record.id);
  });
});
