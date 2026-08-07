// Комнаты стенда. Здесь — то самое «общение чарников по правилам системы»,
// но АВТОРИТЕТНО: сервер исполняет тот же движок (src/events, src/engine),
// что и браузер, бросает свои кости и не верит клиенту ни в одном числе.
// Клиент присылает только намерение: каким действием, от какого листа,
// по какому листу.

import { randomUUID } from 'node:crypto';
import { exchange } from '../src/events/exchange.js';
import { migrateWorld } from '../src/model/migrate.js';
import { randomDie } from '../src/engine/dice.js';
import { me } from './auth.js';
import { can, ROOM_ROLES } from './permissions.js';

// ── миры ─────────────────────────────────────────────────────────────────────

// Автор — не роль из выпадашки, а владение: кто опубликовал, тот и автор.
export function publishWorld(db, name, world, owner) {
  const id = randomUUID();
  db.prepare('INSERT INTO worlds (id, name, owner, data) VALUES (?, ?, ?, ?)')
    .run(id, name, owner, JSON.stringify(world));
  return id;
}

export function listWorlds(db) {
  return db.prepare('SELECT id, name, owner FROM worlds').all();
}

// ── комнаты ──────────────────────────────────────────────────────────────────

// Комната — КОПИЯ мира: партия играет в свой экземпляр, публикация не мутирует.
// Создатель комнаты становится её ВЕДУЩИМ — роль из владения, как у Owlbear.
export function createRoom(db, worldId, name, byUser) {
  const row = db.prepare('SELECT data FROM worlds WHERE id = ?').get(worldId);
  if (!row) throw new Error(`мира «${worldId}» на сервере нет`);
  // Мир мог быть опубликован до перекройки на эффекты. Комната — копия,
  // и копируется она уже в новом формате: иначе партия по старому миру
  // упала бы на первом же ходе.
  const world = migrateWorld(JSON.parse(row.data));

  const id = randomUUID();
  db.prepare('INSERT INTO rooms (id, name, world_id, system, compendium) VALUES (?, ?, ?, ?, ?)')
    .run(id, name, worldId, JSON.stringify(world.system), JSON.stringify(world.compendium));
  for (const sheet of world.sheets) {
    db.prepare('INSERT INTO room_sheets (room_id, id, data) VALUES (?, ?, ?)')
      .run(id, sheet.id, JSON.stringify(sheet));
  }
  db.prepare("INSERT INTO members (room_id, user, role, sheet_id) VALUES (?, ?, 'gm', NULL)")
    .run(id, byUser);
  return { id, name };
}

export function listRooms(db) {
  return db.prepare('SELECT id, name FROM rooms').all();
}

// Вступивший — игрок; уже состоящий сохраняет свою роль (ведущий, севший
// за лист, остаётся ведущим). Роль при вступлении не выбирается.
export function joinRoom(db, roomId, user, sheetId = null) {
  assertRoom(db, roomId);
  if (sheetId) {
    const taken = db.prepare('SELECT user FROM members WHERE room_id = ? AND sheet_id = ?')
      .get(roomId, sheetId);
    if (taken && taken.user !== user) {
      throw new Error(`лист «${sheetId}» занят: за ним сидит ${taken.user}`);
    }
  }
  db.prepare(`INSERT INTO members (room_id, user, role, sheet_id) VALUES (?, ?, 'player', ?)
    ON CONFLICT (room_id, user) DO UPDATE SET sheet_id = excluded.sheet_id`)
    .run(roomId, user, sheetId);
}

export function roomState(db, roomId) {
  const room = assertRoom(db, roomId);
  return {
    id: room.id,
    name: room.name,
    system: JSON.parse(room.system),
    compendium: JSON.parse(room.compendium),
    sheets: db.prepare('SELECT data FROM room_sheets WHERE room_id = ?').all(roomId)
      .map(r => JSON.parse(r.data)),
    members: db.prepare('SELECT user, role, sheet_id FROM members WHERE room_id = ?').all(roomId),
    journal: db.prepare('SELECT seq, data FROM envelopes WHERE room_id = ? ORDER BY seq DESC LIMIT 30')
      .all(roomId).map(r => ({ seq: r.seq, ...JSON.parse(r.data) })),
  };
}

