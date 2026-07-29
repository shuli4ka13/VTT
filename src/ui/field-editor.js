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
import { toDisplay } from './formula-text.js';
import { renderFormulaInput } from './formula-input.js';
import { compile } from '../formula/index.js';

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
      ${renderFormulaInput('field.' + f.tag, {
        exclude: f.tag,
        placeholder: 'пусто — значение вводит игрок',
        read: () => exprOf(f),
        write: expr => writeFormula(f, expr),
      })}
    </div>

    <button class="new-item-btn" style="width:100%;margin:0" onclick="uiDelField('${f.tag}')">
      ✕ Удалить поле
    </button>`;
}

export const exprOf = f =>
  f.value.kind === 'formula' ? f.value.expr : f.value.kind === 'table' ? f.value.arg : '';

// ── состав полей: только режим автора ───────────────────────────────────────

export function pickField(tag) {
  state.activeTag = tag;
  state.formula = { key: null, draft: '', at: 0, index: 0, dismissed: true };
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
  state.formula = { key: null, draft: '', at: 0, index: 0, dismissed: true };
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
  if (state.activeTag === tag) state.activeTag = null;
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

// Пустая формула = поле снова хранимое. Так у автора есть путь назад.
function writeFormula(f, expr) {
  if (f.value.kind === 'table') { f.value = { ...f.value, arg: expr }; return; }
  f.value = expr
    ? { kind: 'formula', expr }
    : { kind: 'stored', type: 'number', default: 0 };
}

export { toDisplay };
