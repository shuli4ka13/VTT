// Режим автора: конструктор листа.
//
// Работает БЕЗ персонажа. Ни одного значения на экране — только состав полей,
// их лейблы, формулы и правила комнаты. Результат правки виден у всех
// персонажей этой системы: промежуточного слоя «шаблон листа» в прототипе нет,
// и это записано в docs/production-differences.md.

import { state, esc, log } from './state.js';
import { renderEditor, exprOf } from './field-editor.js';
import { toDisplay } from './formula-text.js';
import { ADVANTAGE_METHODS, enabledMethods } from '../model/advantage-methods.js';
import { renderRuleList, renderRuleCanvas, renderStepPalette } from './effect-editor.js';
import { renderConstants, renderTables } from './dictionaries-editor.js';
import { renderKindList, renderKindEditor, renderKindTemplates } from './records-editor.js';
import { blockTemplatesHtml, effectTemplatesHtml } from './templates.js';
import { activationOf, allModifiers, allSteps } from '../engine/effects.js';

// Две сцены одного режима: ЛИСТ правит состав полей, МЕХАНИКИ — конвейеры
// правил. Разъезд по сценам — про место на экране, а не про границу режимов:
// обе правят систему, и обе живут только у автора.
export function renderAuthor() {
  const nameInput = document.getElementById('sys-name');
  if (nameInput && nameInput.value !== state.system.name) nameInput.value = state.system.name || '';

  const view = state.authorView;
  for (const name of ['sheet', 'rules', 'records']) {
    document.getElementById('author-view-' + name).style.display = name === view ? '' : 'none';
  }
  document.querySelectorAll('#pane-author .author-subnav .tnav')
    .forEach(b => b.classList.toggle('on', b.dataset.view === view));

  if (view === 'rules') {
    renderRuleList();
    // Мишени бросков, механики преимущества и правила комнаты — тоже законы
    // мира: живут в сцене «Механики», в общей колонке словарей системы.
    document.getElementById('rules-list').insertAdjacentHTML('beforeend', dictionariesHtml());
    renderRuleCanvas();
    renderStepPalette();
    document.getElementById('rules-palette').insertAdjacentHTML('beforeend', effectTemplatesHtml());
    return;
  }
  if (view === 'records') {
    renderKindList();
    renderKindEditor();
    renderKindTemplates();
    return;
  }
  renderFieldList();
  renderEditor();
  document.getElementById('author-templates').innerHTML = blockTemplatesHtml();
}

export function setAuthorView(view) {
  state.authorView = view;
}

// Имя системы уезжает в публикацию мира (see src/ui/net.js) — автор должен
// выбирать его сам, а не наследовать имя образца, с которого начал.
export function renameSystem(name) {
  state.system.name = name;
}

function renderFieldList() {
  const groups = new Map();
  for (const f of state.system.fields) {
    if (!groups.has(f.group)) groups.set(f.group, []);
    groups.get(f.group).push(f);
  }

  document.getElementById('author-fields').innerHTML = [...groups].map(([group, fields]) => `
    <div class="cs-block" style="padding:8px 10px">
      <div class="blk-type">${esc(group)}</div>
      ${fields.map(f => `
        <div class="f-entry${state.activeTag === f.tag ? ' on' : ''}" onclick="uiPickField('${f.tag}')">
          <div class="f-ename">${esc(f.label)}</div>
          <div class="f-expr">${esc(describe(f))}</div>
        </div>`).join('')}
      <button class="add-row" onclick="uiAddField('${esc(group)}')">+ поле в этот блок</button>
    </div>`).join('');
}

// Ни одного значения: только чем поле является и от чего зависит.
function describe(f) {
  if (f.value.kind === 'stored') return 'вводит игрок';
  if (f.value.kind === 'table') {
    const label = ((state.system.tables || {})[f.value.table] || {}).label || f.value.table || '—';
    return `таблица «${label}» от ${toDisplay(f.value.arg, state.system)}`;
  }
  return toDisplay(exprOf(f), state.system);
}

// Словари системы — свёртываемые секции под списком механик. Свёрнутые
// читаются как оглавление: заголовок + счётчик, раскрытие — по клику
// и переживает перерисовку (state.openDicts).
export function toggleDict(key) {
  state.openDicts[key] = !state.openDicts[key];
}

function dictSection(key, title, count, body) {
  const open = !!state.openDicts[key];
  return `<div class="dict-sec">
    <div class="dict-hdr" onclick="uiToggleDict('${key}')">
      <span class="dict-arrow">${open ? '▾' : '▸'}</span>
      <span style="flex:1">${title}</span>
      <span class="dict-count">${count}</span>
    </div>
    ${open ? `<div class="dict-body">${body}</div>` : ''}
  </div>`;
}

