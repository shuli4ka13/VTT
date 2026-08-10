import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { WsAdapter } from '@nestjs/platform-ws';
import { AppModule } from './app.module.ts';

const PORT = Number(process.env.VTT_PORT ?? 8200);

const app = await NestFactory.create(AppModule.create());
app.useWebSocketAdapter(new WsAdapter(app));
app.enableCors({ origin: true });
await app.listen(PORT);

console.log(`VTT-сервер слушает :${PORT} · канал стола — ws://localhost:${PORT}/ws`);
