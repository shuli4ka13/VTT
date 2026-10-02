import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DB, RAW, CLOCK, IDS, DIE } from './common/tokens.ts';
import { openDatabase } from './db/db.ts';
import type { Database } from './db/db.ts';
import { AuthService } from './auth/auth.service.ts';
import { AuthController } from './auth/auth.controller.ts';
import { WorldsService } from './worlds/worlds.service.ts';
import { RoomsService } from './rooms/rooms.service.ts';
import { RoomsController } from './rooms/rooms.controller.ts';
import { TableGateway } from './gateway/table.gateway.ts';
import { CatalogController } from './catalog/catalog.controller.ts';
import { CatalogService } from './catalog/catalog.service.ts';

export interface AppOptions {
  database?: Database;
  now?: () => string;
  newId?: () => string;
  die?: (sides: number) => number;
}

@Module({})
export class AppModule {
  static create(options: AppOptions = {}): DynamicModule {
    const database = options.database ?? openDatabase(process.env.VTT_DB ?? 'vtt.db');

    return {
      module: AppModule,
      controllers: [AuthController, CatalogController, RoomsController],
      providers: [
        { provide: DB, useValue: database.drizzle },
        { provide: RAW, useValue: database.raw },
        { provide: CLOCK, useValue: options.now ?? (() => new Date().toISOString()) },
        { provide: IDS, useValue: options.newId ?? randomUUID },

        { provide: DIE, useValue: options.die ?? ((sides: number) => 1 + Math.floor(Math.random() * sides)) },
        AuthService,
        CatalogService,
        WorldsService,
        RoomsService,
        TableGateway,
      ],
    };
  }
}
