import { columnsOf } from './columns.ts';
import { kindsOf } from './kinds.ts';
import { rowKeysOf } from './row-keys.ts';
import { handlersOf } from './handlers.ts';
import { editsOf } from './edits.ts';
import { costsOf } from './cost.ts';
import { seenOf } from './seen.ts';

export const convert = (world: Record<string, any>): Record<string, any> => seenOf(costsOf(editsOf(handlersOf(rowKeysOf(kindsOf(columnsOf(world)))))));
