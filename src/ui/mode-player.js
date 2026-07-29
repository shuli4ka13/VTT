// Режим игрока: лист персонажа.
//
// Кнопок добавления и удаления полей здесь НЕТ В РАЗМЕТКЕ — не скрыты стилями,
// а не создаются вовсе. Модуль не импортирует ничего, что правит состав полей.
//
// Что игроку можно: вводить значения, надевать предметы, вешать и снимать
// эффекты, брать записи из компендиума и заводить новые. Правило границы:
// новый ТЕГ вводит только автор; комбинировать существующие можно отсюда.

import { state, sheet, field, pass, rollOf, valueOf, show, newRecordId, esc, log } from './state.js';
import { send, receive } from '../events/envelope.js';
import { randomDie } from '../engine/dice.js';

export function renderPlayer() {
  renderSheetList();
  renderSheetBody();
  renderBelongings();
}

function renderSheetList() {
  document.getElementById('player-sheets').innerHTML = state.sheets.map(s => `
    <div class="char-entry${s.id === state.activeSheetId ? ' on' : ''}" onclick="uiPickSheet('${s.id}')">
      <span class="char-type ${s.id === state.activeSheetId ? 'pc' : 'npc'}">лист</span>
      <span class="char-name-inp">${esc(s.name)}</span>
    </div>`).join('');
}

function renderSheetBody() {
  const host = document.getElementById('player-sheet');
  const current = sheet();

  if (!current) {
    host.innerHTML = '<div class="empty-hint">Выберите персонажа слева</div>';
    return;
  }

  const p = pass();
  const groups = new Map();
  for (const f of state.system.fields) {
    if (!groups.has(f.group)) groups.set(f.group, []);
    groups.get(f.group).push(f);
  }

  host.innerHTML = [...groups].map(([group, fields]) => `
    <div class="cs-block">
      <div class="blk-type">${esc(group)}</div>
      <div class="stat-grid">${fields.map(f => cell(f, p)).join('')}</div>
    </div>`).join('');
}

function cell(f, p) {
  const result = valueOf(f.tag, p);
  const computed = f.value.kind !== 'stored';

  let control;
  if (!result.ok) {
    control = `<span class="sv" style="color:var(--red);font-size:11px" title="${esc(result.error)}">ошибка</span>`;
  } else if (computed) {
    // Вычисляемое поле — только для чтения. Его считает движок, а не игрок.
    control = `<span class="sv" style="color:var(--blue)" title="считает движок, вводить нельзя">${esc(show(result.value))}</span>`;
  } else if (f.value.type === 'boolean') {
    control = `<span class="sv" style="cursor:pointer" onclick="uiToggle('${f.tag}')">${result.value ? '✔' : '—'}</span>`;
  } else {
    control = `<input class="sv" id="val-${f.tag}" type="number" value="${esc(result.value)}"
                      oninput="uiSetValue('${f.tag}', this.value)">`;
  }

  return `<div class="stat-cell">
    ${control}
    <span class="sl" style="display:block">${esc(f.label)}</span>
  </div>`;
}

