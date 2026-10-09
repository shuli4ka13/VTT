import { useState } from 'react';
import { useWorld } from '../../../store/world.ts';
import { callMap, bookEntriesOf } from './call-map.ts';
import type { System, Effect } from '@vtt/schema';

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

const nameOf = (system: System, id: string): string => `«${system.effects?.[id]?.label || id}»`;

export function CallMapRow({ id, effect, system }: { id: string; effect: Effect; system: System }) {
  const pick = useWorld(s => s.pick);
  const map = callMap(system, id);
  const open = (target: string) => () => pick({ activeTab: 'effects', activeEffectId: target, activeStepIndex: null });
  const effectItem = (target: string): UsageItem => ({ key: target, text: nameOf(system, target), onClick: open(target) });
  const used: UsageItem[] = [
    ...map.usedBy.map(one => effectItem(one.id)),
    ...bookEntriesOf(system, id).map(name => ({ key: `book:${name}`, text: `книга: ${name}` })),
  ];
  const calls = map.calls.map(effectItem);
  const heard = map.heardBy.map(effectItem);
  if (!calls.length && !used.length && !heard.length) return null;
  return (
    <div className="call-map" data-effect={effect.label ?? id}>
      <UsageRow title="Вызывает:" items={calls} />
      <UsageRow title={`Используется в ${used.length}:`} items={used} />
      <UsageRow title="Слушают:" items={heard} />
    </div>
  );
}
