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
import { SAMPLE_SYSTEMS, SAMPLE_WORLDS } from '../model/systems.js';
import { compile } from '../formula/index.js';

// ── копирование ─────────────────────────────────────────────────────────────
// Два режима переноса, и разница принципиальна:
//   copy…    — явная копия по клику: конфликт имён решается новым ключом;
//   ensure…  — зависимость приезжает ВСЛЕД за копией: уже есть — переиспользуем,
//              ничего не затираем и не дублируем.

export function ensureRollFrom(donor, tag) {
  if ((state.system.rolls || []).some(r => r.tag === tag)) return;
  const src = (donor.rolls || []).find(r => r.tag === tag);
  if (src) (state.system.rolls || (state.system.rolls = [])).push(structuredClone(src));
}

export function ensureConstantFrom(donor, name) {
  if ((state.system.constants || {})[name]) return;
  const src = (donor.constants || {})[name];
  if (src) (state.system.constants || (state.system.constants = {}))[name] = structuredClone(src);
}

function ensureMethod(id) {
  if (!id) return;
  const advantage = state.system.advantage || (state.system.advantage = { methods: {} });
  (advantage.methods || (advantage.methods = {}))[id] = true;
}

function ensureKindFrom(donor, rk) {
  if (!rk || (state.system.records || {})[rk]) return;
  const src = (donor.records || {})[rk];
  if (src) (state.system.records || (state.system.records = {}))[rk] = structuredClone(src);
}

function pullRuleDeps(donor, rule) {
  for (const step of rule.steps || []) {
    const constant = step.roll && step.roll.die && step.roll.die.constant;
    if (constant) ensureConstantFrom(donor, constant);
    const check = step.roll && step.roll.check;
    if (check) ensureRollFrom(donor, check);
  }
}

export function copyRuleFrom(donor, ruleId) {
  const rules = state.system.rules || (state.system.rules = {});
  let id = ruleId;
  let n = 1;
  while (rules[id]) id = `${ruleId}_${++n}`;
  const rule = structuredClone(donor.rules[ruleId]);
  rules[id] = rule;
  pullRuleDeps(donor, rule);
  state.activeRuleId = id;
  return id;
}

// Правило-зависимость сохраняет родной id: на него ссылаются эффекты-вызовы.
function ensureRuleFrom(donor, ruleId) {
  if ((state.system.rules || {})[ruleId]) return;
  const rule = structuredClone(donor.rules[ruleId]);
  (state.system.rules || (state.system.rules = {}))[ruleId] = rule;
  pullRuleDeps(donor, rule);
}

// Правило комнаты: модификатор на всех. Приезжает работоспособным —
// с мишенью броска и с объявлением механики, которой пользуется.
export function copyRoomRuleFrom(donor, modifierId) {
  const modifiers = state.system.modifiers || (state.system.modifiers = []);
  if (modifiers.some(m => m.id === modifierId)) return;
  const src = (donor.modifiers || []).find(m => m.id === modifierId);
  if (!src) return;
  const clone = structuredClone(src);
  modifiers.push(clone);
  if (clone.kind === 'roll') {
    ensureRollFrom(donor, clone.target);
    ensureMethod(clone.method);
  }
}