function renderBelongings() {
  const host = document.getElementById('player-belongings');
  const current = sheet();
  if (!current) { host.innerHTML = ''; return; }

  const { items, effects, actions } = state.compendium;
  const others = state.sheets.filter(s => s.id !== current.id);
  const p = pass();

  host.innerHTML = `
    <div class="pal-sec">Снаряжение</div>
    ${picker(items, current.equipped, 'uiEquip', 'предметов в компендиуме нет')}
    <button class="add-row" onclick="uiCreate('item')">+ создать предмет</button>

    <div class="pal-sec" style="margin-top:10px">Эффекты</div>
    ${picker(effects, current.effects.map(e => e.effectId), 'uiHang', 'эффектов нет')}
    <button class="add-row" onclick="uiCreate('effect')">+ создать эффект</button>

    <div class="pal-sec" style="margin-top:10px">Броски сейчас</div>
    ${state.system.rolls.map(r => {
      const roll = rollOf(r.tag, p);
      return `<div class="mcs-row"><span>${esc(r.label)}</span>
        <span style="color:${roll.mode === 'normal' ? 'var(--muted)' : 'var(--accent)'}">${modeWord(roll.mode)}</span>
      </div>`;
    }).join('')}

    <div class="pal-sec" style="margin-top:10px">Действия</div>
    ${picker(actions, current.actions, 'uiLearn', 'действий нет')}
    <button class="add-row" onclick="uiCreate('action')">+ создать действие</button>
    <button class="add-row" onclick="uiCreate('spell')">+ создать заклинание</button>

    ${current.actions.length && others.length ? `
      <div class="pal-sec" style="margin-top:10px">Применить</div>
      ${current.actions.map(id => {
        const action = actions.find(a => a.id === id);
        if (!action) return '';
        return `<div class="auto-rule" style="padding:7px 8px">
          <div style="font-size:12px;margin-bottom:5px">${esc(action.label)}</div>
          <div style="display:flex;gap:4px;flex-wrap:wrap">
            ${others.map(t => `<button class="die-o" onclick="uiSend('${action.id}','${t.id}')">⚄ по ${esc(t.name)}</button>`).join('')}
          </div>
        </div>`;
      }).join('')}` : ''}`;
}

// Один вид списка для всех трёх видов записей: галочка «у меня есть».
function picker(records, taken, handler, emptyText) {
  if (!records.length) return `<div class="sys-hint" style="padding:2px 4px">${emptyText}</div>`;
  const has = new Set(taken);
  return records.map(r => `
    <div class="fx-entry" onclick="${handler}('${r.id}')" style="padding:5px 8px">
      <span class="fx-e-icon">${has.has(r.id) ? '✔' : '·'}</span>
      <span style="flex:1;${has.has(r.id) ? '' : 'color:var(--muted)'}">${esc(r.label)}</span>
      <span class="hint-kind">${kindWord(r)}</span>
    </div>`).join('');
}

const kindWord = r =>
  r.kind === 'spell' ? 'заклинание' : r.kind === 'action' ? 'действие' : r.modifiers ? '' : '';

const modeWord = mode =>
  mode === 'advantage' ? 'преимущество' : mode === 'disadvantage' ? 'помеха' : 'обычный';

// ── правки чарника ──────────────────────────────────────────────────────────

export function pickSheet(id) {
  state.activeSheetId = id;
}

export function newSheet() {
  const n = state.sheets.length + 1;
  state.sheets.push({
    id: `sheet_${n}`,
    systemId: state.system.id,
    name: `Персонаж ${n}`,
    values: {},          // всё возьмётся из умолчаний системы
    equipped: [],
    effects: [],
    actions: [],
  });
  state.activeSheetId = `sheet_${n}`;
}

export function setValue(tag, raw) {
  const f = field(tag);
  sheet().values[tag] = f.value.type === 'boolean' ? Boolean(raw) : Number(raw);
}

export function toggle(tag) {
  const current = valueOf(tag);
  sheet().values[tag] = !current.value;
}

export function equip(id) {
  const current = sheet();
  current.equipped = current.equipped.includes(id)
    ? current.equipped.filter(e => e !== id)
    : [...current.equipped, id];
}

export function hang(id) {
  const current = sheet();
  current.effects = current.effects.some(e => e.effectId === id)
    ? current.effects.filter(e => e.effectId !== id)
    : [...current.effects, { effectId: id }];
}

export function learn(id) {
  const current = sheet();
  current.actions = current.actions.includes(id)
    ? current.actions.filter(a => a !== id)
    : [...current.actions, id];
}

