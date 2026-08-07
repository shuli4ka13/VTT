// Клиент стендового сервера. Оффлайн-режим никуда не девается: без входа
// приложение работает как раньше, всё в памяти. После входа и вступления
// в комнату истина переезжает на сервер:
//   · ход со стола уходит НАМЕРЕНИЕМ (действие, от какого листа, по какому),
//     сервер исполняет правило сам и своими костями;
//   · правка значения листа уходит на сервер, у себя — оптимистично;
//   · комната присылает свежий срез по SSE — журнал и листы у всех одинаковые.

import { state, esc, log } from './state.js';
import { describeReport } from './journal.js';
import { packWorld } from './world.js';

async function call(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(state.net.token ? { Authorization: `Bearer ${state.net.token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `сервер ответил ${res.status}`);
  return data;
}

export const online = () => !!state.net.roomId;

// ── вход ─────────────────────────────────────────────────────────────────────

export async function loginAs(name) {
  try {
    const { token, me } = await call('POST', '/api/login', { name });
    state.net.token = token;
    state.net.me = me;
    log(`Вошли: <b>${esc(me.name)}</b>. Кто вы за столом — решит то, что вы создадите.`);
    await refreshLists();

    // Пришли по ссылке-приглашению? Сразу в комнату, как у Foundry и Owlbear.
    const invited = (location.hash.match(/room=([\w-]+)/) || [])[1];
    if (invited) await enterRoom(invited);
  } catch (err) {
    log(`<b style="color:var(--red)">Вход не удался:</b> ${esc(err.message)}`);
  }
}

export async function refreshLists() {
  if (!state.net.token) return;
  try {
    state.net.worlds = await call('GET', '/api/worlds');
    state.net.rooms = await call('GET', '/api/rooms');
  } catch (err) {
    log(`<b style="color:var(--red)">Сервер:</b> ${esc(err.message)}`);
  }
}

// ── публикация мира (из конструктора) ───────────────────────────────────────

export async function publish() {
  try {
    const name = (state.system.name || state.system.id || 'Мир') + '';
    await call('POST', '/api/worlds', { name, world: JSON.parse(packWorld(state)) });
    log(`Мир <b>${esc(name)}</b> опубликован на сервере — партия может создать по нему комнату.`);
  } catch (err) {
    log(`<b style="color:var(--red)">Публикация:</b> ${esc(err.message)}`);
  }
}

// ── комнаты ──────────────────────────────────────────────────────────────────

export async function createRoom(worldId) {
  try {
    const room = await call('POST', '/api/rooms', { worldId });
    await enterRoom(room.id);
  } catch (err) {
    log(`<b style="color:var(--red)">Комната:</b> ${esc(err.message)}`);
  }
}

export async function enterRoom(roomId, sheetId = null) {
  try {
    await call('POST', `/api/rooms/${roomId}/join`, { sheetId });
    state.net.roomId = roomId;
    state.net.mySheetId = sheetId;
    location.hash = 'room=' + roomId; // адрес комнаты = приглашение
    applyRoomState(await call('GET', `/api/rooms/${roomId}/state`));
    subscribe(roomId);
    log(`Вы в комнате${sheetId ? ` · ваш лист: <b>${esc(sheetId)}</b>` : ''}. Истина теперь на сервере.`);
  } catch (err) {
    log(`<b style="color:var(--red)">Вступление:</b> ${esc(err.message)}`);
  }
}

function subscribe(roomId) {
  if (state.net.stream) state.net.stream.close();
  const stream = new EventSource(`/api/rooms/${roomId}/events?t=${state.net.token}`);
  stream.addEventListener('state', event => {
    applyRoomState(JSON.parse(event.data));
    window.uiRerender();
  });
  state.net.stream = stream;
}

// Комната — источник правды: система, компендиум, листы и журнал приезжают
// целиком (стендовая простота; диффы — этап «Комнаты» плана).
function applyRoomState(room) {
  state.system = room.system;
  state.compendium = room.compendium;
  state.sheets = room.sheets;
  state.net.members = room.members;
  if (!state.sheets.some(s => s.id === state.activeSheetId)) {
    state.activeSheetId = (state.sheets[0] || {}).id || null;
  }

  // Журнал сеанса строится из серверного журнала — у всех одинаковый.
  // Ход — это не одна запись, а цепочка: конверт плюс ответки триггеров.
  const named = id => state.sheets.find(s => s.id === id) || { name: id || '?' };
  state.log = room.journal.map(entry => {
    const head = `<span style="color:var(--muted)">#${entry.seq} · ${esc(entry.by)}</span>`;
    const lines = (entry.reports || []).map(({ fromId, toId, report }) =>
      describeReport(named(fromId), named(toId), report));
    return [head, ...lines].join('<br>');
  });
}

