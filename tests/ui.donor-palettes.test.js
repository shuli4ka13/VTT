import { group, test, eq, ok } from './harness.js';
import { state, blankWorld } from '../src/ui/state.js';
import {
  effectTemplatesHtml, recordTemplatesHtml, copyEffectFrom, copyStepFrom,
  ensureRollFrom, ensureConstantFrom, copyRoomRuleFrom, copyRecordFrom, worldById,
} from '../src/ui/templates.js';
import { SAMPLE_WORLDS } from '../src/model/systems.js';

// Палитры доноров: всё, из чего состоит система, берётся из ЛЮБОГО образца —
// блоки полей, целые эффекты, отдельные шаги чужих конвейеров, мишени бросков,
// константы, правила комнаты и готовые записи компендиума.
//
// Запись приезжает РАБОЧЕЙ ЦЕПОЧКОЙ: меч тянет свой род, род — привязку
// к эффекту, эффект — кость и мишень броска.

const swap = () => {
  const saved = { system: state.system, compendium: state.compendium, sheets: state.sheets };
  const blank = blankWorld();
  state.system = blank.system;
  state.compendium = blank.compendium;
  state.sheets = blank.sheets;
  return () => { state.system = saved.system; state.compendium = saved.compendium; state.sheets = saved.sheets; };
};

const dnd = () => SAMPLE_WORLDS.find(w => w.system.id === 'dnd5e-slice');

group('палитра эффектов: по механикам, донор — подпись и фильтр', () => {
  test('карточки разложены по категориям, а система подписана на карточке', () => {
    const html = effectTemplatesHtml();
    ok(html.includes('Целые эффекты'), 'первый ярус — целые эффекты');
    ok(html.includes('Атака'), 'категория как полка');
    ok(html.includes('D&amp;D 5e'), 'донор подписан');
    ok(html.includes('Киберпанк'), 'и второй донор тоже');
  });

  test('фильтр по донору сужает палитру, не меняя раскладку по механикам', () => {
    const saved = state.donorFilter;
    state.donorFilter = 'cp-slice';
    // Выпадашка фильтра перечисляет ВСЕ системы — иначе выбранное не сменить.
    // Отфильтрованы карточки, поэтому и смотрим на них, а не на всю разметку.
    const cards = effectTemplatesHtml().split('</select>')[1];
    ok(!cards.includes('D&amp;D 5e'), 'чужой донор отфильтрован');
    ok(cards.includes('Киберпанк'));
    ok(cards.includes('Целые эффекты'), 'ярусы на месте');
    state.donorFilter = saved;
  });

  test('в палитре есть все словари системы: мишени, константы, правила комнаты', () => {
    const html = effectTemplatesHtml();
    ok(html.includes('мишень броска'));
    ok(html.includes('константа'));
    ok(html.includes('правило комнаты'));
  });

  test('мишень и константа приезжают в пустую систему и не дублируются', () => {
    const restore = swap();
    ensureRollFrom(dnd().system, 'attack_roll');
    ensureRollFrom(dnd().system, 'attack_roll');
    eq(state.system.rolls.length, 1);

    ensureConstantFrom(dnd().system, 'lead_die');
    ensureConstantFrom(dnd().system, 'lead_die');
    eq(Object.keys(state.system.constants).length, 1);
    eq(state.system.constants.lead_die.dice[0].sides, 20);
    restore();
  });

  test('правило комнаты приезжает эффектом, с мишенью и объявленной механикой', () => {
    const restore = swap();
    copyRoomRuleFrom(dnd().system, 'heavy_armor_rule');
    eq(state.system.room_rules.length, 1, 'включено на всех');
    ok(state.system.effects.heavy_armor_rule, 'сам эффект приехал в библиотеку');
    ok(state.system.rolls.some(r => r.tag === 'skill_roll'), 'мишень приехала следом');
    ok(state.system.advantage.methods.rerollBest, 'механика объявлена — правило работоспособно');
    copyRoomRuleFrom(dnd().system, 'heavy_armor_rule');
    eq(state.system.room_rules.length, 1, 'повторный клик не дублирует');
    restore();
  });
});

