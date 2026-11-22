export const isBlank = (value: unknown): boolean => {
  if (value === undefined || value === null || value === '') return true;
  if (typeof value === 'object' && !Array.isArray(value) && 'expr' in value) {
    const expr = (value as { expr?: unknown }).expr;
    return expr === undefined || expr === null || String(expr).trim() === '';
  }
  return false;
};

const isFormula = (value: unknown): boolean => Boolean(value && typeof value === 'object' && !Array.isArray(value) && 'expr' in value);

export const fixedDefault = (column: { default?: unknown } | undefined): unknown => (isFormula(column?.default) ? undefined : column?.default);

export const orDefault = (value: unknown, column: { default?: unknown } | undefined): unknown =>
  (isBlank(value) ? fixedDefault(column) ?? null : value);
