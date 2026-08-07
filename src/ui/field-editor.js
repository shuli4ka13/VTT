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
import { allModifiers as worldModifiers } from '../engine/effects.js';

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
    </div>
    <div class="pb">
      <div class="pb-lbl">Значение по умолчанию</div>
      ${f.value.type === 'boolean' ? `
        <select class="meta-sel" style="width:100%" onchange="uiSetDefault('${f.tag}', this.value === 'true')">
          <option value="false"${f.value.default ? '' : ' selected'}>нет</option>
          <option value="true"${f.value.default ? ' selected' : ''}>да</option>
        </select>`
      : `<input class="expr-inp" type="text" value="${esc(f.value.default ?? '')}"
           oninput="uiSetDefault('${f.tag}', this.value)">`}
    </div>` : ''}

    <div class="pb">
      <div class="chk-row${f.roll ? ' on' : ''}" onclick="uiToggleRoll('${f.tag}')">
        <div class="chk-box">✓</div>
        <div class="chk-lbl"><span>По этому полю бросают</span></div>
      </div>
      ${f.roll ? `<input class="expr-inp" style="margin-top:6px" type="text"
             value="${esc(f.roll.label || '')}" placeholder="как назвать бросок"
             oninput="uiSetRollLabel('${f.tag}', this.value)">` : ''}
    </div>

    <div class="pb">
      <div class="pb-lbl">Как считается</div>
      <select class="meta-sel" style="width:100%" onchange="uiSetValueKind('${f.tag}', this.value)">
        <option value="stored"${f.value.kind === 'stored' ? ' selected' : ''}>${esc(KIND_LABEL.stored)}</option>
        <option value="formula"${f.value.kind === 'formula' ? ' selected' : ''}>${esc(KIND_LABEL.formula)}</option>
        <option value="table"${f.value.kind === 'table' ? ' selected' : ''}>${esc(KIND_LABEL.table)}</option>
      </select>

      ${f.value.kind === 'table' ? tablePicker(f) : ''}

      ${f.value.kind !== 'stored' ? renderFormulaInput('field.' + f.tag, {
        exclude: f.tag,
        placeholder: f.value.kind === 'table' ? 'аргумент — обычно #уровень' : 'формула',
        read: () => exprOf(f),
        write: expr => writeFormula(f, expr),
      }) : ''}
    </div>

    <button class="new-item-btn" style="width:100%;margin:0" onclick="uiDelField('${f.tag}')">
      ✕ Удалить поле
    </button>`;
}

export const exprOf = f =>
  f.value.kind === 'formula' ? f.value.expr : f.value.kind === 'table' ? f.value.arg : '';

function tablePicker(f) {
  const tables = Object.entries(state.system.tables || {});
  if (!tables.length) {
    return '<div class="sys-hint">Система не объявляет таблиц — заведите в сцене «Механики».</div>';
  }
  return `<select class="meta-sel" style="width:100%;margin-bottom:6px" onchange="uiSetFieldTable('${f.tag}', this.value)">
    ${tables.map(([name, t]) => `<option value="${name}"${f.value.table === name ? ' selected' : ''}>${esc(t.label)}</option>`).join('')}
  </select>`;
}

export function setFieldTable(tag, name) {
  field(tag).value.table = name;
}

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

// «По этому полю бросают». Мишень броска не объявляется отдельно, а выводится
// из поля — иначе в 5e их пришлось бы завести десятка три руками. Идея из
// черновика: «чтобы не прописывать кубы для каждого навыка».
export function toggleRoll(tag) {
  const f = field(tag);
  if (f.roll) delete f.roll;
  else f.roll = { label: `Проверка: ${f.label}` };
}

export function setRollLabel(tag, label) {
  const f = field(tag);
  if (f.roll) f.roll.label = label;
}

// Движок читает value.default, когда в чарнике значения ещё нет (calc.js,
// rule.js). Приведение к типу — как в setType: чтобы образец «10» не осел
// строкой на числовом поле.
export function setDefault(tag, raw) {
  const f = field(tag);
  if (f.value.kind !== 'stored') return;
  const type = f.value.type;
  f.value.default = type === 'boolean' ? raw === true || raw === 'true'
    : type === 'text' ? String(raw)
      : Number(raw) || 0;
}

// Переключатель между тремя способами вычислить поле: движок их различает
// с самого начала (value.kind), конструктору не хватало явной ручки —
// формула включалась неявно набором текста, а таблица не включалась никак.
export function setValueKind(tag, kind) {
  const f = field(tag);
  if (kind === f.value.kind) return;
  if (kind === 'stored') {
    const type = f.value.type || 'number';
    f.value = { kind: 'stored', type, default: type === 'text' ? '' : type === 'boolean' ? false : 0 };
  } else if (kind === 'formula') {
    f.value = { kind: 'formula', expr: '' };
  } else if (kind === 'table') {
    const table = Object.keys(state.system.tables || {})[0] || '';
    f.value = { kind: 'table', table, arg: '' };
  }
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
  return worldModifiers(state.system, state.compendium);
}

// Пустая формула = поле снова хранимое. Так у автора есть путь назад.
function writeFormula(f, expr) {
  if (f.value.kind === 'table') { f.value = { ...f.value, arg: expr }; return; }
  f.value = expr
    ? { kind: 'formula', expr }
    : { kind: 'stored', type: 'number', default: 0 };
}

export { toDisplay };
