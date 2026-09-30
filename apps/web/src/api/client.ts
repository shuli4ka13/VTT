import { api } from '@vtt/schema';
import type { Session, SystemSummary, PublishedSystem, CompendiumSummary, PublishedCompendium, WorldSummary, RoomSummary, RoomState, ActIntent, RoomDelta, System, Compendium, Sheet, SavedRef } from '@vtt/schema';
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

const put = <S extends ZodType>(path: string, schema: S, body: unknown) =>
  call(path, schema, { method: 'PUT', body: JSON.stringify(body) });

export const login = (name: string): Promise<Session> =>
  post('/auth/login', api.session, { name });

export const listSystems = (): Promise<SystemSummary[]> =>
  call('/systems', api.systemSummary.array());

export const getSystem = (id: string): Promise<PublishedSystem> =>
  call(`/systems/${id}`, api.publishedSystem);

export const createSystem = (title: string, system: System): Promise<SavedRef> =>
  post('/systems', api.savedRef, { title, system });

export const saveSystem = (
  id: string, title: string, system: System, since?: string,
): Promise<SavedRef> => put(`/systems/${id}`, api.savedRef, { title, system, since });

export const publishSystem = (id: string): Promise<SavedRef> =>
  post(`/systems/${id}/publish`, api.savedRef, {});

export const listCompendiums = (systemId?: string): Promise<CompendiumSummary[]> =>
  call(`/compendiums${systemId ? `?systemId=${encodeURIComponent(systemId)}` : ''}`,
    api.compendiumSummary.array());

export const getCompendium = (id: string): Promise<PublishedCompendium> =>
  call(`/compendiums/${id}`, api.publishedCompendium);

export const createCompendium = (
  title: string, systemId: string, compendium: Compendium,
): Promise<SavedRef> => post('/compendiums', api.savedRef, { title, systemId, compendium });

export const saveCompendium = (
  id: string, title: string, systemId: string, compendium: Compendium, since?: string,
): Promise<SavedRef> =>
  put(`/compendiums/${id}`, api.savedRef, { title, systemId, compendium, since });

export const publishCompendium = (id: string): Promise<SavedRef> =>
  post(`/compendiums/${id}/publish`, api.savedRef, {});

export const listWorlds = (): Promise<WorldSummary[]> =>
  call('/worlds', api.worldSummary.array());

export const publishWorld = (
  title: string, systemId: string, compendiumIds: string[], sheets: Sheet[],
): Promise<{ id: string }> => post('/worlds', publishedId,
  { title, systemId, compendiumIds, sheets });

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

const publishedId = z.object({ id: z.string() });
