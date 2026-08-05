// СТЕНДОВАЯ аутентификация: только имя, без пароля. Роль здесь НЕ выбирается —
// она выводится из владения (см. permissions.js): кто создал комнату, тот
// и ведущий. В продакшне на этом месте настоящий логин; контракт /me
// не меняется: токен → личность.
//
// Сессии в памяти процесса: рестарт сервера разлогинивает всех — для стенда
// это честно и даже удобно.

import { randomUUID } from 'node:crypto';

const sessions = new Map();

export function login(name) {
  const cleanName = String(name || '').trim();
  if (!cleanName) throw new Error('нужно имя — по нему вас узнают за столом');

  const token = randomUUID();
  sessions.set(token, { name: cleanName });
  return token;
}

export function me(token) {
  const session = sessions.get(token);
  if (!session) throw new Error('нужен вход: токен не опознан');
  return { name: session.name };
}
