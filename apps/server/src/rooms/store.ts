import type { DatabaseSync } from 'node:sqlite';
import type { Sheet, ClockState, LogEntry } from '@vtt/schema';
import type { Member } from '@vtt/engine/core/authorize';

export interface RoomRow { id: string; title: string; worldId: string; system: string; compendium: string }

export interface Commit {
  roomId: string;
  sheets?: Sheet[];
  clock?: ClockState;
  pending?: { id: string; data: string } | null;
  log?: { id: string; at: string; text: string; hidden: boolean }[];
  journal?: { at: string; userId: string; op: string; input: string; dice: string; result: string };
  member?: { userId: string; sheetId: string | null };
}

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

  pending<T>(roomId: string): (T & { id: string }) | null {
    const row = this.raw.prepare('SELECT id, data FROM room_pending WHERE room_id = ?').get(roomId) as { id: string; data: string } | undefined;
    return row ? { ...(JSON.parse(row.data) as T), id: row.id } : null;
  }

  members(roomId: string): Member[] {
    return (this.raw.prepare('SELECT user_id AS userId, role, sheet_id AS sheetId FROM members WHERE room_id = ?').all(roomId) as { userId: string; role: string; sheetId: string | null }[])
      .map(row => ({ userId: row.userId, role: row.role === 'gm' ? 'gm' : 'player', sheetId: row.sheetId ?? null }));
  }

  log(roomId: string): LogEntry[] {
    return (this.raw.prepare('SELECT id, at, text, hidden FROM log_entries WHERE room_id = ? ORDER BY seq').all(roomId) as { id: string; at: string; text: string; hidden: number }[])
      .map(row => ({ id: row.id, at: row.at, text: row.text, ...(row.hidden ? { hidden: true } : {}) }));
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
          this.raw.prepare('INSERT INTO log_entries (id, room_id, at, text, seq, hidden) VALUES (?, ?, ?, ?, ?, ?)')
            .run(entry.id, roomId, entry.at, entry.text, count + at, entry.hidden ? 1 : 0);
        });
      }
      if (change.member) {
        this.raw.prepare('UPDATE members SET sheet_id = ? WHERE room_id = ? AND user_id = ?').run(change.member.sheetId, roomId, change.member.userId);
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
