// Панель формул — то место черновика, ради которого всё и затевалось.
//
// В черновике (reference/index.html:1360-1372) чипс вставлял в формулу
// ОТОБРАЖАЕМОЕ ИМЯ поля, а evalF подставлял значения регулярной заменой по нему же.
// Отсюда две поломки: переименование рвало формулу, а совпадение подстрок
// («Сила» внутри «Сила воли») тихо портило результат.
//
// Здесь чипс вставляет ТЕГ, а на экране формула собрана из лейблов. Обратного
// преобразования лейбл → тег нет нигде.

import { state, sheet, field, pass, valueOf, show, esc } from './state.js';
import { toDisplay, toParts, insertRefAt, removePart } from './formula-text.js';
import { suggest, applySuggestion } from './suggest.js';
import { compile } from '../formula/index.js';
import { calc } from '../engine/calc.js';

export function renderFormulaList() {
  const list = document.getElementById('fList');
  const computed = state.system.fields.filter(f => f.value.kind !== 'stored');

  if (!computed.length) {
    list.innerHTML = '<div style="font-size:11px;color:var(--muted);padding:2px 0">Формул пока нет.</div>';
    return;
  }

  const p = pass();
  list.innerHTML = computed.map(f => {
    const result = valueOf(f.tag, p);
    return `<div class="f-entry${state.activeTag === f.tag ? ' on' : ''}" onclick="uiPickField('${f.tag}')">
      <div class="f-ename">${esc(f.label)}</div>
      <div class="f-expr">${esc(exprOf(f) ? toDisplay(exprOf(f), state.system) : '—')}
        ${result.ok ? `<span style="color:var(--muted)"> = ${esc(show(result.value))}</span>` : ''}</div>
    </div>`;
  }).join('');
}

export function renderFormulaBox() {
  const box = document.getElementById('fbox');
  const f = state.activeTag && field(state.activeTag);

  if (!f) { box.style.display = 'none'; return; }
  box.style.display = 'block';

  const draft = state.draft ?? exprOf(f) ?? '';
  const parts = toParts(draft, state.system);

  document.getElementById('fbox-lbl').textContent =
    (f.value.kind === 'stored' ? 'Хранимое поле: ' : 'Формула: ') + f.label;

  // Поле правки держит формулу как она хранится — тегами. Иначе пришлось бы
  // переводить лейбл обратно в тег, а это ровно тот баг черновика, ради которого
  // всё затевалось: переименование рвало формулу, а «Сила» внутри «Сила воли»
  // тихо портила результат.
  const input = document.getElementById('fbox-inp');
  if (input.value !== draft) input.value = draft;
  input.classList.toggle('invalid', Boolean(draft.trim()) && !parses(draft));

  // Набирают лейблами, в строку ложится тег. Подстановка — по выбору человека.
  const hints = currentSuggestions();
  document.getElementById('fbox-hints').innerHTML = hints.matches.map((item, i) => `
    <button class="hint${i === state.suggestIndex ? ' on' : ''}" onmousedown="event.preventDefault()"
            onclick="uiAcceptHint(${i})">
      <span class="hint-name">${esc(item.label || item.name)}</span>
      <span class="hint-kind">${item.kind === 'function' ? 'функция' : 'поле'}</span>
    </button>`).join('');

  // Полоса ниже — та же формула, но лейблами. Так её увидит игрок.
  // Ссылки — чипсами, клик убирает.
  document.getElementById('fbox-strip').innerHTML = parts.length
    ? parts.map((part, i) => part.kind === 'ref'
      ? `<button class="dep-tog on" title="убрать" onclick="uiDropPart(${i})">${esc(part.label)}</button>`
      : `<span class="expr-txt">${esc(part.text)}</span>`).join('')
    : '<span style="color:var(--muted);font-size:11px">пусто — наберите формулу или соберите из зависимостей ниже</span>';

  document.getElementById('fbox-res').innerHTML = preview(draft, hints.matches.length);

  const used = new Set(safeDeps(draft));
  document.getElementById('fbox-deps').innerHTML = state.system.fields
    .filter(other => other.tag !== f.tag)
    .map(other => `<span class="dep-tog${used.has(other.tag) ? ' on' : ''}"
      onclick="uiInsertDep('${other.tag}')">${esc(other.label)}</span>`).join(' ');

  document.getElementById('fbox-kind').textContent =
    f.value.kind === 'table' ? 'аргумент таблицы' : f.value.kind === 'stored' ? 'станет формулой' : '';
}

