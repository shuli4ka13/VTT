// Вкладка «Предметы». Вёрстка черновика, но мишень бонуса больше не свободный текст.
//
// В черновике (reference/index.html:1518) цель бонуса набивалась руками в инпут
// «Характеристика / навык» и никуда не резолвилась. Здесь это выпадающий список,
// собранный из объявленных в системе тегов — словарь мишеней нигде отдельно
// не хранится, он выводится (src/engine/targets.js).

import { state, sheet, esc } from './state.js';
import { targets } from '../engine/targets.js';

const OPS = [['add', '+ прибавить'], ['set', '= задать'], ['mul', '× умножить']];
const STACKING = [['sum', 'складывать'], ['max', 'брать наибольший'], ['override', 'последний побеждает']];

export function renderItems() {
  renderList();
  renderEditor();
}

function renderList() {
  const equipped = new Set(sheet().equipped);
  document.getElementById('item-list').innerHTML = state.compendium.items.map(item => `
    <div class="item-entry${state.activeItemId === item.id ? ' on' : ''}" onclick="uiPickItem('${item.id}')">
      <span class="ie-icon">${equipped.has(item.id) ? '🎒' : '▫'}</span>
      <div style="flex:1;min-width:0">
        <div class="ie-name">${esc(item.label)}</div>
        <div class="ie-sub">${item.modifiers.length} модификатор(ов)</div>
      </div>
      <button class="ie-del" onclick="event.stopPropagation();uiDelItem('${item.id}')">✕</button>
    </div>`).join('') || '<div class="char-empty-hint">Предметов нет.</div>';
}

function renderEditor() {
  const editor = document.getElementById('item-ed');
  const item = state.compendium.items.find(i => i.id === state.activeItemId);

  if (!item) {
    editor.innerHTML = '<div class="empty-ed">Выберите предмет слева<br>или создайте новый</div>';
    document.getElementById('item-preview').style.display = 'none';
    return;
  }

  const worn = sheet().equipped.includes(item.id);
  editor.innerHTML = `
    <div class="item-hdr">
      <div class="icon-pick">${worn ? '🎒' : '▫'}</div>
      <div style="flex:1">
        <input class="item-name-inp" id="item-name" value="${esc(item.label)}" oninput="uiSetItem('${item.id}','label',this.value)">
        <div class="meta-row">
          <button class="hbtn${worn ? ' pr' : ''}" onclick="uiEquip('${item.id}')">
            ${worn ? '✓ Надет на ' + esc(sheet().name) : 'Надеть на ' + esc(sheet().name)}
          </button>
        </div>
      </div>
    </div>

    <div class="pb">
      <div class="pb-lbl">Бонусы к полям</div>
      ${item.modifiers.map((mod, i) => modRow(item, mod, i)).join('')}
      <button class="add-row" onclick="uiAddMod('${item.id}')">+ добавить модификатор</button>
    </div>

    <div class="sys-hint">Мишень выбирается из полей, объявленных в системе. Свободный текст здесь
    невозможен: несуществующая мишень роняет сборку модификаторов, а не тихо игнорируется.</div>`;

  renderPreview(item);
}

function modRow(item, mod, i) {
  const all = targets(state.system).filter(t => t.kind === 'value');
  const literal = !(mod.value && typeof mod.value === 'object');

  return `<div class="pb" style="margin-bottom:6px;background:var(--s2)">
    <button class="pb-del" onclick="uiDelMod('${item.id}',${i})">✕</button>
    <div class="bon-row" style="grid-template-columns:1fr 92px 54px">
      <select class="meta-sel" onchange="uiSetMod('${item.id}',${i},'target',this.value)">
        ${all.map(t => `<option value="${t.tag}"${mod.target === t.tag ? ' selected' : ''}>${esc(t.label)}</option>`).join('')}
      </select>
      <select class="meta-sel" onchange="uiSetMod('${item.id}',${i},'op',this.value)">
        ${OPS.map(([v, l]) => `<option value="${v}"${mod.op === v ? ' selected' : ''}>${l}</option>`).join('')}
      </select>
      <input class="bon-v" id="mod-${i}-value" value="${esc(literal ? mod.value : mod.value.expr)}"
             oninput="uiSetMod('${item.id}',${i},'value',this.value)">
    </div>
    <div class="bon-row" style="grid-template-columns:1fr 1fr;border:none">
      <select class="meta-sel" onchange="uiSetMod('${item.id}',${i},'stacking',this.value)">
        ${STACKING.map(([v, l]) => `<option value="${v}"${(mod.stacking || 'sum') === v ? ' selected' : ''}>${l}</option>`).join('')}
      </select>
      <input class="ar-cond" style="border:1px solid var(--border2);border-radius:5px;padding:4px 6px;background:var(--bg)"
             id="mod-${i}-cond" value="${esc(mod.condition || '')}" placeholder="условие, напр. #level >= 5"
             oninput="uiSetMod('${item.id}',${i},'condition',this.value)">
    </div>
  </div>`;
}

function renderPreview(item) {
  const strip = document.getElementById('item-preview');
  strip.style.display = 'flex';
  strip.innerHTML = item.modifiers.map(mod => {
    const target = targets(state.system).find(t => t.tag === mod.target);
    const value = mod.value && typeof mod.value === 'object' ? mod.value.expr : mod.value;
    const sign = mod.op === 'add' && Number(value) >= 0 ? '+' : mod.op === 'set' ? '=' : '×';
    return `<span class="pv-chip">${esc(target ? target.label : mod.target)} <b>${sign}${esc(value)}</b></span>`;
  }).join('') || '<span class="sys-hint">Модификаторов нет.</span>';
}

// ── правки ──────────────────────────────────────────────────────────────────

export function newItem() {
  const id = 'item_' + (state.compendium.items.length + 1);
  state.compendium.items.push({
    id, label: 'Новый предмет', slot: 'misc', description: '',
    modifiers: [{ kind: 'value', target: state.system.fields[0].tag, op: 'add', value: 1, stacking: 'sum', condition: null }],
  });
  state.activeItemId = id;
}

export function deleteItem(id) {
  state.compendium.items = state.compendium.items.filter(i => i.id !== id);
  for (const s of state.sheets) s.equipped = s.equipped.filter(e => e !== id);
  if (state.activeItemId === id) state.activeItemId = null;
}

export function equip(id) {
  const current = sheet();
  current.equipped = current.equipped.includes(id)
    ? current.equipped.filter(e => e !== id)
    : [...current.equipped, id];
}

export function setItem(id, key, value) {
  const item = state.compendium.items.find(i => i.id === id);
  item[key] = value;
}

export function addMod(id) {
  const item = state.compendium.items.find(i => i.id === id);
  item.modifiers.push({
    kind: 'value', target: state.system.fields[0].tag,
    op: 'add', value: 1, stacking: 'sum', condition: null,
  });
}

export function deleteMod(id, index) {
  const item = state.compendium.items.find(i => i.id === id);
  item.modifiers.splice(index, 1);
}

export function setMod(id, index, key, raw) {
  const mod = state.compendium.items.find(i => i.id === id).modifiers[index];

  if (key === 'value') {
    // Число — литерал, всё остальное — формула. Разделение явное, потому что
    // логическое `true` формулой не выражается: в грамматике нет литералов.
    const asNumber = Number(raw);
    mod.value = raw.trim() === '' ? 0
      : raw.trim() === 'да' ? true
        : raw.trim() === 'нет' ? false
          : Number.isNaN(asNumber) ? { expr: raw } : asNumber;
    return;
  }
  if (key === 'condition') { mod.condition = raw.trim() || null; return; }
  mod[key] = raw;
}
