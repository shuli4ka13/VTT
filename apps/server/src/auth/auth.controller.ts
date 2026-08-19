import { Controller, Post, Body, Get, Headers, UsePipes, Inject } from '@nestjs/common';
import { AuthService } from './auth.service.ts';
import { ZodValidationPipe } from '../common/zod.pipe.ts';
import { api } from '@vtt/schema';
import type { LoginRequest, Session } from '@vtt/schema';

export const bearer = (header?: string): string | undefined =>
  header?.startsWith('Bearer ') ? header.slice(7) : undefined;

@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post('login')
  @UsePipes(new ZodValidationPipe(api.loginRequest))
  login(@Body() body: LoginRequest): Promise<Session> {
    return this.auth.login(body.name);
  }

  @Get('me')
  me(@Headers('authorization') header?: string) {
    return this.auth.whoIs(bearer(header));
  }
}
