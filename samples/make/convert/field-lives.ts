type Loose = Record<string, any>;

export function fieldLivesOf(system: Loose): Loose {
  if (!(system.fields ?? []).some((field: Loose) => 'desk' in field)) return system;
  const fields = system.fields.map((field: Loose) => {
    if (!('desk' in field)) return field;
    const { desk, ...rest } = field;
    const out: Loose = {};
    for (const [key, value] of Object.entries(rest)) {
      out[key] = value;
      if (key === 'label' && desk) out.lives = 'desk';
    }
    return out;
  });
  return { ...system, fields };
}
