import type { Sheet } from '../model/types.ts';

export const deskOf = (sheets: readonly Sheet[]): Sheet | null => sheets.find(sheet => sheet.kind === 'desk') ?? null;
