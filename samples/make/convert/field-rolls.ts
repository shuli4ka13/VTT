type Loose = Record<string, any>;

export function fieldRollsOf(world: Loose): Loose {
  const fields = (world.system.fields ?? []).map((field: Loose) => {
    if (!field.roll || field.roll.count || field.roll.bonus) return field;
    const { pool, ...roll } = field.roll;
    return { ...field, roll: { ...roll, ...(pool ? { count: { expr: `@${field.tag}` } } : { bonus: { expr: `@${field.tag}` } }) } };
  });
  return { ...world, system: { ...world.system, fields } };
}
