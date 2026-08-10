// Сериализация чарника и — главное — сторож границы между хранимым и вычисленным.
//
// Критерий приёмки №1 требует, чтобы round-trip JSON давал идентичный объект
// и чтобы вычисленных значений в нём не было. Побайтность обеспечивается
// фиксированным порядком ключей верхнего уровня и сортировкой тегов внутри
// `values` — тогда результат не зависит от того, в каком порядке интерфейс
// эти ключи создавал.
//
// «Вычисленных значений нет» обеспечивается не соглашением, а проверкой:
// всё, что не объявленный ключ и не скаляр, роняет сериализацию с именем
// виновника. Положить в чарник `computed`, метод или вложенный объект нельзя.

import type { Sheet } from './types.ts';

export class SheetShapeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SheetShapeError';
  }
}

const TOP_KEYS = ['id', 'systemId', 'kind', 'name', 'values', 'equipped', 'effects', 'actions'];

// Персонаж игрока или ведущего. Это не правило системы, а метка о том, кто листом
// владеет, — того же рода, что имя. Системы, где различия нет, просто ставят 'pc'.
const KINDS = ['pc', 'npc'];

const isScalar = (v: unknown) => v === null || ['number', 'boolean', 'string'].includes(typeof v);

export function assertSheetShape(sheet: unknown): Sheet {
  if (!sheet || typeof sheet !== 'object' || Array.isArray(sheet)) {
    throw new SheetShapeError('чарник должен быть объектом');
  }

  const s = sheet as Record<string, any>;

  for (const key of Object.keys(s)) {
    if (!TOP_KEYS.includes(key)) {
      throw new SheetShapeError(
        `«${key}» не является полем чарника; в DTO допустимы только: ${TOP_KEYS.join(', ')}. ` +
        'Вычисленные значения в чарнике не хранятся — их считает движок.');
    }
  }
  for (const key of TOP_KEYS) {
    if (!(key in s)) throw new SheetShapeError(`в чарнике нет обязательного поля «${key}»`);
  }

  if (!KINDS.includes(s.kind)) {
    throw new SheetShapeError(`«kind» должен быть одним из: ${KINDS.join(', ')}`);
  }

  for (const key of ['id', 'systemId', 'name']) {
    if (typeof s[key] !== 'string') throw new SheetShapeError(`«${key}» должен быть строкой`);
  }

  if (!s.values || typeof s.values !== 'object' || Array.isArray(s.values)) {
    throw new SheetShapeError('«values» должен быть объектом тег → значение');
  }
  for (const [tag, value] of Object.entries(s.values)) {
    if (!isScalar(value)) {
      throw new SheetShapeError(
        `значение «${tag}» имеет тип ${typeof value} — хранимое значение обязано быть скаляром. ` +
        'Похоже, в чарник попало вычисленное или производное значение.');
    }
  }

  if (!Array.isArray(s.equipped)) throw new SheetShapeError('«equipped» должен быть массивом');
  for (const id of s.equipped) {
    if (typeof id !== 'string') throw new SheetShapeError('«equipped» содержит не ссылку на предмет, а значение');
  }

  if (!Array.isArray(s.actions)) throw new SheetShapeError('«actions» должен быть массивом');
  for (const id of s.actions) {
    if (typeof id !== 'string') {
      throw new SheetShapeError('«actions» содержит не ссылку на действие, а объект — копий записей в чарнике не держим');
    }
  }

  if (!Array.isArray(s.effects)) throw new SheetShapeError('«effects» должен быть массивом');
  for (const entry of s.effects) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new SheetShapeError('запись в «effects» должна быть объектом');
    }
    if (typeof entry.effectId !== 'string') {
      throw new SheetShapeError('запись в «effects» обязана ссылаться на эффект через «effectId»');
    }
    for (const [key, value] of Object.entries(entry)) {
      if (!isScalar(value)) throw new SheetShapeError(`поле «${key}» записи эффекта обязано быть скаляром`);
    }
  }

  return s as Sheet;
}

export function serializeSheet(sheet: unknown): string {
  const ok = assertSheetShape(sheet) as Record<string, unknown>;

  const ordered: Record<string, unknown> = {};
  for (const key of TOP_KEYS) {
    ordered[key] = key === 'values' ? sortKeys(ok.values as Record<string, unknown>) : ok[key];
  }
  return JSON.stringify(ordered, null, 2);
}

export function deserializeSheet(json: string): Sheet {
  let parsed: any;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    throw new SheetShapeError(`чарник не разбирается как JSON: ${(err as Error).message}`);
  }
  assertSheetShape(parsed);
  return {
    id: parsed.id,
    systemId: parsed.systemId,
    kind: parsed.kind,
    name: parsed.name,
    values: sortKeys(parsed.values) as Sheet['values'],
    equipped: [...parsed.equipped],
    effects: parsed.effects.map((e: object) => ({ ...e })),
    actions: [...parsed.actions],
  };
}

function sortKeys(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) out[key] = obj[key];
  return out;
}
