// Точка входа. Собирает режимы и подвешивает обработчики.
//
// Черновик зовёт обработчики инлайновыми onclick — это его идиома, и мы её
// сохраняем, чтобы диф против reference/index.html читался. Модули так не умеют,
// поэтому нужные функции кладутся в window. В продакшне вместо этого делегирование
// событий на корне — записано в docs/production-differences.md.
//
// Граница режимов проведена не стилями, а импортами: mode-player.js не знает
// ни одной функции, которая правит состав полей системы.

import { state, MODES, esc, log } from './state.js';
import * as author from './mode-author.js';
import * as editor from './field-editor.js';
import * as player from './mode-player.js';
import * as compendium from './mode-compendium.js';
import * as formula from './formula-input.js';

export function render() {
  state.brokenModifiers = null;

  document.querySelectorAll('.pane').forEach(p => p.classList.remove('on'));
  document.getElementById('pane-' + state.mode).classList.add('on');
  document.querySelectorAll('.tnav').forEach(b => b.classList.toggle('on', b.dataset.mode === state.mode));
  document.getElementById('mode-badge').textContent = MODES[state.mode].badge;
  document.body.dataset.mode = state.mode;

  if (state.mode === 'author') author.renderAuthor();
  if (state.mode === 'player') player.renderPlayer();
  if (state.mode === 'compendium') compendium.renderCompendium();

  renderLog();
  renderBanner();
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

// Полная перерисовка выбрасывает узел, в котором стоит каретка. Поэтому у каждого
// редактируемого поля стабильный id, и после перерисовки фокус с кареткой
// возвращаются на место. Заплатка поверх заведомо наивного render(state).
const redraw = fn => (...args) => {
  const active = document.activeElement;
  const memo = active && active.id ? { id: active.id, start: active.selectionStart } : null;

  // Обработчик волен сказать «ничего не изменилось» — тогда и перерисовывать
  // нечего. Это не оптимизация: без неё фокус в уже активном поле запускал бы
  // перерисовку, а та — снова фокус.
  if (fn(...args) === false) return;

  render();
  restoreCaret(memo);
};

function restoreCaret(memo) {
  // Подсказка и чипсы сами говорят, в каком слоте и куда встала каретка.
  if (state.caret) {
    // Забираем и обнуляем ДО фокуса: focus() синхронно дёргает onfocus,
    // тот перерисовывает, и вложенный вызов затрёт state.caret под нами.
    const { key, at } = state.caret;
    state.caret = null;

    const input = document.getElementById('fi-' + key);
    if (input) {
      input.focus();
      input.setSelectionRange(at, at);
    }
    return;
  }

  if (!memo) return;
  const next = document.getElementById(memo.id);
  if (!next) return;
  next.focus();
  if (memo.start == null || !next.setSelectionRange) return;
  try { next.setSelectionRange(memo.start, memo.start); } catch { /* input[type=number] так не умеет */ }
}

Object.assign(window, {
  uiMode: redraw(mode => { state.mode = mode; }),

  // ── режим автора: состав полей и правила комнаты ──
  uiPickField: redraw(editor.pickField),
  uiRename: redraw(editor.rename),
  uiSetGroup: redraw(editor.setGroup),
  uiSetType: redraw(editor.setType),
  uiToggleRoll: redraw(editor.toggleRoll),
  uiSetRollLabel: redraw(editor.setRollLabel),
  uiAddField: redraw(editor.addField),
  uiAddGroup: redraw(editor.addGroup),
  uiDelField: redraw(editor.removeField),
  // ── общий редактор формул: поля системы, значения и условия модификаторов ──
  uiFormulaFocus: redraw(formula.focusSlot),
  uiFormulaEdit: redraw(formula.edit),
  uiFormulaAccept: redraw(formula.accept),
  uiFormulaDep: redraw(formula.insertDep),
  uiFormulaDrop: redraw(formula.dropPart),
  uiToggleMethod: redraw(author.toggleMethod),
  uiAddRule: redraw(author.addRule),
  uiDelRule: redraw(author.deleteRule),
  uiSetRule: redraw(author.setRule),

  // ── режим игрока: значения и принадлежности ──
  uiPickSheet: redraw(player.pickSheet),
  uiNewSheet: redraw(player.newSheet),
  uiRenameSheet: redraw(player.renameSheet),
  uiDelSheet: redraw(player.deleteSheet),
  uiSetValue: redraw(player.setValue),
  uiToggle: redraw(player.toggle),
  uiEquip: redraw(player.equip),
  uiHang: redraw(player.hang),
  uiLearn: redraw(player.learn),
  uiCreate: redraw(player.create),
  uiSend: redraw(player.dispatch),

  // ── компендиум ──
  uiPickRecord: redraw(compendium.pickRecord),
  uiNewRecord: redraw(compendium.createRecord),
  uiDelRecord: redraw(compendium.deleteRecord),
  uiSetRecord: redraw(compendium.setRecord),
  uiAddMod: redraw(compendium.addMod),
  uiDelMod: redraw(compendium.deleteMod),
  uiSetMod: redraw(compendium.setMod),
  uiSetEnvelope: redraw(compendium.setEnvelope),
});

// Стрелки и Enter в поле формулы ведут по списку подсказок.
document.addEventListener('keydown', event => {
  if (!String(event.target.id).startsWith('fi-')) return;
  const key = event.target.id.slice(3);

  const handled =
    event.key === 'ArrowDown' ? formula.move(key, 1)
      : event.key === 'ArrowUp' ? formula.move(key, -1)
        : event.key === 'Enter' || event.key === 'Tab' ? formula.accept(key)
          : event.key === 'Escape' ? formula.dismiss(key)
            : false;

  if (!handled) return;
  event.preventDefault();
  render();
  restoreCaret(null);
});

render();
