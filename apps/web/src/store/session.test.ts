// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { useSession } from './session.ts';
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
});
