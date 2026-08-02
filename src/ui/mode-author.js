// Режим автора: конструктор листа.
//
// Работает БЕЗ персонажа. Ни одного значения на экране — только состав полей,
// их лейблы, формулы и правила комнаты. Результат правки виден у всех
// персонажей этой системы: промежуточного слоя «шаблон листа» в прототипе нет,
// и это записано в docs/production-differences.md.

import { state, esc } from './state.js';
import { renderEditor, exprOf } from './field-editor.js';
import { toDisplay } from './formula-text.js';
import { ADVANTAGE_METHODS } from '../model/advantage-methods.js';
import { DAMAGE_SOURCES } from '../model/damage-sources.js';
import { targets } from '../engine/targets.js';

export function renderAuthor() {
  renderFieldList();
  renderEditor();
  renderRules();
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
  if (f.value.kind === 'table') return `таблица «${f.value.table}» от ${toDisplay(f.value.arg, state.system)}`;
  return toDisplay(exprOf(f), state.system);
}

function renderRules() {
  const settings = state.system.advantage;
  const enabled = ADVANTAGE_METHODS.filter(m => settings.methods[m.id]);
  const rules = state.system.modifiers.filter(m => m.kind === 'roll');
  const rollTargets = targets(state.system).filter(t => t.kind === 'roll');

  document.getElementById('author-rules').innerHTML = `
    ${attackRuleCard()}

    <div class="pal-sec">Механики преимущества</div>
    ${ADVANTAGE_METHODS.map(method => `
      <div class="chk-row${settings.methods[method.id] ? ' on' : ''}" onclick="uiToggleMethod('${method.id}')">
        <div class="chk-box">✓</div>
        <div class="chk-lbl">
          <span style="font-size:11px">${esc(method.label)}</span>
          <span class="info-dot" title="${esc(method.examples.map(e => `${e.system}: ${e.example}`).join('\n'))}">i</span>
        </div>
      </div>`).join('')}

    <div class="pal-sec" style="margin-top:10px">Правила комнаты</div>
    ${rules.map(rule => ruleRow(rule, enabled, rollTargets)).join('')}
    <button class="add-row" onclick="uiAddRule()">+ правило</button>`;
}

// Правило «Атака» — конвейер шагов. Пока редактируется один слот: откуда
// берётся величина урона. Выбор здесь и есть смена модели урона всей системы —
// как и всё в режиме автора, без единого значения на экране.
function attackRuleCard() {
  const slots = ((state.system.rules || {}).attack || {}).damage || {};
  const source = slots.source === undefined ? 'roll' : slots.source;
  const chosen = DAMAGE_SOURCES.find(s => s.id === source);
  const tip = chosen
    ? `${chosen.hint}\n${chosen.examples.map(e => `${e.system}: ${e.example}`).join('\n')}`
    : 'неизвестное значение — движок его отвергнет при броске';

  return `
    <div class="pal-sec">Разрешение атаки</div>
    <div class="auto-rule" style="padding:8px 9px">
      <div class="ar-row" style="font-size:11px;opacity:.7">шаг 1 · Проверка — бросок действия против защиты цели</div>
      <div class="ar-row" style="font-size:11px">шаг 2 · Урон — откуда берётся величина
        <span class="info-dot" title="${esc(tip)}">i</span>
      </div>
      <div class="ar-row">
        <select onchange="uiSetDamageSource(this.value)">
          ${DAMAGE_SOURCES.map(s => `
            <option value="${s.id}"${s.id === source ? ' selected' : ''}>
              ${esc(s.label)} — ${esc(s.examples.map(e => e.system).join(', '))}
            </option>`).join('')}
        </select>
      </div>
      <div class="ar-row" style="font-size:11px;opacity:.7">шаг 3 · Применение — цель считает и применяет к себе</div>
    </div>`;
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

export function toggleMethod(id) {
  const methods = state.system.advantage.methods;
  if (methods[id]) delete methods[id]; else methods[id] = true;
}

export function addRule() {
  state.system.modifiers.push({
    id: 'rule_' + (state.system.modifiers.length + 1),
    label: '', kind: 'roll', target: (state.system.rolls[0] || {}).tag,
    effect: 'advantage', method: 'rerollBest', condition: '',
  });
}

export function deleteRule(index) {
  state.system.modifiers.splice(index, 1);
}

export function setRule(index, key, value) {
  state.system.modifiers[index][key] = value;
}

export function setDamageSource(source) {
  const rules = state.system.rules || (state.system.rules = {});
  const attack = rules.attack || (rules.attack = {});
  attack.damage = { ...(attack.damage || {}), source };
}
