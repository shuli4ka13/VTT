// Редактор поля — центр режима автора.
//
// Здесь и только здесь лейбл превращается в тег: в момент, когда человек
// выбирает подсказку из списка. В черновике это происходило заново при каждом
// вычислении, регулярной заменой (reference/index.html:1096-1102), и потому
// ломалось от переименования и от совпадения подстрок.
//
// Значений на экране нет намеренно: автор задаёт правило, а не результат.
// Персонажа в этом режиме может не быть вовсе.

import { state, field, newTag, esc, log } from './state.js';
import { toDisplay, toParts, insertRefAt, removePart } from './formula-text.js';
import { suggest, applySuggestion } from './suggest.js';
import { compile, FormulaError } from '../formula/index.js';

const KIND_LABEL = {
  stored: 'хранимое — значение вводит игрок',
  formula: 'формула — считает движок',
  table: 'таблица по диапазонам',
};

export function renderEditor() {
  const host = document.getElementById('author-editor');
  const f = state.activeTag && field(state.activeTag);

  if (!f) {
    host.innerHTML = '<div class="empty-ed">Выберите поле слева<br>или добавьте новое кнопкой справа</div>';
    return;
  }

  const draft = state.draft ?? exprOf(f) ?? '';
  const groups = [...new Set(state.system.fields.map(x => x.group))];

  host.innerHTML = `
    <div class="pb">
      <div class="pb-lbl">Как называется</div>
      <input class="item-name-inp" id="fe-label" value="${esc(f.label)}"
             oninput="uiRename('${f.tag}', this.value)">
      <div class="sys-hint" style="margin-top:6px">
        Служебное имя <code>#${esc(f.tag)}</code> задано при создании и не меняется.
        Формулы держатся за него — поэтому переименование выше ничего не ломает.
      </div>
    </div>

    <div class="pb">
      <div class="pb-lbl">В каком блоке</div>
      <select class="meta-sel" style="width:100%" onchange="uiSetGroup('${f.tag}', this.value)">
        ${groups.map(g => `<option${g === f.group ? ' selected' : ''}>${esc(g)}</option>`).join('')}
      </select>
    </div>

    ${f.value.kind === 'stored' ? `<div class="pb">
      <div class="pb-lbl">Что вводит игрок</div>
      <select class="meta-sel" style="width:100%" onchange="uiSetType('${f.tag}', this.value)">
        <option value="number"${f.value.type === 'number' ? ' selected' : ''}>Число</option>
        <option value="boolean"${f.value.type === 'boolean' ? ' selected' : ''}>Да / нет</option>
        <option value="text"${f.value.type === 'text' ? ' selected' : ''}>Текст — имя, раса, класс</option>
      </select>
      <div class="sys-hint" style="margin-top:6px">
        На текстовые поля формулы не ссылаются: складывать строки нечем.
      </div>
    </div>` : ''}

    <div class="pb">
      <div class="pb-lbl">Как считается · ${esc(KIND_LABEL[f.value.kind] || f.value.kind)}</div>
      <input class="expr-inp" id="fbox-inp" type="text" spellcheck="false"
             placeholder="пусто — значение вводит игрок. Наберите «Сила» или «floor»"
             oninput="uiEditFormula(this.value, this.selectionStart)"
             value="${esc(draft)}">
      <div class="hints" id="fbox-hints"></div>
      <div class="expr-strip" id="fbox-strip" title="так формулу увидит игрок"></div>
      <div class="f-result" id="fbox-res"></div>

      <div class="sys-sub" style="margin-top:12px">Собрать из полей</div>
      <div style="display:flex;flex-wrap:wrap;gap:3px" id="fbox-deps"></div>
    </div>

    <button class="new-item-btn" style="width:100%;margin:0" onclick="uiDelField('${f.tag}')">
      ✕ Удалить поле
    </button>`;

  renderFormulaBits(f, draft);
}

function renderFormulaBits(f, draft) {
  const input = document.getElementById('fbox-inp');
  const hints = currentSuggestions();

  input.classList.toggle('invalid', Boolean(draft.trim()) && !parses(draft));

  document.getElementById('fbox-hints').innerHTML = hints.matches.map((item, i) => `
    <button class="hint${i === state.suggestIndex ? ' on' : ''}" onmousedown="event.preventDefault()"
            onclick="uiAcceptHint(${i})">
      <span class="hint-name">${esc(item.label || item.name)}</span>
      <span class="hint-kind">${item.kind === 'function' ? 'функция' : 'поле'}</span>
    </button>`).join('');

  const parts = toParts(draft, state.system);
  document.getElementById('fbox-strip').innerHTML = parts.length
    ? parts.map((part, i) => part.kind === 'ref'
      ? `<button class="dep-tog on" title="убрать" onclick="uiDropPart(${i})">${esc(part.label)}</button>`
      : `<span class="expr-txt">${esc(part.text)}</span>`).join('')
    : '<span style="color:var(--muted);font-size:11px">формулы нет — поле хранимое</span>';

  document.getElementById('fbox-res').innerHTML = verdict(draft, hints.matches.length);

  const used = new Set(safeDeps(draft));
  document.getElementById('fbox-deps').innerHTML = state.system.fields
    .filter(other => other.tag !== f.tag)
    .map(other => `<span class="dep-tog${used.has(other.tag) ? ' on' : ''}"
      onclick="uiInsertDep('${other.tag}')">${esc(other.label)}</span>`).join(' ');
}

