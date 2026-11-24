import type { ReactNode } from 'react';
import type { SunBubble, SunKind } from '@vtt/engine';
import type { System } from '@vtt/schema';

export const nameOf = (system: System, id: string): string => system.effects?.[id]?.label || id;

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="sunw__section">
      <h3 className="sunw__section-title">{title}</h3>
      {children}
    </section>
  );
}

export function Row({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="sunw__row">
      <span className="sunw__row-name">{name}</span>
      <div className="sunw__row-value">{children}</div>
    </div>
  );
}

export function Pill({ kind, children }: { kind: SunKind; children: ReactNode }) {
  return <span className="sunw__pill" style={kindStyle(kind)}>{children}</span>;
}

export function Link({ onClick, children, label }: { onClick: () => void; children: ReactNode; label?: string }) {
  return <button type="button" className="sunw__link" {...(label ? { 'aria-label': label } : {})} onClick={onClick}>{children}</button>;
}

export const kindStyle = (kind: SunKind): Record<string, string> => ({
  '--sunw-fill': `var(--sun-${kind}-bg, var(--surface-3))`,
  '--sunw-line': `var(--sun-${kind}-line, var(--border-strong))`,
  '--sunw-ink': `var(--sun-${kind}-text, var(--text))`,
});

export const KIND_MARK: Record<SunKind, string> = {
  step: '●', heard: '◇', input: '→', field: '▭', result: '○', value: '#', call: '◆', cost: '◆', state: '◍', tag: '◈', seam: '◌', ask: '?', stop: '■', aside: '◌',
};

export const uniq = (items: readonly SunBubble[]): SunBubble[] => {
  const seen = new Set<string>();
  return items.filter(item => {
    const key = `${item.kind}|${item.role}|${item.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const namesLine = (names: readonly string[], more: string, shown = 3): string =>
  names.length > shown ? `${names.slice(0, shown).join(', ')} ${more}` : names.join(', ');
