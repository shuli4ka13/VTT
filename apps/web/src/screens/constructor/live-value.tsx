import { useMemo } from 'react';
import { compile, fieldOf } from '@vtt/engine';
import { Chip, Tip } from '../../ui/primitives.tsx';
import { useReader, show } from '../../engine/use-calc.ts';
import { mannequinsOf } from '../../engine/dry-run.ts';
import { formulaAsLabels } from '../../ui/formula.tsx';
import type { System, Compendium } from '@vtt/schema';
import { useT } from '../../i18n/author.ts';

const depsOf = (source: string): readonly string[] => {
  try { return compile(source).deps; } catch { return []; }
};

export function LiveValue({ system, compendium, tag, source }: {
  system: System;
  compendium: Compendium;
  tag: string;
  source: string;
}) {
  const t = useT('sheetTab');
  const [doll] = mannequinsOf(system);
  const reader = useReader(system, doll!, compendium);
  const deps = useMemo(() => depsOf(source), [source]);
  const value = show(reader.valueOf(tag), undefined, fieldOf(system, tag)?.dice);
  const words = formulaAsLabels(system, source);

  return (
    <div className="stack stack--tight live">
      <span className={`live__value ${value.bad ? 'field__error' : ''}`} title={value.title}>
        = {value.text}{' '}
        <Tip text={t('live.tip')}><span className="faint">{t('live.onNew')}</span></Tip>
      </span>
      {words && words !== source ? <span className="faint">{words}</span> : null}
      {deps.length ? (
        <div className="inline inline--tight">
          <span className="faint">{t('live.depends')}</span>
          {deps.map(dep => (
            <Chip key={dep}>{formulaAsLabels(system, `@${dep}`)}</Chip>
          ))}
        </div>
      ) : null}
    </div>
  );
}