// Вместо результата — приговор о разборе. Считать в конструкторе не по чему
// и незачем: персонажа тут нет, а правило верно или неверно само по себе.
function verdict(draft, hintCount) {
  if (!draft.trim()) return '<span style="color:var(--muted)">значение будет вводить игрок</span>';
  if (hintCount) return '<span style="color:var(--muted)">выберите из списка выше</span>';
  try {
    const { deps } = compile(draft);
    const unknown = deps.filter(tag => !field(tag));
    if (unknown.length) return `<span style="color:var(--red)">нет полей: ${unknown.map(esc).join(', ')}</span>`;
    return `<span style="color:var(--green)">правило верное${deps.length ? ` · зависит от ${deps.length}` : ''}</span>`;
  } catch (err) {
    return `<span style="color:var(--red)">${esc(err.message)}</span>`;
  }
}

function safeDeps(expr) {
  try { return compile(expr).deps; } catch { return []; }
}

function parses(expr) {
  try { compile(expr); return true; } catch { return false; }
}

export const exprOf = f =>
  f.value.kind === 'formula' ? f.value.expr : f.value.kind === 'table' ? f.value.arg : '';

// ── состав полей: только режим автора ───────────────────────────────────────

export function pickField(tag) {
  state.activeTag = tag;
  state.draft = exprOf(field(tag)) ?? '';
  state.suggestDismissed = true;
}

export function rename(tag, label) {
  field(tag).label = label;
}

export function setGroup(tag, group) {
  field(tag).group = group;
}

export function setType(tag, type) {
  const f = field(tag);
  if (f.value.kind !== 'stored') return;
  f.value = { kind: 'stored', type, default: type === 'text' ? '' : type === 'boolean' ? false : 0 };
  // Прежние значения могли быть другого рода — приводим, чтобы лист не показал ошибку.
  for (const s of state.sheets) {
    if (!(tag in s.values)) continue;
    const raw = s.values[tag];
    s.values[tag] = type === 'text' ? String(raw) : type === 'boolean' ? Boolean(raw) : Number(raw) || 0;
  }
}

export function addField(group) {
  const tag = newTag();
  state.system.fields.push({
    tag, label: 'Новое поле', group,
    value: { kind: 'stored', type: 'number', default: 0 },
  });
  state.activeTag = tag;
  state.draft = '';
  state.suggestDismissed = true;
  return tag;
}

export function addGroup() {
  const existing = new Set(state.system.fields.map(f => f.group));
  let n = existing.size + 1;
  while (existing.has(`Блок ${n}`)) n++;
  addField(`Блок ${n}`);
}

export function removeField(tag) {
  const dependants = state.system.fields.filter(f => f.tag !== tag && depsOf(f).includes(tag));
  if (dependants.length) {
    log(`<b>Нельзя удалить «${esc(field(tag).label)}»:</b> на него ссылаются ` +
      dependants.map(f => esc(f.label)).join(', '));
    return;
  }

  if (allModifiers().some(m => m.target === tag)) {
    log(`<b>Нельзя удалить «${esc(field(tag).label)}»:</b> на него нацелены записи компендиума`);
    return;
  }

  state.system.fields = state.system.fields.filter(f => f.tag !== tag);
  for (const s of state.sheets) delete s.values[tag];
  if (state.activeTag === tag) { state.activeTag = null; state.draft = null; }
}

// Зависимости берутся из разобранного дерева, а не поиском подстроки:
// иначе «#str» находился бы внутри «#str_mod».
function depsOf(f) {
  const expr = exprOf(f);
  if (!expr) return [];
  try { return [...compile(expr).deps]; } catch { return []; }
}

function allModifiers() {
  const { items, effects } = state.compendium;
  return [
    ...state.system.modifiers,
    ...items.flatMap(r => r.modifiers || []),
    ...effects.flatMap(r => r.modifiers || []),
  ];
}

// ── правка формулы ──────────────────────────────────────────────────────────

// Кнопки «Применить» нет намеренно: система — это данные, и правка данных
// видна сразу, как было в черновике (reference/index.html:1351). Но в систему
// уходит только то, что разбирается и что ссылается на существующие поля.
export function edit(text, caret) {
  state.draft = String(text);
  state.editCaret = caret == null ? state.draft.length : caret;
  state.suggestDismissed = false;
  state.suggestIndex = 0;
  applyIfValid();
}

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
  state.suggestDismissed = true;
  applyIfValid();
}

export function dropPart(index) {
  state.draft = removePart(state.draft ?? '', state.system, index);
  state.suggestDismissed = true;
  applyIfValid();
}

function applyIfValid() {
  const f = field(state.activeTag);
  if (!f) return;
  const draft = (state.draft ?? '').trim();

  if (!draft) {
    // Пустая формула = поле снова хранимое. Так у автора есть путь назад.
    if (f.value.kind === 'formula') f.value = { kind: 'stored', type: 'number', default: 0 };
    return;
  }

  let deps;
  try {
    deps = compile(draft).deps;
  } catch (err) {
    if (err instanceof FormulaError) return;
    throw err;
  }
  if (deps.some(tag => !field(tag))) return;

  if (f.value.kind === 'table') f.value = { ...f.value, arg: draft };
  else f.value = { kind: 'formula', expr: draft };
}

export { toDisplay };
