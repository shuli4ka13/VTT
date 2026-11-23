import { seenBy } from './visibility.ts';
import { Controller, Get, Post, Put, Delete, Body, Param, Headers, UsePipes, Inject } from '@nestjs/common';
import { RoomsService } from './rooms.service.ts';
import { WorldsService } from '../worlds/worlds.service.ts';
import { AuthService } from '../auth/auth.service.ts';
import { bearer } from '../auth/auth.controller.ts';
import { ZodValidationPipe } from '../common/zod.pipe.ts';
import { api } from '@vtt/schema';
import type { CreateRoomRequest, PublishRequest, ActIntent, TurnIntent, AnswerIntent, CancelIntent } from '@vtt/schema';

@Controller()
export class RoomsController {
  constructor(
    @Inject(RoomsService) private readonly roomsService: RoomsService,
    @Inject(WorldsService) private readonly worldsService: WorldsService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  @Get('worlds')
  async worlds(@Headers('authorization') header?: string) {
    let viewer: string | undefined;
    try { viewer = (await this.auth.whoIs(bearer(header))).userId; } catch { viewer = undefined; }
    return this.worldsService.list(viewer);
  }

  @Delete('worlds/:id')
  async removeWorld(@Param('id') id: string, @Headers('authorization') header?: string) {
    const { userId } = await this.auth.whoIs(bearer(header));
    await this.worldsService.remove(userId, id);
    return { ok: true };
  }

  @Post('worlds')
  @UsePipes(new ZodValidationPipe(api.publishRequest))
  async publish(@Body() body: PublishRequest, @Headers('authorization') header?: string) {
    const { userId } = await this.auth.whoIs(bearer(header));
    return this.worldsService.publish(
      userId, body.title, body.systemId, body.compendiumIds, body.sheets);
  }

  @Put('worlds/:id')
  async updateWorld(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(api.publishRequest)) body: PublishRequest,
    @Headers('authorization') header?: string,
  ) {
    const { userId } = await this.auth.whoIs(bearer(header));
    return this.worldsService.update(userId, id, body.title, body.systemId, body.compendiumIds, body.sheets);
  }

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

  @Delete('rooms/:id')
  async close(@Param('id') id: string, @Headers('authorization') header?: string) {
    const { userId } = await this.auth.whoIs(bearer(header));
    await this.roomsService.close(userId, id);
    return { ok: true };
  }

  @Post('rooms/:id/join')
  async join(@Param('id') id: string, @Headers('authorization') header?: string) {
    const { userId } = await this.auth.whoIs(bearer(header));
    await this.roomsService.join(userId, id);
    return seenBy(await this.roomsService.state(id), this.roomsService.sight(id, userId));
  }

  @Get('rooms/:id')
  async state(@Param('id') id: string, @Headers('authorization') header?: string) {
    const { userId } = await this.auth.whoIs(bearer(header));
    return seenBy(await this.roomsService.state(id), this.roomsService.sight(id, userId));
  }

  @Get('rooms/:id/journal')
  async journal(@Param('id') id: string, @Headers('authorization') header?: string) {
    const { userId } = await this.auth.whoIs(bearer(header));
    return this.roomsService.journal(userId, id);
  }

  @Post('rooms/:id/act')
  @UsePipes(new ZodValidationPipe(api.actIntent))
  async act(@Body() intent: ActIntent, @Headers('authorization') header?: string) {
    const { userId } = await this.auth.whoIs(bearer(header));
    return seenBy(await this.roomsService.act(userId, intent), this.roomsService.sight(intent.roomId, userId));
  }

  @Post('rooms/:id/turn')
  @UsePipes(new ZodValidationPipe(api.turnIntent))
  async turn(@Body() intent: TurnIntent, @Headers('authorization') header?: string) {
    const { userId } = await this.auth.whoIs(bearer(header));
    return seenBy(await this.roomsService.turn(userId, intent), this.roomsService.sight(intent.roomId, userId));
  }

  @Post('rooms/:id/answer')
  @UsePipes(new ZodValidationPipe(api.answerIntent))
  async answer(@Body() intent: AnswerIntent, @Headers('authorization') header?: string) {
    const { userId } = await this.auth.whoIs(bearer(header));
    return seenBy(await this.roomsService.answer(userId, intent), this.roomsService.sight(intent.roomId, userId));
  }

  @Post('rooms/:id/cancel')
  @UsePipes(new ZodValidationPipe(api.cancelIntent))
  async cancel(@Body() intent: CancelIntent, @Headers('authorization') header?: string) {
    const { userId } = await this.auth.whoIs(bearer(header));
    return seenBy(await this.roomsService.cancel(userId, intent), this.roomsService.sight(intent.roomId, userId));
  }
}
