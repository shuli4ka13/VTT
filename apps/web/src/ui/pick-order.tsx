import { useDragList } from './drag-list.ts';

export function moveKey(list: readonly string[], key: string, target: string, after: boolean): string[] {
  const next = list.filter(one => one !== key);
  const at = next.indexOf(target);
  if (at < 0) return [...list];
  next.splice(at + (after ? 1 : 0), 0, key);
  return next;
}

export function PickOrder({ keys, chosen, labelOf, onChange }: {
  keys: readonly string[];
  chosen: readonly string[];
  labelOf: (key: string) => string;
  onChange: (next: string[]) => void;
}) {
  const shown = chosen.filter(key => keys.includes(key));
  const rest = keys.filter(key => !shown.includes(key));
  const drag = useDragList((key, to, after) => onChange(moveKey(shown, key, to, after)), 'x');
  return (
    <div className="stack stack--tight">
      <div className="stack stack--tight block-pick">
        <span className="block-pick__title">показываются{shown.length > 1 ? <span className="faint"> · перетащите, чтобы поменять порядок</span> : null}</span>
        <div className="inline inline--tight">
          {shown.length === 0 ? <span className="faint">ничего</span> : null}
          {shown.map(key => (
            <span key={key} className={`inline inline--tight drag-item${drag.mark(key)}`} {...drag.props(key)}>
              <span className="drag-grip" aria-hidden>⋮⋮</span>
              <label className="inline inline--tight">
                <input type="checkbox" checked onChange={() => onChange(shown.filter(one => one !== key))} />
                {labelOf(key)}
              </label>
            </span>
          ))}
        </div>
      </div>
      {rest.length ? (
        <div className="stack stack--tight block-pick">
          <span className="block-pick__title">не показываются</span>
          <div className="inline inline--tight">
            {rest.map(key => (
              <label key={key} className="inline inline--tight">
                <input type="checkbox" checked={false} onChange={() => onChange([...shown, key])} />
                {labelOf(key)}
              </label>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
