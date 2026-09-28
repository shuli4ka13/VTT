type Loose = Record<string, any>;

export function fieldDiceOf(system: Loose): Loose {
  const die = system.initiative?.die;
  if (!die) return system;
  const fields = (system.fields ?? []).map((field: Loose) => (
    field.roll && !field.roll.die ? { ...field, roll: { ...field.roll, die } } : field));
  return { ...system, fields };
}
