import { useEffect, useRef } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { SUN_KINDS, SUN_STAGES } from '@vtt/engine';
import type { Sun, SunKind, System } from '@vtt/engine';
import { useT } from '../../../../../i18n/author.ts';
import type { Placed } from '../layout.ts';
import { KIND_MARK, kindStyle, nameOf } from './parts.tsx';
import { RayBody } from './ray-body.tsx';
import { GroupBody } from './group-body.tsx';
import './windows.css';

export interface BubbleWindowProps {
  system: System;
  effectId: string;
  sun: Sun;
  placed: Placed;
  onClose: () => void;
  onOpenEffect: (id: string) => void;
  onOpenForm: (step: number | null) => void;
}

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

function Frame({ kind, mark, title, sub, onClose, footer, children }: {
  kind: SunKind;
  mark: string;
  title: string;
  sub: string;
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const t = useT('sunWindow');
  const box = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    box.current?.focus();
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') { event.preventDefault(); close.current(); return; }
      if (event.key !== 'Tab' || !box.current) return;
      const items = [...box.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (!items.length) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const at = document.activeElement;
      if (event.shiftKey && (at === first || at === box.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && at === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (before && document.contains(before)) before.focus();
    };
  }, []);
  return createPortal(
    <div className="sunw">
      <div className="sunw__veil" onClick={onClose} />
      <div ref={box} className="sunw__box" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
        <header className="sunw__head">
          <span className="sunw__badge" style={kindStyle(kind)} aria-hidden="true">{mark}</span>
          <div className="sunw__titles">
            <h2 className="sunw__title">{title}</h2>
            <span className="faint">{sub}</span>
          </div>
          <button type="button" className="sunw__x" aria-label={t('closeX')} onClick={onClose}>×</button>
        </header>
        <div className="sunw__body">{children}</div>
        <footer className="sunw__foot">
          {footer}
          <button type="button" className="btn" onClick={onClose}>{t('close')}</button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

export function BubbleWindow(props: BubbleWindowProps): ReactElement | null {
  const { placed } = props;
  if (placed.what === 'ray' && placed.ray) return <RayWindow {...props} />;
  if (placed.what === 'group' && placed.group) return <GroupWindow {...props} />;
  return null;
}

function RayWindow({ system, effectId, sun, placed, onClose, onOpenEffect, onOpenForm }: BubbleWindowProps) {
  const t = useT('sunWindow');
  const ray = placed.ray!;
  return (
    <Frame
      kind={ray.kind}
      mark={String(ray.number)}
      title={t('step.title', { n: ray.number, label: ray.label })}
      sub={`${SUN_STAGES[ray.stage]} · ${SUN_KINDS[ray.kind]}`}
      onClose={onClose}
      footer={<button type="button" className="btn btn--primary" onClick={() => onOpenForm(ray.span?.part === 'steps' ? ray.span.from : null)}>{t('openForm')}</button>}
    >
      <RayBody system={system} effectId={effectId} sun={sun} ray={ray} onOpenEffect={onOpenEffect} />
    </Frame>
  );
}

function GroupWindow({ system, effectId, sun, placed, onClose, onOpenEffect }: BubbleWindowProps) {
  const t = useT('sunWindow');
  const group = placed.group!;
  const names = group.items.map(item => item.label).filter((name, at, all) => all.indexOf(name) === at).join(', ');
  const calledIds = [...new Set(group.items.filter(item => item.role === 'calls').map(item => item.ref?.effect).filter((id): id is string => Boolean(id)))];
  const title = group.role === 'calls'
    ? (calledIds.length === 1 ? t('call.title', { name: nameOf(system, calledIds[0]!) }) : t('call.titleMany', { names }))
    : group.role === 'sets' && group.kind === 'tag' ? t('tag.title', { names })
    : group.role === 'seam' ? t('seam.title', { names })
    : group.role === 'stand' ? t('stand.title')
    : group.role === 'meddle' ? t('meddle.title')
    : group.role === 'gives' ? t('gives.title', { names })
    : group.role === 'sets' ? t('sets.title', { names })
    : t('reads.title', { names });
  return (
    <Frame kind={group.kind} mark={KIND_MARK[group.kind]} title={title} sub={SUN_KINDS[group.kind]} onClose={onClose}>
      <GroupBody system={system} effectId={effectId} sun={sun} group={group} {...(placed.ray ? { ray: placed.ray } : {})} onOpenEffect={onOpenEffect} />
    </Frame>
  );
}