// Механики преимущества: СЛОВАРЬ — межсистемный справочник, а какие механики
// СУЩЕСТВУЮТ в этом мире — объявляет система (system.advantage.methods).
// Рисуем объявленное; справочник — только как источник для добавления.
// У киберпанка здесь честно пусто: днд-преимущество ему не навязано.
function dictionariesHtml() {
  const enabled = enabledMethods(state.system);
  const room = state.system.room_rules || [];

  return `<div class="pal-sec" style="margin-top:14px">Словари системы</div>` + [
    dictSection('rolls', 'Мишени бросков', (state.system.rolls || []).length, rollsSection()),
    dictSection('advantage', 'Механики преимущества', enabled.length, advantageBody(enabled)),
    dictSection('constants', 'Константы-кости', Object.keys(state.system.constants || {}).length, renderConstants()),
    dictSection('tables', 'Таблицы по диапазонам', Object.keys(state.system.tables || {}).length, renderTables()),
    dictSection('costs', 'Типы действий', Object.keys(state.system.action_types || {}).length, actionTypesBody()),
    dictSection('room', 'Правила комнаты', room.length, roomRulesBody(room)),
  ].join('');
}

// Экономика действий: словарь системы, как мишени бросков. Раундов в PoC нет,
// поэтому это разметка кнопок, а не запрет; лимиты повесятся сюда, когда
// появятся ходы (docs/production-differences.md).
function actionTypesBody() {
  const types = Object.entries(state.system.action_types || {});
  return `<div class="sys-hint" style="margin:2px 0 6px">Чего стоит применить эффект.
      Пока разметка: бейдж на кнопке, не запрет.</div>
    ${types.map(([id, t]) => `
      <div class="ar-row" style="margin-top:4px">
        <input value="${esc(t.label || '')}" placeholder="Название"
               oninput="uiRenameCost('${id}',this.value)" style="flex:1">
        <button class="ar-del" style="position:static" onclick="uiDeleteCost('${id}')">✕</button>
      </div>`).join('')}
    <button class="add-row" onclick="uiAddCost()">+ тип действия</button>`;
}

function advantageBody(enabled) {
  const available = ADVANTAGE_METHODS.filter(m => !enabled.includes(m));
  return `${enabled.length
    ? enabled.map(method => `
      <div class="auto-rule" style="padding:6px 9px">
        <button class="ar-del" onclick="uiToggleMethod('${method.id}')" title="убрать из системы">×</button>
        <div style="font-size:11px">${esc(method.label)}${method.implemented ? '' : ' <span style="color:var(--muted)">· не отыгран</span>'}
          <span class="info-dot" title="${esc(method.examples.map(e => `${e.system}: ${e.example}`).join('\n'))}">i</span>
        </div>
      </div>`).join('')
    : '<div class="sys-hint">Система не объявляет механик преимущества — и это законно: не во всяком мире они есть.</div>'}
  ${available.length ? `
    <div class="ar-row" style="margin-top:6px">
      <select class="meta-sel" id="adv-add" style="flex:1">
        ${available.map(m => `<option value="${m.id}">${esc(m.label)} — ${esc(m.examples.map(e => e.system).join(', '))}</option>`).join('')}
      </select>
    </div>
    <button class="add-row" onclick="uiToggleMethod(document.getElementById('adv-add').value)">+ механика из справочника</button>`
  : ''}`;
}

// Правила комнаты — СПИСОК ВКЛЮЧЁННЫХ ЭФФЕКТОВ, а не отдельная порода правил.
// На карточке самого эффекта про охват ни слова: он описывает только что
// делает, а включён ли он на всех — вопрос этого списка. Один и тот же эффект
// можно включить здесь и повесить на одного варвара.
function roomRulesBody(room) {
  const passive = Object.entries(state.system.effects || {})
    .filter(([, e]) => activationOf(e) === 'passive');
  const free = passive.filter(([id]) => !room.includes(id));

  return `<div class="sys-hint" style="margin:2px 0 6px">Пассивные эффекты,
      включённые на ВСЕХ чарников мира. Вешать никому не нужно.</div>
    ${room.map(id => {
      const effect = (state.system.effects || {})[id];
      return `<div class="ar-row" style="margin-top:4px">
        <span style="flex:1;font-size:12px">${effect
          ? `${esc(effect.icon || '⚖')} ${esc(effect.label || id)}`
          : `<span style="color:var(--red)">нет такого эффекта: ${esc(id)}</span>`}</span>
        <button class="ar-del" style="position:static" onclick="uiRoomOff('${esc(id)}')">✕</button>
      </div>`;
    }).join('')}
    ${free.length ? `
      <div class="ar-row" style="margin-top:6px">
        <select class="meta-sel" id="room-add" style="flex:1">
          ${free.map(([id, e]) => `<option value="${esc(id)}">${esc(e.label || id)}</option>`).join('')}
        </select>
      </div>
      <button class="add-row" onclick="uiRoomOn(document.getElementById('room-add').value)">+ включить эффект</button>`
      : `<div class="sys-hint">${passive.length
        ? 'Все пассивные эффекты уже включены.'
        : 'Пассивных эффектов в библиотеке нет — включать нечего.'}</div>`}`;
}

