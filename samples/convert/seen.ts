type Loose = Record<string, unknown>;
type Op = Loose & { op: string };

function opsToSteps(effect: string, key: string, ops: Op[]): Loose[] {
  const out: Loose[] = [];
  for (const op of ops) {
    const last = out[out.length - 1];
    if (op.op === 'addDie') {
      out.push({ type: 'roll-add', count: typeof op.count === 'object' ? op.count : { expr: String(op.count ?? 1) }, ...(op.sides ? { sides: { expr: String(op.sides) } } : {}) });
    } else if ((op.op === 'keepBest' || op.op === 'keepWorst') && last?.type === 'roll-add') {
      last.keep = op.op === 'keepBest' ? 'best' : 'worst';
    } else if (op.op === 'explode' && op.apart && last?.type === 'roll-add') {
      last.explode = true;
    } else if (op.op === 'bonusDie') {
      out.push({ type: 'roll-plus', value: { expr: `${op.minus ? '-' : ''}кинуть('${Number(op.count ?? 1)}к${Number(op.sides)}')` } });
    } else if (op.op === 'reroll') {
      out.push({ type: 'roll-reroll', upTo: { expr: String(op.n ?? 1) } });
    } else {
      throw new Error(`«${effect}»: правку «${key}» (${op.op}) увидев кости не выразить — переведите руками`);
    }
  }
  return out;
}

export function seenOf(world: Loose): Loose {
  const system = world.system as Loose;
  const dictionary = (system.roll_edits ?? {}) as Record<string, { ops?: Op[] }>;
  const effects = Object.fromEntries(Object.entries((system.effects ?? {}) as Record<string, Loose>).map(([id, effect]) => {
    if (!Array.isArray(effect.on)) return [id, effect];
    const on = (effect.on as Loose[]).map(handler => {
      const claims = handler.claims as string[] | undefined;
      if (!claims?.length) return handler;
      const { claims: _claims, on: _moment, steps, ...rest } = handler;
      const ops = claims.flatMap(key => opsToSteps(id, key, dictionary[key]?.ops ?? []));
      return { on: 'seen', ...rest, steps: [...((steps ?? []) as Loose[]), ...ops] };
    });
    return [id, { ...effect, on }];
  }));
  return { ...world, system: { ...system, effects } };
}
