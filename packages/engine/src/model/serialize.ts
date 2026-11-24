import type { Sheet } from './types.ts';
import { tr } from '../words/tongue.ts';

export class SheetShapeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SheetShapeError';
  }
}

const TOP_KEYS = ['id', 'systemId', 'of', 'group', 'name', 'values', 'has', 'effects', 'quiet'];

const OPTIONAL_KEYS = ['of', 'group', 'quiet'];

const isScalar = (v: unknown) => v === null || ['number', 'boolean', 'string'].includes(typeof v);

export function assertSheetShape(sheet: unknown): Sheet {
  if (!sheet || typeof sheet !== 'object' || Array.isArray(sheet)) {
    throw new SheetShapeError(tr`лист должен быть объектом`);
  }

  const s = sheet as Record<string, any>;

  for (const key of Object.keys(s)) {
    if (!TOP_KEYS.includes(key)) {
      throw new SheetShapeError(
        tr`«${key}» не является полем листа; в DTO допустимы только: ${TOP_KEYS.join(', ')}. ` +
        tr`Вычисленные значения в листе не хранятся — их считает движок.`);
    }
  }
  for (const key of TOP_KEYS) {
    if (!(key in s) && !OPTIONAL_KEYS.includes(key)) throw new SheetShapeError(tr`в листе нет обязательного поля «${key}»`);
  }

  for (const key of ['id', 'systemId', 'name']) {
    if (typeof s[key] !== 'string') throw new SheetShapeError(tr`«${key}» должен быть строкой`);
  }

  if (!s.values || typeof s.values !== 'object' || Array.isArray(s.values)) {
    throw new SheetShapeError(tr`«values» должен быть объектом тег → значение`);
  }
  for (const [tag, value] of Object.entries(s.values)) {
    if (!isScalar(value)) {
      throw new SheetShapeError(
        tr`значение «${tag}» имеет тип ${typeof value} — хранимое значение обязано быть скаляром. ` +
        tr`Похоже, в лист попало вычисленное или производное значение.`);
    }
  }

  if (!Array.isArray(s.has)) throw new SheetShapeError(tr`«has» должен быть массивом`);
  for (const entry of s.has) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry) || typeof entry.of !== 'string') {
      throw new SheetShapeError(tr`запись в «has» обязана ссылаться на запись компендиума через «of» — копий записей в листе не держим`);
    }
    for (const [key, value] of Object.entries(entry.values ?? {})) {
      if (!isScalar(value)) throw new SheetShapeError(tr`значение «${key}» у «${entry.of}» обязано быть скаляром`);
    }
  }

  if (!Array.isArray(s.effects)) throw new SheetShapeError(tr`«effects» должен быть массивом`);
  for (const entry of s.effects) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new SheetShapeError(tr`запись в «effects» должна быть объектом`);
    }
    if (typeof entry.effectId !== 'string') {
      throw new SheetShapeError(tr`запись в «effects» обязана ссылаться на эффект через «effectId»`);
    }
    for (const [key, value] of Object.entries(entry)) {
      if (!isScalar(value)) throw new SheetShapeError(tr`поле «${key}» записи эффекта обязано быть скаляром`);
    }
  }

  return s as Sheet;
}

export function serializeSheet(sheet: unknown): string {
  const ok = assertSheetShape(sheet) as Record<string, unknown>;

  const ordered: Record<string, unknown> = {};
  for (const key of TOP_KEYS) {
    if (!(key in ok)) continue;
    ordered[key] = key === 'values' ? sortKeys(ok.values as Record<string, unknown>) : ok[key];
  }
  return JSON.stringify(ordered, null, 2);
}

export function deserializeSheet(json: string): Sheet {
  let parsed: any;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    throw new SheetShapeError(tr`лист не разбирается как JSON: ${(err as Error).message}`);
  }
  assertSheetShape(parsed);
  return {
    id: parsed.id,
    systemId: parsed.systemId,
    ...(typeof parsed.of === 'string' ? { of: parsed.of } : {}),
    ...(typeof parsed.group === 'string' ? { group: parsed.group } : {}),
    name: parsed.name,
    values: sortKeys(parsed.values) as Sheet['values'],
    has: parsed.has.map((e: { values?: object }) => ({ ...e, ...(e.values ? { values: { ...e.values } } : {}) })),
    effects: parsed.effects.map((e: object) => ({ ...e })),
    ...(Array.isArray(parsed.quiet) && parsed.quiet.length ? { quiet: [...parsed.quiet] } : {}),
  };
}

function sortKeys(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) out[key] = obj[key];
  return out;
}
