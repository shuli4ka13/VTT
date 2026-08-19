import { group, test, eq, ok, deepEq } from './harness.ts';
import { migrateWorld, needsMigration } from '../src/model/migrate.ts';

import { send, receive, availableActions } from '../src/events/envelope.ts';

const queue = (...values) => {
  const rest = [...values];
  return () => rest.shift();
};

const oldWorld = () => ({
  system: {
    id: 'old', name: 'Старый мир',
    constants: { lead_die: { label: 'к20', kind: 'die', dice: [{ count: 1, sides: 20 }] } },
    rolls: [{ tag: 'attack_roll', label: 'Атака' }],
    records: {
      weapon: { kind: 'item', label: 'Оружие', icon: '⚔', hint: '…',
        props: [{ key: 'damage_dice', label: 'Кость урона', kind: 'dice' }] },
      effect: { kind: 'effect', label: 'Эффект', icon: '✦', hint: '…' },
      call: { kind: 'call', label: 'Вызов правила', icon: '⚙', hint: '…' },
      action: { kind: 'action', label: 'Действие', icon: '✊', hint: '…' },
    },
    rules: {
      strike: {
        label: 'Атака',
        params: [
          { key: 'bonus', label: 'Бонус', kind: 'expr' },
          { key: 'versus', label: 'Против', kind: 'tag' },
          { key: 'apply_to', label: 'Куда', kind: 'tag' },
        ],
        steps: [
          { id: 'hit', type: 'threshold',
            roll: { die: { constant: 'lead_die' }, bonus: { param: 'bonus' }, check: 'attack_roll' },
            versus: { param: 'versus' } },
          { id: 'dmg', type: 'amount', source: 'roll', dice: { item: 'damage_dice' } },
          { type: 'apply', target: { param: 'apply_to' }, direction: 'subtract',
            value: { ref: 'dmg' }, floor: { const: 0 }, targetModifiers: true },
        ],
      },
    },
    modifiers: [{
      id: 'rule_fog', label: 'Туман мешает всем', kind: 'roll', target: 'attack_roll',
      effect: 'disadvantage', method: 'rerollBest', condition: null,
    }],
    advantage: { methods: { rerollBest: true } },
    fields: [
      { tag: 'atk', label: 'Атака', group: 'Бой', value: { kind: 'stored', type: 'number', default: 5 } },
      { tag: 'def', label: 'Защита', group: 'Бой', value: { kind: 'stored', type: 'number', default: 10 } },
      { tag: 'hp', label: 'Хиты', group: 'Бой', value: { kind: 'stored', type: 'number', default: 20 } },
    ],
  },
  compendium: {
    items: [{
      id: 'sword', rk: 'weapon', label: 'Меч', props: { damage_dice: '1d8' },
      activities: [{ label: 'Удар', effect: 'sword-strike' }], modifiers: [],
    }],
    effects: [
      { id: 'poisoned', rk: 'effect', label: 'Отравлен', icon: '☠',
        modifiers: [{ kind: 'roll', target: 'attack_roll', effect: 'disadvantage', method: 'rerollBest', condition: null }] },
      { id: 'sword-strike', rk: 'call', label: 'Удар мечом', rule: 'strike',
        params: { bonus: '#atk', versus: 'def', apply_to: 'hp' } },
    ],
    actions: [{ id: 'punch', rk: 'action', label: 'Кулак', effect: 'sword-strike' }],
  },
  sheets: [
    { id: 'a', systemId: 'old', kind: 'pc', name: 'А', values: { atk: 5, def: 10, hp: 20 },
      equipped: ['sword'], effects: [{ effectId: 'poisoned' }], actions: [] },
    { id: 'b', systemId: 'old', kind: 'npc', name: 'Б', values: { atk: 2, def: 8, hp: 15 },
      equipped: [], effects: [], actions: ['punch'] },
  ],
});

