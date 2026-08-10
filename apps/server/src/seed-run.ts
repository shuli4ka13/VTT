// Запуск сида с командной строки: `make ts-seed`. Логика — в seed.ts,
// отдельно от запуска, чтобы тест звал её без процесса и сети наружу.

import { seed } from './seed.ts';

await seed(process.env.VTT_URL ?? 'http://localhost:8200', process.env.VTT_OWNER ?? 'Стенд');
