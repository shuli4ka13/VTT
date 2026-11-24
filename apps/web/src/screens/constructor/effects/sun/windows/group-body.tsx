import type { Meddle, Seam, Stand, Sun, SunBubble, SunRay } from '@vtt/engine';
import { PHASES, sunOf, paramsOf, NAME_LABELS } from '@vtt/engine';
import type { Step, System } from '@vtt/schema';
import { useT } from '../../../../../i18n/author.ts';
import type { SunGroup } from '../layout.ts';
import { Link, Pill, Row, Section, nameOf } from './parts.tsx';
import { MeddleFull } from './meddle.tsx';
import { namesBefore, wordsOf, exprOf } from './step-words.tsx';
import { chainOf } from './chain.ts';
import { tagLinks } from './tag-links.ts';
import { tagSaid } from '../../../tag-said.ts';

interface Common { system: System; effectId: string; sun: Sun; group: SunGroup; ray?: SunRay; onOpenEffect: (id: string) => void }

const HINT: Record<string, string> = {
  'reads:input': 'input', 'reads:aside': 'aside', 'reads:field': 'field', 'reads:state': 'state', 'reads:result': 'result', 'reads:value': 'value',
  'sets:field': 'setField', 'sets:state': 'setState', 'sets:tag': 'setTag', 'sets:ask': 'ask', 'sets:stop': 'stop', 'gives:result': 'gives',
};

function CallItem({ system, effectId, ray, item, onOpenEffect }: Common & { item: SunBubble }) {
  const t = useT('sunWindow');
  const id = item.ref?.effect;
  const called = id ? system.effects?.[id] : undefined;
  if (!id || !called) return <p className="faint">{t('call.noEffect')}</p>;
  const caller = system.effects?.[effectId];
  const chain = caller ? chainOf(caller, ray?.span ?? null) : [];
  const step = chain.find(one => one.type === 'emit' && one.effect === id) as (Step & { args?: Record<string, unknown> }) | undefined;
  const names = caller ? namesBefore(system, caller, chain, chain.indexOf(step as Step)) : new Map<string, string>();
  const inside = sunOf(system, id);
  const params = paramsOf(system, called);
  return (
    <div className="sunw__block">
      <h4 className="sunw__sub">{called.label || id}</h4>
      {called.description ? <Section title={t('call.does')}><p>{called.description}</p></Section> : null}
      {step && params.length ? (
        <Section title={t('call.gives')}>
          {params.map(param => {
            const arg = step.args?.[param.key];
            const text = wordsOf(system, arg, names);
            const shown = text || ((param as { ask?: unknown }).ask ? t('call.asked') : exprOf(arg) === null && param.default !== undefined ? t('call.same') : t('call.notPassed'));
            return <Row key={param.key} name={param.label ?? param.key}>{text ? <Pill kind="input">{shown}</Pill> : <span className="faint">{shown}</span>}</Row>;
          })}
        </Section>
      ) : null}
      {inside?.rays.length ? (
        <Section title={t('call.inside')}>
          <ol className="sunw__rays">
            {inside.rays.map(one => <li key={one.key}>{t('call.insideRay', { n: one.number, label: one.label })}</li>)}
          </ol>
        </Section>
      ) : null}
      {called.returns?.length ? (
        <Section title={t('call.returns')}>
          <div className="sunw__chips">{called.returns.map(one => <Pill key={one.key} kind="result">{one.label || one.key}</Pill>)}</div>
        </Section>
      ) : null}
      <div className="sunw__actions">
        <button type="button" className="btn" onClick={() => onOpenEffect(id)}>{t('call.open', { name: called.label || id })}</button>
      </div>
    </div>
  );
}

function TagItem({ system, item, onOpenEffect }: { system: System; item: SunBubble; onOpenEffect: (id: string) => void }) {
  const t = useT('sunWindow');
  const more = (rest: number) => (rest > 0 ? <span className="faint">{t('tag.more', { n: rest })}</span> : null);
  const SHOWN = 8;
  return (
    <>
      {(item.ref?.tags ?? []).map(tag => {
        const contract = system.tags?.[tag];
        const said = (key: string): string => contract?.said?.[key] ?? key;
        const links = tagLinks(system, tag);
        const effects = (ids: string[]) => ids.slice(0, SHOWN).map(id => <Link key={id} onClick={() => onOpenEffect(id)}>{nameOf(system, id)}</Link>);
        return (
          <div key={tag} className="sunw__block">
            <h4 className="sunw__sub">{tagSaid(system, tag)}</h4>
            <Section title={t('tag.contract')}>
              {contract && (contract.inputs?.length || contract.each || contract.outputs?.length || contract.traits?.length) ? (
                <>
                  {contract.inputs?.length ? <Row name={t('tag.inputs')}>{contract.inputs.map(one => said(one.key)).join(', ')}</Row> : null}
                  {contract.each ? <Row name={t('tag.each')}>{said(contract.each)}</Row> : null}
                  {contract.outputs?.length ? <Row name={t('tag.outputs')}>{contract.outputs.map(one => said(one.key)).join(', ')}</Row> : null}
                  {contract.traits?.length ? <Row name={t('tag.traits')}>{contract.traits.map(one => said(one.key)).join(', ')}</Row> : null}
                </>
              ) : <span className="faint">{t('tag.noContract')}</span>}
            </Section>
            <Section title={t('tag.carries', { n: links.carriers.length })}>
              <div className="sunw__chips">{links.carriers.length ? effects(links.carriers) : <span className="faint">{t('tag.nobody')}</span>}{more(links.carriers.length - SHOWN)}</div>
            </Section>
            <Section title={t('tag.hears', { n: links.hearers.length })}>
              <div className="sunw__chips">
                {links.hearers.length ? links.hearers.slice(0, SHOWN).map(one => (
                  <span key={`${one.effect}:${one.handler}`}><Link onClick={() => onOpenEffect(one.effect)}>{nameOf(system, one.effect)}</Link> <span className="faint">{PHASES[one.phase].label}</span></span>
                )) : <span className="faint">{t('tag.nobody')}</span>}
                {more(links.hearers.length - SHOWN)}
              </div>
            </Section>
            <Section title={t('tag.edits', { n: links.editors.length })}>
              <div className="sunw__chips">
                {links.editors.length ? links.editors.slice(0, SHOWN).map(one => (
                  <span key={one.effect}><Link onClick={() => onOpenEffect(one.effect)}>{nameOf(system, one.effect)}</Link>{one.count > 1 ? <span className="faint"> {t('tag.times', { n: one.count })}</span> : null}</span>
                )) : <span className="faint">{t('tag.nobody')}</span>}
                {more(links.editors.length - SHOWN)}
              </div>
            </Section>
          </div>
        );
      })}
    </>
  );
}

