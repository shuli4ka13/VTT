import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { litOf, namesAt, sampleHeard } from '@vtt/engine';
import type { Lit, Sun, System } from '@vtt/engine';
import { useT } from '../../../../../i18n/author.ts';
import { Select, NumInput, Field, Button } from '../../../../../ui/primitives.tsx';
import { MANNEQUINS } from '../../../../../engine/dry-run.ts';
import type { DryRun, Staged } from '../../../../../engine/dry-run.ts';
import { PreviewPanel } from '../../preview-panel.tsx';

const [HOLDER, OTHER] = [MANNEQUINS[0]!.id, MANNEQUINS[1]!.id];

const SHOWN = new Set(['sheet', 'boolean', 'number', 'choice']);

interface Heard { name: string; label: string; kind: string; many: boolean; from?: string }

type Values = Record<string, unknown>;

export interface TrialProps {
  system: System;
  effectId: string;
  sun: Sun;
  onLit?: (lit: Lit | null) => void;
}

export function Trial({ system, effectId, sun, onLit }: TrialProps): ReactElement {
  const t = useT('sunTrial');
  const effect = system.effects[effectId];
  const count = effect?.on?.length ?? 0;
  const hanging = sun.launch !== 'manual';
  const [handler, setHandler] = useState(0);
  const at = Math.min(handler, Math.max(0, count - 1));
  const defaults = useMemo<Values>(
    () => (hanging && count ? sampleHeard(system as never, effectId, at, HOLDER, OTHER) : {}),
    [system, effectId, at, hanging, count],
  );
  const [typed, setTyped] = useState<Values | null>(null);
  const heard = typed ?? defaults;
  const staged = useMemo<Staged | undefined>(
    () => (hanging && count ? { handler: at, heard } : undefined),
    [hanging, count, at, heard],
  );
  const names = useMemo<Heard[]>(
    () => (hanging && count
      ? namesAt(system as never, effectId, { part: 'handler-if', handler: at })
        .filter(one => one.group === 'heard' && SHOWN.has(one.kind))
        .map(one => ({ name: one.name, label: one.label, kind: one.kind, many: Boolean(one.many), ...(one.from ? { from: one.from } : {}) }))
      : []),
    [system, effectId, at, hanging, count],
  );
  const handlerLabels = useMemo(() => {
    const whens = sun.rays.filter(ray => ray.stage === 'when');
    return Array.from({ length: count }, (_, index) => whens[index]?.label || t('which', { n: index + 1 }));
  }, [sun, count, t]);

  const hold = useRef(onLit);
  hold.current = onLit;
  useEffect(() => () => hold.current?.(null), []);
  const lit = (run: DryRun | null) => {
    if (!run || run.trouble || !effect) { hold.current?.(null); return; }
    try {
      hold.current?.(litOf(sun, effect as never, run.reports.map(one => one.report) as never, hanging ? at : undefined));
    } catch {
      hold.current?.(null);
    }
  };

  const put = (name: string, value: unknown) => {
    const next = { ...heard };
    if (value === undefined) delete next[name];
    else next[name] = value;
    setTyped(next);
  };

  if (hanging && !count) return <p className="faint">{t('nothing')}</p>;

  return (
    <>
      {hanging ? (
        <div className="sundock__case">
          <div className="sundock__case-head">
            <span className="sundock__case-title">{t('happened')}</span>
            <Button size="sm" onClick={() => setTyped(null)}>{t('reset')}</Button>
          </div>
          {count > 1 ? (
            <Field label={t('whichLabel')}>
              <Select
                value={String(at)} label={t('whichLabel')}
                options={handlerLabels.map((label, index) => [String(index), label] as const)}
                onChange={next => { setHandler(Number(next)); setTyped(null); }}
              />
            </Field>
          ) : null}
          {names.map(one => (
            <Field key={one.name} label={one.label}>
              <HeardField one={one} system={system} value={heard[one.name]} onPut={value => put(one.name, value)} />
            </Field>
          ))}
        </div>
      ) : null}
      <PreviewPanel effectId={effectId} only="trial" {...(staged ? { staged } : {})} onRun={run => lit(run)} />
    </>
  );
}

function HeardField({ one, system, value, onPut }: { one: Heard; system: System; value: unknown; onPut: (value: unknown) => void }): ReactElement {
  const t = useT('sunTrial');
  if (one.kind === 'sheet') {
    const id = Array.isArray(value) ? value[0] : value;
    const current = id === OTHER ? OTHER : HOLDER;
    return (
      <Select
        value={current} label={one.label}
        options={[[HOLDER, t('holder')], [OTHER, t('other')]] as const}
        onChange={next => onPut(one.many || Array.isArray(value) ? [next] : next)}
      />
    );
  }
  if (one.kind === 'boolean') {
    return <input type="checkbox" aria-label={one.label} checked={value === true} onChange={event => onPut(event.target.checked)} />;
  }
  if (one.kind === 'number') {
    return <NumInput value={typeof value === 'number' ? value : 0} onCommit={onPut} />;
  }
  const table = one.from ? system.tables?.[one.from] : undefined;
  const rows = (table?.rows ?? []).map(row => {
    const id = String(row.value ?? '');
    return [id, row.label || id] as const;
  });
  return (
    <Select
      value={typeof value === 'string' ? value : ''} label={one.label}
      options={[['', t('unset')], ...rows] as const}
      onChange={next => onPut(next === '' ? undefined : next)}
    />
  );
}
