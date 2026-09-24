type Loose = Record<string, any>;

export function recordsOfBook(book: Loose | undefined): Loose | undefined {
  if (!book) return book;
  if (!('items' in book) && !('actions' in book)) return book;
  const { items = [], actions = [], ...rest } = book;
  const records = [...items, ...actions].map((record: Loose) => {
    const next = { ...record };
    if (next.activities?.length) next.bindings = next.activities;
    else if (next.effect) next.bindings = [{ label: next.label, effect: String(next.effect), args: next.args ?? {} }];
    delete next.activities;
    delete next.effect;
    delete next.args;
    return next;
  });
  return { ...rest, records };
}

export function hasOfSheet(sheet: Loose): Loose {
  if (!('equipped' in sheet) && !('actions' in sheet)) return sheet;
  const { equipped = [], actions = [], ...rest } = sheet;
  const seen = new Set<string>();
  const has = [...equipped, ...actions].filter((id: string) => !seen.has(id) && seen.add(id)).map((of: string) => ({ of }));
  const ordered: Loose = {};
  for (const [key, value] of Object.entries(rest)) {
    if (key === 'effects') ordered.has = has;
    ordered[key] = value;
  }
  if (!('has' in ordered)) ordered.has = has;
  return ordered;
}

export function ownedOf<T extends { system: Loose; compendium?: Loose; sheets?: Loose[] }>(world: T): T {
  const next = JSON.parse(JSON.stringify(world)) as T;
  if (next.compendium) next.compendium = recordsOfBook(next.compendium);
  if (next.sheets) next.sheets = next.sheets.map(hasOfSheet);
  if (next.system.mannequins) next.system.mannequins = next.system.mannequins.map(hasOfSheet);
  return next;
}