group('миграция мира со старого формата', () => {
  test('старый формат распознаётся, новый — нет', () => {
    ok(needsMigration(oldWorld()));
    ok(!needsMigration(migrateWorld(oldWorld())), 'дважды не мигрируем');
  });

  test('правила-конвейеры становятся активируемыми эффектами под теми же id', () => {
    const { system } = migrateWorld(oldWorld());
    eq(system.rules, undefined, 'секции rules больше нет');
    ok(system.effects.strike, 'id сохранён — ссылки не порвались');
    eq(system.effects.strike.activation, 'manual');
    eq(system.effects.strike.steps.length, 3, 'шаги переехали целиком');
  });

  test('правила комнаты становятся пассивными эффектами плюс список включённых', () => {
    const { system } = migrateWorld(oldWorld());
    eq(system.modifiers, undefined, 'голых модификаторов в системе больше нет');
    ok(system.effects.rule_fog, 'правило стало эффектом');
    eq(system.effects.rule_fog.activation, 'passive');
    deepEq(system.room_rules, ['rule_fog'], 'и включено на всех');

    const mod = system.effects.rule_fog.modifiers[0];
    eq(mod.target, 'attack_roll');
    ok(!('id' in mod) && !('label' in mod));
  });

  test('длящиеся эффекты компендиума переезжают в библиотеку системы', () => {
    const { system, compendium } = migrateWorld(oldWorld());
    eq(compendium.effects, undefined, 'полки эффектов в компендиуме больше нет');
    ok(system.effects.poisoned, 'эффект — теперь закон системы');
    eq(system.effects.poisoned.activation, 'passive');
    eq(system.effects.poisoned.duration.kind, 'temporary');
  });

  test('вызовы РАСТВОРЯЮТСЯ: параметры переезжают в привязку записи', () => {
    const { system, compendium } = migrateWorld(oldWorld());
    ok(!system.effects['sword-strike'], 'промежуточной записи не осталось');

    const sword = compendium.items.find(i => i.id === 'sword');
    eq(sword.activities[0].effect, 'strike', 'запись ссылается на эффект напрямую');
    deepEq(sword.activities[0].args, { bonus: '#atk', versus: 'def', apply_to: 'hp' },
      'а параметры вызова стали её аргументами');

    const punch = compendium.actions.find(a => a.id === 'punch');
    eq(punch.effect, 'strike');
    deepEq(punch.args, { bonus: '#atk', versus: 'def', apply_to: 'hp' });
  });

  test('рода «вызов» и «эффект» уходят: описанной ими полки больше нет', () => {
    const { system } = migrateWorld(oldWorld());
    deepEq(Object.keys(system.records).sort(), ['action', 'weapon']);
  });

  test('чарники не трогаются: ссылка на эффект по id как была', () => {
    const { sheets } = migrateWorld(oldWorld());
    deepEq(sheets[0].effects, [{ effectId: 'poisoned' }]);
  });

  test('мигрированный мир СРАЗУ РАБОТАЕТ — это и есть смысл миграции', () => {
    const world = migrateWorld(oldWorld());
    const { system, compendium, sheets } = world;
    const [a, b] = sheets;

    const list = availableActions(a, { system, compendium });
    ok(list.some(x => x.id === 'sword:0'), 'меч даёт удар');

    const env = send('sword:0', { system, sheet: a, compendium, die: queue(15, 4, 6) });
    const { sheet, report } = receive(env, { system, sheet: b, compendium, die: queue() });
    deepEq(report.trace[0].rolls, [15, 4], 'две кости — помеха на месте');
    eq(report.trace[0].kept, 4, 'взята худшая');
    eq(sheet.values.hp, 9, '15 минус кость урона 6');
  });

  test('файл мира версии 1 читается и мигрируется при загрузке', () => {

    const text = JSON.stringify({ version: 1, ...oldWorld() });
    const world = migrateWorld(JSON.parse(text));
    ok(world.system.effects.strike, 'после загрузки формат уже новый');
    eq(world.system.rules, undefined);
  });
});