// ── авторитетный ход ─────────────────────────────────────────────────────────

export function act(db, roomId, user, { actionId, fromSheetId, targetSheetId }, die = randomDie) {
  const room = assertRoom(db, roomId);
  const member = memberOf(db, roomId, user);
  assertOwn(member, fromSheetId, 'envelope.send', 'ходить');

  const system = JSON.parse(room.system);
  const compendium = JSON.parse(room.compendium);
  const sheets = db.prepare('SELECT data FROM room_sheets WHERE room_id = ?')
    .all(roomId).map(row => JSON.parse(row.data));

  // ВЕСЬ ход исполняет СЕРВЕР — своим экземпляром того же движка, включая
  // ответки триггеров. Собирать цепочку здесь нельзя: тогда в комнате
  // работало бы одно, а в оффлайне другое. Кости серверные: класс читов
  // «подправил бросок в консоли» умирает.
  const { sheets: after, reports } = exchange({
    system, compendium, die, sheets, actionId, fromId: fromSheetId, toId: targetSheetId,
  });

  const write = db.prepare('UPDATE room_sheets SET data = ? WHERE room_id = ? AND id = ?');
  const touched = new Set(reports.map(r => r.toId));
  for (const sheet of after) {
    if (touched.has(sheet.id)) write.run(JSON.stringify(sheet), roomId, sheet.id);
  }

  const seq = nextSeq(db, roomId);
  db.prepare('INSERT INTO envelopes (room_id, seq, data) VALUES (?, ?, ?)')
    .run(roomId, seq, JSON.stringify({ by: user, target: targetSheetId, reports }));

  const find = id => after.find(s => s.id === id) || null;
  return {
    seq, reports,
    report: reports[0].report,
    from: find(fromSheetId),
    target: find(targetSheetId),
  };
}

export function patchSheet(db, roomId, user, sheetId, values) {
  assertRoom(db, roomId);
  const member = memberOf(db, roomId, user);
  assertOwn(member, sheetId, 'sheet.edit', 'править лист');

  const sheet = sheetOf(db, roomId, sheetId);
  const next = { ...sheet, values: { ...sheet.values, ...values } };
  db.prepare('UPDATE room_sheets SET data = ? WHERE room_id = ? AND id = ?')
    .run(JSON.stringify(next), roomId, sheetId);
  return next;
}

// ── сторожа ──────────────────────────────────────────────────────────────────

function assertRoom(db, roomId) {
  const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(roomId);
  if (!room) throw new Error(`комнаты «${roomId}» нет`);
  return room;
}

function memberOf(db, roomId, user) {
  const member = db.prepare('SELECT * FROM members WHERE room_id = ? AND user = ?')
    .get(roomId, user);
  if (!member) throw new Error(`«${user}» не в этой комнате — сначала вступите`);
  return member;
}

function sheetOf(db, roomId, sheetId) {
  const row = db.prepare('SELECT data FROM room_sheets WHERE room_id = ? AND id = ?')
    .get(roomId, sheetId);
  if (!row) throw new Error(`в комнате нет листа «${sheetId}»`);
  return JSON.parse(row.data);
}

// Право со scope: «any» — можно чужое, «own» — только лист, за которым сидишь.
function assertOwn(member, sheetId, permission, verb) {
  const permissions = ROOM_ROLES[member.role] || [];
  if (can(permissions, `${permission}:any`)) return;
  if (can(permissions, `${permission}:own`) && member.sheet_id === sheetId) return;
  throw new Error(`это не ваш лист: ${verb} от «${sheetId}» нельзя`);
}

function nextSeq(db, roomId) {
  const row = db.prepare('SELECT MAX(seq) AS top FROM envelopes WHERE room_id = ?').get(roomId);
  return (row.top || 0) + 1;
}

export { me };
