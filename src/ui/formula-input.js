// Один редактор формул на всю программу.
//
// Им правятся и формулы полей системы, и значения модификаторов в компендиуме,
// и условия. Разницы быть не должно: везде один язык, одна подсказка по лейблам,
// один способ увидеть ошибку.
//
// Ровно это отличает конструктор от Foundry. Там, чтобы повесить бонус, набирают
// машинный путь `system.abilities.wis.bonuses.check` и держат его в голове.
// Здесь набирают «Мудрость» и выбирают из списка, а в строку ложится тег —
// один раз, в момент выбора.
//
// Слот — место, куда формула сохраняется: поле системы, значение модификатора,
// условие. Редактируется всегда ровно один слот — тот, где стоит каретка.
// Остальные показывают сохранённое.

import { state, field, esc } from './state.js';
import { toParts, insertRefAt, removePart } from './formula-text.js';
import { suggest, applySuggestion } from './suggest.js';
import { compile, FormulaError } from '../formula/index.js';

// Как слот читается и куда пишется. Заполняется при отрисовке, читается обработчиками.
const slots = new Map();

export function renderFormulaInput(key, slot) {
  slots.set(key, slot);

  const { placeholder = 'наберите «Сила» или «floor»', exclude = null } = slot;
  const active = state.formula.key === key;
  const draft = active ? state.formula.draft : String(slot.read() ?? '');
  const hints = active ? suggestions(exclude) : { matches: [] };
  const broken = Boolean(draft.trim()) && !parses(draft);

  return `<div class="fi">
    <input class="expr-inp${broken ? ' invalid' : ''}" id="fi-${key}" type="text" spellcheck="false"
           placeholder="${esc(placeholder)}" value="${esc(draft)}"
           onfocus="uiFormulaFocus('${key}')"
           oninput="uiFormulaEdit('${key}', this.value, this.selectionStart)">

    ${active && hints.matches.length ? `<div class="hints">${hints.matches.map((item, i) => `
      <button class="hint${i === state.formula.index ? ' on' : ''}" onmousedown="event.preventDefault()"
              onclick="uiFormulaAccept('${key}', ${i})">
        <span class="hint-name">${esc(item.label || item.name)}</span>
        <span class="hint-kind">${item.kind === 'function' ? 'функция' : 'поле'}</span>
      </button>`).join('')}</div>` : ''}

    ${strip(key, draft)}
    <div class="f-result">${verdict(draft, hints.matches.length)}</div>
    ${active ? depsRow(key, draft, exclude) : ''}
  </div>`;
}

// Та же формула лейблами. Ссылки — чипсами, клик убирает.
function strip(key, draft) {
  const parts = toParts(draft, state.system);
  if (!parts.length) return '';
  return `<div class="expr-strip" title="так формулу увидит игрок">${parts.map((part, i) => part.kind === 'ref'
    ? `<button class="dep-tog on" title="убрать" onclick="uiFormulaDrop('${key}', ${i})">${esc(part.label)}</button>`
    : `<span class="expr-txt">${esc(part.text)}</span>`).join('')}</div>`;
}

function depsRow(key, draft, exclude) {
  const used = new Set(safeDeps(draft));
  return `<div class="sys-sub" style="margin:8px 0 3px">Собрать из полей</div>
    <div style="display:flex;flex-wrap:wrap;gap:3px">
      ${state.system.fields.filter(f => f.tag !== exclude).map(f =>
        `<span class="dep-tog${used.has(f.tag) ? ' on' : ''}"
               onclick="uiFormulaDep('${key}', '${f.tag}')">${esc(f.label)}</span>`).join(' ')}
    </div>`;
}

function verdict(draft, hintCount) {
  if (!draft.trim()) return '<span style="color:var(--muted)">пусто</span>';
  if (hintCount) return '<span style="color:var(--muted)">выберите из списка выше</span>';
  try {
    const { deps } = compile(draft);
    const unknown = deps.filter(tag => !field(tag));
    if (unknown.length) return `<span style="color:var(--red)">нет полей: ${unknown.map(esc).join(', ')}</span>`;
    return `<span style="color:var(--green)">разбирается${deps.length ? ` · зависит от ${deps.length}` : ''}</span>`;
  } catch (err) {
    return `<span style="color:var(--red)">${esc(err.message)}</span>`;
  }
}

// ── правки ──────────────────────────────────────────────────────────────────

export function focusSlot(key) {
  if (state.formula.key === key) return false;
  const slot = slots.get(key);
  state.formula = { key, draft: String(slot ? slot.read() ?? '' : ''), at: 0, index: 0, dismissed: true };
  return true;
}

export function edit(key, text, caret) {
  state.formula = {
    key,
    draft: String(text),
    at: caret == null ? String(text).length : caret,
    index: 0,
    dismissed: false,
  };
  commit(key);
}

export function move(key, delta) {
  if (state.formula.key !== key) return false;
  const { matches } = suggestions(excludeOf(key));
  if (!matches.length) return false;
  state.formula.index = (state.formula.index + delta + matches.length) % matches.length;
  return true;
}

export function accept(key, index) {
  if (state.formula.key !== key) return false;
  const range = suggestions(excludeOf(key));
  const item = range.matches[index == null ? state.formula.index : index];
  if (!item) return false;

  const { expr, caret } = applySuggestion(state.formula.draft ?? '', range, item);
  Object.assign(state.formula, { draft: expr, at: caret, index: 0, dismissed: false });
  state.caret = { key, at: caret };
  commit(key);
  return true;
}

export function dismiss(key) {
  if (state.formula.key !== key) return false;
  state.formula.dismissed = true;
  state.formula.index = 0;
  return true;
}

export function insertDep(key, tag) {
  if (state.formula.key !== key) focusSlot(key);
  const { expr, caret } = insertRefAt(state.formula.draft ?? '', tag, state.formula.at);
  Object.assign(state.formula, { draft: expr, at: caret, dismissed: true });
  state.caret = { key, at: caret };
  commit(key);
}

export function dropPart(key, index) {
  if (state.formula.key !== key) focusSlot(key);
  state.formula.draft = removePart(state.formula.draft ?? '', state.system, index);
  state.formula.dismissed = true;
  commit(key);
}

// В данные уходит только то, что разбирается и ссылается на существующие поля.
// Пока формула недописана, слот держит последнее рабочее и горит красным.
function commit(key) {
  const slot = slots.get(key);
  if (!slot) return;
  const draft = (state.formula.draft ?? '').trim();

  if (!draft) return slot.write('');

  let deps;
  try {
    deps = compile(draft).deps;
  } catch (err) {
    if (err instanceof FormulaError) return;
    throw err;
  }
  if (deps.some(tag => !field(tag))) return;
  slot.write(draft);
}

function suggestions(exclude) {
  if (state.formula.dismissed) return { query: '', from: 0, to: 0, matches: [] };
  return suggest(state.formula.draft ?? '', state.formula.at, state.system, exclude);
}

const excludeOf = key => (slots.get(key) || {}).exclude ?? null;

function safeDeps(expr) {
  try { return compile(expr).deps; } catch { return []; }
}

function parses(expr) {
  try { compile(expr); return true; } catch { return false; }
}
