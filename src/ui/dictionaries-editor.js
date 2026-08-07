// Словари системы: константы-кости и таблицы по диапазонам.
//
// Оба — законы мира наравне с полями, и оба живут в сцене «Механики».
// Секции рисуются БЕЗ заголовка: свёртку и подпись даёт колонка словарей
// (mode-author.js, dictSection) — секция сама не знает, раскрыта ли она.
//
// Константа-кость — то, что бросается для действий в этом мире. Шаги эффектов
// ссылаются на неё, а не пишут «1d20»: смена кости здесь меняет все броски
// системы разом, не требуя правки ни одной формулы.

import { state, esc, log } from './state.js';
import { allSteps } from '../engine/effects.js';

// ── константы системы: ведущая кость ────────────────────────────────────────

const dieWord = c => (c.dice || []).map(d => `${d.count || 1}к${d.sides}${d.name ? ` «${d.name}»` : ''}`).join(' + ');

// Содержимое секции без заголовка: свёртку и подпись даёт колонка словарей
// (mode-author.js, dictSection) — секция сама не знает, раскрыта ли она.
export function renderConstants() {
  const dice = Object.entries(state.system.constants || {}).filter(([, c]) => c.kind === 'die');

  return `${dice.map(([name, c]) => `
      <div class="auto-rule" style="padding:8px 9px">
        <button class="ar-del" onclick="uiConstDelete('${name}')" title="удалить константу">×</button>
        <div class="ar-row">
          <input value="${esc(c.label)}" placeholder="Название константы" style="flex:1;font-weight:600"
                 oninput="uiConstRename('${name}',this.value)">
          <span class="info-dot" title="Броски правил ссылаются на константу, а не пишут «1d20». Смена кости здесь меняет все броски системы разом.">i</span>
        </div>
        ${(c.dice || []).map((d, i) => `
          <div class="ar-row">
            <input class="bon-v" style="width:34px" value="${d.count || 1}" title="сколько костей"
                   oninput="uiLeadDie('${name}',${i},'count',this.value)">
            <span style="font-size:11px;color:var(--muted)">к</span>
            <input class="bon-v" style="width:44px" value="${d.sides}" title="граней"
                   oninput="uiLeadDie('${name}',${i},'sides',this.value)">
            <input class="ar-cond" style="width:74px" value="${esc(d.name || '')}" placeholder="имя части"
                   title="именованная часть броска: Надежда/Страх в Daggerheart"
                   oninput="uiLeadDie('${name}',${i},'name',this.value)">
            ${(c.dice.length > 1) ? `<button class="ar-del" style="position:static" onclick="uiLeadDie('${name}',${i},'remove','')">×</button>` : ''}
          </div>`).join('')}
        <button class="add-row" onclick="uiLeadDie('${name}',-1,'add','')">+ кость в бросок</button>
      </div>`).join('')}
    <button class="add-row" onclick="uiConstAdd()">+ константа-кость</button>`;
}

let constCounter = 0;
function newConstName() {
  let name;
  do { name = `const_${++constCounter}`; } while (state.system.constants && name in state.system.constants);
  return name;
}

export function addConstant() {
  const constants = state.system.constants || (state.system.constants = {});
  const name = newConstName();
  constants[name] = { label: 'Новая кость', kind: 'die', dice: [{ count: 1, sides: 6 }] };
  return name;
}

export function renameConstant(name, label) {
  const c = state.system.constants[name];
  if (c) c.label = label;
}

// Ссылку держит только слот «Кость» шага «порог» (roll.die.constant) —
// тот же принцип защиты, что у поля и у мишени броска.
function constantUsage(name) {
  return allSteps(state.system).some(step =>
    step.roll && step.roll.die && step.roll.die.constant === name);
}

export function deleteConstant(name) {
  if (constantUsage(name)) {
    log(`<b>Нельзя удалить «${esc(state.system.constants[name].label)}»:</b> на неё ссылается шаг эффекта`);
    return;
  }
  delete state.system.constants[name];
}

