// Режим компендиума: общая библиотека записей.
//
// Компендиум — ДАННЫЕ для системы и чарника. Ни одного шага автоматизации
// здесь нет и быть не может: шаги живут в эффектах системы.
//
// Что у записи спрашивают, объявляет её РОД (system.records[rk]):
//   props    — какие циферки ввести человеку;
//   bindings — к каким эффектам эти циферки привязать.
// Поэтому наполнение сводится к вводу заранее известных чисел: у меча
// спрашивают кость урона, а «Атака» появляется у владельца сама.
//
// Записи ссылаются только на УЖЕ объявленные теги и эффекты: мишень бонуса,
// мишень броска, эффект привязки выбираются из выпадающих списков. Свободного
// текста нет нигде — именно из-за него в черновике бонусы никуда не резолвились
// (reference/index.html:1518). Нового тега запись ввести не может, поэтому
// создавать её волен и игрок.

import { state, esc, newRecordId, log } from './state.js';
import { allRecords } from '../model/compendium.js';
import { isPipeline } from '../engine/effects.js';
import { modifiersBody, defaultModifier, ownerKey } from './modifiers-editor.js';
import { recordTemplatesHtml } from './templates.js';

// Движковый базис (item / action) — запасной словарь на случай записи
// без рода: честное «запись», а не выдуманный лейбл.
const BASE_FALLBACK = {
  item: { label: 'запись-предмет', icon: '⬡' },
  action: { label: 'запись-действие', icon: '✊' },
};

// Базис хранения записи: по какому массиву компендиума она живёт.
function baseOf(record) {
  return state.compendium.items.some(r => r.id === record.id) ? 'item' : 'action';
}

function declOf(record) {
  return (state.system.records || {})[record.rk] || BASE_FALLBACK[baseOf(record)];
}

export function renderCompendium() {
  renderList();
  renderRecord();
  renderPalette();
}

// Палитра «что можно добавить» выводится из словаря родов системы,
// разложенного по ГРУППАМ рода: заклинания к заклинаниям, снаряжение
// к снаряжению. У 5e здесь есть «Атакующее заклинание», у киберпанка — нет.
function renderPalette() {
  const host = document.getElementById('comp-palette');
  const kinds = Object.entries(state.system.records || {});
  const groups = new Map();
  for (const [rk, decl] of kinds) {
    const group = decl.group || 'Записи';
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push([rk, decl]);
  }

  host.innerHTML = (kinds.length
    ? [...groups].map(([group, items]) => `
      <div class="pal-sec">${esc(group)}</div>
      ${items.map(([rk, decl]) => `
        <div class="pal-item" onclick="uiNewRecord('${rk}')">
          <span class="pal-icon">${decl.icon || '□'}</span>
          <div><div class="pal-t">${esc(decl.label)}</div><div class="pal-s">${esc(decl.hint || '')}</div></div>
        </div>`).join('')}`).join('')
    : '<div class="sys-hint">Система не объявляет родов записей — объявить их можно в конструкторе.</div>')
    + recordTemplatesHtml();
}

function renderList() {
  const records = allRecords(state.compendium);
  const used = usage();

  document.getElementById('comp-list').innerHTML = records.length
    ? records.map(r => `
      <div class="item-entry${state.activeRecordId === r.id ? ' on' : ''}" onclick="uiPickRecord('${r.id}')">
        <span class="ie-icon">${declOf(r).icon || '□'}</span>
        <div style="flex:1;min-width:0">
          <div class="ie-name">${esc(r.label)}</div>
          <div class="ie-sub">${esc(declOf(r).label)}${used[r.id] ? ` · у ${used[r.id]}` : ' · ни у кого'}</div>
        </div>
        <button class="ie-del" onclick="event.stopPropagation();uiDelRecord('${r.id}')">✕</button>
      </div>`).join('')
    : '<div class="char-empty-hint">Библиотека пуста.</div>';
}

// Кто на запись ссылается. Персонажи держат только ссылки, копий нет.
function usage() {
  const map = {};
  for (const s of state.sheets) {
    for (const id of [...s.equipped, ...s.actions]) {
      map[id] = map[id] ? `${map[id]}, ${s.name}` : s.name;
    }
  }
  return map;
}

function renderRecord() {
  const host = document.getElementById('comp-editor');
  const record = find(state.activeRecordId);

  if (!record) {
    host.innerHTML = '<div class="empty-ed">Выберите запись слева<br>или создайте новую</div>';
    return;
  }

  const decl = declOf(record);
  const head = `
    <div class="item-hdr">
      <div class="icon-pick">${decl.icon || '□'}</div>
      <div style="flex:1">
        <input class="item-name-inp" id="rec-name" value="${esc(record.label)}"
               oninput="uiSetRecord('${record.id}','label',this.value)">
        <div class="meta-row"><span class="rarity-badge" style="background:var(--s2);color:var(--muted)">
          ${esc(decl.label)}</span></div>
      </div>
    </div>`;

  const body = propsBody(record, decl)
    + bindingsBody(record, decl)
    + activitiesBody(record)
    + (baseOf(record) === 'item' ? modifiersBody(ownerKey('item', record.id), record, 'Бонусы — пока надет') : '');

  host.innerHTML = head + body + `
    <textarea class="desc-ta" placeholder="Описание для игрока…"
      oninput="uiSetRecord('${record.id}','description',this.value)">${esc(record.description || '')}</textarea>`;
}

