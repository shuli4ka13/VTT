import { useState, type KeyboardEvent } from 'react';
import { useT } from '../i18n/index.ts';

export interface ComboOption { value: string; label: string; group?: string; hidden?: boolean; checked?: boolean }
export interface ComboMore { label: string; run: () => void }

const MORE = '\u0000more';

const SAID_UP_TO = 40;

const fits = (option: ComboOption, query: string) => (query ? option.value !== '' && option.label.toLowerCase().includes(query) : !option.hidden);

function useMenu(options: readonly ComboOption[], pick: (option: ComboOption) => void, more?: ComboMore, stay = false) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [lit, setLit] = useState(0);
  const query = text.trim().toLowerCase();
  const shown = [
    ...options.filter(option => fits(option, query)),
    ...(more && !query ? [{ value: MORE, label: more.label }] : []),
  ];
  const choose = (option: ComboOption) => {
    if (option.value === MORE) { more?.run(); return; }
    pick(option);
    if (stay) return;
    setText('');
    setLit(0);
    setOpen(false);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setLit(at => Math.min(at + 1, shown.length - 1)); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setLit(at => Math.max(at - 1, 0)); return; }
    if (e.key === 'Enter') { e.preventDefault(); const option = shown[lit]; if (open && option) choose(option); return; }
    if (e.key === 'Escape') { setOpen(false); setText(''); }
  };
  const menu = open && shown.length ? (
    <div className="slot__menu" role="listbox">
      {shown.map((option, at) => {
        const head = option.group && option.group !== shown[at - 1]?.group ? <div className="combo__group">{option.group}</div> : null;
        return (
          <div key={`${option.group ?? ''}\u0000${option.value}`}>
            {head}
            <button
              type="button" role="option" aria-selected={at === lit} data-value={option.value}
              className={`slot__option${at === lit ? ' slot__option--lit' : ''}`}
              onMouseEnter={() => setLit(at)}
              onMouseDown={e => { e.preventDefault(); choose(option); }}
            >
              {option.checked !== undefined ? <span className={`combo__check${option.checked ? ' is-on' : ''}`} aria-hidden>{option.checked ? '✓' : ''}</span> : null}
              {option.label}
            </button>
          </div>
        );
      })}
    </div>
  ) : null;
  const input = {
    value: text,
    onFocus: () => { setOpen(true); setLit(0); },
    onBlur: (e?: { currentTarget: HTMLInputElement }) => {
      setOpen(false);
      setText('');
      const el = e?.currentTarget;
      if (el) requestAnimationFrame(() => { el.scrollLeft = 0; });
    },
    onChange: (next: string) => { setText(next); setOpen(true); setLit(0); },
    onKeyDown,
  };
  const said = options.length > SAID_UP_TO ? undefined : [...options.map(option => option.label), ...(more ? [more.label] : [])].join(' | ');
  return { open, menu, input, said };
}

export function Combo({ value, options, onChange, blank, label, more, className, title, onFocus, look, disabled }: {
  value: string;
  look?: 'select';
  disabled?: boolean;
  className?: string;
  title?: string;
  onFocus?: () => void;
  more?: ComboMore | undefined;
  options: readonly ComboOption[];
  onChange: (value: string) => void;
  blank?: string;
  label?: string;
}) {
  const t = useT('ui');
  const unset = blank ?? t('combo.unset');
  const current = options.find(option => option.value === value);
  const shownLabel = current ? current.label : value ? t('combo.missing', { value }) : '';
  const { open, menu, input, said } = useMenu(options, option => { if (option.value !== value) onChange(option.value); }, more);
  return (
    <div className={look ? `select combo combo--select${disabled ? ' is-disabled' : ''}${className ? ` ${className}` : ''}` : 'slot combo'} title={look ? title : undefined}>
      <input
        className={look ? 'combo__bare' : `input combo__input${className ? ` ${className}` : ''}`}
        title={look ? undefined : title}
        disabled={disabled}
        role="combobox"
        data-options={said}
        aria-expanded={open}
        aria-label={label}
        data-value={value}
        data-blank={options.some(option => option.value === '') ? '' : undefined}
        value={open ? input.value : shownLabel}
        placeholder={open ? shownLabel || unset : unset}
        onFocus={() => { onFocus?.(); input.onFocus(); }}
        onBlur={e => input.onBlur(e)}
        onChange={e => input.onChange(e.target.value)}
        onKeyDown={input.onKeyDown}
      />
      {menu}
    </div>
  );
}

export function MultiCombo({ value, options, onChange, prompt, more }: {
  value: readonly string[];
  more?: ComboMore | undefined;
  options: readonly ComboOption[];
  onChange: (next: string[]) => void;
  prompt?: string;
}) {
  const t = useT('ui');
  const labelOf = (key: string) => options.find(option => option.value === key)?.label ?? key;
  const known = new Set(options.map(option => option.value));
  const marked: ComboOption[] = [
    ...value.filter(key => !known.has(key)).map(key => ({ value: key, label: t('combo.missing', { value: key }), checked: true })),
    ...options.map(option => ({ ...option, checked: value.includes(option.value) })),
  ];
  const { open, menu, input, said } = useMenu(marked, option => (
    onChange(value.includes(option.value) ? value.filter(other => other !== option.value) : [...value, option.value])
  ), more, true);
  const summary = value.map(labelOf).join(', ');
  const empty = prompt ?? t('combo.add');
  return (
    <div className="select combo combo--select combo--multi" title={summary || undefined}>
      <input
        className="combo__bare"
        role="combobox"
        data-options={said}
        data-value={value.join('\u0000')}
        aria-expanded={open}
        aria-label={prompt}
        value={open ? input.value : summary}
        placeholder={open ? t('combo.find') : empty}
        onFocus={input.onFocus}
        onBlur={e => input.onBlur(e)}
        onChange={e => input.onChange(e.target.value)}
        onKeyDown={input.onKeyDown}
      />
      {value.length > 1 && !open ? <span className="combo__count">{value.length}</span> : null}
      {menu}
    </div>
  );
}

export function AddCombo({ options, onPick, prompt, label }: {
  options: readonly ComboOption[];
  onPick: (value: string) => void;
  prompt: string;
  label?: string;
}) {
  const { open, menu, input, said } = useMenu(options, option => onPick(option.value));
  return (
    <div className="slot combo combo--add">
      <input
        className="input combo__input"
        role="combobox"
        data-options={said}
        aria-expanded={open}
        aria-label={label ?? prompt}
        data-value=""
        value={input.value}
        placeholder={prompt}
        onFocus={input.onFocus}
        onBlur={e => input.onBlur(e)}
        onChange={e => input.onChange(e.target.value)}
        onKeyDown={input.onKeyDown}
      />
      {menu}
    </div>
  );
}