function preview(draft, hintCount) {
  if (!draft.trim()) return '<span style="color:var(--muted)">формулы нет — значение берётся из чарника</span>';
  try {
    const p = pass();
    const value = compile(draft).evaluate(tag => calc(state.system, sheet(), tag, p));
    return `<span style="color:var(--green)">= ${esc(show(value))}</span>`;
  } catch (err) {
    // Пока висит подсказка, ошибка разбора — это просто «слово ещё не выбрано».
    // Показывать «после имени «Сил» ожидается «(»» в этот момент значит пугать
    // человека сообщением про функции, когда он набирает поле.
    if (hintCount) return '<span style="color:var(--muted)">выберите из списка выше</span>';
    return `<span style="color:var(--red)">${esc(err.message)}</span>`;
  }
}

function safeDeps(expr) {
  try { return compile(expr).deps; } catch { return []; }
}

export const exprOf = f =>
  f.value.kind === 'formula' ? f.value.expr : f.value.kind === 'table' ? f.value.arg : '';

// ── правки ──────────────────────────────────────────────────────────────────

export function pickField(tag) {
  state.activeTag = tag;
  state.draft = exprOf(field(tag)) ?? '';
}

// Правка руками. Кнопки «Применить» нет намеренно: система — это данные,
// и правка данных должна быть видна сразу, как было в черновике
// (reference/index.html:1351). Но в систему уходит только то, что разбирается:
// пока формула недописана, поле держит последнюю рабочую и горит красным.
export function edit(text, caret) {
  state.draft = String(text);
  state.editCaret = caret == null ? state.draft.length : caret;
  state.suggestDismissed = false;
  state.suggestIndex = 0;
  applyIfValid();
}

// ── подсказка при наборе ────────────────────────────────────────────────────

export function currentSuggestions() {
  if (state.suggestDismissed) return { query: '', from: 0, to: 0, matches: [] };
  return suggest(state.draft ?? '', state.editCaret, state.system, state.activeTag);
}

export function moveSuggestion(delta) {
  const { matches } = currentSuggestions();
  if (!matches.length) return false;
  state.suggestIndex = (state.suggestIndex + delta + matches.length) % matches.length;
  return true;
}

export function acceptSuggestion(index) {
  const range = currentSuggestions();
  const item = range.matches[index == null ? state.suggestIndex : index];
  if (!item) return false;

  // Вот здесь и только здесь лейбл превращается в тег — по выбору человека.
  const { expr, caret } = applySuggestion(state.draft ?? '', range, item);
  state.draft = expr;
  state.caret = caret;
  state.editCaret = caret;
  state.suggestIndex = 0;
  applyIfValid();
  return true;
}

export function dismissSuggestions() {
  state.suggestDismissed = true;
  state.suggestIndex = 0;
}

export function insertDep(tag) {
  const input = document.getElementById('fbox-inp');
  const pos = input && input.selectionStart != null ? input.selectionStart : null;
  const { expr, caret } = insertRefAt(state.draft ?? '', tag, pos);
  state.draft = expr;
  state.caret = caret;
  applyIfValid();
}

export function dropPart(index) {
  state.draft = removePart(state.draft ?? '', state.system, index);
  applyIfValid();
}

function applyIfValid() {
  const f = field(state.activeTag);
  if (!f) return;
  const draft = (state.draft ?? '').trim();

  if (!draft) {
    // Пустая формула = поле снова хранимое. Так у некодера есть путь назад.
    if (f.value.kind === 'formula') f.value = { kind: 'stored', type: 'number', default: 0 };
    return;
  }
  if (!parses(draft)) return;

  if (f.value.kind === 'table') f.value = { ...f.value, arg: draft };
  else f.value = { kind: 'formula', expr: draft };
}

function parses(expr) {
  try { compile(expr); return true; } catch { return false; }
}