// ── игровые намерения ────────────────────────────────────────────────────────

export async function act(actionId, fromSheetId, targetSheetId) {
  try {
    await call('POST', `/api/rooms/${state.net.roomId}/act`, { actionId, fromSheetId, targetSheetId });
    // Ответ не применяем: свежий срез придёт всем по SSE, включая нас.
  } catch (err) {
    log(`<b style="color:var(--red)">Сервер отказал:</b> ${esc(err.message)}`);
    window.uiRerender();
  }
}

export async function patchSheet(sheetId, values) {
  try {
    await call('PATCH', `/api/rooms/${state.net.roomId}/sheets/${sheetId}`, { values });
  } catch (err) {
    log(`<b style="color:var(--red)">Сервер отказал:</b> ${esc(err.message)}`);
    window.uiRerender();
  }
}

// ── панель сеанса (рисуется столом) ─────────────────────────────────────────

export function renderSession() {
  const net = state.net;
  if (!net.token) {
    return `<div class="pal-sec">Сеанс</div>
      <div class="sys-hint">Оффлайн: всё в памяти вкладки. Войдите в шапке,
        чтобы играть комнатой через сервер.</div>`;
  }

  if (!net.roomId) {
    const worlds = net.worlds || [];
    const rooms = net.rooms || [];
    return `<div class="pal-sec">Сеанс · ${esc(net.me.name)}</div>
      ${rooms.length
        ? rooms.map(r => `<button class="add-row" onclick="uiNetJoin('${r.id}')">→ ${esc(r.name)}</button>`).join('')
        : '<div class="sys-hint">Комнат пока нет — создайте свою: кто создал, тот и ведущий.</div>'}
      <div class="ar-row" style="margin-top:6px">
        <select class="meta-sel" id="net-world" style="flex:1">
          ${worlds.length
            ? worlds.map(w => `<option value="${w.id}">${esc(w.name)} · автор: ${esc(w.owner)}</option>`).join('')
            : '<option value="">— миров на сервере нет —</option>'}
        </select>
      </div>
      <button class="add-row" onclick="uiNetCreateRoom(document.getElementById('net-world').value)">+ комната из мира</button>`;
  }

  const members = net.members || [];
  const takenSheets = new Set(members.map(m => m.sheet_id).filter(Boolean));
  const myRole = (members.find(m => m.user === net.me.name) || {}).role || 'player';
  const canPickSheet = myRole === 'player' && !net.mySheetId;
  const invite = `${location.origin}${location.pathname}#room=${net.roomId}`;
  return `<div class="pal-sec">Сеанс · комната</div>
    ${members.map(m => `<div class="mcs-row"><span>${esc(m.user)}</span>
      <span style="color:var(--muted)">${m.role === 'gm' ? 'ведущий' : 'игрок'}${m.sheet_id ? ` · ${esc(m.sheet_id)}` : ''}</span></div>`).join('')}
    <div class="pal-sec" style="margin-top:8px">Приглашение</div>
    <input class="ar-cond" style="width:100%" readonly value="${esc(invite)}"
           onclick="this.select()" title="отправьте эту ссылку игрокам">
    ${canPickSheet ? `
      <div class="pal-sec" style="margin-top:8px">Сесть за лист</div>
      ${state.sheets.filter(s => !takenSheets.has(s.id)).map(s =>
        `<button class="add-row" onclick="uiNetJoin('${net.roomId}','${s.id}')">◈ ${esc(s.name)}</button>`).join('')
        || '<div class="sys-hint">Свободных листов нет.</div>'}`
    : ''}`;
}
