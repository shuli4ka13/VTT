type Loose = Record<string, any>;

const TYPES: Record<string, { key: string; label: string; icon: string; hint: string }> = {
  pc: { key: 'персонаж', label: 'Персонаж', icon: '🧙', hint: 'Лист героя.' },
  npc: { key: 'противник', label: 'Противник', icon: '👹', hint: 'Лист противника.' },
};

const bare = (sheet: Loose): Loose => {
  const { kind, ...rest } = sheet;
  void kind;
  return rest;
};

export function sheetTypesOf(world: { system: Loose; sheets?: Loose[] }): { system: Loose; sheets?: Loose[] } {
  const system = { ...world.system };
  const records: Loose = { ...(system.records ?? {}) };
  const typed = Object.values(records).some((kind: Loose) => kind.kind === 'sheet');
  const used = new Set((world.sheets ?? []).filter(sheet => !sheet.of).map(sheet => sheet.kind));
  const split = !typed && used.has('pc') && used.has('npc');
  if (split) {
    for (const who of ['pc', 'npc']) {
      const { key, label, icon, hint } = TYPES[who]!;
      records[key] ??= { kind: 'sheet', label, icon, hint };
    }
    system.records = records;
  }
  if (system.mannequins) system.mannequins = system.mannequins.map(bare);
  const sheets = world.sheets?.map(sheet => {
    const type = split && !sheet.of ? TYPES[sheet.kind]?.key : undefined;
    const next = bare(sheet);
    if (!type) return next;
    const ordered: Loose = {};
    for (const [key, value] of Object.entries(next)) {
      ordered[key] = value;
      if (key === 'systemId') ordered.of = type;
    }
    return ordered;
  });
  return { system, ...(sheets ? { sheets } : {}) };
}
