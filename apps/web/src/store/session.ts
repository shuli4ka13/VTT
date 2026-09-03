import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { login, setToken, currentToken } from '../api/client.ts';

export interface SessionState {
  name: string;
  signed: boolean;
  enter: (name: string) => Promise<void>;
  leave: () => void;
}

export const useSession = create<SessionState>()(persist(set => ({
  name: '',
  signed: Boolean(currentToken()),

  enter: async name => {
    const session = await login(name.trim() || 'Гость');
    setToken(session.token);
    set({ name: session.name, signed: true });
  },

  leave: () => {
    setToken(null);
    set({ signed: false });
  },
}), {
  name: 'vtt.session',
  storage: createJSONStorage(() => localStorage),
  partialize: state => ({ name: state.name }),
  merge: (saved, current) => ({
    ...current,
    name: typeof (saved as { name?: unknown })?.name === 'string' ? (saved as { name: string }).name : '',
    signed: Boolean(currentToken()),
  }),
}));
