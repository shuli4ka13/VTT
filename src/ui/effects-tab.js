// Вкладка «Эффекты». В черновике эффект был текстом описания механики
// (reference/index.html:351, поле fx-mech-ta) — красиво, но ни на что не влияло.
// Здесь эффект несёт настоящий модификатор породы «правящий бросок»:
// помеха действительно превращает бросок в два кубика с выбором худшего.

import { state, sheet, pass, rollOf, esc } from './state.js';
import { targets } from '../engine/targets.js';
import { ADVANTAGE_METHODS } from '../model/advantage-methods.js';

export function renderEffects() {
  renderList();
  renderEditor();
}

function renderList() {
  const active = new Set(sheet().effects.map(e => e.effectId));
  document.getElementById('fx-list').innerHTML = state.compendium.effects.map(fx => `
    <div class="fx-entry${state.activeEffectId === fx.id ? ' on' : ''}" onclick="uiPickEffect('${fx.id}')">
      <span class="fx-e-icon">${esc(fx.icon || '✦')}</span>
      <span style="flex:1">${esc(fx.label)}</span>
      ${active.has(fx.id) ? '<span class="fx-e-type" style="background:var(--red)"></span>' : ''}
      <button class="fx-e-del" onclick="event.stopPropagation();uiDelEffect('${fx.id}')">✕</button>
    </div>`).join('') || '<div class="char-empty-hint">Эффектов нет.</div>';
}

function renderEditor() {
  const editor = document.getElementById('fx-ed');
  const fx = state.compendium.effects.find(e => e.id === state.activeEffectId);

  if (!fx) {
    editor.innerHTML = '<div class="empty-ed">Выберите эффект слева<br>или создайте новый</div>';
    return;
  }

  const hung = sheet().effects.some(e => e.effectId === fx.id);
  const rollTargets = targets(state.system).filter(t => t.kind === 'roll');
  const mod = fx.modifiers[0] || {};
  const p = pass();

  editor.innerHTML = `
    <div style="display:flex;gap:12px;align-items:flex-start">
      <div class="fx-icon-pick">${esc(fx.icon || '✦')}</div>
      <div style="flex:1">
        <input class="fx-name-inp" id="fx-name" value="${esc(fx.label)}" oninput="uiSetEffect('${fx.id}','label',this.value)">
        <div class="meta-row">
          <button class="hbtn${hung ? ' pr' : ''}" onclick="uiHang('${fx.id}')">
            ${hung ? '✓ Висит на ' + esc(sheet().name) : 'Повесить на ' + esc(sheet().name)}
          </button>
        </div>
      </div>
    </div>

    <div class="pb">
      <div class="pb-lbl">Модификатор броска</div>
      <div class="ar-row" style="display:flex;gap:6px;margin-bottom:6px">
        <select class="meta-sel" style="flex:1" onchange="uiSetFxMod('${fx.id}','target',this.value)">
          ${rollTargets.map(t => `<option value="${t.tag}"${mod.target === t.tag ? ' selected' : ''}>${esc(t.label)}</option>`).join('')}
        </select>
        <select class="meta-sel" onchange="uiSetFxMod('${fx.id}','effect',this.value)">
          <option value="advantage"${mod.effect === 'advantage' ? ' selected' : ''}>Преимущество</option>
          <option value="disadvantage"${mod.effect === 'disadvantage' ? ' selected' : ''}>Помеха</option>
        </select>
      </div>
      <select class="meta-sel" style="width:100%" onchange="uiSetFxMod('${fx.id}','method',this.value)">
        ${ADVANTAGE_METHODS.map(m => `<option value="${m.id}"${mod.method === m.id ? ' selected' : ''}>
          ${esc(m.label)}${m.implemented ? '' : ' — не отыгран в прототипе'}</option>`).join('')}
      </select>
      <div class="sys-hint" style="margin-top:8px">
        Это не число. Два преимущества дают одно преимущество, помеха гасит преимущество целиком.
      </div>
    </div>

    <div class="pb">
      <div class="pb-lbl">Что сейчас у ${esc(sheet().name)}</div>
      ${rollTargets.map(t => {
        const roll = rollOf(t.tag, p);
        return `<div class="mcs-row"><span>${esc(t.label)}</span><span>${word(roll.mode)}</span></div>`;
      }).join('')}
    </div>

    <textarea class="fx-desc-ta" id="fx-desc" placeholder="Описание для игрока…"
      oninput="uiSetEffect('${fx.id}','description',this.value)">${esc(fx.description || '')}</textarea>`;
}

const word = mode =>
  mode === 'advantage' ? 'преимущество' : mode === 'disadvantage' ? 'помеха' : 'обычный';

// ── правки ──────────────────────────────────────────────────────────────────

export function newEffect() {
  const id = 'fx_' + (state.compendium.effects.length + 1);
  const rollTag = (state.system.rolls[0] || {}).tag;
  state.compendium.effects.push({
    id, label: 'Новый эффект', icon: '✦', duration: { kind: 'scene' }, description: '',
    modifiers: [{ kind: 'roll', target: rollTag, effect: 'disadvantage', method: 'rerollBest', condition: null }],
  });
  state.activeEffectId = id;
}

export function addPreset(icon, label, effect, target) {
  const id = 'fx_' + label.toLowerCase().replace(/\s+/g, '_') + '_' + state.compendium.effects.length;
  state.compendium.effects.push({
    id, label, icon, duration: { kind: 'scene' }, description: '',
    modifiers: [{ kind: 'roll', target, effect, method: 'rerollBest', condition: null }],
  });
  state.activeEffectId = id;
}

export function deleteEffect(id) {
  state.compendium.effects = state.compendium.effects.filter(e => e.id !== id);
  for (const s of state.sheets) s.effects = s.effects.filter(e => e.effectId !== id);
  if (state.activeEffectId === id) state.activeEffectId = null;
}

export function hang(id) {
  const current = sheet();
  current.effects = current.effects.some(e => e.effectId === id)
    ? current.effects.filter(e => e.effectId !== id)
    : [...current.effects, { effectId: id }];
}

export function setEffect(id, key, value) {
  state.compendium.effects.find(e => e.id === id)[key] = value;
}

export function setFxMod(id, key, value) {
  const fx = state.compendium.effects.find(e => e.id === id);
  if (!fx.modifiers.length) {
    fx.modifiers.push({ kind: 'roll', target: state.system.rolls[0].tag, effect: 'disadvantage', method: 'rerollBest', condition: null });
  }
  fx.modifiers[0][key] = value;
}
