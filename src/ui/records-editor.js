// Редактор родов записей. Живёт ТОЛЬКО в режиме автора: род — часть закона
// системы, как поле и как правило. Автор задаёт, ЧТО может лежать в компендиуме
// его мира: не «Оружие», а «Атакующие предметы»; не «Заклинание», а «Ритуал».
//
// Инварианты — те же, что у полей:
//   · машинный ключ рода стабилен, правится только человеческое (лейбл,
//     подсказка, значок, свойства) — переименование не ломает записей;
//   · базис (item / effect / call / action) — короткий словарь движка,
//     выбирается при создании и дальше неизменен, как тип поля;
//   · у свойства рода тоже стабильный ключ — на него ссылаются правила
//     через { item: 'ключ' }.
//
// Шаблоны: род можно подтянуть копией из любой образцовой системы
// (src/model/systems.js) и редактировать у себя — донор не меняется.

import { state, esc } from './state.js';
import { SAMPLE_SYSTEMS } from '../model/systems.js';

// Базисы — словарь движка, честно подписанный именно так. Он мал и закрыт:
// всё человеческое поверх него объявляет система.
export const BASES = [
  { kind: 'item', label: 'вещь', hint: 'Носится персонажем: свойства, активности, бонусы.' },
  { kind: 'effect', label: 'состояние', hint: 'Висит на персонаже: модификаторы, пока висит.' },
  { kind: 'call', label: 'вызов правила', hint: 'Механика системы с заполненными параметрами.' },
  { kind: 'action', label: 'приём', hint: 'Кнопка у игрока: сама выбирает вызов правила.' },
];

// ── отрисовка ───────────────────────────────────────────────────────────────

export function renderKindList() {
  const kinds = Object.entries(state.system.records || {});
  if (!state.activeKindId || !state.system.records[state.activeKindId]) {
    state.activeKindId = (kinds[0] || [null])[0];
  }

  document.getElementById('records-list').innerHTML = `
    ${kinds.map(([rk, decl]) => `
      <div class="item-entry${rk === state.activeKindId ? ' on' : ''}" onclick="uiKindPick('${rk}')">
        <span class="ie-icon">${decl.icon || '□'}</span>
        <div style="flex:1;min-width:0">
          <div class="ie-name">${esc(decl.label || rk)}</div>
          <div class="ie-sub">базис: ${esc(baseWord(decl.kind))}${decl.props ? ` · свойств: ${decl.props.length}` : ''}</div>
        </div>
      </div>`).join('')}
    <div class="ar-row" style="margin-top:6px">
      <select class="meta-sel" id="kind-add-base" style="flex:1">
        ${BASES.map(b => `<option value="${b.kind}">${esc(b.label)} — ${esc(b.hint)}</option>`).join('')}
      </select>
    </div>
    <button class="add-row" onclick="uiKindAdd(document.getElementById('kind-add-base').value)">+ род записей</button>`;
}

export function renderKindEditor() {
  const host = document.getElementById('records-editor');
  const rk = state.activeKindId;
  const decl = rk && state.system.records[rk];

  if (!decl) {
    host.innerHTML = '<div class="empty-ed">Заведите первый род записей<br>кнопкой слева</div>';
    return;
  }

  const inBook = countRecords(rk);
  host.innerHTML = `
    <div style="display:flex;gap:8px;align-items:center">
      <input class="bon-v" style="width:44px;text-align:center;font-size:16px" value="${esc(decl.icon || '')}"
             placeholder="□" title="значок в палитре" oninput="uiKindSet('${rk}','icon',this.value)">
      <input class="blk-name" id="kind-label-${rk}" style="font-size:16px;margin:0;flex:1" value="${esc(decl.label || '')}"
             placeholder="Название рода" oninput="uiKindRename('${rk}',this.value)">
      <button class="row-del" style="opacity:.7" title="удалить род" onclick="uiKindDel('${rk}')">✕</button>
    </div>
    <div class="sys-hint" style="margin:4px 0 10px">
      базис: ${esc(baseWord(decl.kind))} · записей этого рода в компендиуме: ${inBook}
      — переименование ничего не ломает: записи держатся за ключ, не за имя</div>

    <div class="pal-sec">Подсказка в палитре</div>
    <input class="ar-cond" style="width:100%" id="kind-hint-${rk}" value="${esc(decl.hint || '')}"
           placeholder="что это и зачем — увидит тот, кто добавляет запись"
           oninput="uiKindSet('${rk}','hint',this.value)">

    ${decl.kind === 'item' ? propsEditor(rk, decl) : ''}`;
}

