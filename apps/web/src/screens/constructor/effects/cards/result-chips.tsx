import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { System } from '@vtt/schema';
import { listOf } from '@vtt/engine';
import { formulaWords } from '../../../../ui/formula-words.ts';
import { t as tg, useT } from '../../../../i18n/author.ts';

export interface ResultOutput { key: string; label?: string; kind?: string; from?: string; many?: boolean; no?: string }

const marks = (): Record<string, string> => ({ boolean: '◐', choice: '☰', number: '#', text: tg('rollCards:result.mark.text') });

const kinds = (): Record<string, string> => ({
  boolean: tg('rollCards:result.kind.boolean'), choice: tg('rollCards:result.kind.choice'), number: tg('rollCards:result.kind.number'), text: tg('rollCards:result.kind.text'),
});

function Fork() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
      <path d="M8 2.5v4.5M8 7 4.5 12.5M8 7l3.5 5.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function cellText(system: System, value: unknown): string {
  if (value === undefined || value === null || value === '') return '—';
  if (typeof value === 'object' && 'expr' in (value as object)) return formulaWords(system, String((value as { expr: unknown }).expr));
  if (value === true) return tg('common:yes');
  if (value === false) return tg('common:no');
  return String(value);
}

function Card({ system, one, branch, active, forked, branches, onClose }: { system: System; one: ResultOutput; branch?: (() => void) | undefined; active: string | undefined; forked?: string | undefined; branches: Record<string, () => void>; onClose: () => void }) {
  const t = useT('rollCards');
  const kind = one.kind ?? 'number';
  const label = one.label ?? one.key;
  const no = one.no ?? t('result.not', { label });
  const table = kind === 'choice' && one.from ? system.tables?.[one.from] : undefined;
  const columns = (table?.columns ?? []).filter(column => column.key !== 'text');
  const rows = kind === 'choice' && one.from ? listOf(system, one.from) ?? [] : [];
  const raw = new Map((table?.rows ?? []).map(row => [String(row.value), (row.cells ?? {}) as Record<string, unknown>]));
  return (
    <div className="result-table" role="dialog" aria-label={t('result.dialog', { label })}>
      <div className="result-table__head">
        <span className="result-table__title">{label}</span>
        <span className="result-table__kind">{kinds()[kind] ?? kind}</span>
        <button type="button" className="result-table__close" aria-label={t('common:close')} onClick={onClose}>×</button>
      </div>
      {kind === 'boolean' ? (
        <table>
          <tbody>
            <tr><td className="result-table__variant">{t('common:yes')}</td><td>{label}</td></tr>
            <tr><td className="result-table__variant">{t('common:no')}</td><td>{no}</td></tr>
          </tbody>
        </table>
      ) : null}
      {rows.length ? (
        <table>
          <thead>
            <tr>
              <th>{table?.label ?? t('result.variant')}</th>
              {columns.map(column => <th key={column.key}>{column.label ?? column.key}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={String(row.value)}>
                <td className="result-table__variant">{row.label}</td>
                {columns.map(column => <td key={column.key}>{cellText(system, raw.get(String(row.value))?.[column.key])}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {columns.filter(column => column.kind === 'boolean').map(column => {
        const path = `${one.key}.${column.key}`;
        const side = (wanted: boolean) => rows.filter(row => Boolean(raw.get(String(row.value))?.[column.key]) === wanted).map(row => row.label).join(' · ');
        if (active === path) return <p key={path} className="result-table__note">{t('result.forkBy', { name: column.label ?? column.key })}</p>;
        const run = branches[path];
        return run ? (
          <button key={path} type="button" className="result-table__fork" onClick={() => { run(); onClose(); }}>
            <Fork /> {t('result.forkColumn', { name: column.label ?? column.key, yes: side(true), no: side(false) })}
          </button>
        ) : null;
      })}
      {active === one.key ? <p className="result-table__note">{t('result.forkThis')}</p> : branch ? (
        <button type="button" className="result-table__fork" onClick={() => { branch(); onClose(); }}>
          <Fork /> {t('result.fork', { variants: kind === 'boolean' ? `${label} / ${no}` : rows.map(row => row.label).join(' · ') })}
        </button>
      ) : forked && !active?.startsWith(`${one.key}.`) ? <p className="result-table__muted">{t('result.forked', { name: forked })}</p> : null}
    </div>
  );
}

function ResultChip({ one, system, branch, active, forked, branches }: { one: ResultOutput; system: System; branch?: (() => void) | undefined; active: string | undefined; forked?: string | undefined; branches: Record<string, () => void> }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  const kind = one.kind ?? 'number';
  const label = one.label ?? one.key;
  const variants = kind === 'choice' && one.from && !one.many ? listOf(system, one.from) ?? [] : [];
  const opens = kind === 'boolean' || variants.length > 0;
  useEffect(() => {
    if (!open) return undefined;
    const away = (event: MouseEvent) => { if (box.current && !box.current.contains(event.target as Node)) setOpen(false); };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', key); };
  }, [open]);
  return (
    <span ref={box} className={`result-chip result-chip--${kind}${active === one.key || active?.startsWith(`${one.key}.`) ? ' is-active' : ''}${open ? ' is-open' : ''}`}>
      <button
        type="button" className="result-chip__face" title={kinds()[kind] ?? kind}
        {...(opens ? { 'aria-expanded': open, onClick: () => setOpen(!open) } : { tabIndex: -1 })}
      >
        <span className="result-chip__mark" aria-hidden="true">{marks()[kind] ?? '·'}</span>
        <span className="result-chip__label">{label}</span>
        {variants.length ? <span className="result-chip__count">{variants.length}</span> : null}
      </button>
      {open ? <Card system={system} one={one} branch={branch} active={active} forked={forked} branches={branches} onClose={() => setOpen(false)} /> : null}
    </span>
  );
}
function forkedLabel(system: System, outputs: readonly ResultOutput[], active: string): string {
  const [head, flag] = active.split('.');
  const one = outputs.find(other => other.key === head);
  const label = one?.label ?? head ?? active;
  if (!flag || !one?.from) return label;
  const column = (system.tables?.[one.from]?.columns ?? []).find(other => other.key === flag);
  return `${label} → ${column?.label ?? flag}`;
}

export function ResultChips({ name, outputs, system, branches = {}, active, onName, nameSlot }: {
  name: string;
  outputs: readonly ResultOutput[];
  system: System;
  branches?: Record<string, () => void>;
  active?: string | undefined;
  onName?: (() => void) | undefined;
  nameSlot?: ReactNode;
}) {
  const t = useT('rollCards');
  return (
    <div className="result-row">
      {nameSlot ?? (onName
        ? <button type="button" className="result-row__name" title={t('result.renameTitle')} onClick={onName}>
            {name || t('result.name')}
          </button>
        : <span className="result-row__name" title={t('result.lockedTitle')}>{name}</span>)}
      <span className="result-row__arrow" aria-hidden="true">→</span>
      <span className="result-row__chips">
        {outputs.map(one => <ResultChip key={one.key} one={one} system={system} branch={branches[one.key]} active={active} branches={branches} forked={active ? forkedLabel(system, outputs, active) : undefined} />)}
      </span>
    </div>
  );
}
