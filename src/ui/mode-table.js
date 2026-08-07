// Режим «Стол» — минимальный VTT-слой поверх той же машины.
//
// ТОКЕН здесь — фишка: позиция + ссылка на чарник. НЕ персонаж: один чарник
// волен стоять на столе несколькими фишками (омоним «токен» — см. CLAUDE.md).
// Чарник про фишки не знает ничего — они живут в state.board, DTO не трогается.
//
// Главный жест стола: кликнул свою фишку → выбрал действие → кликнул чужую.
// Дальше работает ровно тот же конверт, что и на экране игрока: отправитель
// пакует своё, получатель считает своё, журнал несёт трассу. Стол ничего
// не считает сам — он только выбирает, ЧЕЙ лист с чьим общается.

import { state, esc, log } from './state.js';
import { availableActions } from '../events/envelope.js';
import { exchange } from '../events/exchange.js';
import { describeReport } from './journal.js';
import { online, act as netAct, renderSession } from './net.js';
import { randomDie } from '../engine/dice.js';

export const BOARD = { cols: 12, rows: 8, cell: 56 };

// ── модель фишек ────────────────────────────────────────────────────────────

let counter = 0;
const newTokenId = () => {
  let id;
  do { id = `tok_${++counter}`; } while (state.board.tokens.some(t => t.id === id));
  return id;
};

// Сверка фишек с листами: у каждого листа есть хотя бы одна, фишки удалённых
// листов уходят вслед за ними. Больше ничего не навязывается.
export function ensureTokens() {
  state.board.tokens = state.board.tokens.filter(t => state.sheets.some(s => s.id === t.sheetId));
  for (const sheet of state.sheets) {
    if (!state.board.tokens.some(t => t.sheetId === sheet.id)) {
      const cell = freeCell();
      state.board.tokens.push({ id: newTokenId(), sheetId: sheet.id, x: cell.x, y: cell.y });
    }
  }
}

export function addToken(sheetId) {
  const cell = freeCell();
  const token = { id: newTokenId(), sheetId, x: cell.x, y: cell.y };
  state.board.tokens.push(token);
  return token;
}

export function moveToken(id, x, y) {
  const token = state.board.tokens.find(t => t.id === id);
  if (!token) return;
  token.x = Math.max(0, Math.min(BOARD.cols - 1, Math.round(x)));
  token.y = Math.max(0, Math.min(BOARD.rows - 1, Math.round(y)));
}

function freeCell() {
  for (let y = 1; y < BOARD.rows; y += 2) {
    for (let x = 1; x < BOARD.cols; x += 2) {
      if (!state.board.tokens.some(t => t.x === x && t.y === y)) return { x, y };
    }
  }
  return { x: 0, y: 0 };
}

const sheetOf = token => state.sheets.find(s => s.id === token.sheetId) || null;
const tokenById = id => state.board.tokens.find(t => t.id === id) || null;

// ── отрисовка ───────────────────────────────────────────────────────────────

export function renderTable() {
  ensureTokens();
  if (state.table.selected && !tokenById(state.table.selected)) {
    state.table.selected = null;
    state.table.action = null;
  }
  renderBoard();
  renderSide();
}

function renderBoard() {
  const host = document.getElementById('table-board');
  const targeting = !!state.table.action;

  host.style.width = `${BOARD.cols * BOARD.cell}px`;
  host.style.height = `${BOARD.rows * BOARD.cell}px`;
  host.classList.toggle('targeting', targeting);

  host.innerHTML = state.board.tokens.map(token => {
    const sheet = sheetOf(token);
    const twins = state.board.tokens.filter(t => t.sheetId === token.sheetId).length;
    return `<div class="vtt-token ${sheet.kind}${token.id === state.table.selected ? ' sel' : ''}"
      data-id="${token.id}"
      style="left:${token.x * BOARD.cell}px;top:${token.y * BOARD.cell}px"
      title="${esc(sheet.name)}${twins > 1 ? ' (фишек: ' + twins + ')' : ''}">
      <span>${esc((sheet.name || '?').slice(0, 1))}</span>
      <em>${esc(sheet.name)}</em>
    </div>`;
  }).join('');

  bindBoard(host);
}

