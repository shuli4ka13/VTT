import { group, test, eq, ok } from './harness.js';
import { state } from '../src/ui/state.js';
import { copyBlockFrom, copyEffectFrom, copyTableFrom, effectTemplatesHtml } from '../src/ui/templates.js';
import { toggleDict } from '../src/ui/mode-author.js';
import { SAMPLE_SYSTEMS } from '../src/model/systems.js';

// «Подтянуть из любой образцовой системы и править как своё» до сих пор умели
// только рода записей. Суть конструктора — намешать в свою систему море всего:
// блок полей из 5e, правило удара из киберпанка, таблицу прогрессии откуда
// угодно. Копия — своя, донор не меняется; зависимости приезжают вслед.

const dnd5e = SAMPLE_SYSTEMS.find(s => s.id === 'dnd5e-slice');
const cp = SAMPLE_SYSTEMS.find(s => s.id === 'cp-slice');

group('шаблоны из образцовых систем', () => {
  test('эффект из киберпанка приезжает в 5e-систему под свободным id', () => {
    const id = copyEffectFrom(cp, 'strike');
    ok(id !== 'strike', 'strike в системе уже есть — копия не затирает его');
    const effect = state.system.effects[id];
    eq(effect.steps.length, cp.effects.strike.steps.length, 'шаги приехали целиком');
    eq(effect.params.length, cp.effects.strike.params.length, 'и параметры');

    // Копия своя: правка не трогает донора.
    effect.label = 'Хромированный удар';
    eq(cp.effects.strike.label, 'Удар', 'донор не изменился');
    delete state.system.effects[id];
  });

  test('эффект тянет за собой недостающие константы и мишени бросков — и не дублирует существующие', () => {
    const donor = {
      id: 'донор', name: 'Донор',
      constants: { volt_die: { label: 'Вольт-кость', kind: 'die', dice: [{ count: 1, sides: 8 }] } },
      rolls: [{ tag: 'zap_roll', label: 'Разряд' }],
      effects: {
        zap: {
          label: 'Разряд', activation: 'manual', params: [],
          steps: [{ id: 'hit', type: 'threshold',
            roll: { die: { constant: 'volt_die' }, bonus: { const: 0 }, check: 'zap_roll' },
            versus: { const: 10 } }],
        },
      },
    };
    const rollsBefore = state.system.rolls.length;
    const id = copyEffectFrom(donor, 'zap');

    ok('volt_die' in state.system.constants, 'константа приехала вслед за эффектом');
    ok(state.system.rolls.some(r => r.tag === 'zap_roll'), 'мишень броска приехала');
    eq(state.system.rolls.length, rollsBefore + 1, 'ровно одна новая — существующие не тронуты');

    delete state.system.effects[id];
    delete state.system.constants.volt_die;
    state.system.rolls = state.system.rolls.filter(r => r.tag !== 'zap_roll');
  });

  test('эффект с существующей костью переиспользует её, а не затирает', () => {
    const donor = {
      id: 'донор2', name: 'Донор',
      constants: { lead_die: { label: 'Чужая кость', kind: 'die', dice: [{ count: 1, sides: 10 }] } },
      rolls: [],
      effects: { hit: { label: 'Хит', activation: 'manual', params: [], steps: [{ id: 's', type: 'threshold',
        roll: { die: { constant: 'lead_die' }, bonus: { const: 0 }, check: null }, versus: { const: 5 } }] } },
    };
    const id = copyEffectFrom(donor, 'hit');
    eq(state.system.constants.lead_die.dice[0].sides, 20, 'моя ведущая кость осталась d20');
    delete state.system.effects[id];
  });

  test('блок полей приезжает с транзитивными зависимостями формул и таблицами', () => {
    const saved = state.system;
    state.system = { id: 'моя', name: 'Моя', fields: [], tables: {}, rolls: [], effects: {}, room_rules: [], constants: {}, records: {} };

    copyBlockFrom(dnd5e, 'Навыки');
    ok(state.system.fields.some(f => f.tag === 'athletics'), 'навык приехал');
    ok(state.system.fields.some(f => f.tag === 'str_mod'), 'зависимость-формула приехала');
    ok(state.system.fields.some(f => f.tag === 'str'), 'и зависимость зависимости');

    copyBlockFrom(dnd5e, 'Прогрессия');
    ok(state.system.fields.some(f => f.tag === 'prof_bonus'));
    ok('proficiency' in state.system.tables, 'таблица приехала вслед за табличным полем');

    state.system = saved;
  });

  test('копирование блока в систему, где всё уже есть — ничего не дублирует', () => {
    const before = state.system.fields.length;
    copyBlockFrom(dnd5e, 'Характеристики');
    eq(state.system.fields.length, before, 'теги совпали — копий нет');
  });

  test('таблица копируется под свободным ключом при конфликте', () => {
    const name = copyTableFrom(dnd5e, 'proficiency');
    ok(name !== 'proficiency', 'своя proficiency уже есть');
    ok(name in state.system.tables);
    delete state.system.tables[name];
  });

  test('палитра механик показывает ВСЕ образцы — и 5e, и киберпанк', () => {
    const html = effectTemplatesHtml();
    ok(html.includes('D&amp;D 5e'), '5e-донор не скрыт, даже если система начата с него');
    ok(html.includes('Киберпанк'));
    ok(html.includes('уже в системе'), 'нетронутые правила образца помечены, а не спрятаны');
  });

  test('в 5e механика зовётся «Атака», а не «Удар» — удар остаётся киберпанку', () => {
    eq(dnd5e.effects.strike.label, 'Атака');
    eq(cp.effects.strike.label, 'Удар');
  });
});

group('словари системы сворачиваются в колонке механик', () => {
  test('toggleDict переключает раскрытие секции и помнит его', () => {
    ok(!state.openDicts.constants, 'по умолчанию секция свёрнута — колонка читается как оглавление');
    toggleDict('constants');
    ok(state.openDicts.constants);
    toggleDict('constants');
    ok(!state.openDicts.constants);
  });
});
