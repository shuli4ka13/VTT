import { Controller, Get, Post, Body, Param, Headers, UsePipes, Inject } from '@nestjs/common';
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

  @Get('rooms/:id/journal')
  async journal(@Param('id') id: string, @Headers('authorization') header?: string) {
    const { userId } = await this.auth.whoIs(bearer(header));
    return this.roomsService.journal(userId, id);
  }

  @Post('rooms/:id/act')
  @UsePipes(new ZodValidationPipe(api.actIntent))
  async act(@Body() intent: ActIntent, @Headers('authorization') header?: string) {
    const { userId } = await this.auth.whoIs(bearer(header));
    return this.roomsService.act(userId, intent);
  }

  @Post('rooms/:id/turn')
  @UsePipes(new ZodValidationPipe(api.turnIntent))
  async turn(@Body() intent: TurnIntent, @Headers('authorization') header?: string) {
    const { userId } = await this.auth.whoIs(bearer(header));
    return this.roomsService.turn(userId, intent);
  }

  @Post('rooms/:id/answer')
  @UsePipes(new ZodValidationPipe(api.answerIntent))
  async answer(@Body() intent: AnswerIntent, @Headers('authorization') header?: string) {
    const { userId } = await this.auth.whoIs(bearer(header));
    return this.roomsService.answer(userId, intent);
  }

  @Post('rooms/:id/cancel')
  @UsePipes(new ZodValidationPipe(api.cancelIntent))
  async cancel(@Body() intent: CancelIntent, @Headers('authorization') header?: string) {
    const { userId } = await this.auth.whoIs(bearer(header));
    return this.roomsService.cancel(userId, intent);
  }
}
