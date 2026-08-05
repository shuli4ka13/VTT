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
import { renderRuleList, renderRuleCanvas, renderStepPalette } from './rule-editor.js';
import { renderKindList, renderKindEditor, renderKindTemplates } from './records-editor.js';
import { blockTemplatesHtml, ruleTemplatesHtml } from './templates.js';
import { targets } from '../engine/targets.js';

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
    document.getElementById('rules-palette').insertAdjacentHTML('beforeend', ruleTemplatesHtml());
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

// Механики преимущества: СЛОВАРЬ — межсистемный справочник, а какие механики
// СУЩЕСТВУЮТ в этом мире — объявляет система (system.advantage.methods).
// Рисуем объявленное; справочник — только как источник для добавления.
// У киберпанка здесь честно пусто: днд-преимущество ему не навязано.
function dictionariesHtml() {
  const enabled = enabledMethods(state.system);
  const available = ADVANTAGE_METHODS.filter(m => !enabled.includes(m));
  const rules = (state.system.modifiers || []).filter(m => m.kind === 'roll');
  const rollTargets = targets(state.system).filter(t => t.kind === 'roll');

  return `
    <div class="pal-sec" style="margin-top:12px">Мишени бросков — объявлены системой</div>
    ${rollsSection()}

    <div class="pal-sec" style="margin-top:10px">Механики преимущества — объявлены системой</div>
    ${enabled.length
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
      <button class="add-row" onclick="uiToggleMethod(document.getElementById('adv-add').value)">+ механика из справочника</button>
      <div class="sys-hint">Справочник межсистемный; что из него существует в вашем мире — решаете вы.</div>`
    : ''}

    <div class="pal-sec" style="margin-top:10px">Правила комнаты — условные модификаторы на всех</div>
    ${rules.map(rule => ruleRow(rule, enabled, rollTargets)).join('')}
    ${rollTargets.length ? '<button class="add-row" onclick="uiAddRule()">+ правило</button>'
      : '<div class="sys-hint">В системе нет мишеней бросков — правилам комнаты не на что вешаться.</div>'}`;
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

function ruleRow(rule, enabled, rollTargets) {
  const index = state.system.modifiers.indexOf(rule);
  return `<div class="auto-rule" style="padding:8px 9px">
    <button class="ar-del" onclick="uiDelRule(${index})">×</button>
    <div class="ar-row">
      <input id="rule-${index}-label" value="${esc(rule.label || '')}" placeholder="Ярлык"
             oninput="uiSetRule(${index},'label',this.value)">
    </div>
    <div class="ar-row">
      <input class="ar-cond" id="rule-${index}-cond" value="${esc(rule.condition || '')}"
             placeholder="условие, напр. #armor_heavy"
             oninput="uiSetRule(${index},'condition',this.value)">
    </div>
    <div class="ar-row">
      <select class="ar-tag" onchange="uiSetRule(${index},'effect',this.value)">
        <option value="advantage"${rule.effect === 'advantage' ? ' selected' : ''}>Преимущество</option>
        <option value="disadvantage"${rule.effect === 'disadvantage' ? ' selected' : ''}>Помеха</option>
      </select>
      <select onchange="uiSetRule(${index},'target',this.value)">
        ${rollTargets.map(t => `<option value="${t.tag}"${rule.target === t.tag ? ' selected' : ''}>${esc(t.label)}</option>`).join('')}
      </select>
    </div>
    <select style="margin-top:5px" onchange="uiSetRule(${index},'method',this.value)">
      ${enabled.length
        ? enabled.map(m => `<option value="${m.id}"${rule.method === m.id ? ' selected' : ''}>${esc(m.label)}</option>`).join('')
        : '<option>— включите механику выше —</option>'}
    </select>
  </div>`;
}

// ── правки правил комнаты ───────────────────────────────────────────────────

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
  const mods = [
    ...(state.system.modifiers || []),
    ...state.compendium.items.flatMap(r => r.modifiers || []),
    ...state.compendium.effects.flatMap(r => r.modifiers || []),
  ];
  if (mods.some(m => m.kind === 'roll' && m.target === tag)) return true;
  return Object.values(state.system.rules || {}).some(rule =>
    (rule.steps || []).some(step => step.roll && step.roll.check === tag));
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

export function addRule() {
  if (!state.system.modifiers) state.system.modifiers = [];
  const method = enabledMethods(state.system)[0];
  state.system.modifiers.push({
    id: 'rule_' + (state.system.modifiers.length + 1),
    label: '', kind: 'roll', target: ((state.system.rolls || [])[0] || {}).tag,
    effect: 'advantage', method: method ? method.id : '', condition: '',
  });
}

export function deleteRule(index) {
  state.system.modifiers.splice(index, 1);
}

export function setRule(index, key, value) {
  state.system.modifiers[index][key] = value;
}