group('куски конвейеров: шаблон урона из чужой системы', () => {
  test('шаг чужого эффекта вставляется в открытый — и тянет его зависимости', () => {
    const restore = swap();
    const mine = copyEffectFrom(dnd().system, 'heal'); // открыт в конструкторе
    const before = state.system.effects[mine].steps.length;

    const cp = SAMPLE_WORLDS.find(w => w.system.id === 'cp-slice').system;
    const index = cp.effects.strike.steps.findIndex(s => s.id === 'hit');
    const step = copyStepFrom(cp, 'strike', index);

    ok(step, 'шаг вставлен');
    eq(state.system.effects[mine].steps.length, before + 1);
    ok('lead_die' in state.system.constants, 'кость приехала вслед за шагом');
    ok(state.system.rolls.some(r => r.tag === 'attack_roll'), 'и мишень броска');
    restore();
  });

  test('имя результата не сталкивается с уже занятым', () => {
    const restore = swap();
    const mine = copyEffectFrom(dnd().system, 'strike');
    const donor = dnd().system;
    const index = donor.effects.strike.steps.findIndex(s => s.id === 'hit');
    const step = copyStepFrom(donor, 'strike', index);

    ok(step.id !== 'hit', 'имя занято — копия получила своё');
    const ids = state.system.effects[mine].steps.map(s => s.id).filter(Boolean);
    eq(new Set(ids).size, ids.length, 'все имена в конвейере уникальны');
    restore();
  });

  test('в пассивный эффект шаг не вставляется: у него нет конвейера', () => {
    const restore = swap();
    copyEffectFrom(dnd().system, 'poisoned');
    const donor = dnd().system;
    const index = donor.effects.strike.steps.findIndex(s => s.id === 'hit');
    eq(copyStepFrom(donor, 'strike', index), null);
    restore();
  });
});

group('готовые записи компендиума из образцов', () => {
  test('меч приезжает рабочей цепочкой: род, привязка, эффект, кость, мишень', () => {
    const restore = swap();
    const id = copyRecordFrom(dnd(), 'longsword-item');
    eq(id, 'longsword-item');
    ok(state.compendium.items.some(r => r.id === id), 'предмет в библиотеке');
    ok(state.system.records.weapon, 'род «Оружие» объявился — свойства читаемы');
    ok(state.system.records.weapon.bindings.length, 'и его привязка приехала с ним');
    ok(state.system.effects.strike, 'эффект приехал за привязкой');
    ok('lead_die' in state.system.constants, 'кость — за эффектом');
    ok(state.system.rolls.some(r => r.tag === 'attack_roll'), 'мишень — за эффектом');
    restore();
  });

  test('заклинание тянет свой род, а род — эффект спасброска', () => {
    const restore = swap();
    copyRecordFrom(dnd(), 'poison-spray');
    ok(state.compendium.actions.some(r => r.id === 'poison-spray'));
    ok(state.system.records['attack-spell'], 'род приехал вместе с записью');
    ok(state.system.effects.save, 'и эффект, к которому род привязан');
    restore();
  });

  test('повторный клик ничего не дублирует', () => {
    const restore = swap();
    copyRecordFrom(dnd(), 'longsword-item');
    copyRecordFrom(dnd(), 'longsword-item');
    eq(state.compendium.items.length, 1);
    restore();
  });

  test('эффект с roll-модификатором объявляет механику и мишень', () => {
    const restore = swap();
    copyEffectFrom(dnd().system, 'poisoned');
    ok(state.system.effects.poisoned);
    ok(state.system.rolls.some(r => r.tag === 'attack_roll'));
    ok(state.system.advantage.methods.rerollBest);
    restore();
  });

  test('палитра записей сгруппирована по донорам и показывает записи', () => {
    const html = recordTemplatesHtml();
    ok(html.includes('Кольчуга'));
    ok(html.includes('Мономолекулярный нож'));
    ok(html.includes('D&amp;D 5e'));
  });

  test('worldById находит донора вместе с его компендиумом', () => {
    const world = worldById('cp-slice');
    ok(world.system && world.compendium);
    eq(world.system.name, 'Киберпанк');
  });
});
