import type { DatabaseSync } from 'node:sqlite';
import type { Sheet, ClockState, LogEntry, Places } from '@vtt/schema';
import type { Member } from '@vtt/engine/core/authorize';

export interface RoomRow { id: string; title: string; worldId: string; system: string; compendium: string }

export interface Commit {
  roomId: string;
  sheets?: Sheet[];
  gone?: string[];
  clock?: ClockState;
  pending?: { id: string; data: string } | null;
  log?: { id: string; at: string; text: string; lines?: string | null; hidden: boolean }[];
  journal?: { at: string; userId: string; op: string; input: string; dice: string; result: string };
  member?: { userId: string; sheetId: string | null };
  items?: { userId: string; on: boolean };
}

export const openTable = (): boolean => process.env.VTT_OPEN_TABLE === '1';

export class RoomStore {
  constructor(private readonly raw: DatabaseSync) {}

  room(roomId: string): RoomRow | null {
    return (this.raw.prepare('SELECT id, title, world_id AS worldId, system, compendium FROM rooms WHERE id = ?').get(roomId) as RoomRow | undefined) ?? null;
  }

  sheets(roomId: string): Sheet[] {
    return (this.raw.prepare('SELECT data FROM room_sheets WHERE room_id = ? ORDER BY rowid').all(roomId) as { data: string }[])
      .map(row => JSON.parse(row.data) as Sheet);
  }

  clock(roomId: string): ClockState | null {
    const row = this.raw.prepare('SELECT data FROM room_clocks WHERE room_id = ?').get(roomId) as { data: string } | undefined;
    return row ? JSON.parse(row.data) as ClockState : null;
  }

  places(roomId: string): Places {
    const row = this.raw.prepare('SELECT data FROM room_places WHERE room_id = ?').get(roomId) as { data: string } | undefined;
    return row ? JSON.parse(row.data) as Places : {};
  }

  savePlaces(roomId: string, places: Places): void {
    this.raw.prepare('DELETE FROM room_places WHERE room_id = ?').run(roomId);
    if (Object.keys(places).length) this.raw.prepare('INSERT INTO room_places (room_id, data) VALUES (?, ?)').run(roomId, JSON.stringify(places));
  }

  pending<T>(roomId: string): (T & { id: string }) | null {
    const row = this.raw.prepare('SELECT id, data FROM room_pending WHERE room_id = ?').get(roomId) as { id: string; data: string } | undefined;
    return row ? { ...(JSON.parse(row.data) as T), id: row.id } : null;
  }

  members(roomId: string): Member[] {
    return (this.raw.prepare('SELECT user_id AS userId, role, sheet_id AS sheetId, items FROM members WHERE room_id = ?').all(roomId) as { userId: string; role: string; sheetId: string | null; items: number }[])
      .map(row => ({ userId: row.userId, role: row.role === 'gm' || openTable() ? 'gm' : 'player', sheetId: row.sheetId ?? null, ...(row.items ? { editsItems: true } : {}) }));
  }

  log(roomId: string): LogEntry[] {
    return (this.raw.prepare('SELECT id, at, text, lines, hidden FROM log_entries WHERE room_id = ? ORDER BY seq').all(roomId) as { id: string; at: string; text: string; lines: string | null; hidden: number }[])
      .map(row => ({ id: row.id, at: row.at, text: row.text, ...(row.lines ? { lines: JSON.parse(row.lines) as string[] } : {}), ...(row.hidden ? { hidden: true } : {}) }));
  }

  close(roomId: string): void {
    this.raw.exec('BEGIN');
    try {
      for (const table of ['room_sheets', 'room_clocks', 'room_places', 'room_pending', 'room_journal', 'members', 'log_entries']) {
        this.raw.prepare(`DELETE FROM ${table} WHERE room_id = ?`).run(roomId);
      }
      this.raw.prepare('DELETE FROM rooms WHERE id = ?').run(roomId);
      this.raw.exec('COMMIT');
    } catch (err) {
      this.raw.exec('ROLLBACK');
      throw err;
    }
  }

  commit(change: Commit): void {
    const { roomId } = change;
    this.raw.exec('BEGIN');
    try {
      for (const sheet of change.sheets ?? []) {
        const known = this.raw.prepare('SELECT 1 FROM room_sheets WHERE room_id = ? AND sheet_id = ?').get(roomId, sheet.id);
        if (known) this.raw.prepare('UPDATE room_sheets SET data = ? WHERE room_id = ? AND sheet_id = ?').run(JSON.stringify(sheet), roomId, sheet.id);
        else this.raw.prepare('INSERT INTO room_sheets (room_id, sheet_id, data) VALUES (?, ?, ?)').run(roomId, sheet.id, JSON.stringify(sheet));
      }
      for (const id of change.gone ?? []) {
        this.raw.prepare('DELETE FROM room_sheets WHERE room_id = ? AND sheet_id = ?').run(roomId, id);
        this.raw.prepare('UPDATE members SET sheet_id = NULL WHERE room_id = ? AND sheet_id = ?').run(roomId, id);
      }
      if (change.gone?.length) {
        const places = this.places(roomId);
        const kept = Object.fromEntries(Object.entries(places).filter(([id]) => !change.gone!.includes(id)));
        if (Object.keys(kept).length !== Object.keys(places).length) this.savePlaces(roomId, kept);
      }
      if (change.clock) {
        this.raw.prepare('DELETE FROM room_clocks WHERE room_id = ?').run(roomId);
        this.raw.prepare('INSERT INTO room_clocks (room_id, data) VALUES (?, ?)').run(roomId, JSON.stringify(change.clock));
      }
      if (change.pending !== undefined) {
        this.raw.prepare('DELETE FROM room_pending WHERE room_id = ?').run(roomId);
        if (change.pending) this.raw.prepare('INSERT INTO room_pending (id, room_id, data) VALUES (?, ?, ?)').run(change.pending.id, roomId, change.pending.data);
      }
      if (change.log?.length) {
        const { count } = this.raw.prepare('SELECT COUNT(*) AS count FROM log_entries WHERE room_id = ?').get(roomId) as { count: number };
        change.log.forEach((entry, at) => {
          this.raw.prepare('INSERT INTO log_entries (id, room_id, at, text, lines, seq, hidden) VALUES (?, ?, ?, ?, ?, ?, ?)')
            .run(entry.id, roomId, entry.at, entry.text, entry.lines ?? null, count + at, entry.hidden ? 1 : 0);
        });
      }
      if (change.member) {
        this.raw.prepare('UPDATE members SET sheet_id = ? WHERE room_id = ? AND user_id = ?').run(change.member.sheetId, roomId, change.member.userId);
      }
      if (change.items) {
        this.raw.prepare('UPDATE members SET items = ? WHERE room_id = ? AND user_id = ?').run(change.items.on ? 1 : 0, roomId, change.items.userId);
      }
      if (change.journal) {
        const last = this.raw.prepare('SELECT MAX(seq) AS seq FROM room_journal WHERE room_id = ?').get(roomId) as { seq: number | null };
        const j = change.journal;
        this.raw.prepare('INSERT INTO room_journal (room_id, seq, at, user_id, op, input, dice, result) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
          .run(roomId, (last.seq ?? -1) + 1, j.at, j.userId, j.op, j.input, j.dice, j.result);
      }
      this.raw.exec('COMMIT');
    } catch (err) {
      this.raw.exec('ROLLBACK');
      throw err;
    }
  }
}
