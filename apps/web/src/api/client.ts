// Клиент сервера. Типы берутся из `@vtt/schema` — тех же, которыми сервер
// валидирует вход, поэтому расходиться им негде.
//
// Ответы разбираются схемой: сервер свой, но «свой» — не гарантия. Молча
// принять ответ не той формы значит уронить экран позже и в другом месте.

import { api } from '@vtt/schema';
import type {
  Session, WorldSummary, RoomSummary, RoomState, ActIntent, RoomDelta, World,
} from '@vtt/schema';
import { z } from 'zod';
import type { ZodType } from 'zod';

const BASE = '/api';

let token: string | null = localStorage.getItem('vtt.token');

export const currentToken = () => token;

export function setToken(next: string | null): void {
  token = next;
  if (next) localStorage.setItem('vtt.token', next);
  else localStorage.removeItem('vtt.token');
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly issues: string[] = []) {
    super(message);
    this.name = 'ApiError';
  }
}

async function call<S extends ZodType>(path: string, schema: S, init?: RequestInit): Promise<z.infer<S>> {
  const response = await fetch(BASE + path, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    // Сеанса больше нет — сервер перезапустили, токен протух. Держать мёртвый
    // токен нельзя: прихожая по нему считает человека вошедшим и не показывает
    // вход, а каждый запрос отвечает «войдите заново» — выйти из этого некуда.
    if (response.status === 401) setToken(null);
    const message = typeof body?.message === 'string' ? body.message : `запрос не прошёл (${response.status})`;
    throw new ApiError(message, response.status, body?.issues ?? []);
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(
      'сервер ответил не той формой — обновите страницу; если повторится, версии клиента и сервера разошлись',
      response.status,
      parsed.error.issues.slice(0, 3).map((i: { path: PropertyKey[]; message: string }) =>
        `${i.path.join('.')}: ${i.message}`),
    );
  }
  return parsed.data;
}

const post = <S extends ZodType>(path: string, schema: S, body: unknown) =>
  call(path, schema, { method: 'POST', body: JSON.stringify(body) });

// ── ручки ───────────────────────────────────────────────────────────────

export const login = (name: string): Promise<Session> =>
  post('/auth/login', api.session, { name });

export const listWorlds = (): Promise<WorldSummary[]> =>
  call('/worlds', api.worldSummary.array());

export const publishWorld = (title: string, world: World): Promise<{ id: string }> =>
  post('/worlds', publishedId, { title, world });

export const listRooms = (): Promise<RoomSummary[]> =>
  call('/rooms', api.roomSummary.array());

export const createRoom = (worldId: string, title: string): Promise<RoomSummary> =>
  post('/rooms', api.roomSummary, { worldId, title });

export const joinRoom = (roomId: string): Promise<RoomState> =>
  post(`/rooms/${roomId}/join`, api.roomState, {});

export const roomState = (roomId: string): Promise<RoomState> =>
  call(`/rooms/${roomId}`, api.roomState);

export const act = (intent: ActIntent): Promise<RoomDelta> =>
  post(`/rooms/${intent.roomId}/act`, api.roomDelta, intent);

// Ответ на публикацию — единственный, чью форму схема мира не описывает:
// это идентификатор созданного, а не часть модели.
const publishedId = z.object({ id: z.string() });
