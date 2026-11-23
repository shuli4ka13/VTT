import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface LeftIo { read(): string[]; write(items: string[]): void }

export const leftIo = (list: string): LeftIo => {
  const path = resolve(import.meta.dirname, `${list}.json`);
  return {
    read: () => JSON.parse(readFileSync(path, 'utf8')) as string[],
    write: items => writeFileSync(path, `${JSON.stringify(items, null, 2)}\n`),
  };
};
