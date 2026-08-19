import { Injectable, Inject, UnauthorizedException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DB, CLOCK, IDS } from '../common/tokens.ts';
import type { Db } from '../db/db.ts';
import { users, sessions } from '../db/schema.ts';
import type { Session } from '@vtt/schema';

@Injectable()
export class AuthService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(CLOCK) private readonly now: () => string,
    @Inject(IDS) private readonly newId: () => string,
  ) {}

  async login(name: string): Promise<Session> {
    const existing = await this.db.select().from(users).where(eq(users.name, name));
    const user = existing[0] ?? await this.create(name);

    const token = this.newId();
    await this.db.insert(sessions).values({ token, userId: user.id, createdAt: this.now() });
    return { userId: user.id, name: user.name, token };
  }

  async whoIs(token: string | undefined): Promise<{ userId: string; name: string }> {
    if (!token) throw new UnauthorizedException('нужен токен сеанса');

    const found = await this.db.select().from(sessions).where(eq(sessions.token, token));
    const session = found[0];
    if (!session) throw new UnauthorizedException('сеанс не найден — войдите заново');

    const owner = await this.db.select().from(users).where(eq(users.id, session.userId));
    const user = owner[0];
    if (!user) throw new UnauthorizedException('владелец сеанса удалён');

    return { userId: user.id, name: user.name };
  }

  private async create(name: string) {
    const user = { id: this.newId(), name, createdAt: this.now() };
    await this.db.insert(users).values(user);
    return user;
  }
}
