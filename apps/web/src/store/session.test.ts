// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { useSession, confirmSession } from './session.ts';
import { listSystems, setToken, currentToken } from '../api/client.ts';

describe('сеанс', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('сервер не узнал сеанс — вход сброшен, страница вернётся ко входу', async () => {
    setToken('протух');
    useSession.setState({ signed: true });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ message: 'сеанс не найден — войдите заново' }), { status: 401 })));
    await expect(listSystems()).rejects.toThrow('сеанс не найден');
    expect(currentToken()).toBeNull();
    expect(useSession.getState().signed).toBe(false);
  });

  it('сохранённый вход без номера пользователя — сервер называет, кто вошёл', async () => {
    setToken('старый');
    useSession.setState({ signed: true, userId: '', name: '' });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ userId: 'u-1', name: 'Ведущий' }), { status: 200 })));
    await confirmSession();
    expect(useSession.getState()).toMatchObject({ userId: 'u-1', name: 'Ведущий', signed: true });
    setToken(null);
  });
});