// Мишени бросков (attack_roll, save_roll…) — общие, не выведенные из полей.
// Тег стабилен, как у поля: генерируется при создании, шаги правил и модификаторы
// ссылаются только на него, переименование лейбла ничего не ломает.
function rollsSection() {
  const rolls = state.system.rolls || [];
  return `${rolls.map(r => `
      <div class="ar-row" style="margin-top:4px">
        <input value="${esc(r.label)}" placeholder="Лейбл" style="flex:1"
               oninput="uiRenameRoll('${r.tag}',this.value)">
        <button class="ar-del" style="position:static" onclick="uiDeleteRoll('${r.tag}')">✕</button>
      </div>`).join('')}
    <button class="add-row" onclick="uiAddRoll()">+ мишень броска</button>`;
}

// ── правки словарей системы ─────────────────────────────────────────────────

let rollCounter = 0;
function newRollTag() {
  let tag;
  do { tag = `roll_${++rollCounter}`; } while ((state.system.rolls || []).some(r => r.tag === tag));
  return tag;
}

export function addRoll() {
  const rolls = state.system.rolls || (state.system.rolls = []);
  const tag = newRollTag();
  rolls.push({ tag, label: 'Новый бросок' });
  return tag;
}

export function renameRoll(tag, label) {
  const roll = (state.system.rolls || []).find(r => r.tag === tag);
  if (roll) roll.label = label;
}

// Мишень используют модификаторы (правила комнаты и записи компендиума) и
// слот «Мишень модификаторов» шагов правил — тот же принцип защиты, что у
// удаления поля: сослались — не даём унести конвейер в пустоту.
function rollUsage(tag) {
  const mods = allModifiers(state.system, state.compendium);
  if (mods.some(m => m.kind === 'roll' && m.target === tag)) return true;
  return allSteps(state.system).some(step => step.roll && step.roll.check === tag);
}

export function deleteRoll(tag) {
  if (rollUsage(tag)) {
    const label = (state.system.rolls.find(r => r.tag === tag) || {}).label;
    log(`<b>Нельзя удалить «${esc(label)}»:</b> на неё ссылаются правила или записи компендиума`);
    return;
  }
  state.system.rolls = state.system.rolls.filter(r => r.tag !== tag);
}

export function toggleMethod(id) {
  const advantage = state.system.advantage || (state.system.advantage = { methods: {} });
  const methods = advantage.methods || (advantage.methods = {});
  if (methods[id]) delete methods[id]; else methods[id] = true;
}

// Включить и выключить — единственные действия над правилом комнаты.
// Что оно делает, правится там же, где любой другой эффект: в конструкторе.
export function roomOn(effectId) {
  if (!effectId || !(state.system.effects || {})[effectId]) return;
  const room = state.system.room_rules || (state.system.room_rules = []);
  if (!room.includes(effectId)) room.push(effectId);
}

export function roomOff(effectId) {
  state.system.room_rules = (state.system.room_rules || []).filter(id => id !== effectId);
}

// Типы действий. Удаление разрешено только пока на тип никто не ссылается:
// иначе кнопка получила бы бейдж в пустоту.
export function addCost() {
  const types = state.system.action_types || (state.system.action_types = {});
  let n = 1;
  while (types[`cost_${n}`]) n++;
  types[`cost_${n}`] = { label: 'Новый тип', icon: '◆' };
  return `cost_${n}`;
}

export function renameCost(id, label) {
  const type = (state.system.action_types || {})[id];
  if (type) type.label = label;
}

export function deleteCost(id) {
  const used = Object.values(state.system.effects || {}).some(e => e.cost === id);
  if (used) {
    log(`<b>Нельзя удалить тип действия:</b> на него ссылаются эффекты`);
    return;
  }
  delete (state.system.action_types || {})[id];
}
