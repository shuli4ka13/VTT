import { act as oldAct } from '../src/lang/act.ts';
import { act as newAct } from '../src/core/act.ts';

export const act = (process.env.VTT_CORE === '2' ? newAct : oldAct) as typeof oldAct;

export const NEW_CORE = process.env.VTT_CORE === '2';
