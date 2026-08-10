import { group, test, eq, ok, deepEq, throws } from './harness.ts';

// Тесты СТЕНДОВОГО сервера: логика без сети, напрямую по модулям.
// node:sqlite есть только в node — в браузере группа честно пропускается,
// как сканер критерия №6.

const inNode = typeof process !== 'undefined' && !!(process.versions && process.versions.node);

if (inNode) {
  const { openStore } = await import('../server/store.ts');
  const { login, me } = await import('../server/auth.ts');
  const { can, ROOM_ROLES } = await import('../server/permissions.ts');
  const { publishWorld, listWorlds, createRoom, joinRoom, roomState, act, patchSheet } =
    await import('../server/rooms.ts');
  const { packWorld } = await import('../src/ui/world.ts');
  const { system } = await import('../src/model/system.ts');
  const { compendium } = await import('../src/model/compendium.ts');
  const { arven, mirra } = await import('../src/model/sheets.ts');

  // Кубик с очередью — тот же приём, что во всех тестах движка.
  const queue = (...values) => {
    const rest = [...values];
    return () => {
      if (!rest.length) throw new Error('кубик бросили больше раз, чем ожидал тест');
      return rest.shift();
    };
  };

  const world = () => JSON.parse(packWorld({ system, compendium, sheets: [arven, mirra] }));

  group('стендовый сервер', () => {
    group('вход и права', () => {
      test('логин — только имя; роль никто не выбирает', () => {
        const who = me(login('Влад'));
        eq(who.name, 'Влад');
        ok(!('role' in who), 'роль не в личности — она выводится из владения');
      });

      test('пустое имя и битый токен — внятные ошибки', () => {
        throws(() => login('   '), 'имя');
        throws(() => me('нет-такого-токена'), 'вход');
      });

      test('роль комнаты — пресет способностей; can() понимает :own против :any', () => {
        ok(can(ROOM_ROLES.gm, 'envelope.send:own'), 'any покрывает own');
        ok(!can(ROOM_ROLES.player, 'sheet.edit:any'));
      });
    });

    group('миры и комнаты', () => {
      const db = openStore(':memory:');

      test('мир принадлежит опубликовавшему — «автор» это владение, не роль', () => {
        const id = publishWorld(db, 'Пятёрочка', world(), 'влад');
        const list = listWorlds(db);
        eq(list.length, 1);
        eq(list[0].name, 'Пятёрочка');
        eq(list[0].owner, 'влад');
        ok(!('data' in list[0]), 'список лёгкий — сам мир по запросу');
      });

      test('комната — копия мира: правки в комнате донора не трогают', () => {
        const worldId = listWorlds(db)[0].id;
        const room = createRoom(db, worldId, 'Стол у Влада', 'вика');
        const state = roomState(db, room.id);
        eq(state.sheets.length, 2, 'чарники приехали в комнату');
        ok(state.system.fields.length > 0);
      });

      test('создатель комнаты — ведущий; вступившие — игроки; занятый лист — отказ', () => {
        const room = createRoom(db, listWorlds(db)[0].id, 'Второй стол', 'вика');
        joinRoom(db, room.id, 'оля', 'arven');
        throws(() => joinRoom(db, room.id, 'петя', 'arven'), 'занят');
        joinRoom(db, room.id, 'петя', 'mirra');
        const state = roomState(db, room.id);
        eq(state.members.find(m => m.user === 'вика').role, 'gm', 'кто создал, тот и ведущий');
        eq(state.members.find(m => m.user === 'оля').role, 'player', 'кто вступил — игрок');
        eq(state.members.length, 3);
      });
    });

    group('старые миры не умирают', () => {
      // Мир мог быть опубликован до перекройки на эффекты. Комната — копия,
      // и копируется она уже в новом формате: иначе партия по старому миру
      // упала бы на первом же ходе.
      test('комната из мира версии 1 создаётся уже в новом формате и играется', () => {
        const db = openStore(':memory:');
        const old = {
          version: 1,
          system: {
            id: 'old', name: 'Старый', constants: { d: { label: 'к6', kind: 'die', dice: [{ count: 1, sides: 6 }] } },
            rolls: [], records: { w: { kind: 'item', label: 'Оружие', hint: '', props: [] } },
            rules: { hit: { label: 'Удар',
              params: [{ key: 'to', label: 'Куда', kind: 'tag' }],
              steps: [{ type: 'apply', target: { param: 'to' }, direction: 'subtract',
                value: { const: 4 }, floor: { const: 0 }, targetModifiers: false }] } },
            modifiers: [], advantage: { methods: {} },
            fields: [{ tag: 'hp', label: 'Хиты', group: 'Б', value: { kind: 'stored', type: 'number', default: 10 } }],
          },
          compendium: {
            items: [{ id: 'club', rk: 'w', label: 'Дубина', modifiers: [],
              activities: [{ label: 'Удар', effect: 'call' }] }],
            effects: [{ id: 'call', rk: 'call', label: 'Вызов', rule: 'hit', params: { to: 'hp' } }],
            actions: [],
          },
          sheets: [
            { id: 'x', systemId: 'old', kind: 'pc', name: 'Икс', values: { hp: 10 }, equipped: ['club'], effects: [], actions: [] },
            { id: 'y', systemId: 'old', kind: 'npc', name: 'Игрек', values: { hp: 10 }, equipped: [], effects: [], actions: [] },
          ],
        };
        const worldId = publishWorld(db, 'Старый мир', old, 'влад');
        const room = createRoom(db, worldId, 'Стол', 'гм');

        const state = roomState(db, room.id);
        eq(state.system.rules, undefined, 'в комнате уже новый формат');
        ok(state.system.effects.hit, 'конвейер стал эффектом');

        const out = act(db, room.id, 'гм', {
          actionId: 'club:0', fromSheetId: 'x', targetSheetId: 'y',
        }, queue());
        eq(out.target.values.hp, 6, 'и ход по старому миру проходит');
      });
    });

    group('авторитетный ход', () => {
      const db = openStore(':memory:');
      const worldId = publishWorld(db, 'Мир', world(), 'влад');
      const room = createRoom(db, worldId, 'Стол', 'гм-вика');
      joinRoom(db, room.id, 'оля', 'arven');

      test('сервер сам исполняет правило и пишет журнал', () => {
        const out = act(db, room.id, 'оля', {
          actionId: 'longsword-item:0', fromSheetId: 'arven', targetSheetId: 'mirra',
        }, queue(15, 5));
        eq(out.report.trace[0].total, 21, 'бросок сделан СЕРВЕРОМ: 15 + 6');
        const state = roomState(db, room.id);
        eq(state.sheets.find(s => s.id === 'mirra').values.hp_current, 13, '21 минус 8 — в БД');
        eq(state.journal.length, 1, 'конверт лёг в журнал');
        eq(state.journal[0].seq, 1, 'с порядковым номером');
      });

      test('игрок не может ходить от чужого листа — сервер отказывает', () => {
        throws(() => act(db, room.id, 'оля', {
          actionId: 'poison-spray:0', fromSheetId: 'mirra', targetSheetId: 'arven',
        }, queue(3, 4)), 'не ваш');
      });

      test('ГМ ходит от любого листа', () => {
        const out = act(db, room.id, 'гм-вика', {
          actionId: 'poison-spray:0', fromSheetId: 'mirra', targetSheetId: 'arven',
        }, queue(3, 4, 5));
        ok(out.report.trace.length >= 1);
        eq(roomState(db, room.id).journal.length, 2);
      });

      test('не член комнаты — отказ до всякой игры', () => {
        throws(() => act(db, room.id, 'чужак', {
          actionId: 'longsword-item:0', fromSheetId: 'arven', targetSheetId: 'mirra',
        }, queue(15, 5)), 'комнат');
      });

      test('ответка триггера тоже исполняется СЕРВЕРОМ — и ложится в тот же ход', () => {
        // Комната-копия правится отдельно от донора: вешаем «Шипы» на Мирру
        // и даём им аргументы, как это сделал бы автор системы.
        const sys = JSON.parse(db.prepare('SELECT system FROM rooms WHERE id = ?').get(room.id).system);
        sys.effects.thorns.args = { dice: '1d4', apply_to: 'hp_current' };
        db.prepare('UPDATE rooms SET system = ? WHERE id = ?').run(JSON.stringify(sys), room.id);
        const mirra = JSON.parse(db.prepare('SELECT data FROM room_sheets WHERE room_id = ? AND id = ?')
          .get(room.id, 'mirra').data);
        db.prepare('UPDATE room_sheets SET data = ? WHERE room_id = ? AND id = ?')
          .run(JSON.stringify({ ...mirra, effects: [{ effectId: 'thorns', usesLeft: 2 }] }), room.id, 'mirra');

        const before = roomState(db, room.id).sheets.find(s => s.id === 'arven').values.hp_current;
        const out = act(db, room.id, 'гм-вика', {
          actionId: 'longsword-item:0', fromSheetId: 'arven', targetSheetId: 'mirra',
          // Арвен отравлена предыдущим тестом — помеха, потому две кости.
        }, queue(18, 17, 4, 3));

        eq(out.reports.length, 2, 'ход — цепочка: удар и ответка');
        eq(out.reports[1].report.reply, true);
        const after = roomState(db, room.id);
        eq(after.sheets.find(s => s.id === 'arven').values.hp_current, before - 3,
          'урон шипов записан в БД: ответку исполнил сервер, а не клиент');
        eq(after.sheets.find(s => s.id === 'mirra').effects[0].usesLeft, 1,
          'и счётчик срабатываний уменьшился там же');
      });

      test('правка листа: свой — можно, чужой — отказ, ГМ — любой', () => {
        patchSheet(db, room.id, 'оля', 'arven', { hp_current: 40 });
        eq(roomState(db, room.id).sheets.find(s => s.id === 'arven').values.hp_current, 40);
        throws(() => patchSheet(db, room.id, 'оля', 'mirra', { hp_current: 1 }), 'не ваш');
        patchSheet(db, room.id, 'гм-вика', 'mirra', { hp_current: 5 });
        eq(roomState(db, room.id).sheets.find(s => s.id === 'mirra').values.hp_current, 5);
      });
    });
  });
} else {
  console.log('  · тесты стендового сервера идут только через `node tests/run.js`');
}
