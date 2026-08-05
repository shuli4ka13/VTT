// Стендовый сервер: node:http + node:sqlite + SSE. Ноль зависимостей —
// в духе проекта. Запуск: node server/server.js [порт]
//
// Он отдаёт и статику (те же constructor.html / vtt.html), и API:
//   POST /api/login {name, role}         → { token, me }
//   GET  /api/me                          → { name, role, permissions }
//   GET  /api/worlds · POST /api/worlds  {name, world}
//   GET  /api/rooms  · POST /api/rooms   {worldId, name}
//   POST /api/rooms/:id/join             {sheetId?}
//   GET  /api/rooms/:id/state
//   POST /api/rooms/:id/act              {actionId, fromSheetId, targetSheetId}
//   PATCH /api/rooms/:id/sheets/:sid     {values}
//   GET  /api/rooms/:id/events            (SSE; токен в ?t=)
//
// Всё игровое сервер исполняет сам (server/rooms.js) и раскидывает комнате
// по SSE. Клиент не утверждает о состоянии ничего — только намерения.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { openStore } from './store.js';
import { login, me } from './auth.js';
import {
  publishWorld, listWorlds, createRoom, listRooms, joinRoom, roomState, act, patchSheet,
} from './rooms.js';

// Порт и путь к базе задаются и аргументом, и переменными окружения —
// второе нужно контейнеру: БД уезжает в примонтированный том.
const PORT = Number(process.argv[2]) || Number(process.env.PORT) || 8000;
const ROOT = new URL('..', import.meta.url).pathname;
const db = openStore(process.env.STAND_DB || undefined);

// ── SSE: подписчики по комнатам ──────────────────────────────────────────────

const streams = new Map(); // roomId → Set<res>

function broadcast(roomId, event, payload) {
  for (const res of streams.get(roomId) || []) {
    res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
  }
}

// После любого игрового изменения комната получает свежий срез целиком.
// Стендовая простота: диффы и подписанные срезы — этап «Комнаты» плана.
function pushState(roomId) {
  broadcast(roomId, 'state', roomState(db, roomId));
}

// ── HTTP ─────────────────────────────────────────────────────────────────────

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    return await serveStatic(url.pathname, res);
  } catch (err) {
    const known = err instanceof Error;
    res.writeHead(known && err.status ? err.status : 400, { 'Content-Type': MIME['.json'] });
    res.end(JSON.stringify({ error: known ? err.message : String(err) }));
  }
});

async function api(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean); // ['api', ...]
  const body = req.method === 'GET' ? null : await readBody(req);
  const json = (data, status = 200) => {
    res.writeHead(status, { 'Content-Type': MIME['.json'] });
    res.end(JSON.stringify(data));
  };

  // Вход — единственная ручка без токена. Только имя: роль не выбирается,
  // она выводится из владения (создал комнату — ведущий, вступил — игрок).
  if (req.method === 'POST' && url.pathname === '/api/login') {
    const token = login(body.name);
    return json({ token, me: me(token) });
  }

  // SSE держит токен в query: EventSource не умеет заголовки.
  const token = (req.headers.authorization || '').replace('Bearer ', '') || url.searchParams.get('t');
  const who = me(token); // бросит «нужен вход», если токена нет

  if (req.method === 'GET' && url.pathname === '/api/me') return json(who);

  if (url.pathname === '/api/worlds') {
    if (req.method === 'GET') return json(listWorlds(db));
    return json({ id: publishWorld(db, body.name || 'Без имени', body.world, who.name) });
  }

  if (url.pathname === '/api/rooms') {
    if (req.method === 'GET') return json(listRooms(db));
    return json(createRoom(db, body.worldId, body.name || `Стол ${who.name}`, who.name));
  }

  const roomId = parts[2];
  const tail = parts.slice(3);

  if (tail[0] === 'join' && req.method === 'POST') {
    joinRoom(db, roomId, who.name, body.sheetId || null);
    pushState(roomId);
    return json({ ok: true });
  }
  if (tail[0] === 'state' && req.method === 'GET') return json(roomState(db, roomId));
  if (tail[0] === 'act' && req.method === 'POST') {
    const out = act(db, roomId, who.name, body);
    pushState(roomId);
    return json({ seq: out.seq, report: out.report });
  }
  if (tail[0] === 'sheets' && req.method === 'PATCH') {
    patchSheet(db, roomId, who.name, tail[1], body.values || {});
    pushState(roomId);
    return json({ ok: true });
  }
  if (tail[0] === 'events' && req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive',
    });
    res.write(': привет\n\n');
    if (!streams.has(roomId)) streams.set(roomId, new Set());
    streams.get(roomId).add(res);
    req.on('close', () => streams.get(roomId).delete(res));
    // Свежий срез сразу при подключении: лечит гонку «ход случился, пока
    // подписка ещё жала руку серверу» и любые переподключения.
    res.write(`event: state\ndata: ${JSON.stringify(roomState(db, roomId))}\n\n`);
    return;
  }

  json({ error: `нет такой ручки: ${req.method} ${url.pathname}` }, 404);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let text = '';
    req.on('data', chunk => { text += chunk; });
    req.on('end', () => {
      try { resolve(text ? JSON.parse(text) : {}); } catch { reject(new Error('тело не JSON')); }
    });
    req.on('error', reject);
  });
}

async function serveStatic(pathname, res) {
  const clean = normalize(pathname === '/' ? '/index.html' : pathname).replace(/^(\.\.[/\\])+/, '');
  const file = join(ROOT, clean);
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('нет такого файла');
  }
}

server.listen(PORT, () => {
  console.log(`стендовый сервер: http://localhost:${PORT} · БД: server/stand.db · Ctrl+C — стоп`);
});
