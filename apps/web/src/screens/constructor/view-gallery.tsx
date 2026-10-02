import type { ReactNode } from 'react';
import type { Control } from '@vtt/schema';
import { VIEWS, viewsFor } from '../../sheet/views/index.tsx';
import type { ValueFamily } from '../../sheet/views/index.tsx';

export function ViewGallery({ value, family, computed, label = 'Вид', plain, onChange }: {
  value: Control | undefined;
  family: ValueFamily | null;
  computed: boolean;
  label?: string;
  plain: { label: string; hint: string };
  onChange: (next: Control | undefined) => void;
}) {
  const keys = viewsFor(family, computed);
  const known = value === undefined || keys.includes(value);
  const shown = known ? keys : [...keys, value!];
  return (
    <div className="view-gallery" role="radiogroup" aria-label={label}>
      <Tile on={value === undefined} title={plain.label} hint={plain.hint} onPick={() => onChange(undefined)}>
        <span className="view-gallery__plain">{computed ? '16' : '12'}</span>
      </Tile>
      {shown.map(key => {
        const spec = VIEWS[key];
        return (
          <Tile key={key} on={value === key} title={spec.label} hint={known || key !== value ? spec.hint : 'не подходит к типу значения'}
            off={!known && key === value} onPick={() => onChange(key)}>
            <spec.draw {...spec.sample} label={spec.label} />
          </Tile>
        );
      })}
    </div>
  );
}

function Tile({ on, off, title, hint, onPick, children }: {
  on: boolean; off?: boolean; title: string; hint: string; onPick: () => void; children: ReactNode;
}) {
  return (
    <div
      role="radio"
      tabIndex={0}
      aria-checked={on}
      aria-label={title}
      title={hint}
      className={`view-gallery__tile${on ? ' view-gallery__tile--on' : ''}${off ? ' view-gallery__tile--off' : ''}`}
      onClick={onPick}
      onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onPick(); } }}
    >
      <span className="view-gallery__preview" aria-hidden="true">{children}</span>
      <span className="view-gallery__name">{title}</span>
    </div>
  );
}
