// Шаблоны из образцовых систем — «намешать в свою систему море всего».
//
// Тот же принцип, что у родов записей (records-editor.js): образец — донор,
// копия — своя, донор не меняется. Здесь — остальные словари системы:
// блоки полей, правила-конвейеры, таблицы. Копия правила тянет за собой
// недостающие зависимости (константу-кость, мишень броска), копия блока —
// транзитивные зависимости формул и таблицы табличных полей: приехать
// должно работающее, а не огрызок со ссылками в пустоту.
//
// Ссылки на свойства предметов ({ item: 'damage_dice' }) не резолвятся при
// копировании намеренно: свойство объявляет РОД записи, рода подтягиваются
// своим шаблоном на сцене «Записи» — приговор правила скажет, чего не хватает.

import { state, esc } from './state.js';
import { SAMPLE_SYSTEMS } from '../model/systems.js';
import { compile } from '../formula/index.js';

// ── копирование ─────────────────────────────────────────────────────────────

export function copyRuleFrom(donor, ruleId) {
  const rules = state.system.rules || (state.system.rules = {});
  let id = ruleId;
  let n = 1;
  while (rules[id]) id = `${ruleId}_${++n}`;
  const rule = structuredClone(donor.rules[ruleId]);
  rules[id] = rule;

  for (const step of rule.steps || []) {
    const constant = step.roll && step.roll.die && step.roll.die.constant;
    if (constant && !(state.system.constants || {})[constant] && (donor.constants || {})[constant]) {
      (state.system.constants || (state.system.constants = {}))[constant] =
        structuredClone(donor.constants[constant]);
    }
    const check = step.roll && step.roll.check;
    if (check && !(state.system.rolls || []).some(r => r.tag === check)) {
      const src = (donor.rolls || []).find(r => r.tag === check);
      if (src) (state.system.rolls || (state.system.rolls = [])).push(structuredClone(src));
    }
  }

  state.activeRuleId = id;
  return id;
}

// Блок — группа полей. Вместе с полем едут его зависимости по формуле
// (даже из других блоков: «Навыки» притянут «Модификаторы», те — «Характеристики»)
// и таблицы табличных полей. Уже существующий тег переиспользуется: смешение,
// а не затирание.
export function copyBlockFrom(donor, group) {
  const queue = donor.fields.filter(f => f.group === group).map(f => f.tag);
  const seen = new Set(queue);

  while (queue.length) {
    const tag = queue.shift();
    const src = donor.fields.find(f => f.tag === tag);
    if (!src) continue; // зависимость вне донора — приговор формулы покажет
    if (state.system.fields.some(f => f.tag === tag)) continue;

    state.system.fields.push(structuredClone(src));

    if (src.value.kind === 'table' && !(state.system.tables || {})[src.value.table]) {
      const table = (donor.tables || {})[src.value.table];
      if (table) (state.system.tables || (state.system.tables = {}))[src.value.table] = structuredClone(table);
    }

    const expr = src.value.kind === 'formula' ? src.value.expr
      : src.value.kind === 'table' ? src.value.arg : '';
    if (!expr) continue;
    try {
      for (const dep of compile(expr).deps) {
        if (!seen.has(dep)) { seen.add(dep); queue.push(dep); }
      }
    } catch { /* формула донора не разобралась — поле уже скопировано, приговор скажет */ }
  }
}

export function copyTableFrom(donor, tableName) {
  const tables = state.system.tables || (state.system.tables = {});
  let name = tableName;
  let n = 1;
  while (tables[name]) name = `${tableName}_${++n}`;
  tables[name] = structuredClone(donor.tables[tableName]);
  return name;
}

export const donorById = id => SAMPLE_SYSTEMS.find(s => s.id === id) || null;

// ── палитры шаблонов ────────────────────────────────────────────────────────

const donors = () => SAMPLE_SYSTEMS.filter(s => s.id !== state.system.id);

// Сцена «Лист», правая колонка: блоки полей образцовых систем.
export function blockTemplatesHtml() {
  const list = donors();
  if (!list.length) return '<div class="sys-hint">Образцовых систем-доноров нет.</div>';
  return `${list.map(sys => {
    const groups = [...new Set(sys.fields.map(f => f.group))];
    return `<div class="pal-sec">${esc(sys.name)}</div>
      ${groups.map(g => {
        const fields = sys.fields.filter(f => f.group === g);
        const have = fields.every(f => state.system.fields.some(x => x.tag === f.tag));
        return `<div class="pal-item"${have ? ' style="opacity:.45"' : ''} onclick="uiCopyBlock('${sys.id}','${esc(g)}')">
          <span class="pal-icon">⊞</span>
          <div><div class="pal-t">${esc(g)}</div>
          <div class="pal-s">${have ? 'уже в системе' : `полей: ${fields.length}`}</div></div>
        </div>`;
      }).join('')}`;
  }).join('')}
  <div class="sys-hint" style="margin-top:8px">Клик — блок приедет в вашу систему
    вместе с зависимостями формул. Донор не изменится.</div>`;
}

// Сцена «Механики», низ палитры: правила-конвейеры и таблицы образцов.
export function ruleTemplatesHtml() {
  const list = donors();
  if (!list.length) return '';
  return `<div class="pal-sec" style="margin-top:14px">Готовые механики из образцов</div>
    ${list.map(sys => `
      ${Object.entries(sys.rules || {}).map(([id, rule]) => `
        <div class="pal-item" onclick="uiCopyRule('${sys.id}','${id}')">
          <span class="pal-icon">⚙</span>
          <div><div class="pal-t">${esc(rule.label || id)}</div>
          <div class="pal-s">${esc(sys.name)} · шагов: ${(rule.steps || []).length}</div></div>
        </div>`).join('')}
      ${Object.entries(sys.tables || {}).map(([name, t]) => `
        <div class="pal-item" onclick="uiCopyTable('${sys.id}','${name}')">
          <span class="pal-icon">▤</span>
          <div><div class="pal-t">${esc(t.label || name)}</div>
          <div class="pal-s">${esc(sys.name)} · таблица, диапазонов: ${(t.ranges || []).length}</div></div>
        </div>`).join('')}`).join('')}
    <div class="sys-hint">Правило приедет со своей костью и мишенью броска;
      чего не хватит (свойства предметов) — скажет приговор.</div>`;
}
