import { useMemo } from 'react';
import type { Sun, SunRay } from '@vtt/engine';
import type { System } from '@vtt/schema';
import { useT } from '../../../../../i18n/author.ts';
import { Link, Pill, Section, nameOf, uniq } from './parts.tsx';
import { MeddleSummary, mergeMeddle } from './meddle.tsx';
import { StepWords, namesBefore, wordsOf } from './step-words.tsx';
import { chainOf, sliceOf } from './chain.ts';

export function RayBody({ system, effectId, ray, onOpenEffect }: {
  system: System;
  effectId: string;
  sun: Sun;
  ray: SunRay;
  onOpenEffect: (id: string) => void;
}) {
  const t = useT('sunWindow');
  const effect = system.effects?.[effectId];
  const chain = useMemo(() => (effect ? chainOf(effect, ray.span) : []), [effect, ray.span]);
  if (!effect) return null;
  const steps = sliceOf(chain, ray.span, Boolean(ray.condition));
  const names = namesBefore(system, effect, chain, ray.span?.from ?? 0);
  const condition = ray.condition ? wordsOf(system, ray.condition, names) : '';
  const made = uniq(ray.bubbles.filter(one => one.role === 'reads' || one.role === 'calls'));
  const sets = uniq(ray.bubbles.filter(one => one.role === 'sets'));
  const gives = uniq(ray.bubbles.filter(one => one.role === 'gives'));
  const meddle = ray.bubbles.filter(one => one.role === 'meddle');
  const seams = [...new Map(ray.bubbles.filter(one => one.role === 'seam' && one.seam).map(one => [one.seam!.by, one.seam!.label])).entries()];
  const merged = mergeMeddle(meddle);
  const hasMeddle = merged.sources.length > 0 || merged.asks.length > 0;
  return (
    <>
      <Section title={t('step.does')}>
        {condition ? <p className="sunw__condition"><span className="faint">{t('step.condition')}: </span>{condition}</p> : null}
        {steps.length
          ? <StepWords system={system} effect={effect} steps={steps} names={names} />
          : <p>{t(`stage.${ray.stage}`)}</p>}
      </Section>
      {made.length ? <Section title={t('step.made')}><div className="sunw__chips">{made.map((one, index) => <Pill key={index} kind={one.kind}>{one.label}</Pill>)}</div></Section> : null}
      {sets.length ? <Section title={t('step.sets')}><div className="sunw__chips">{sets.map((one, index) => <Pill key={index} kind={one.kind}>{one.label}</Pill>)}</div></Section> : null}
      {gives.length ? <Section title={t('step.gives')}><div className="sunw__chips">{gives.map((one, index) => <Pill key={index} kind={one.kind}>{one.label}</Pill>)}</div></Section> : null}
      {hasMeddle || seams.length ? (
        <Section title={t('step.meddle')}>
          {hasMeddle ? <MeddleSummary system={system} merged={merged} /> : null}
          {seams.length ? (
            <div className="sunw__chips">
              <span className="faint">{t('meddle.seams')}:</span>
              {seams.map(([id]) => <Link key={id} onClick={() => onOpenEffect(id)}>{nameOf(system, id)}</Link>)}
            </div>
          ) : null}
        </Section>
      ) : null}
    </>
  );
}