function SeamItem({ system, seam, onOpenEffect }: { system: System; seam: Seam; onOpenEffect: (id: string) => void }) {
  const t = useT('sunWindow');
  const handler = system.effects?.[seam.by]?.on?.[seam.handler];
  const said = system.tags?.[seam.key]?.said ?? {};
  const names = new Map<string, string>([...Object.entries(said), ['holder', NAME_LABELS.holder]]);
  const condition = handler?.if ? wordsOf(system, handler.if, names) : '';
  const via = seam.via === 'tag' ? t('seam.byTag', { tag: tagSaid(system, seam.key) }) : seam.via === 'id' ? t('seam.byId') : t('seam.byAny');
  return (
    <div className="sunw__block" data-seam={seam.by}>
      <h4 className="sunw__sub">{seam.label}</h4>
      <Row name={t('seam.whose')}><Link onClick={() => onOpenEffect(seam.by)}>{nameOf(system, seam.by)}</Link></Row>
      <Row name={t('seam.when')}>{PHASES[seam.phase].label}</Row>
      <Row name={t('seam.by')}>{via}</Row>
      {condition ? <Row name={t('seam.condition')}>{condition}</Row> : null}
      {seam.confirm ? <p>{t('seam.decides')}</p> : null}
      {seam.manual ? <p>{t('seam.manual')}</p> : null}
      <p className="faint">{seam.found ? t('seam.found') : t('seam.lost')}</p>
      <div className="sunw__actions"><button type="button" className="btn" onClick={() => onOpenEffect(seam.by)}>{t('openMore')}</button></div>
    </div>
  );
}

function StandItem({ system, stand, onOpenEffect }: { system: System; stand: Stand; onOpenEffect: (id: string) => void }) {
  const t = useT('sunWindow');
  const via = stand.via === 'tag' ? t('stand.byTag') : t('stand.byId');
  return (
    <Row name={t('stand.title')}>
      <Link onClick={() => onOpenEffect(stand.effect)}>{t('stand.ray', { effect: nameOf(system, stand.effect), ray: stand.rayLabel })}</Link>
      <span className="faint"> · {PHASES[stand.phase].label} · {via}</span>
    </Row>
  );
}

export function GroupBody(props: Common) {
  const { system, group, onOpenEffect } = props;
  const t = useT('sunWindow');
  const items = group.items;
  const calls = items.filter(one => one.role === 'calls');
  const tags = items.filter(one => one.role === 'sets' && one.kind === 'tag');
  const seams = items.filter(one => one.role === 'seam' && one.seam);
  const stands = items.filter(one => one.role === 'stand' && one.stand);
  const meddles = items.filter(one => one.role === 'meddle' && one.meddle);
  const rows = items.filter(one => (one.role === 'reads' || one.role === 'gives' || one.role === 'sets') && !(one.role === 'sets' && one.kind === 'tag'));
  return (
    <>
      {calls.map((item, index) => <CallItem key={index} {...props} item={item} />)}
      {tags.map((item, index) => <TagItem key={index} system={system} item={item} onOpenEffect={onOpenEffect} />)}
      {seams.map((item, index) => <SeamItem key={index} system={system} seam={item.seam!} onOpenEffect={onOpenEffect} />)}
      {stands.length ? <div className="sunw__block">{stands.map((item, index) => <StandItem key={index} system={system} stand={item.stand!} onOpenEffect={onOpenEffect} />)}</div> : null}
      {meddles.map((item, index) => <MeddleFull key={index} system={system} meddle={item.meddle as Meddle} onOpenEffect={onOpenEffect} />)}
      {rows.length ? (
        <div className="sunw__block">
          {rows.map((item, index) => {
            const hint = HINT[`${item.role}:${item.kind}`] ?? 'other';
            return <Row key={index} name={item.label}><span className="faint">{t(`hint.${hint}`)}</span></Row>;
          })}
        </div>
      ) : null}
    </>
  );
}
