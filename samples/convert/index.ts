import { columnsOf } from './columns.ts';
import { kindsOf } from './kinds.ts';

export const convert = (world: Record<string, any>): Record<string, any> => kindsOf(columnsOf(world));
