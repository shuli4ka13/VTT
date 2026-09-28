type Loose = Record<string, any>;

export function roomGrantsOf(system: Loose): Loose {
  if (!('room_rules' in system)) return system;
  const { room_rules: rules, ...rest } = system;
  const out: Loose = {};
  for (const [key, value] of Object.entries(rest)) {
    if (key === 'mannequins' && rules?.length) out.grants = rules;
    out[key] = value;
  }
  if (rules?.length && !('grants' in out)) out.grants = rules;
  return out;
}
