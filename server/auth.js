// СТЕНДОВАЯ аутентификация: имя + роль, без паролей. Этого достаточно, чтобы
// прощупать сеанс «автор → ГМ → игроки»; в продакшне здесь настоящий логин,
// а контракт /me не меняется: токен → { name, role, permissions }.
//
// Сессии в памяти процесса: рестарт сервера разлогинивает всех — для стенда
// это честно и даже удобно.

import { randomUUID } from 'node:crypto';
import { ROLES } from './permissions.js';

const sessions = new Map();

export function login(name, role) {
  if (!ROLES[role]) {
    throw new Error(`роль «${role}» неизвестна — есть: ${Object.keys(ROLES).join(', ')}`);
  }
  const cleanName = String(name || '').trim();
  if (!cleanName) throw new Error('нужно имя — по нему вас узнают за столом');

  const token = randomUUID();
  sessions.set(token, { name: cleanName, role });
  return token;
}

export function me(token) {
  const session = sessions.get(token);
  if (!session) throw new Error('нужен вход: токен не опознан');
  return { name: session.name, role: session.role, permissions: ROLES[session.role] };
}