// ── таблицы по диапазонам: третий способ вычислить поле ─────────────────────
// Ступенчатая прогрессия (бонус мастерства 5e) — не арифметика, а поиск по
// диапазону; движок это умел с самого начала (src/engine/tables.js), заводить
// таблицу и править диапазоны из конструктора было негде.

export function renderTables() {
  const tables = Object.entries(state.system.tables || {});
  return `${tables.map(([name, t]) => `
      <div class="auto-rule" style="padding:8px 9px">
        <button class="ar-del" onclick="uiTableDelete('${name}')" title="удалить таблицу">×</button>
        <div class="ar-row">
          <input value="${esc(t.label || '')}" placeholder="Название таблицы" style="flex:1;font-weight:600"
                 oninput="uiTableRename('${name}',this.value)">
        </div>
        ${(t.ranges || []).map((r, i) => `
          <div class="ar-row">
            <input class="bon-v" style="width:44px" value="${r.from}" title="от"
                   oninput="uiTableRange('${name}',${i},'from',this.value)">
            <span style="font-size:11px;color:var(--muted)">–</span>
            <input class="bon-v" style="width:44px" value="${r.to}" title="до"
                   oninput="uiTableRange('${name}',${i},'to',this.value)">
            <span style="font-size:11px;color:var(--muted)">→</span>
            <input class="bon-v" style="width:44px" value="${r.value}" title="значение"
                   oninput="uiTableRange('${name}',${i},'value',this.value)">
            ${(t.ranges.length > 1) ? `<button class="ar-del" style="position:static" onclick="uiTableRangeDel('${name}',${i})">×</button>` : ''}
          </div>`).join('')}
        <button class="add-row" onclick="uiTableRangeAdd('${name}')">+ диапазон</button>
      </div>`).join('')}
    <button class="add-row" onclick="uiTableAdd()">+ таблица</button>`;
}

let tableCounter = 0;
function newTableName() {
  let name;
  do { name = `table_${++tableCounter}`; } while (state.system.tables && name in state.system.tables);
  return name;
}

export function addTable() {
  const tables = state.system.tables || (state.system.tables = {});
  const name = newTableName();
  tables[name] = { label: 'Новая таблица', ranges: [{ from: 1, to: 1, value: 0 }] };
  return name;
}

export function renameTable(name, label) {
  const t = state.system.tables[name];
  if (t) t.label = label;
}

export function addRange(name) {
  const ranges = state.system.tables[name].ranges;
  const last = ranges[ranges.length - 1];
  const from = last ? last.to + 1 : 1;
  ranges.push({ from, to: from, value: 0 });
}

export function setRange(name, index, key, raw) {
  const n = Number(raw);
  state.system.tables[name].ranges[index][key] = Number.isNaN(n) ? 0 : n;
}

export function deleteRange(name, index) {
  state.system.tables[name].ranges.splice(index, 1);
}

function tableUsage(name) {
  return state.system.fields.some(f => f.value.kind === 'table' && f.value.table === name);
}

export function deleteTable(name) {
  if (tableUsage(name)) {
    log(`<b>Нельзя удалить «${esc(state.system.tables[name].label)}»:</b> на неё ссылается поле листа`);
    return;
  }
  delete state.system.tables[name];
}


export function setLeadDie(name, index, key, raw) {
  const constant = state.system.constants[name];
  if (key === 'add') { constant.dice.push({ count: 1, sides: 6 }); return; }
  if (key === 'remove') { constant.dice.splice(index, 1); return; }
  const die = constant.dice[index];
  if (key === 'name') {
    if (String(raw).trim()) die.name = String(raw).trim(); else delete die.name;
    return;
  }
  const n = Number(raw);
  if (!Number.isNaN(n) && n > 0) die[key] = n;
}
