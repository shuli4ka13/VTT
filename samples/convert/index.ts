import { columnsOf } from './columns.ts';
import { kindsOf } from './kinds.ts';
import { rowKeysOf } from './row-keys.ts';

export const convert = (world: Record<string, any>): Record<string, any> => rowKeysOf(kindsOf(columnsOf(world)));
