import { Body, Controller, Get, Headers, Inject, Param, Post, Query, UsePipes } from '@nestjs/common';
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

  @Get('systems') systems() { return this.catalog.systems(); }
  @Get('systems/:id') system(@Param('id') id: string) { return this.catalog.system(id); }
  @Post('systems')
  @UsePipes(new ZodValidationPipe(api.publishSystemRequest))
  async publishSystem(@Body() body: PublishSystemRequest, @Headers('authorization') header?: string) {
    const { userId } = await this.auth.whoIs(bearer(header));
    return this.catalog.publishSystem(userId, body.title, body.system);
  }

  @Get('compendiums') compendiums(@Query('systemId') systemId?: string) {
    return this.catalog.compendiums(systemId);
  }
  @Get('compendiums/:id') compendium(@Param('id') id: string) { return this.catalog.compendium(id); }
  @Post('compendiums')
  @UsePipes(new ZodValidationPipe(api.publishCompendiumRequest))
  async publishCompendium(@Body() body: PublishCompendiumRequest, @Headers('authorization') header?: string) {
    const { userId } = await this.auth.whoIs(bearer(header));
    return this.catalog.publishCompendium(userId, body.title, body.systemId, body.compendium);
  }
}