// Созданная запись ложится в ОБЩИЙ компендиум, персонаж получает ссылку.
// Копий внутри персонажа не делаем — потому и уходим сразу в компендиум,
// чтобы было видно: правится общая библиотека.
export function create(kind) {
  const current = sheet();
  const first = state.system.fields[0].tag;
  const roll = (state.system.rolls[0] || {}).tag;

  if (kind === 'item') {
    const id = newRecordId('item');
    state.compendium.items.push({
      id, label: 'Новый предмет', slot: 'misc', description: '',
      modifiers: [{ kind: 'value', target: first, op: 'add', value: 1, stacking: 'sum', condition: null }],
    });
    current.equipped.push(id);
    return handOff(id, 'предмет');
  }

  if (kind === 'effect') {
    const id = newRecordId('fx');
    state.compendium.effects.push({
      id, label: 'Новый эффект', icon: '✦', duration: { kind: 'scene' }, description: '',
      modifiers: [{ kind: 'roll', target: roll, effect: 'disadvantage', method: 'rerollBest', condition: null }],
    });
    current.effects.push({ effectId: id });
    return handOff(id, 'эффект');
  }

  const spell = kind === 'spell';
  const id = newRecordId(spell ? 'spell' : 'act');
  state.compendium.actions.push({
    id, kind: spell ? 'spell' : 'action',
    label: spell ? 'Новое заклинание' : 'Новое действие',
    description: '',
    envelope: spell
      ? { kind: 'save', saveTag: firstFormulaTag(), dc: '#' + firstFormulaTag(), onFail: null, onSuccess: null }
      : {
        kind: 'attack',
        roll: { die: 20, bonus: '#' + firstFormulaTag(), target: roll },
        versus: firstFormulaTag(),
        onHit: { damage: { dice: '1d6' }, applyTo: firstStoredTag() },
      },
  });
  current.actions.push(id);
  return handOff(id, spell ? 'заклинание' : 'действие');
}

// Действие ссылается только на уже объявленные теги — нового не вводит.
// Потому его и волен создать игрок.
const firstFormulaTag = () =>
  (state.system.fields.find(f => f.value.kind === 'formula') || state.system.fields[0]).tag;

const firstStoredTag = () =>
  (state.system.fields.find(f => f.value.kind === 'stored') || state.system.fields[0]).tag;

function handOff(id, word) {
  state.mode = 'compendium';
  state.activeRecordId = id;
  log(`Новый ${word} создан <b>в общем компендиуме</b>. Персонаж на него ссылается.`);
}

export function dispatch(actionId, targetId) {
  const target = state.sheets.find(s => s.id === targetId);
  const from = sheet();
  const ctx = { system: state.system, compendium: state.compendium, die: randomDie };

  try {
    const envelope = send(actionId, { ...ctx, sheet: from });
    const { sheet: updated, report } = receive(envelope, { ...ctx, sheet: target });
    // Получатель вернул НОВЫЙ чарник — подменяем целиком, не правя старый.
    state.sheets = state.sheets.map(s => (s.id === targetId ? updated : s));
    log(describe(from, target, report));
  } catch (err) {
    log(`<b style="color:var(--red)">Ошибка:</b> ${esc(err.message)}`);
  }
}

function describe(from, to, report) {
  const head = `<b>${esc(from.name)}</b> → <b>${esc(to.name)}</b>`;
  const changes = report.changes
    .map(c => `${esc(field(c.tag) ? field(c.tag).label : c.tag)}: ${c.from} → ${c.to}`).join(', ');
  const effects = report.effects.length ? ` · наложено: ${report.effects.map(esc).join(', ')}` : '';

  if (report.kind === 'attack') {
    const verdict = report.hit
      ? '<span class="roll-success">попадание</span>'
      : '<span class="roll-fail">мимо</span>';
    const versusLabel = field(report.versus.tag) ? field(report.versus.tag).label : report.versus.tag;
    return `${head} · ${esc(report.label)}<br>
      бросок [${report.attack.rolls.join(', ')}] + ${report.attack.bonus} = ${report.attack.total}
      против ${esc(versusLabel)} ${report.versus.value} — ${verdict}${changes ? '<br>' + changes : ''}${effects}`;
  }

  const verdict = report.success
    ? '<span class="roll-success">спасся</span>'
    : '<span class="roll-fail">провал</span>';
  return `${head} · ${esc(report.label)}<br>
    спасбросок [${report.save.rolls.join(', ')}] + ${report.save.bonus} = ${report.save.total}
    против ${report.dc} — ${verdict}${changes ? '<br>' + changes : ''}${effects}`;
}