// Готовая запись компендиума. Приезжает РАБОЧЕЙ ЦЕПОЧКОЙ: предмет тянет
// вызовы своих активностей, вызов — правило (под родным id), правило — кость
// и мишень; roll-модификаторы объявляют механику. Поля листа НЕ тянутся:
// записи комбинируют объявленное, недостающее поле — повод скопировать блок.
export function copyRecordFrom(world, recordId) {
  const { system: donor, compendium: book } = world;
  const mine = state.compendium;
  if ([...mine.items, ...mine.effects, ...mine.actions].some(r => r.id === recordId)) return recordId;

  const shelf = ['items', 'effects', 'actions'].find(k => (book[k] || []).some(r => r.id === recordId));
  if (!shelf) return null;
  const clone = structuredClone(book[shelf].find(r => r.id === recordId));
  mine[shelf].push(clone);

  ensureKindFrom(donor, clone.rk);
  if (clone.rule) ensureRuleFrom(donor, clone.rule);
  if (shelf === 'actions' && clone.effect) copyRecordFrom(world, clone.effect);
  for (const act of clone.activities || []) copyRecordFrom(world, act.effect);
  for (const mod of clone.modifiers || []) {
    if (mod.kind !== 'roll') continue;
    ensureRollFrom(donor, mod.target);
    if (mod.effect) ensureMethod(mod.method);
  }
  return recordId;
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
export const worldById = id => SAMPLE_WORLDS.find(w => w.system.id === id) || null;

// ── палитры шаблонов ────────────────────────────────────────────────────────

// Доноры — ВСЕ образцы, включая тот, с которого система начата: удалил
// блок или правило — сможешь вернуть из образца. Уже существующее не
// прячется, а помечается «уже в системе» (и всё равно копируемо).
const donors = () => SAMPLE_SYSTEMS;

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

// Сцена «Механики», низ палитры: готовое из образцов, СГРУППИРОВАНО по
// системам-донорам и покрывает все словари: правила, таблицы, мишени
// бросков, константы-кости, правила комнаты.
const palItem = (icon, title, sub, onclick, have) =>
  `<div class="pal-item"${have ? ' style="opacity:.45"' : ''} onclick="${onclick}">
    <span class="pal-icon">${icon}</span>
    <div><div class="pal-t">${esc(title)}</div><div class="pal-s">${sub}</div></div>
  </div>`;

export function ruleTemplatesHtml() {
  return `<div class="pal-sec" style="margin-top:14px">Готовое из образцов</div>
    ${donors().map(sys => `
      <div class="pal-sec" style="opacity:.65;margin-top:8px">${esc(sys.name)}</div>
      ${Object.entries(sys.rules || {}).map(([id, rule]) => {
        const have = id in (state.system.rules || {});
        return palItem('⚙', rule.label || id,
          have ? 'механика · уже в системе — клик даст копию' : `механика · шагов: ${(rule.steps || []).length}`,
          `uiCopyRule('${sys.id}','${id}')`, have);
      }).join('')}
      ${Object.entries(sys.tables || {}).map(([name, t]) => {
        const have = name in (state.system.tables || {});
        return palItem('▤', t.label || name,
          have ? 'таблица · уже в системе — клик даст копию' : `таблица · диапазонов: ${(t.ranges || []).length}`,
          `uiCopyTable('${sys.id}','${name}')`, have);
      }).join('')}
      ${(sys.rolls || []).map(r => {
        const have = (state.system.rolls || []).some(x => x.tag === r.tag);
        return palItem('⌖', r.label, have ? 'мишень броска · уже в системе' : 'мишень броска',
          `uiCopyRoll('${sys.id}','${r.tag}')`, have);
      }).join('')}
      ${Object.entries(sys.constants || {}).map(([name, c]) => {
        const have = name in (state.system.constants || {});
        return palItem('⬡', c.label,
          `константа · ${(c.dice || []).map(d => `${d.count || 1}к${d.sides}`).join(' + ')}${have ? ' · уже в системе' : ''}`,
          `uiCopyConst('${sys.id}','${name}')`, have);
      }).join('')}
      ${(sys.modifiers || []).map(m => {
        const have = (state.system.modifiers || []).some(x => x.id === m.id);
        return palItem('⚖', m.label || m.id, have ? 'правило комнаты · уже в системе' : 'правило комнаты',
          `uiCopyRoomRule('${sys.id}','${m.id}')`, have);
      }).join('')}`).join('')}
    <div class="sys-hint">Копия приезжает работоспособной: правило тянет кость
      и мишень, правило комнаты — механику. Чего не хватит — скажет приговор.</div>`;
}

// Режим компендиума, низ палитры: готовые записи образцов. Клик — запись
// приезжает цепочкой (активности, вызовы, правила) и открывается в редакторе.
export function recordTemplatesHtml() {
  return `<div class="pal-sec" style="margin-top:14px">Готовые записи из образцов</div>
    ${SAMPLE_WORLDS.map(({ system: sys, compendium: book }) => `
      <div class="pal-sec" style="opacity:.65;margin-top:8px">${esc(sys.name)}</div>
      ${['items', 'effects', 'actions'].flatMap(shelf => (book[shelf] || []).map(r => {
        const decl = (sys.records || {})[r.rk] || {};
        const have = [...state.compendium.items, ...state.compendium.effects, ...state.compendium.actions]
          .some(x => x.id === r.id);
        return palItem(decl.icon || '□', r.label,
          `${esc(decl.label || shelf)}${have ? ' · уже в библиотеке' : ''}`,
          `uiCopyRecord('${sys.id}','${r.id}')`, have);
      })).join('')}`).join('')}
    <div class="sys-hint">Запись приедет рабочей цепочкой: меч притянет свой
      вызов, вызов — правило, правило — кость. Поля листа не тянутся —
      их даёт блок на сцене «Лист».</div>`;
}
