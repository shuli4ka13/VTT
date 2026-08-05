import { group, test, eq, ok } from './harness.js';
import { state, blankWorld } from '../src/ui/state.js';
import {
  ruleTemplatesHtml, recordTemplatesHtml,
  ensureRollFrom, ensureConstantFrom, copyRoomRuleFrom, copyRecordFrom, worldById,
} from '../src/ui/templates.js';
import { SAMPLE_WORLDS } from '../src/model/systems.js';

// Палитры доноров: всё, из чего состоит система, берётся из ЛЮБОГО образца —
// не только блоки и правила, но и мишени бросков, константы, правила комнаты
// и готовые записи компендиума. Запись приезжает рабочей цепочкой: меч тянет
// свой вызов правила, вызов — правило, правило — кость и мишень броска.

const swap = () => {
  const saved = { system: state.system, compendium: state.compendium, sheets: state.sheets };
  const blank = blankWorld();
  state.system = blank.system;
  state.compendium = blank.compendium;
  state.sheets = blank.sheets;
  return () => { state.system = saved.system; state.compendium = saved.compendium; state.sheets = saved.sheets; };
};

const dnd = () => SAMPLE_WORLDS.find(w => w.system.id === 'dnd5e-slice');

group('палитра механик: по системам и по всем словарям', () => {
  test('шаблоны сгруппированы заголовками систем-доноров', () => {
    const html = ruleTemplatesHtml();
    ok(html.includes('D&amp;D 5e'), 'заголовок 5e');
    ok(html.includes('Киберпанк'), 'заголовок киберпанка');
  });

  test('в палитре есть все словари: мишени, константы, правила комнаты', () => {
    const html = ruleTemplatesHtml();
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

  test('правило комнаты приезжает с мишенью и объявляет свою механику', () => {
    const restore = swap();
    copyRoomRuleFrom(dnd().system, 'rule_heavy_armor');
    eq(state.system.modifiers.length, 1);
    ok(state.system.rolls.some(r => r.tag === 'skill_roll'), 'мишень приехала следом');
    ok(state.system.advantage.methods.rerollBest, 'механика объявлена — правило работоспособно');
    copyRoomRuleFrom(dnd().system, 'rule_heavy_armor');
    eq(state.system.modifiers.length, 1, 'повторный клик не дублирует');
    restore();
  });
});

group('готовые записи компендиума из образцов', () => {
  test('меч приезжает рабочей цепочкой: род, вызов, правило, кость, мишень', () => {
    const restore = swap();
    const id = copyRecordFrom(dnd(), 'longsword-item');
    eq(id, 'longsword-item');
    ok(state.compendium.items.some(r => r.id === id), 'предмет в библиотеке');
    ok(state.system.records.weapon, 'род «Оружие» объявился — свойства читаемы');
    ok(state.compendium.effects.some(r => r.id === 'sword-strike'), 'вызов правила приехал за активностью');
    ok(state.system.rules.strike, 'правило приехало за вызовом');
    ok('lead_die' in state.system.constants, 'кость — за правилом');
    ok(state.system.rolls.some(r => r.tag === 'attack_roll'), 'мишень — за правилом');
    restore();
  });

  test('заклинание тянет вызов, а вызов — правило спасброска', () => {
    const restore = swap();
    copyRecordFrom(dnd(), 'poison-spray');
    ok(state.compendium.actions.some(r => r.id === 'poison-spray'));
    ok(state.compendium.effects.some(r => r.id === 'poison-touch'));
    ok(state.system.rules.save);
    restore();
  });

  test('повторный клик ничего не дублирует', () => {
    const restore = swap();
    copyRecordFrom(dnd(), 'longsword-item');
    copyRecordFrom(dnd(), 'longsword-item');
    eq(state.compendium.items.length, 1);
    eq(state.compendium.effects.filter(r => r.id === 'sword-strike').length, 1);
    restore();
  });

  test('эффект с roll-модификатором объявляет механику и мишень', () => {
    const restore = swap();
    copyRecordFrom(dnd(), 'poisoned');
    ok(state.compendium.effects.some(r => r.id === 'poisoned'));
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
