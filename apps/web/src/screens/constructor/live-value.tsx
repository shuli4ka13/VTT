import { useMemo } from 'react';
import { compile } from '@vtt/engine/formula';
import { Chip } from '../../ui/primitives.tsx';
import { useReader, show } from '../../engine/use-calc.ts';
import { mannequinsOf } from '../../engine/dry-run.ts';
import { formulaAsLabels } from '../../ui/formula.tsx';
import type { System, Compendium } from '@vtt/schema';

const depsOf = (source: string): readonly string[] => {
  try { return compile(source).deps; } catch { return []; }
};

export function LiveValue({ system, compendium, tag, source }: {
  system: System;
  compendium: Compendium;
  tag: string;
  source: string;
}) {
  const [doll] = mannequinsOf(system);
  const reader = useReader(system, doll!, compendium);
  const deps = useMemo(() => depsOf(source), [source]);
  const value = show(reader.valueOf(tag));
  const words = formulaAsLabels(system, source);

  return (
    <div className="stack stack--tight live">
      <span className={`live__value ${value.bad ? 'field__error' : ''}`} title={value.title}>
        = {value.text}
        <span className="faint"> на манекене</span>
      </span>
      {words && words !== source ? <span className="faint">{words}</span> : null}
      {deps.length ? (
        <div className="inline inline--tight">
          <span className="faint">Зависит от:</span>
          {deps.map(dep => (
            <Chip key={dep}>{system.fields.find(field => field.tag === dep)?.label ?? dep}</Chip>
          ))}
        </div>
      ) : null}
    </div>
  );
}
