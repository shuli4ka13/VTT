import type { ReactNode } from 'react';
import { DangerButton } from '../../../ui/primitives.tsx';

export function WhileWhenRow({ when, named = false, label, title, removeTitle, onOpen, onRemove, children }: {
  when: boolean;
  named?: boolean;
  label?: string;
  title?: string;
  removeTitle?: string;
  onOpen?: () => void;
  onRemove: () => void;
  children: ReactNode;
}) {
  const inside = (
    <>
      {when || named ? <span className="mod-row__kind">{when ? 'когда' : 'пока'}</span> : null}
      <span className="mod-row__phrase">{children}</span>
    </>
  );
  return (
    <div className={`mod-row mod-row--${when ? 'when' : 'while'}`}>
      {onOpen
        ? <button type="button" className="mod-row__text" aria-label={label} title={title} onClick={onOpen}>{inside}</button>
        : <span className="mod-row__text mod-row__text--still" title={title}>{inside}</span>}
      <DangerButton size="sm" title={removeTitle} onConfirm={onRemove}>×</DangerButton>
    </div>
  );
}

export function WhileWhenEmpty({ title, children }: { title?: string; children: ReactNode }) {
  return <div className="faint" title={title}>{children}</div>;
}
