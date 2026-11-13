import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { Chip } from './primitives.tsx';

export interface ComboOption { value: string; label: string; group?: string; hidden?: boolean }
export interface ComboMore { label: string; run: () => void }

const MORE = '\u0000more';

const fits = (option: ComboOption, query: string) => (query ? option.value !== '' && option.label.toLowerCase().includes(query) : !option.hidden);

function useMenu(options: readonly ComboOption[], pick: (option: ComboOption) => void, more?: ComboMore) {
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
    onBlur: () => { setOpen(false); setText(''); },
    onChange: (next: string) => { setText(next); setOpen(true); setLit(0); },
    onKeyDown,
  };
  return { open, menu, input };
}

export function Combo({ value, options, onChange, blank = '— не выбрано —', label, more }: {
  value: string;
  more?: ComboMore | undefined;
  options: readonly ComboOption[];
  onChange: (value: string) => void;
  blank?: string;
  label?: string;
}) {
  const current = options.find(option => option.value === value);
  const shownLabel = current ? current.label : value ? `${value} — такого в списке нет` : '';
  const { open, menu, input } = useMenu(options, option => { if (option.value !== value) onChange(option.value); }, more);
  return (
    <div className="slot combo">
      <input
        className="input combo__input"
        role="combobox"
        aria-expanded={open}
        aria-label={label}
        value={open ? input.value : shownLabel}
        placeholder={open ? shownLabel || blank : blank}
        onFocus={input.onFocus}
        onBlur={input.onBlur}
        onChange={e => input.onChange(e.target.value)}
        onKeyDown={input.onKeyDown}
      />
      {menu}
    </div>
  );
}

export function MultiCombo({ value, options, onChange, prompt }: {
  value: readonly string[];
  options: readonly ComboOption[];
  onChange: (next: string[]) => void;
  prompt?: string;
}) {
  const labelOf = (key: string) => options.find(option => option.value === key)?.label ?? key;
  const free = options.filter(option => !value.includes(option.value));
  const { open, menu, input } = useMenu(free, option => onChange([...value, option.value]));
  const chips: ReactNode = value.map(key => (
    <Chip key={key} onRemove={() => onChange(value.filter(other => other !== key))}>{labelOf(key)}</Chip>
  ));
  return (
    <div className="slot combo">
      <div className="tagbox">
        {chips}
        {free.length ? (
          <input
            className="combo__text"
            role="combobox"
            aria-expanded={open}
            value={input.value}
            placeholder={prompt ?? (value.length ? '+ ещё…' : '+ добавить…')}
            onFocus={input.onFocus}
            onBlur={input.onBlur}
            onChange={e => input.onChange(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Backspace' && !input.value && value.length) { onChange(value.slice(0, -1)); return; }
              input.onKeyDown(e);
            }}
          />
        ) : null}
      </div>
      {menu}
    </div>
  );
}
