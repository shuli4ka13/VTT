import { WebSocketGateway, WebSocketServer, SubscribeMessage, MessageBody, ConnectedSocket } from '@nestjs/websockets';
import { Injectable, Inject } from '@nestjs/common';
import type { WebSocket, Server } from 'ws';
import { RoomsService } from '../rooms/rooms.service.ts';
import { AuthService } from '../auth/auth.service.ts';
import { api } from '@vtt/schema';
import type { ServerMessage } from '@vtt/schema';

interface Guest { socket: WebSocket; roomId: string; userId: string }

@Injectable()
@WebSocketGateway({ path: '/ws' })
export class TableGateway {
  @WebSocketServer() server!: Server;

  private readonly guests = new Set<Guest>();

  constructor(
    @Inject(RoomsService) private readonly roomsService: RoomsService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  @SubscribeMessage('room:join')
  async join(@MessageBody() raw: unknown, @ConnectedSocket() socket: WebSocket) {
    const parsed = api.clientMessage.safeParse({ type: 'room:join', ...(raw as object) });
    if (!parsed.success || parsed.data.type !== 'room:join') {
      return this.fail(socket, 'сообщение «войти в комнату» не проходит схему');
    }

    const { roomId, token } = parsed.data;
    let userId: string;
    try {
      ({ userId } = await this.auth.whoIs(token));
      await this.roomsService.join(userId, roomId);
    } catch (err) {
      return this.fail(socket, (err as Error).message);
    }

    for (const guest of this.guests) {
      if (guest.socket === socket) this.guests.delete(guest);
    }
    this.guests.add({ socket, roomId, userId });
    socket.once('close', () => {
      for (const guest of this.guests) {
        if (guest.socket === socket) this.guests.delete(guest);
      }
      this.announceMembers(roomId);
    });

    this.send(socket, { type: 'room:state', state: await this.roomsService.state(roomId) });
    this.announceMembers(roomId);
  }

  @SubscribeMessage('room:act')
  async act(@MessageBody() raw: unknown, @ConnectedSocket() socket: WebSocket) {
    const guest = this.guestOf(socket);
    if (!guest) return this.fail(socket, 'сначала войдите в комнату');

    const parsed = api.actIntent.safeParse((raw as { intent?: unknown })?.intent ?? raw);
    if (!parsed.success) return this.fail(socket, 'намерение не проходит схему');

    try {
      const delta = await this.roomsService.act(guest.userId, parsed.data);
      this.broadcast(delta.roomId, { type: 'room:delta', delta });
    } catch (err) {
      this.fail(socket, (err as Error).message);
    }
  }

  @SubscribeMessage('room:turn')
  async turn(@MessageBody() raw: unknown, @ConnectedSocket() socket: WebSocket) {
    const guest = this.guestOf(socket);
    if (!guest) return this.fail(socket, 'сначала войдите в комнату');

    const parsed = api.turnIntent.safeParse((raw as { intent?: unknown })?.intent ?? raw);
    if (!parsed.success) return this.fail(socket, 'команда хода не проходит схему');

    try {
      const delta = await this.roomsService.turn(guest.userId, parsed.data);
      this.broadcast(delta.roomId, { type: 'room:delta', delta });
    } catch (err) {
      this.fail(socket, (err as Error).message);
    }
  }

  @SubscribeMessage('room:answer')
  async answer(@MessageBody() raw: unknown, @ConnectedSocket() socket: WebSocket) {
    const guest = this.guestOf(socket);
    if (!guest) return this.fail(socket, 'сначала войдите в комнату');

    const parsed = api.answerIntent.safeParse((raw as { intent?: unknown })?.intent ?? raw);
    if (!parsed.success) return this.fail(socket, 'ответ не проходит схему');

    try {
      const delta = await this.roomsService.answer(guest.userId, parsed.data);
      this.broadcast(delta.roomId, { type: 'room:delta', delta });
    } catch (err) {
      this.fail(socket, (err as Error).message);
    }
  }

  @SubscribeMessage('sheet:set')
  async setValue(@MessageBody() raw: unknown, @ConnectedSocket() socket: WebSocket) {
    const guest = this.guestOf(socket);
    if (!guest) return this.fail(socket, 'сначала войдите в комнату');

    const parsed = api.clientMessage.safeParse({ type: 'sheet:set', ...(raw as object) });
    if (!parsed.success || parsed.data.type !== 'sheet:set') {
      return this.fail(socket, 'правка значения не проходит схему');
    }

    const { roomId, sheetId, tag, value } = parsed.data;
    try {
      const delta = await this.roomsService.setValue(guest.userId, roomId, sheetId, tag, value);
      this.broadcast(roomId, { type: 'room:delta', delta });
    } catch (err) {
      this.fail(socket, (err as Error).message);
    }
  }

  @SubscribeMessage('sheet:create')
  async createSheet(@MessageBody() raw: unknown, @ConnectedSocket() socket: WebSocket) {
    const guest = this.guestOf(socket);
    if (!guest) return this.fail(socket, 'сначала войдите в комнату');

    const parsed = api.clientMessage.safeParse({ type: 'sheet:create', ...(raw as object) });
    if (!parsed.success || parsed.data.type !== 'sheet:create') {
      return this.fail(socket, 'создание листа не проходит схему');
    }

    try {
      const delta = await this.roomsService.createSheet(
        guest.userId, parsed.data.roomId, parsed.data.name, parsed.data.of);
      this.broadcast(parsed.data.roomId, { type: 'room:delta', delta });
    } catch (err) {
      this.fail(socket, (err as Error).message);
    }
  }

  @SubscribeMessage('sheet:claim')
  async claimSheet(@MessageBody() raw: unknown, @ConnectedSocket() socket: WebSocket) {
    const guest = this.guestOf(socket);
    if (!guest) return this.fail(socket, 'сначала войдите в комнату');

    const parsed = api.clientMessage.safeParse({ type: 'sheet:claim', ...(raw as object) });
    if (!parsed.success || parsed.data.type !== 'sheet:claim') {
      return this.fail(socket, 'выбор листа не проходит схему');
    }
    const { roomId, sheetId } = parsed.data;
    try {
      await this.roomsService.claimSheet(guest.userId, roomId, sheetId);
      await this.announceMembers(roomId);
    } catch (err) {
      this.fail(socket, (err as Error).message);
    }
  }

  @SubscribeMessage('sheet:roll')
  async rollField(@MessageBody() raw: unknown, @ConnectedSocket() socket: WebSocket) {
    const guest = this.guestOf(socket);
    if (!guest) return this.fail(socket, 'сначала войдите в комнату');

    const parsed = api.clientMessage.safeParse({ type: 'sheet:roll', ...(raw as object) });
    if (!parsed.success || parsed.data.type !== 'sheet:roll') {
      return this.fail(socket, 'бросок с листа не проходит схему');
    }
    const { roomId, sheetId, tag } = parsed.data;
    try {
      const delta = await this.roomsService.rollField(guest.userId, roomId, sheetId, tag);
      this.broadcast(roomId, { type: 'room:delta', delta });
    } catch (err) {
      this.fail(socket, (err as Error).message);
    }
  }

  @SubscribeMessage('sheet:of')
  async setSheetKind(@MessageBody() raw: unknown, @ConnectedSocket() socket: WebSocket) {
    const guest = this.guestOf(socket);
    if (!guest) return this.fail(socket, 'сначала войдите в комнату');

    const parsed = api.clientMessage.safeParse({ type: 'sheet:of', ...(raw as object) });
    if (!parsed.success || parsed.data.type !== 'sheet:of') {
      return this.fail(socket, 'тип листа не проходит схему');
    }

    const { roomId, sheetId, of } = parsed.data;
    try {
      const delta = await this.roomsService.setSheetKind(guest.userId, roomId, sheetId, of);
      this.broadcast(roomId, { type: 'room:delta', delta });
    } catch (err) {
      this.fail(socket, (err as Error).message);
    }
  }

  @SubscribeMessage('sheet:group')
  async setSheetGroup(@MessageBody() raw: unknown, @ConnectedSocket() socket: WebSocket) {
    const guest = this.guestOf(socket);
    if (!guest) return this.fail(socket, 'сначала войдите в комнату');

    const parsed = api.clientMessage.safeParse({ type: 'sheet:group', ...(raw as object) });
    if (!parsed.success || parsed.data.type !== 'sheet:group') {
      return this.fail(socket, 'группа листа не проходит схему');
    }

    const { roomId, sheetId, group } = parsed.data;
    try {
      const delta = await this.roomsService.setSheetGroup(guest.userId, roomId, sheetId, group);
      this.broadcast(roomId, { type: 'room:delta', delta });
    } catch (err) {
      this.fail(socket, (err as Error).message);
    }
  }

  @SubscribeMessage('sheet:belong')
  async setBelonging(@MessageBody() raw: unknown, @ConnectedSocket() socket: WebSocket) {
    const guest = this.guestOf(socket);
    if (!guest) return this.fail(socket, 'сначала войдите в комнату');

    const parsed = api.clientMessage.safeParse({ type: 'sheet:belong', ...(raw as object) });
    if (!parsed.success || parsed.data.type !== 'sheet:belong') {
      return this.fail(socket, 'правка принадлежностей не проходит схему');
    }

    const { roomId, sheetId, list, id, on, off } = parsed.data;
    try {
      const delta = await this.roomsService.setBelonging(guest.userId, roomId, sheetId, list, id, on, off);
      this.broadcast(roomId, { type: 'room:delta', delta });
    } catch (err) {
      this.fail(socket, (err as Error).message);
    }
  }

  broadcast(roomId: string, message: ServerMessage): void {
    for (const guest of this.guests) {
      if (guest.roomId === roomId) this.send(guest.socket, message);
    }
  }

  private async announceMembers(roomId: string) {
    const state = await this.roomsService.state(roomId).catch(() => null);
    if (state) this.broadcast(roomId, { type: 'room:members', members: state.members });
  }

  private guestOf(socket: WebSocket): Guest | null {
    for (const guest of this.guests) if (guest.socket === socket) return guest;
    return null;
  }

  private send(socket: WebSocket, message: ServerMessage): void {
    socket.send(JSON.stringify({ event: message.type, data: message }));
  }

  private fail(socket: WebSocket, message: string): void {
    this.send(socket, { type: 'error', message });
  }
}
