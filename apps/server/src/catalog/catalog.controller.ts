import {
  Body, Controller, Delete, Get, Headers, Inject, Param, Post, Put, Query, UsePipes,
} from '@nestjs/common';
import { api } from '@vtt/schema';
import type { PublishCompendiumRequest, PublishSystemRequest } from '@vtt/schema';
import { AuthService } from '../auth/auth.service.ts';
import { bearer } from '../auth/auth.controller.ts';
import { ZodValidationPipe } from '../common/zod.pipe.ts';
import { CatalogService } from './catalog.service.ts';

@Controller()
export class CatalogController {
  constructor(
    @Inject(CatalogService) private readonly catalog: CatalogService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  private async viewer(header?: string): Promise<string | undefined> {
    try {
      return (await this.auth.whoIs(bearer(header))).userId;
    } catch {
      return undefined;
    }
  }

  @Get('systems') async systems(@Headers('authorization') header?: string) {
    return this.catalog.systems(await this.viewer(header));
  }
  @Get('systems/:id') async system(
    @Param('id') id: string,
    @Headers('authorization') header?: string,
  ) {
    return this.catalog.systemFor(id, await this.viewer(header));
  }
  @Post('systems')
  @UsePipes(new ZodValidationPipe(api.publishSystemRequest))
  async createSystem(@Body() body: PublishSystemRequest, @Headers('authorization') header?: string) {
    const { userId } = await this.auth.whoIs(bearer(header));
    return this.catalog.createSystem(userId, body.title, body.system);
  }

  @Put('systems/:id')
  async saveSystem(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(api.publishSystemRequest)) body: PublishSystemRequest,
    @Headers('authorization') header?: string,
  ) {
    const { userId } = await this.auth.whoIs(bearer(header));
    return this.catalog.saveSystem(userId, id, body.title, body.system, body.since);
  }

  @Post('systems/:id/publish')
  async publishSystem(@Param('id') id: string, @Headers('authorization') header?: string) {
    const { userId } = await this.auth.whoIs(bearer(header));
    return this.catalog.publishSystem(userId, id);
  }

  @Delete('systems/:id')
  async removeSystem(@Param('id') id: string, @Headers('authorization') header?: string) {
    const { userId } = await this.auth.whoIs(bearer(header));
    await this.catalog.removeSystem(userId, id);
    return { ok: true };
  }

  @Delete('compendiums/:id')
  async removeCompendium(@Param('id') id: string, @Headers('authorization') header?: string) {
    const { userId } = await this.auth.whoIs(bearer(header));
    await this.catalog.removeCompendium(userId, id);
    return { ok: true };
  }

  @Get('compendiums') async compendiums(
    @Query('systemId') systemId?: string,
    @Headers('authorization') header?: string,
  ) {
    return this.catalog.compendiums(systemId, await this.viewer(header));
  }
  @Get('compendiums/:id') async compendium(
    @Param('id') id: string,
    @Headers('authorization') header?: string,
  ) {
    return this.catalog.compendiumFor(id, await this.viewer(header));
  }
  @Post('compendiums')
  @UsePipes(new ZodValidationPipe(api.publishCompendiumRequest))
  async createCompendium(@Body() body: PublishCompendiumRequest, @Headers('authorization') header?: string) {
    const { userId } = await this.auth.whoIs(bearer(header));
    return this.catalog.createCompendium(userId, body.title, body.systemId, body.compendium);
  }

  @Put('compendiums/:id')
  async saveCompendium(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(api.publishCompendiumRequest)) body: PublishCompendiumRequest,
    @Headers('authorization') header?: string,
  ) {
    const { userId } = await this.auth.whoIs(bearer(header));
    return this.catalog.saveCompendium(userId, id, body.title, body.compendium, body.since);
  }

  @Post('compendiums/:id/publish')
  async publishCompendium(@Param('id') id: string, @Headers('authorization') header?: string) {
    const { userId } = await this.auth.whoIs(bearer(header));
    return this.catalog.publishCompendium(userId, id);
  }
}
