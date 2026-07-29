// Точка входа. Собирает панели и подвешивает обработчики.
//
// Черновик вызывает обработчики инлайновыми onclick — это его идиома, и мы её
// сохраняем, чтобы диф против reference/index.html читался. Модули так не умеют,
// поэтому нужные функции кладутся в window. В продакшне вместо этого делегирование
// событий на корне — записано в docs/production-differences.md.

import { state, sheet, esc, log } from './state.js';
import * as canvas from './sheet-canvas.js';
import * as formula from './formula-panel.js';
import * as items from './items-tab.js';
import * as effects from './effects-tab.js';
import * as system from './system-tab.js';

export function render() {
  state.brokenModifiers = null;

  document.querySelectorAll('.pane').forEach(p => p.classList.remove('on'));
  document.getElementById('pane-' + state.tab).classList.add('on');
  document.querySelectorAll('.tnav').forEach(b => b.classList.toggle('on', b.dataset.tab === state.tab));

  renderCharList();
  if (state.tab === 'char') {
    canvas.renderCanvas();
    formula.renderFormulaList();
    formula.renderFormulaBox();
  }
  if (state.tab === 'items') items.renderItems();
  if (state.tab === 'fx') effects.renderEffects();
  if (state.tab === 'system') system.renderSystem();

  renderLog();
  renderBanner();
}

function renderCharList() {
  document.getElementById('char-entries').innerHTML = state.sheets.map(s => `
    <div class="char-entry${s.id === state.activeSheetId ? ' on' : ''}" onclick="uiPickSheet('${s.id}')">
      <span class="char-type ${s.id === state.activeSheetId ? 'pc' : 'npc'}">${s.id === state.activeSheetId ? 'ИГ' : 'НПС'}</span>
      <span class="char-name-inp">${esc(s.name)}</span>
    </div>`).join('');
}

function renderLog() {
  const box = document.getElementById('event-log');
  if (!box) return;
  box.innerHTML = state.log.length
    ? state.log.map(line => `<div class="chat-msg" style="border-bottom:1px solid var(--border);padding:6px 0">${line}</div>`).join('')
    : '<div class="char-empty-hint">Броски и события появятся здесь.</div>';
}

function renderBanner() {
  const banner = document.getElementById('banner');
  banner.style.display = state.brokenModifiers ? 'block' : 'none';
  banner.textContent = state.brokenModifiers || '';
}

// ── обработчики, которые черновик зовёт из onclick ──────────────────────────

// Полная перерисовка выбрасывает узел, в котором стоит каретка, — при вводе в поле
// фокус терялся бы на каждой букве. Поэтому у каждого редактируемого поля
// стабильный id, и после перерисовки фокус с кареткой возвращаются на место.
// Это заплатка поверх заведомо наивного render(state); в продакшне перерисовки
// затронутого узла нет вовсе. Записано в docs/production-differences.md.
const redraw = fn => (...args) => {
  const active = document.activeElement;
  const memo = active && active.id ? { id: active.id, start: active.selectionStart } : null;

  fn(...args);
  render();

  // Клик по зависимости сам говорит, куда встала каретка, — иначе после вставки
  // она прыгала бы туда, где стояла до неё.
  if (state.caret != null) {
    const input = document.getElementById('fbox-inp');
    if (input) {
      input.focus();
      input.setSelectionRange(state.caret, state.caret);
    }
    state.caret = null;
    return;
  }

  if (!memo) return;
  const next = document.getElementById(memo.id);
  if (!next) return;
  next.focus();
  if (memo.start == null || !next.setSelectionRange) return;
  try { next.setSelectionRange(memo.start, memo.start); } catch { /* input[type=number] так не умеет */ }
};

Object.assign(window, {
  uiTab: redraw(tab => { state.tab = tab; }),
  uiPickSheet: redraw(id => { state.activeSheetId = id; }),

  // чарник
  uiPickField: redraw(formula.pickField),
  uiRename: redraw(canvas.rename),
  uiSetValue: redraw(canvas.setValue),
  uiToggle: redraw(canvas.toggle),
  uiDelField: redraw(canvas.removeField),
  uiAddField: redraw(canvas.addFieldTo),
  uiSend: redraw(canvas.dispatch),
  uiAddBlock: redraw(type => {
    const refusal = canvas.addBlock(type);
    if (refusal) log(`<b>Не оживлено:</b> ${esc(refusal)}`);
  }),

  // панель формул
  uiInsertDep: redraw(formula.insertDep),
  uiDropPart: redraw(formula.dropPart),
  uiEditFormula: redraw(formula.edit),
  uiAcceptHint: redraw(formula.acceptSuggestion),

  // предметы
  uiPickItem: redraw(id => { state.activeItemId = id; }),
  uiNewItem: redraw(items.newItem),
  uiDelItem: redraw(items.deleteItem),
  uiEquip: redraw(items.equip),
  uiSetItem: redraw(items.setItem),
  uiAddMod: redraw(items.addMod),
  uiDelMod: redraw(items.deleteMod),
  uiSetMod: redraw(items.setMod),

  // эффекты
  uiPickEffect: redraw(id => { state.activeEffectId = id; }),
  uiNewEffect: redraw(effects.newEffect),
  uiDelEffect: redraw(effects.deleteEffect),
  uiHang: redraw(effects.hang),
  uiSetEffect: redraw(effects.setEffect),
  uiSetFxMod: redraw(effects.setFxMod),
  uiPreset: redraw(effects.addPreset),

  // система
  uiToggleMethod: redraw(system.toggleMethod),
  uiAddRule: redraw(system.addRule),
  uiDelRule: redraw(system.deleteRule),
  uiSetRule: redraw(system.setRule),
});

// Стрелки и Enter в поле формулы ведут по списку подсказок.
// Вешается один раз, не внутри перерисовки.
document.addEventListener('keydown', event => {
  if (event.target.id !== 'fbox-inp') return;

  const handled =
    event.key === 'ArrowDown' ? formula.moveSuggestion(1)
      : event.key === 'ArrowUp' ? formula.moveSuggestion(-1)
        : event.key === 'Enter' || event.key === 'Tab' ? formula.acceptSuggestion()
          : event.key === 'Escape' ? (formula.dismissSuggestions(), true)
            : false;

  if (!handled) return;
  event.preventDefault();

  render();
  if (state.caret == null) return;
  const input = document.getElementById('fbox-inp');
  if (input) {
    input.focus();
    input.setSelectionRange(state.caret, state.caret);
  }
  state.caret = null;
});

render();
