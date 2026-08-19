import { seed } from './seed.ts';

await seed(process.env.VTT_URL ?? 'http://localhost:8200', process.env.VTT_OWNER ?? 'Стенд');
