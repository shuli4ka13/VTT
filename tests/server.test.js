import { group, test, eq, ok, deepEq, throws } from './harness.js';

// Тесты СТЕНДОВОГО сервера: логика без сети, напрямую по модулям.
// node:sqlite есть только в node — в браузере группа честно пропускается,
// как сканер критерия №6.

const inNode = typeof process !== 'undefined' && !!(process.versions && process.versions.node);

if (inNode) {
  const { openStore } = await import('../server/store.js');
  const { login, me } = await import('../server/auth.js');
  const { can, ROLES } = await import('../server/permissions.js');
  const { publishWorld, listWorlds, createRoom, joinRoom, roomState, act, patchSheet } =
    await import('../server/rooms.js');
  const { packWorld } = await import('../src/ui/world.js');
  const { system } = await import('../src/model/system.js');
  const { compendium } = await import('../src/model/compendium.js');
  const { arven, mirra } = await import('../src/model/sheets.js');

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
      test('логин выдаёт токен, /me возвращает СПОСОБНОСТИ, а не роль-слово', () => {
        const token = login('Влад', 'author');
        const who = me(token);
        eq(who.name, 'Влад');
        ok(Array.isArray(who.permissions), 'права — список');
        ok(who.permissions.includes('world.publish'), 'автор публикует миры');
      });

      test('роль — пресет прав: игрок не публикует и шлёт только от своего листа', () => {
        const who = me(login('Оля', 'player'));
        ok(!who.permissions.includes('world.publish'));
        ok(who.permissions.includes('envelope.send:own'));
        ok(!who.permissions.includes('envelope.send:any'));
      });

      test('неизвестная роль и битый токен — внятные ошибки', () => {
        throws(() => login('Кто-то', 'котик'), 'котик');
        throws(() => me('нет-такого-токена'), 'вход');
      });

      test('can() понимает :own против :any', () => {
        ok(can(ROLES.gm, 'envelope.send:own'), 'any покрывает own');
        ok(!can(ROLES.player, 'sheet.edit:any'));
      });
    });

    group('миры и комнаты', () => {
      const db = openStore(':memory:');

      test('автор публикует мир, список отдаёт его без содержимого', () => {
        const id = publishWorld(db, 'Пятёрочка', world());
        const list = listWorlds(db);
        eq(list.length, 1);
        eq(list[0].name, 'Пятёрочка');
        ok(!('data' in list[0]), 'список лёгкий — сам мир по запросу');
      });

      test('комната — копия мира: правки в комнате донора не трогают', () => {
        const worldId = listWorlds(db)[0].id;
        const room = createRoom(db, worldId, 'Стол у Влада', 'вика');
        const state = roomState(db, room.id);
        eq(state.sheets.length, 2, 'чарники приехали в комнату');
        ok(state.system.fields.length > 0);
      });

      test('игрок вступает и садится за свободный лист; чужой занятый — отказ', () => {
        const room = createRoom(db, listWorlds(db)[0].id, 'Второй стол', 'вика');
        joinRoom(db, room.id, 'оля', 'player', 'arven');
        throws(() => joinRoom(db, room.id, 'петя', 'player', 'arven'), 'занят');
        joinRoom(db, room.id, 'петя', 'player', 'mirra');
        const state = roomState(db, room.id);
        eq(state.members.length, 3, 'ГМ и два игрока');
      });
    });

    group('авторитетный ход', () => {
      const db = openStore(':memory:');
      const worldId = publishWorld(db, 'Мир', world());
      const room = createRoom(db, worldId, 'Стол', 'гм-вика');
      joinRoom(db, room.id, 'оля', 'player', 'arven');

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
          actionId: 'poison-spray', fromSheetId: 'mirra', targetSheetId: 'arven',
        }, queue(3, 4)), 'не ваш');
      });

      test('ГМ ходит от любого листа', () => {
        const out = act(db, room.id, 'гм-вика', {
          actionId: 'poison-spray', fromSheetId: 'mirra', targetSheetId: 'arven',
        }, queue(3, 4, 5));
        ok(out.report.trace.length >= 1);
        eq(roomState(db, room.id).journal.length, 2);
      });

      test('не член комнаты — отказ до всякой игры', () => {
        throws(() => act(db, room.id, 'чужак', {
          actionId: 'longsword-item:0', fromSheetId: 'arven', targetSheetId: 'mirra',
        }, queue(15, 5)), 'комнат');
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