function renderSide() {
  const host = document.getElementById('table-side');
  const token = tokenById(state.table.selected);

  if (!token) {
    host.innerHTML = renderSession() + `<div class="sys-hint" style="padding:8px">
      Кликните фишку — её лист станет отправителем.<br><br>
      Стол ничего не считает: он лишь решает, чей чарник с чьим общается.
      Правила общения задал автор системы.</div>`;
    return;
  }

  const sheet = sheetOf(token);
  const usable = availableActions(sheet, { system: state.system, compendium: state.compendium });

  host.innerHTML = renderSession() + `
    <div class="cs-block" style="background:var(--s2);padding:8px 10px">
      <div style="font-size:13px;font-weight:600">${esc(sheet.name)}</div>
      <div class="blk-type" style="margin:0">${sheet.kind === 'pc' ? 'персонаж игрока' : 'НПС ведущего'}</div>
    </div>

    ${state.table.action ? `
      <div class="auto-rule" style="padding:8px 9px;border-color:var(--accent)">
        <div style="font-size:12px;margin-bottom:4px">⌖ ${esc((usable.find(a => a.id === state.table.action) || {}).label || '')}</div>
        <div class="sys-hint">Кликните фишку цели. Свою вторую фишку тоже можно — лечение по себе законно.</div>
        <button class="add-row" onclick="uiTblCancel()">отмена</button>
      </div>`
    : `
      <div class="pal-sec">Действия</div>
      ${usable.length
        ? usable.map(a => `<button class="die-o" style="display:block;width:100%;text-align:left;margin-bottom:4px"
            onclick="uiTblAction('${a.id}')">⚄ ${esc(a.label)}</button>`).join('')
        : '<div class="sys-hint">Нечего применить: ни надетых предметов с активностями, ни выученных действий.</div>'}`}

    <div class="pal-sec" style="margin-top:10px">Фишки</div>
    <button class="add-row" onclick="uiTokAdd('${sheet.id}')">+ ещё фишка этого персонажа</button>
    <div class="sys-hint">Один чарник — сколько угодно фишек: отряд культистов ходит по одному листу.</div>

    <button class="add-row" style="margin-top:10px" onclick="uiTblOpenSheet('${sheet.id}')">открыть лист →</button>`;
}

// ── жесты: клик выбирает, клик по чужой фишке при взведённом действии бьёт,
//    перетаскивание двигает. Драг отличается от клика порогом в 6px. ─────────

function bindBoard(host) {
  if (host.dataset.bound) return;
  host.dataset.bound = '1';

  let drag = null;

  host.addEventListener('pointerdown', e => {
    const el = e.target.closest('.vtt-token');
    if (!el) return;
    drag = {
      id: el.dataset.id, el,
      startX: e.clientX, startY: e.clientY,
      origLeft: el.offsetLeft, origTop: el.offsetTop,
      moved: false,
    };
    el.setPointerCapture(e.pointerId);
  });

  host.addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < 6) return;
    drag.moved = true;
    drag.el.style.left = `${drag.origLeft + dx}px`;
    drag.el.style.top = `${drag.origTop + dy}px`;
  });

  host.addEventListener('pointerup', () => {
    if (!drag) return;
    const { id, el, moved } = drag;
    drag = null;
    if (moved) {
      window.uiTokMove(id, el.offsetLeft / BOARD.cell, el.offsetTop / BOARD.cell);
    } else {
      window.uiTokClick(id);
    }
  });
}

// ── жесты → намерения ───────────────────────────────────────────────────────

export function clickToken(id) {
  const { selected, action } = state.table;
  if (action && selected && id !== selected) {
    strike(selected, action, id);
    return;
  }
  state.table.selected = id;
  state.table.action = null;
}

export function armAction(actionId) {
  state.table.action = actionId;
}

export function cancelAction() {
  state.table.action = null;
}

export function openSheet(sheetId) {
  state.activeSheetId = sheetId;
  state.mode = 'player';
}

// Само «общение чарников»: фишки только выбрали пару листов, дальше — тот же
// конверт, что и всюду. Отправитель не считает за цель; считает получатель.
function strike(fromTokenId, actionId, targetTokenId) {
  const from = sheetOf(tokenById(fromTokenId));
  const target = sheetOf(tokenById(targetTokenId));

  // Онлайн ход — только НАМЕРЕНИЕ: правило исполнит сервер своими костями,
  // свежий срез приедет всем по SSE. Клиент за цель не считает ничего.
  if (online()) {
    netAct(actionId, from.id, target.id);
    state.table.action = null;
    return;
  }

  const before = state.sheets;
  try {
    const { sheets, reports } = exchange({
      system: state.system, compendium: state.compendium, die: randomDie,
      sheets: before, actionId, fromId: from.id, toId: target.id,
    });
    state.sheets = sheets;
    for (const { fromId, toId, report } of reports) {
      log(describeReport(byId(before, fromId), byId(before, toId), report));
    }
  } catch (err) {
    log(`<b style="color:var(--red)">Ошибка:</b> ${esc(err.message)}`);
  }
  state.table.action = null;
}

const byId = (sheets, id) => sheets.find(s => s.id === id) || { name: id };
