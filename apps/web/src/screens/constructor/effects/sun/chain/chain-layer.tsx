import { useEffect, useRef } from 'react';
import type { ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { useEffectView } from '../../../../../store/effect-view.ts';
import { useWorld } from '../../../../../store/world.ts';
import { useT } from '../../../../../i18n/author.ts';
import { RecordChainView } from './record-chain.tsx';
import '../windows/windows.css';

export function RecordChainLayer({ linked = true }: { linked?: boolean } = {}): ReactElement | null {
  const t = useT('sunChain');
  const chain = useEffectView(s => s.chain);
  const system = useWorld(s => s.system);
  const compendium = useWorld(s => s.compendium);
  const box = useRef<HTMLDivElement>(null);
  const open = chain !== null;
  useEffect(() => {
    if (!open) return undefined;
    const before = document.activeElement as HTMLElement | null;
    box.current?.focus();
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') { event.preventDefault(); useEffectView.getState().closeChain(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (before && document.contains(before)) before.focus();
    };
  }, [open]);
  if (chain === null) return null;
  const close = (): void => useEffectView.getState().closeChain();
  const openEffect = (id: string): void => {
    close();
    useEffectView.getState().setView('sun');
    useWorld.getState().pick({ activeTab: 'effects', activeEffectId: id });
  };
  return createPortal(
    <div className="sunw">
      <div className="sunw__veil" onClick={close} />
      <div ref={box} className="sunw__box chain__box" role="dialog" aria-modal="true" aria-label={t('dialog')} tabIndex={-1}>
        <div className="sunw__body">
          <RecordChainView system={system} compendium={compendium} recordId={chain} onOpenEffect={linked ? openEffect : undefined} onClose={close} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
