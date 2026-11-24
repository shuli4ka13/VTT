import { CALL_WORDS, ROLL_CALL } from '@vtt/engine';
import type { Meddle, MeddleAsk, SunBubble } from '@vtt/engine';
import type { System } from '@vtt/schema';
import { useT } from '../../../../../i18n/author.ts';
import { Link, Row, nameOf, namesLine } from './parts.tsx';
import { tagSaid } from '../../../tag-said.ts';

export interface Merged { sources: string[]; asks: MeddleAsk[] }

export function mergeMeddle(bubbles: readonly SunBubble[]): Merged {
  const sources = new Set<string>();
  const asks = new Map<string, MeddleAsk>();
  for (const bubble of bubbles) {
    if (!bubble.meddle) continue;
    bubble.meddle.sources.forEach(one => sources.add(one));
    bubble.meddle.asks.forEach(ask => asks.set(`${ask.effect}:${ask.handler}`, ask));
  }
  return { sources: [...sources], asks: [...asks.values()] };
}

export function MeddleSummary({ system, merged }: { system: System; merged: Merged }) {
  const t = useT('sunWindow');
  const more = t('meddle.others');
  const own = merged.sources.map(id => nameOf(system, id));
  const asked = [...new Set(merged.asks.map(ask => ask.label))];
  if (!own.length && !asked.length) return <span className="faint">{t('meddle.none')}</span>;
  return (
    <div className="sunw__callout">
      {own.length ? <p><strong>{t('meddle.own', { n: own.length })}</strong> — {namesLine(own, more)}</p> : null}
      {asked.length ? <p><strong>{t('meddle.ask', { n: asked.length })}</strong> — {namesLine(asked, more)}</p> : null}
    </div>
  );
}

export function MeddleFull({ system, meddle, onOpenEffect }: { system: System; meddle: Meddle; onOpenEffect: (id: string) => void }) {
  const t = useT('sunWindow');
  const wordOf = (edit: Meddle['edits'][number]): string => {
    if (edit.word) return system.roll_edits?.[edit.word]?.label ?? edit.word;
    const said = (CALL_WORDS[ROLL_CALL].params as Record<string, string | undefined>)[edit.param];
    return said ? `${said.charAt(0).toLocaleUpperCase()}${said.slice(1)}` : t('meddle.other');
  };
  const words = [...new Set(meddle.edits.map(wordOf))];
  return (
    <div className="sunw__stack">
      <h4 className="sunw__sub">{t('meddle.edits')} · {meddle.sources.length}</h4>
      {words.map(word => (
        <Row key={word} name={word}>
          {meddle.edits.filter(edit => wordOf(edit) === word).map((edit, index) => {
            const side = edit.side === 'roller' ? t('meddle.roller') : edit.side === 'against' ? t('meddle.against') : t('meddle.any');
            return (
              <span key={index} className="sunw__item">
                <Link onClick={() => onOpenEffect(edit.source)}>{edit.label}</Link>
                <span className="faint"> · {side}</span>
                {edit.needs.length ? <span className="faint"> · {t('meddle.needs', { tags: edit.needs.map(tag => tagSaid(system, tag)).join(', ') })}</span> : null}
              </span>
            );
          })}
        </Row>
      ))}
      <h4 className="sunw__sub">{t('meddle.asks')} · {meddle.asks.length}</h4>
      {meddle.asks.map((ask, index) => (
        <p key={index} className="sunw__item">
          <Link onClick={() => onOpenEffect(ask.effect)}>{nameOf(system, ask.effect)}</Link>
          <span className="faint"> · {ask.confirm ? t('meddle.decides') : t('meddle.itself')}</span>
        </p>
      ))}
    </div>
  );
}
