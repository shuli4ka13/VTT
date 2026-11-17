import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { login, setToken, currentToken, onSessionLost, whoAmI } from '../api/client.ts';

export interface SessionState {
  name: string;
  userId: string;
  signed: boolean;
  enter: (name: string) => Promise<void>;
  leave: () => void;
}

export const useSession = create<SessionState>()(persist(set => ({
  name: '',
  userId: '',
  signed: Boolean(currentToken()),

  enter: async name => {
    const session = await login(name.trim() || 'Гость');
    setToken(session.token);
    set({ name: session.name, userId: session.userId, signed: true });
  },

  leave: () => {
    setToken(null);
    set({ signed: false });
  },
}), {
  name: 'vtt.session',
  storage: createJSONStorage(() => localStorage),
  partialize: state => ({ name: state.name, userId: state.userId }),
  merge: (saved, current) => ({
    ...current,
    name: typeof (saved as { name?: unknown })?.name === 'string' ? (saved as { name: string }).name : '',
    userId: typeof (saved as { userId?: unknown })?.userId === 'string' ? (saved as { userId: string }).userId : '',
    signed: Boolean(currentToken()),
  }),
}));

onSessionLost(() => useSession.setState({ signed: false }));

export async function confirmSession(): Promise<void> {
  if (!currentToken()) return;
  try {
    const who = await whoAmI();
    useSession.setState({ name: who.name, userId: who.userId });
  } catch {
    return;
  }
}

void confirmSession();
