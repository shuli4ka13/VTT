import { useState } from 'react';

const SHOWN = 3;

export interface UsageItem { key: string; text: string; onClick?: () => void }

export function UsageRow({ title, items }: { title: string; items: UsageItem[] }) {
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
      {rest > 0 ? <button type="button" className="chip chip--action" onClick={() => setAll(true)}>и ещё {rest}</button> : null}
      {all && items.length > SHOWN ? <button type="button" className="chip chip--action" onClick={() => setAll(false)}>свернуть</button> : null}
    </div>
  );
}

