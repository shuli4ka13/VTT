import type { INestApplication } from '@nestjs/common';

export const BODY_LIMIT = process.env.VTT_BODY_LIMIT ?? '8mb';

interface WithBodyParser {
  useBodyParser?: (type: string, options: Record<string, unknown>) => void;
}

export function allowBigWorlds(app: INestApplication): void {
  const host = app as unknown as WithBodyParser;
  host.useBodyParser?.('json', { limit: BODY_LIMIT });
  host.useBodyParser?.('urlencoded', { limit: BODY_LIMIT, extended: true });
}