// Свойства записи: СОСТАВ объявлен системой для РОДА этой записи, запись
// только заполняет значения. Нет объявления — нет и раздела: компендиум
// определяется изначальной механикой, а не наоборот.
function propsBody(record, decl) {
  if (!decl || !decl.props || !decl.props.length) return '';
  const props = record.props || {};
  return `<div class="pb">
    <div class="pb-lbl">${esc(decl.label)} — свойства из системы</div>
    ${decl.props.map(p => `
      <div class="bon-row" style="grid-template-columns:130px 1fr;border:none">
        <span style="font-size:11px;color:var(--muted)">${esc(p.label)}</span>
        ${propControl(record, p, props[p.key])}
      </div>`).join('')}
  </div>`;
}

// Свойство с родом «эффект» выбирается из библиотеки, а не набирается
// руками: иначе в записи оказался бы id несуществующего состояния.
function propControl(record, p, value) {
  if (p.kind === 'effect') {
    const hangable = Object.entries(state.system.effects || {}).filter(([, e]) => !isPipeline(e));
    return `<select class="meta-sel" onchange="uiSetProp('${record.id}','${p.key}',this.value)">
      <option value="">— не задано —</option>
      ${hangable.map(([id, e]) => `<option value="${id}"${value === id ? ' selected' : ''}>${esc(e.label || id)}</option>`).join('')}
    </select>`;
  }
  return `<input class="bon-v" style="text-align:left" value="${esc(value ?? '')}"
    placeholder="${p.kind === 'dice' ? 'напр. 1d8' : p.kind === 'number' ? 'число' : 'значение'}"
    oninput="uiSetProp('${record.id}','${p.key}',this.value)">`;
}

// Что запись даёт владельцу. Раздел ЧИТАЕМЫЙ, а не редактируемый: привязку
// объявил род в конструкторе систем, и правится она там же. Здесь она
// показана, чтобы человек видел, куда уходят введённые им циферки.
function bindingsBody(record, decl) {
  const own = record.activities && record.activities.length;
  const fromKind = (decl && decl.bindings) || [];
  if (own || !fromKind.length) return '';

  return `<div class="pb">
    <div class="pb-lbl">Что даёт — привязка рода «${esc(decl.label)}»</div>
    ${fromKind.map(binding => {
      const effect = (state.system.effects || {})[binding.effect];
      return `<div class="bon-row" style="grid-template-columns:110px 1fr;border:none">
        <span style="font-size:11px;color:var(--muted)">${esc(binding.label || 'Применение')}</span>
        <span style="font-size:11px">${effect
          ? `${esc(effect.icon || '⚙')} ${esc(effect.label || binding.effect)}`
          : `<span style="color:var(--red)">нет эффекта «${esc(binding.effect)}»</span>`}</span>
      </div>`;
    }).join('')}
    <div class="sys-hint">Привязку объявил род в конструкторе систем — там же она и правится.</div>
  </div>`;
}

// Своя активность перебивает привязку рода: так штучная вещь получает
// поведение поверх общей формы. Аргументы при этом заполняются здесь —
// форма выводится из объявления параметров эффекта.
function activitiesBody(record) {
  const pipeline = Object.entries(state.system.effects || {}).filter(([, e]) => isPipeline(e));
  const activities = record.activities || [];
  if (!activities.length) {
    return `<div class="pb">
      <div class="pb-lbl">Своя активность — вместо привязки рода</div>
      ${pipeline.length
        ? `<button class="add-row" onclick="uiItemActAdd('${record.id}')">+ своя активность</button>
           <div class="sys-hint">Нужна штучной вещи: перебьёт то, что даёт род.</div>`
        : '<div class="sys-hint">В системе нет применимых эффектов — привязывать нечего.</div>'}
    </div>`;
  }

  return `<div class="pb">
    <div class="pb-lbl">Свои активности — перебивают привязку рода</div>
    ${activities.map((act, i) => {
      const effect = (state.system.effects || {})[act.effect];
      return `<div class="pb" style="margin-bottom:6px;background:var(--s2)">
        <button class="pb-del" onclick="uiItemActDel('${record.id}',${i})">✕</button>
        <div class="bon-row" style="grid-template-columns:110px 1fr;border:none">
          <input class="bon-v" style="text-align:left" value="${esc(act.label || '')}" placeholder="Атака"
                 oninput="uiItemActSet('${record.id}',${i},'label',this.value)">
          <select class="meta-sel" onchange="uiItemActSet('${record.id}',${i},'effect',this.value)">
            ${pipeline.map(([id, e]) => `<option value="${id}"${act.effect === id ? ' selected' : ''}>${esc(e.label || id)}</option>`).join('')}
          </select>
        </div>
        ${effect ? argRows(record, i, act, effect) : '<div class="sys-hint" style="color:var(--red)">эффект не найден</div>'}
      </div>`;
    }).join('')}
    <button class="add-row" onclick="uiItemActAdd('${record.id}')">+ ещё активность</button>
  </div>`;
}

