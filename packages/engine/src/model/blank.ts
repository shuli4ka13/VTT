export const isBlank = (value: unknown): boolean => {
  if (value === undefined || value === null || value === '') return true;
  if (typeof value === 'object' && !Array.isArray(value) && 'expr' in value) {
    const expr = (value as { expr?: unknown }).expr;
    return expr === undefined || expr === null || String(expr).trim() === '';
  }
  return false;
};

export const orDefault = (value: unknown, column: { default?: unknown } | undefined): unknown =>
  (isBlank(value) ? column?.default ?? null : value);