function propsEditor(rk, decl) {
  return `<div class="pal-sec" style="margin-top:12px">Типизированные свойства</div>
    <div class="sys-hint">На ключ свойства ссылаются правила («кость из записи»).
      Ключ стабилен, имя — ваше.</div>
    ${(decl.props || []).map(p => `
      <div style="display:flex;gap:6px;align-items:center;padding:3px 0">
        <input class="ar-cond" style="flex:1;min-width:0" id="prop-${rk}-${p.key}" value="${esc(p.label || '')}"
               placeholder="имя свойства" oninput="uiKindPropSet('${rk}','${p.key}','label',this.value)">
        <select class="meta-sel" onchange="uiKindPropSet('${rk}','${p.key}','kind',this.value)">
          <option value="dice"${p.kind === 'dice' ? ' selected' : ''}>кости</option>
          <option value="number"${p.kind === 'number' ? ' selected' : ''}>число</option>
        </select>
        <button class="rl-del" onclick="uiKindPropDel('${rk}','${p.key}')">✕</button>
      </div>`).join('')}
    <button class="add-row" onclick="uiKindPropAdd('${rk}')">+ свойство</button>`;
}

// Шаблоны: рода чужих систем, готовые к копированию. Список систем — данные,
// панель ничего не знает о том, какие миры существуют.
export function renderKindTemplates() {
  const others = SAMPLE_SYSTEMS.filter(s => s.id !== state.system.id);
  document.getElementById('records-templates').innerHTML = `
    ${others.map(sys => `
      <div class="pal-sec">${esc(sys.name)}</div>
      ${Object.entries(sys.records || {}).map(([rk, decl]) => `
        <div class="pal-item" onclick="uiKindCopy('${sys.id}','${rk}')">
          <span class="pal-icon">${decl.icon || '□'}</span>
          <div><div class="pal-t">${esc(decl.label)}</div><div class="pal-s">${esc(decl.hint || '')}</div></div>
        </div>`).join('')}`).join('')}
    <div class="sys-hint" style="margin-top:8px">Клик — копия рода приедет в вашу
      систему; правьте как своё, донор не изменится.</div>`;
}

const baseWord = kind => (BASES.find(b => b.kind === kind) || { label: kind }).label;

function countRecords(rk) {
  const { items, effects, actions } = state.compendium;
  return [...items, ...effects, ...actions].filter(r => r.rk === rk).length;
}

// ── правки ───────────────────────────────────────────────────────────────────

const freeKey = (prefix, taken) => {
  let n = 1;
  while (taken[`${prefix}_${n}`]) n++;
  return `${prefix}_${n}`;
};

export function pickKind(rk) {
  state.activeKindId = rk;
}

export function addKind(base) {
  if (!BASES.some(b => b.kind === base)) return null;
  const records = state.system.records || (state.system.records = {});
  const rk = freeKey('kind', records);
  records[rk] = { kind: base, label: 'Новый род', hint: '', icon: '□', ...(base === 'item' ? { props: [] } : {}) };
  state.activeKindId = rk;
  return rk;
}

export function setKind(rk, prop, value) {
  const decl = state.system.records[rk];
  if (!decl) return;
  if (prop === 'kind') return; // базис неизменен, как тип поля
  decl[prop] = value;
}

export function deleteKind(rk) {
  delete state.system.records[rk];
  if (state.activeKindId === rk) {
    state.activeKindId = Object.keys(state.system.records)[0] || null;
  }
}

export function addProp(rk) {
  const decl = state.system.records[rk];
  const props = decl.props || (decl.props = []);
  const key = freeKey('prop', Object.fromEntries(props.map(p => [p.key, 1])));
  props.push({ key, label: '', kind: 'number' });
  return key;
}

export function setProp(rk, key, prop, value) {
  const entry = (state.system.records[rk].props || []).find(p => p.key === key);
  if (!entry) return;
  if (prop === 'key') return; // ключ стабилен — на него ссылаются правила
  entry[prop] = value;
}

export function deleteProp(rk, key) {
  const decl = state.system.records[rk];
  decl.props = (decl.props || []).filter(p => p.key !== key);
}

// Копия рода из чужой системы. Донора ищем по объекту или по id — обе формы
// нужны: тестам удобен объект, разметке — строка.
export function copyKindFrom(donor, donorKey) {
  const sys = typeof donor === 'string' ? SAMPLE_SYSTEMS.find(s => s.id === donor) : donor;
  const source = sys && (sys.records || {})[donorKey];
  if (!source) return null;

  const records = state.system.records || (state.system.records = {});
  const rk = records[donorKey] ? freeKey(donorKey, records) : donorKey;
  records[rk] = structuredClone(source);
  state.activeKindId = rk;
  return rk;
}
