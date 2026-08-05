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
import * as ruleEditor from './rule-editor.js';
import * as player from './mode-player.js';
import * as compendium from './mode-compendium.js';
import * as table from './mode-table.js';
import * as recordsEditor from './records-editor.js';
import * as formula from './formula-input.js';
import { packWorld, unpackWorld } from './world.js';
import * as net from './net.js';

// Один main.js на оба приложения: страница объявляет свой стартовый режим
// атрибутом (constructor.html — автор, vtt.html — стол), а какие режимы
// вообще доступны, решает её разметка — кнопок чужих режимов там просто нет.
state.mode = document.body.dataset.start || state.mode;

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
  if (state.mode === 'table') table.renderTable();

  renderLog();
  renderBanner();
}

// Журнал один на программу; экранов у него два — игрок и стол.
function renderLog() {
  const html = state.log.length
    ? state.log.map(line => `<div class="chat-msg" style="border-bottom:1px solid var(--border);padding:6px 0">${line}</div>`).join('')
    : '<div class="char-empty-hint">Броски и события появятся здесь.</div>';
  for (const id of ['event-log', 'table-log']) {
    const box = document.getElementById(id);
    if (box) box.innerHTML = html;
  }
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

// ── мир одним файлом: мост между конструктором и игровым столом ─────────────
// Выгрузка/загрузка {system, compendium, sheets} как JSON. Это критерий №1,
// возведённый в интерфейс; в полноценной версии здесь встанет сервис с БД,
// формат файла останется публичным контрактом.

function worldExport() {
  const blob = new Blob([packWorld(state)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'мир.json';
  a.click();
  URL.revokeObjectURL(a.href);
  log('Мир выгружен файлом <b>мир.json</b> — его откроет второе приложение.');
  return false; // состояние не менялось — перерисовка не нужна
}

async function worldImport(file) {
  if (!file) return;
  let world;
  try {
    world = unpackWorld(await file.text());
  } catch (err) {
    log(`<b style="color:var(--red)">Мир не загружен:</b> ${esc(err.message)}`);
    render();
    return;
  }
  state.system = world.system;
  state.compendium = world.compendium;
  state.sheets = world.sheets;
  // Всё выбранное принадлежало прошлому миру.
  state.activeSheetId = (state.sheets[0] || {}).id || null;
  state.activeTag = null;
  state.activeRuleId = null;
  state.activeKindId = null;
  state.activeRecordId = null;
  state.board.tokens = [];
  state.table.selected = null;
  state.table.action = null;
  log(`Загружен мир: <b>${esc(world.system.name || world.system.id || 'без имени')}</b> · чарников: ${state.sheets.length}.`);
  render();
}

// Асинхронные сетевые обработчики сами дорисовывают экран по завершении.
const rerender = () => { render(); restoreCaret(null); };
const netcall = fn => async (...args) => { await fn(...args); rerender(); };

Object.assign(window, {
  uiMode: redraw(mode => { state.mode = mode; }),
  uiWorldExport: redraw(worldExport),
  uiWorldImport: worldImport, // асинхронный: сам зовёт render, redraw не годится
  uiRerender: rerender,       // для SSE: пришёл срез комнаты — перерисоваться

  // ── сеанс со стендовым сервером ──
  uiNetLogin: netcall(() => net.loginAs(document.getElementById('net-name').value)),
  uiNetPublish: netcall(net.publish),
  uiNetCreateRoom: netcall(net.createRoom),
  uiNetJoin: netcall(net.enterRoom),

  // ── режим автора: состав полей и правила комнаты ──
  uiAuthorView: redraw(author.setAuthorView),
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
  uiRenameSystem: redraw(author.renameSystem),
  uiAddRoll: redraw(author.addRoll),
  uiRenameRoll: redraw(author.renameRoll),
  uiDeleteRoll: redraw(author.deleteRoll),
  // ── конструктор правил разрешения: карточки шагов из реестра ──
  uiRulePick: redraw(ruleEditor.pickRule),
  uiRuleAdd: redraw(ruleEditor.addRule),
  uiRuleDelete: redraw(ruleEditor.deleteRule),
  uiRuleRename: redraw(ruleEditor.renameRule),
  uiRuleParamAdd: redraw(ruleEditor.addParam),
  uiRuleParamDel: redraw(ruleEditor.deleteParam),
  uiRuleParamSet: redraw(ruleEditor.setParam),
  uiRuleAddStep: redraw(ruleEditor.addStep),
  uiRuleDelStep: redraw(ruleEditor.deleteStep),
  uiRuleSlot: redraw(ruleEditor.setSlot),
  uiRuleSlotRef: redraw(ruleEditor.setSlotRef),
  uiRuleSlotConst: redraw(ruleEditor.setSlotConst),
  uiRuleSlotExpr: redraw(ruleEditor.setSlotExpr),
  uiLeadDie: redraw(ruleEditor.setLeadDie),
  uiConstAdd: redraw(ruleEditor.addConstant),
  uiConstRename: redraw(ruleEditor.renameConstant),
  uiConstDelete: redraw(ruleEditor.deleteConstant),
  // ── редактор родов записей: что вообще бывает в компендиуме ──
  uiKindPick: redraw(recordsEditor.pickKind),
  uiKindAdd: redraw(recordsEditor.addKind),
  uiKindDel: redraw(recordsEditor.deleteKind),
  uiKindSet: redraw(recordsEditor.setKind),
  uiKindRename: redraw((rk, v) => recordsEditor.setKind(rk, 'label', v)),
  uiKindPropAdd: redraw(recordsEditor.addProp),
  uiKindPropDel: redraw(recordsEditor.deleteProp),
  uiKindPropSet: redraw(recordsEditor.setProp),
  uiKindCopy: redraw(recordsEditor.copyKindFrom),

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

  // ── стол: фишки выбирают, ЧЕЙ лист с чьим общается ──
  uiTokClick: redraw(table.clickToken),
  uiTokMove: redraw(table.moveToken),
  uiTokAdd: redraw(table.addToken),
  uiTblAction: redraw(table.armAction),
  uiTblCancel: redraw(table.cancelAction),
  uiTblOpenSheet: redraw(table.openSheet),

  // ── компендиум ──
  uiPickRecord: redraw(compendium.pickRecord),
  uiNewRecord: redraw(compendium.createRecord),
  uiDelRecord: redraw(compendium.deleteRecord),
  uiSetRecord: redraw(compendium.setRecord),
  uiAddMod: redraw(compendium.addMod),
  uiDelMod: redraw(compendium.deleteMod),
  uiSetMod: redraw(compendium.setMod),
  uiSetEffectRule: redraw(compendium.setEffectRule),
  uiSetEffectParam: redraw(compendium.setEffectParam),
  uiSetWeapon: redraw(compendium.setWeapon),
  uiSetWeaponProp: redraw(compendium.setWeaponProp),
  uiItemActAdd: redraw(compendium.addActivity),
  uiItemActDel: redraw(compendium.deleteActivity),
  uiItemActSet: redraw(compendium.setActivity),
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
