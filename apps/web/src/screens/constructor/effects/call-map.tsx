import { useState } from 'react';
import { useT } from '../../../i18n/author.ts';

const SHOWN = 3;

export interface UsageItem { key: string; text: string; onClick?: () => void }

export function UsageRow({ title, items }: { title: string; items: UsageItem[] }) {
  const t = useT('effects');
  const [all, setAll] = useState(false);
  if (!items.length) return null;
  const shown = all ? items : items.slice(0, SHOWN);
  const rest = items.length - shown.length;
  return (
    <div className="inline inline--tight call-map__row">
      <span className="muted">{title}</span>
      {shown.map(item => (item.onClick
        ? <button key={item.key} type="button" className="chip chip--action" onClick={item.onClick}>{item.text}</button>
        : <span key={item.key} className="chip">{item.text}</span>))}
      {rest > 0 ? <button type="button" className="chip chip--action" onClick={() => setAll(true)}>{t('callMap.more', { n: rest })}</button> : null}
      {all && items.length > SHOWN ? <button type="button" className="chip chip--action" onClick={() => setAll(false)}>{t('common:collapse')}</button> : null}
    </div>
  );
}

