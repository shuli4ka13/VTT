import { Controller, Get, Post, Body, Param, Headers, UsePipes, Inject } from '@nestjs/common';
import { RoomsService } from './rooms.service.ts';
import { WorldsService } from '../worlds/worlds.service.ts';
import { AuthService } from '../auth/auth.service.ts';
import { bearer } from '../auth/auth.controller.ts';
import { ZodValidationPipe } from '../common/zod.pipe.ts';
import { api } from '@vtt/schema';
import type { CreateRoomRequest, PublishRequest, ActIntent } from '@vtt/schema';

@Controller()
export class RoomsController {
  constructor(
    @Inject(RoomsService) private readonly roomsService: RoomsService,
    @Inject(WorldsService) private readonly worldsService: WorldsService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  // ── миры ──────────────────────────────────────────────────────────────

  @Get('worlds')
  worlds() {
    return this.worldsService.list();
  }

  @Post('worlds')
  @UsePipes(new ZodValidationPipe(api.publishRequest))
  async publish(@Body() body: PublishRequest, @Headers('authorization') header?: string) {
    const { userId } = await this.auth.whoIs(bearer(header));
    return this.worldsService.publish(
      userId, body.title, body.systemId, body.compendiumIds, body.sheets);
  }

  // ── комнаты ───────────────────────────────────────────────────────────

  @Get('rooms')
  async rooms(@Headers('authorization') header?: string) {
    const { userId } = await this.auth.whoIs(bearer(header));
    return this.roomsService.listFor(userId);
  }

  @Post('rooms')
  @UsePipes(new ZodValidationPipe(api.createRoomRequest))
  async createRoom(@Body() body: CreateRoomRequest, @Headers('authorization') header?: string) {
    const { userId } = await this.auth.whoIs(bearer(header));
    return this.roomsService.create(userId, body.worldId, body.title);
  }

  @Post('rooms/:id/join')
  async join(@Param('id') id: string, @Headers('authorization') header?: string) {
    const { userId } = await this.auth.whoIs(bearer(header));
    await this.roomsService.join(userId, id);
    return this.roomsService.state(id);
  }

  @Get('rooms/:id')
  async state(@Param('id') id: string, @Headers('authorization') header?: string) {
    await this.auth.whoIs(bearer(header));
    return this.roomsService.state(id);
  }

  /**
   * Ход. Клиент присылает НАМЕРЕНИЕ, ответ — дельта: что изменилось.
   * Полный срез не гоняем: он нужен только при входе в комнату.
   */
  @Post('rooms/:id/act')
  @UsePipes(new ZodValidationPipe(api.actIntent))
  async act(@Body() intent: ActIntent, @Headers('authorization') header?: string) {
    const { userId } = await this.auth.whoIs(bearer(header));
    return this.roomsService.act(userId, intent);
  }
}
