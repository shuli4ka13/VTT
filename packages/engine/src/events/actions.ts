import { findRecord, heldBy, isItem, kindOfRecord, argsWithProps, propKeysOf, propsOf } from '../model/owned.ts';
import { compile } from '../formula/index.ts';
import { linkOf, staticCell } from '../model/tables.ts';
import { findEffect, isPipeline, grantedTo } from '../engine/effects.ts';
import { byOrder, typeColumn } from '../model/inherit.ts';
import { orDefault } from '../model/blank.ts';
import { EngineError } from '../engine/errors.ts';
import { isDesk } from './desk.ts';
import type { System, Sheet, Compendium, CompendiumRecord, Binding } from '../model/types.ts';

export interface Action {
  id: string;
  label: string;
  record: CompendiumRecord;
  binding: Binding;
  effect: string;
  inst?: string;
}

export function bindingsOf(record: CompendiumRecord, system: System): Binding[] {
  return byOrder(kindOfRecord(system, record)?.bindings ?? [], record.bindings ?? []);
}

export const GRANTED_ACTION = '+';

function grantedAction(id: string, system: System): Action | null {
  const effect = findEffect(system, id);
  if (!effect || !isPipeline(effect)) return null;
  const label = effect.label || id;
  return {
    id: `${GRANTED_ACTION}${id}`,
    label,
    record: { id: `${GRANTED_ACTION}${id}`, label, ...(effect.description ? { description: effect.description } : {}) },
    binding: { effect: id },
    effect: id,
  };
}

export function availableActions(
  sheet: Sheet, { system, compendium }: { system: System; compendium: Compendium },
): Action[] {
  const own = heldBy(sheet, compendium).flatMap(({ record, entry }) => actionsOfRecord(record, system, isItem(system, record), entry.id)
    .filter(action => bindingHolds(system, record, action.binding)));
  if (isDesk(sheet)) return own;
  const granted = grantedTo(system, sheet, compendium)
    .map(id => grantedAction(id, system))
    .filter((action): action is Action => action !== null && !own.some(o => o.effect === action.effect));
  return [...own, ...granted];
}

export function actionOf(
  actionId: string, { system, compendium }: { system: System; compendium: Compendium },
): Action {
  if (String(actionId).startsWith(GRANTED_ACTION)) {
    const id = String(actionId).slice(GRANTED_ACTION.length);
    const action = grantedAction(id, system);
    if (!action) throw new EngineError(`эффекта-кнопки «${id}» в системе нет`);
    return action;
  }
  const at = String(actionId).lastIndexOf(':');
  const head = at > 0 ? String(actionId).slice(0, at) : String(actionId);
  const index = at > 0 ? Number(String(actionId).slice(at + 1)) : 0;
  const mark = head.indexOf(INSTANCE);
  const recordId = mark > 0 ? head.slice(0, mark) : head;
  const inst = mark > 0 ? head.slice(mark + 1) : undefined;

  const record = findRecord(compendium, recordId);
  if (!record) throw new EngineError(`в компендиуме нет записи «${recordId}»`);

  const action = actionsOfRecord(record, system, isItem(system, record), inst)[index];
  if (!action) {
    throw new EngineError(
      `запись «${record.label}» (${recordId}) не даёт действия №${index}: ` +
      'ни своей привязки, ни привязки у её рода');
  }
  if (!bindingHolds(system, record, action.binding)) throw new EngineError(`«${action.label}»: у записи «${record.label}» этой кнопки нет`);
  return action;
}

export const INSTANCE = '@';

export function bindingHolds(system: System, record: CompendiumRecord, binding: Binding): boolean {
  const condition = (binding as { if?: { expr?: string } }).if?.expr;
  if (!condition?.trim()) return true;
  const props = propsOf(record, system) ?? {};
  const value = compile(condition).evaluate(name => {
    const [head, ...path] = name.split('.');
    const column = typeColumn(system, record.table, head!);
    return staticCell(system, linkOf(column), orDefault(props[head!], column), path) as never;
  });
  if (typeof value !== 'boolean') throw new EngineError(`условие кнопки «${binding.label ?? binding.effect}» у «${record.label}» должно давать да/нет, а дало ${JSON.stringify(value)}`);
  return value;
}

function actionsOfRecord(record: CompendiumRecord, system: System, fromItem: boolean, inst?: string): Action[] {
  const bindings = bindingsOf(record, system);
  const props = propKeysOf(kindOfRecord(system, record));
  return bindings.map((binding, index): Action => {
    const args = argsWithProps(system, binding, props);
    return {
      id: `${record.id}${inst ? `${INSTANCE}${inst}` : ''}:${index}`,
      ...(inst ? { inst } : {}),
      label: fromItem || bindings.length > 1
        ? `${record.label} · ${binding.label || 'Применение'}`
        : String(record.label),
      record,
      binding: { ...binding, ...(args ? { args } : {}) },
      effect: binding.effect,
    };
  });
}

export const effectLabelOf = (system: System, id: string): string => {
  const effect = findEffect(system, id);
  return (effect && effect.label) || id;
};
