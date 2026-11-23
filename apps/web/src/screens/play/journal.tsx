import { useEffect, useRef } from 'react';
import type { LogEntry } from '@vtt/schema';
import { useT } from '../../i18n/play.ts';

const timeOf = (at: string): string => {
  const stamp = new Date(at);
  return Number.isNaN(stamp.getTime())
    ? ''
    : `${String(stamp.getHours()).padStart(2, '0')}:${String(stamp.getMinutes()).padStart(2, '0')}`;
};

export function Journal({ log }: { log: LogEntry[] }) {
  const t = useT('play');
  const end = useRef<HTMLDivElement>(null);
  const last = log.at(-1)?.id;
  useEffect(() => { end.current?.scrollIntoView?.({ block: 'end' }); }, [last]);

  if (!log.length) return <span className="faint">{t('journal.empty')}</span>;
  return (
    <div className="log">
      {log.slice(-200).map(entry => <Line key={entry.id} entry={entry} />)}
      <div ref={end} />
    </div>
  );
}

function Line({ entry }: { entry: LogEntry }) {
  const t = useT('play');
  const lines = entry.lines?.length ? entry.lines : null;
  const head = lines ? lines[0]! : entry.text;
  const rest = lines ? lines.slice(1) : [];
  const outcome = rest.at(-1);
  const details = rest.slice(0, -1);
  return (
    <div className={`log-line${lines ? ' log-line--act' : ''}`}>
      <span className="log-line__at">{timeOf(entry.at)}</span>
      <div className="log-line__body">
        <span className="log-line__head">
          {entry.hidden ? <span title={t('journal.secret')} aria-label={t('journal.secretLabel')}>🔒 </span> : null}{head}
        </span>
        {outcome ? <span className="log-line__outcome">{outcome}</span> : null}
        {details.length ? (
          <details className="log-line__more">
            <summary>{t('common:more')}</summary>
            {details.map((line, i) => <div key={i} className="log-line__detail">{line}</div>)}
          </details>
        ) : null}
      </div>
    </div>
  );
}
