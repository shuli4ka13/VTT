import 'reflect-metadata';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { WsAdapter } from '@nestjs/platform-ws';
import { AppModule } from './app.module.ts';

const PORT = Number(process.env.VTT_PORT ?? 8200);
// Прод-режим полигона. Обе переменные пусты в деве — там статику раздаёт
// vite, а дверь не нужна.
const STATIC = process.env.VTT_STATIC;
const AUTH = process.env.VTT_AUTH; // «логин:пароль» — одна пара на полигон

const app = await NestFactory.create<NestExpressApplication>(AppModule.create());
app.useWebSocketAdapter(new WsAdapter(app));
app.enableCors({ origin: true });

if (AUTH) {
  // Калитка, не сессии: Basic открывает дверь ОДИН раз (браузер сам просит
  // логин-пароль) и ставит куку; дальше и страницы, и fetch едут на куке.
  // Через заголовок нельзя: Authorization уже занят Bearer-токеном самого
  // приложения. WebSocket идёт мимо express-цепочки (upgrade), но у него
  // своя проверка — токен сессии при входе в комнату.
  const expected = 'Basic ' + Buffer.from(AUTH).toString('base64');
  const gate = createHash('sha256').update(AUTH).digest('hex');
  app.use((req: any, res: any, next: any) => {
    if ((req.headers.cookie ?? '').includes(`vtt_gate=${gate}`)) return next();
    if (req.headers.authorization === expected) {
      res.cookie('vtt_gate', gate, { httpOnly: true, sameSite: 'lax', path: '/' });
      return next();
    }
    res.set('WWW-Authenticate', 'Basic realm="vtt"').status(401).send('нужен пароль');
  });
}

if (STATIC) {
  // В деве префикс /api срезает vite-прокси; без прокси срезаем сами —
  // клиент одинаков в обоих мирах.
  app.use((req: any, _res: any, next: any) => {
    if (req.url === '/api' || req.url.startsWith('/api/')) req.url = req.url.slice(4) || '/';
    next();
  });
  app.useStaticAssets(STATIC);
  // SPA: /author/system и /play — маршруты браузера, не файлы. Ловим только
  // навигацию (GET за text/html) — fetch за JSON проходит ниже, к API.
  app.use((req: any, res: any, next: any) => {
    if (req.method === 'GET' && String(req.headers.accept ?? '').includes('text/html')) {
      return res.sendFile(join(STATIC, 'index.html'));
    }
    next();
  });
}

await app.listen(PORT);

console.log(`VTT-сервер слушает :${PORT} · канал стола — ws://localhost:${PORT}/ws`
  + (STATIC ? ' · статика: ' + STATIC : '') + (AUTH ? ' · вход по паролю' : ''));
