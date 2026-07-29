// Вкладка «Система»: механики преимущества и правила комнаты.
//
// Карточка механик — данные черновика как есть, это его самая ценная часть:
// семь механик с примерами из пятнадцати систем. Разница в правилах: в черновике
// условие сохранялось и нигде не вычислялось (reference/index.html:1929).
// Здесь оно разбирается парсером и считается по активному чарнику на глазах.

import { state, sheet, pass, rollOf, esc } from './state.js';
import { ADVANTAGE_METHODS } from '../model/advantage-methods.js';
import { targets } from '../engine/targets.js';
import { compile } from '../formula/index.js';
import { calc } from '../engine/calc.js';
import { toDisplay } from './formula-text.js';

export function renderSystem() {
  renderAdvantage();
  renderTargets();
}

function renderAdvantage() {
  const settings = state.system.advantage;
  const enabled = ADVANTAGE_METHODS.filter(m => settings.methods[m.id]);
  const rules = state.system.modifiers.filter(m => m.kind === 'roll');

  document.getElementById('sys-adv').innerHTML = `
    <div class="sys-card-hdr"><h2>Преимущества / Помехи</h2><span class="sys-hint">Можно выбрать несколько</span></div>
    <div class="sys-sub">Механики, доступные в комнате</div>
    ${ADVANTAGE_METHODS.map(method => `
      <div class="chk-row${settings.methods[method.id] ? ' on' : ''}" onclick="uiToggleMethod('${method.id}')">
        <div class="chk-box">✓</div>
        <div class="chk-lbl">
          <span>${esc(method.label)}</span>
          <span class="info-dot" title="${esc(method.examples.map(e => `${e.system}: ${e.example}`).join('\n'))}">i</span>
          ${method.implemented ? '' : '<span class="sys-hint">объявлена, в прототипе не отыгрывается</span>'}
        </div>
      </div>`).join('')}
    <div class="sys-hint" style="margin-top:8px">
      Отыгран пока один способ — переброс с выбором лучшего или худшего. Остальные шесть
      объявлены, чтобы стало видно: «преимущество» это не одна механика, а семейство,
      и числом оно не выражается.
    </div>

    <div class="sys-divider"></div>
    <div class="sys-sub-row">
      <span>Правила комнаты</span>
      <button class="sys-add-btn" onclick="uiAddRule()">+ Правило</button>
    </div>
    <div class="sys-hint" style="margin-bottom:10px">
      Ярлык + условие → эффект применяется сам, без предметов и эффектов.
      Условие вычисляется прямо сейчас по чарнику <b>${esc(sheet().name)}</b>.
    </div>
    ${rules.length
      ? rules.map(rule => ruleRow(rule, enabled)).join('')
      : '<div class="sys-hint">Пока нет правил.</div>'}`;
}

function ruleRow(rule, enabled) {
  const index = state.system.modifiers.indexOf(rule);
  const rollTargets = targets(state.system).filter(t => t.kind === 'roll');

  return `<div class="auto-rule">
    <button class="ar-del" onclick="uiDelRule(${index})">×</button>
    <div class="ar-row">
      <input id="rule-${index}-label" value="${esc(rule.label || '')}" placeholder="Ярлык — напр. «Атака не той рукой»"
             oninput="uiSetRule(${index},'label',this.value)">
    </div>
    <div class="ar-row">
      <input class="ar-cond" id="rule-${index}-cond" value="${esc(rule.condition || '')}" placeholder="условие, напр. #armor_heavy"
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
      <select onchange="uiSetRule(${index},'method',this.value)">
        ${enabled.length
          ? enabled.map(m => `<option value="${m.id}"${rule.method === m.id ? ' selected' : ''}>${esc(m.label)}</option>`).join('')
          : '<option>— включите механику выше —</option>'}
      </select>
    </div>
    <div class="sys-hint" style="margin-top:7px">
      <span style="font-family:Consolas,monospace;color:var(--blue)">${esc(toDisplay(rule.condition || '', state.system))}</span>
      → ${verdictOf(rule.condition)}
    </div>
  </div>`;
}

function renderTargets() {
  const p = pass();
  document.getElementById('sys-targets').innerHTML = `
    <div class="sys-card-hdr"><h2>Словарь мишеней</h2><span class="sys-hint">выводится, не хранится</span></div>
    <div class="sys-hint" style="margin-bottom:14px">
      Список того, на что могут ссылаться эффекты и бонусы предметов, нигде не задан
      отдельно — он собран из объявленных в системе тегов. Добавьте поле на вкладке
      «Чарники», и оно появится здесь само. У Foundry этот список задан кодом системы,
      поэтому там своё поле без программиста не завести.
    </div>
    <div class="sys-sub">Поля — мишени для бонусов</div>
    <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:14px">
      ${targets(state.system).filter(t => t.kind === 'value')
        .map(t => `<span class="dep-tog">${esc(t.label)}</span>`).join('')}
    </div>
    <div class="sys-sub">Броски — мишени для преимущества и помехи</div>
    ${targets(state.system).filter(t => t.kind === 'roll').map(t => {
      const roll = rollOf(t.tag, p);
      const sources = roll.sources.map(s => esc(s.label)).join(', ');
      return `<div class="mcs-row">
        <span>${esc(t.label)}</span>
        <span style="color:${roll.mode === 'normal' ? 'var(--muted)' : 'var(--accent)'}">
          ${modeWord(roll.mode)}${sources ? ` <span class="sys-hint">(${sources})</span>` : ''}
        </span>
      </div>`;
    }).join('')}`;
}

const modeWord = mode =>
  mode === 'advantage' ? 'преимущество' : mode === 'disadvantage' ? 'помеха' : 'обычный';

function verdictOf(condition) {
  if (!condition || !condition.trim()) return '<span style="color:var(--muted)">условия нет — действует всегда</span>';
  try {
    const p = pass();
    const value = compile(condition).evaluate(tag => calc(state.system, sheet(), tag, p));
    if (typeof value !== 'boolean') {
      return `<span style="color:var(--yellow)">условие должно быть логическим, а даёт ${esc(String(value))}</span>`;
    }
    return value
      ? '<span style="color:var(--green)">срабатывает</span>'
      : '<span style="color:var(--muted)">не срабатывает</span>';
  } catch (err) {
    return `<span style="color:var(--red)">${esc(err.message)}</span>`;
  }
}

// ── правки ──────────────────────────────────────────────────────────────────

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
  const rule = state.system.modifiers[index];
  rule[key] = key === 'condition' ? value : value;
}