// Форма аргументов ВЫВЕДЕНА из объявления параметров эффекта: эффект
// объявил четыре параметра — здесь четыре поля. Шагов в этом редакторе
// нет: не скрыты, а не созданы — граница режимов.
function argRows(record, index, act, effect) {
  const args = act.args || {};
  return (effect.params || []).map(p => {
    const value = args[p.key];
    const label = `${p.label || p.key}${p.of === 'target' ? ' (считает цель)' : ''}`;
    return `<div class="bon-row" style="grid-template-columns:130px 1fr;border:none">
      <span style="font-size:11px;color:var(--muted)">${esc(label)}</span>
      <input class="bon-v" style="text-align:left" value="${esc(typeof value === 'object' ? '' : value ?? '')}"
             placeholder="${esc(argHint(p))}"
             oninput="uiItemArgSet('${record.id}',${index},'${p.key}',this.value)">
    </div>`;
  }).join('');
}

const argHint = p => ({
  expr: '#тег + 2', tag: 'тег поля', dice: '2d6',
  number: 'число', effect: 'id эффекта', choice: 'roll / item / margin',
}[p.kind] || 'значение');

// ── правки ──────────────────────────────────────────────────────────────────

export function find(id) {
  return allRecords(state.compendium).find(r => r.id === id) || null;
}

// Возвращает живой объект из компендиума, а не копию из allRecords.
function live(id) {
  const { items, actions } = state.compendium;
  return items.find(r => r.id === id) || actions.find(r => r.id === id) || null;
}

export function pickRecord(id) {
  state.activeRecordId = id;
}

// Создание записи РОДА, объявленного системой: что именно рождается,
// решает базис рода (item / action), слова и форму — объявление.
export function createRecord(rk) {
  const decl = (state.system.records || {})[rk];
  if (!decl) return;
  const id = newRecordId(rk);
  const record = { id, rk, label: `${decl.label} — новая запись`, description: '' };
  if (decl.props && decl.props.length) record.props = {};

  if (decl.kind === 'item') {
    // Предмет без объявленных свойств заводится ради бонусов — даём заготовку.
    record.modifiers = decl.props ? [] : [defaultModifier(state.system)];
    state.compendium.items.push(record);
  } else {
    state.compendium.actions.push(record);
  }
  state.activeRecordId = id;
  return id;
}

export function deleteRecord(id) {
  const { compendium } = state;
  compendium.items = compendium.items.filter(r => r.id !== id);
  compendium.actions = compendium.actions.filter(r => r.id !== id);

  for (const s of state.sheets) {
    s.equipped = s.equipped.filter(e => e !== id);
    s.actions = s.actions.filter(a => a !== id);
  }
  if (state.activeRecordId === id) state.activeRecordId = null;
  log(`Запись убрана из компендиума и со всех персонажей.`);
}

export function setRecord(id, key, value) {
  const record = live(id);
  if (record) record[key] = value;
}

export function setProp(id, key, raw) {
  const record = live(id);
  const schema = (((state.system.records || {})[record.rk]) || {}).props || [];
  const kind = (schema.find(p => p.key === key) || {}).kind;
  const value = String(raw).trim();
  record.props = record.props || {};
  if (!value) { delete record.props[key]; return; }
  record.props[key] = kind === 'number' && !Number.isNaN(Number(value)) ? Number(value) : value;
}

// ── свои активности ─────────────────────────────────────────────────────────

export function addActivity(id) {
  const record = live(id);
  const first = Object.entries(state.system.effects || {}).find(([, e]) => isPipeline(e));
  record.activities = record.activities || [];
  record.activities.push({ label: 'Применение', effect: first ? first[0] : '', args: {} });
}

export function deleteActivity(id, index) {
  live(id).activities.splice(index, 1);
}

// Смена эффекта пересобирает аргументы: у другого эффекта другие параметры,
// и старые значения к ним не приложить.
export function setActivity(id, index, key, value) {
  const activity = live(id).activities[index];
  activity[key] = value;
  if (key === 'effect') activity.args = {};
}

export function setActivityArg(id, index, key, raw) {
  const record = live(id);
  const activity = record.activities[index];
  const effect = (state.system.effects || {})[activity.effect] || {};
  const decl = (effect.params || []).find(p => p.key === key);
  const args = activity.args || (activity.args = {});
  const value = typeof raw === 'string' ? raw.trim() : raw;
  if (value === '' || value === undefined) { delete args[key]; return; }
  args[key] = decl && decl.kind === 'number' && !Number.isNaN(Number(value)) ? Number(value) : value;
}

// Наружу — для экрана игрока: он тоже волен завести запись.
export { defaultModifier };
