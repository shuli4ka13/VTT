// Режим компендиума: общая библиотека записей.
//
// Один список, на разделы не дроблю. Предмет, эффект, действие и заклинание
// живут вперемешку с пометкой рода — так и просили.
//
// Все три рода ссылаются только на УЖЕ объявленные теги: мишень бонуса, мишень
// броска, тег спасброска, тег урона выбираются из выпадающих списков. Свободного
// текста нет нигде — именно из-за него в черновике бонусы никуда не резолвились
// (reference/index.html:1518). Нового тега запись ввести не может, поэтому
// создавать её волен и игрок.

import { state, esc, newRecordId, log } from './state.js';
import { targets } from '../engine/targets.js';
import { ADVANTAGE_METHODS } from '../model/advantage-methods.js';
import { allRecords } from '../model/compendium.js';
import { renderFormulaInput } from './formula-input.js';
import { field } from './state.js';

const OPS = [['add', '+ прибавить'], ['set', '= задать'], ['mul', '× умножить']];
const STACKING = [['sum', 'складывать'], ['max', 'брать наибольший'], ['override', 'последний побеждает']];
const KIND = {
  item: { word: 'предмет', icon: '⬡' },
  effect: { word: 'эффект', icon: '✦' },
  action: { word: 'действие', icon: '⚔' },
  spell: { word: 'заклинание', icon: '🔮' },
};

export function renderCompendium() {
  renderList();
  renderRecord();
}

function renderList() {
  const records = allRecords(state.compendium);
  const used = usage();

  document.getElementById('comp-list').innerHTML = records.length
    ? records.map(r => `
      <div class="item-entry${state.activeRecordId === r.id ? ' on' : ''}" onclick="uiPickRecord('${r.id}')">
        <span class="ie-icon">${KIND[r.kind].icon}</span>
        <div style="flex:1;min-width:0">
          <div class="ie-name">${esc(r.label)}</div>
          <div class="ie-sub">${KIND[r.kind].word}${used[r.id] ? ` · у ${used[r.id]}` : ' · ни у кого'}</div>
        </div>
        <button class="ie-del" onclick="event.stopPropagation();uiDelRecord('${r.id}')">✕</button>
      </div>`).join('')
    : '<div class="char-empty-hint">Библиотека пуста.</div>';
}

// Кто на запись ссылается. Персонажи держат только ссылки, копий нет.
function usage() {
  const map = {};
  for (const s of state.sheets) {
    for (const id of [...s.equipped, ...s.actions, ...s.effects.map(e => e.effectId)]) {
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

  const head = `
    <div class="item-hdr">
      <div class="icon-pick">${KIND[record.kind].icon}</div>
      <div style="flex:1">
        <input class="item-name-inp" id="rec-name" value="${esc(record.label)}"
               oninput="uiSetRecord('${record.id}','label',this.value)">
        <div class="meta-row"><span class="rarity-badge" style="background:var(--s2);color:var(--muted)">
          ${KIND[record.kind].word}</span></div>
      </div>
    </div>`;

  const body =
    record.kind === 'action' || record.kind === 'spell' ? actionBody(record) : modifiersBody(record);

  host.innerHTML = head + body + `
    <textarea class="desc-ta" placeholder="Описание для игрока…"
      oninput="uiSetRecord('${record.id}','description',this.value)">${esc(record.description || '')}</textarea>`;
}

// Один редактор модификаторов для предметов и эффектов: разницы между ними
// в этом месте нет. Разница между ПОРОДАМИ модификатора — есть, и она главная:
//
//   правит значение — обычная арифметика, складывается по правилу стакинга;
//   правит бросок   — либо числовая прибавка (тоже складывается),
//                     либо преимущество/помеха (не число, помеха гасит).
//
// Всё это движок различал с самого начала; раньше эффекту в редакторе было
// доступно только преимущество с помехой, и «+5 к Мудрости» эффектом было не завести.
function modifiersBody(record) {
  const fields = targets(state.system).filter(t => t.kind === 'value');
  const rolls = targets(state.system).filter(t => t.kind === 'roll');

  return `<div class="pb">
    <div class="pb-lbl">Что делает</div>
    ${(record.modifiers || []).map((mod, i) => modRow(record.id, mod, i, fields, rolls)).join('')}
    <button class="add-row" onclick="uiAddMod('${record.id}')">+ добавить</button>
  </div>`;
}

function modRow(id, mod, i, fields, rolls) {
  const isRoll = mod.kind === 'roll';
  const behaviour = !isRoll ? mod.op : mod.effect ? mod.effect : 'bonus';
  const literal = !(mod.value && typeof mod.value === 'object');
  const list = isRoll ? rolls : fields;

  const target = field(mod.target);
  const logical = !isRoll && target && target.value.type === 'boolean';

  return `<div class="pb" style="margin-bottom:6px;background:var(--s2)">
    <button class="pb-del" onclick="uiDelMod('${id}',${i})">✕</button>

    <div class="bon-row" style="grid-template-columns:1fr 1fr;border:none">
      <select class="meta-sel" onchange="uiSetMod('${id}',${i},'kind',this.value)">
        <option value="value"${isRoll ? '' : ' selected'}>Правит значение поля</option>
        <option value="roll"${isRoll ? ' selected' : ''}>Правит бросок</option>
      </select>
      <select class="meta-sel" onchange="uiSetMod('${id}',${i},'behaviour',this.value)">
        ${isRoll ? `
          <option value="bonus"${behaviour === 'bonus' ? ' selected' : ''}>Прибавка к броску</option>
          <option value="advantage"${behaviour === 'advantage' ? ' selected' : ''}>Преимущество</option>
          <option value="disadvantage"${behaviour === 'disadvantage' ? ' selected' : ''}>Помеха</option>`
        : `
          <option value="add"${behaviour === 'add' ? ' selected' : ''}>+ прибавить</option>
          <option value="set"${behaviour === 'set' ? ' selected' : ''}>= задать</option>
          <option value="mul"${behaviour === 'mul' ? ' selected' : ''}>× умножить</option>`}
      </select>
    </div>

    <div class="bon-row" style="grid-template-columns:1fr 1fr;border:none">
      <select class="meta-sel" onchange="uiSetMod('${id}',${i},'target',this.value)">
        ${list.map(t => `<option value="${t.tag}"${mod.target === t.tag ? ' selected' : ''}>${esc(t.label)}</option>`).join('')}
      </select>
      ${mod.effect ? `
        <select class="meta-sel" onchange="uiSetMod('${id}',${i},'method',this.value)">
          ${ADVANTAGE_METHODS.map(m => `<option value="${m.id}"${mod.method === m.id ? ' selected' : ''}>${esc(m.label)}${m.implemented ? '' : ' — не отыгран'}</option>`).join('')}
        </select>`
      : `<select class="meta-sel" onchange="uiSetMod('${id}',${i},'stacking',this.value)">
          ${STACKING.map(([v, l]) => `<option value="${v}"${(mod.stacking || 'sum') === v ? ' selected' : ''}>${l}</option>`).join('')}
        </select>`}
    </div>

    ${mod.effect ? '' : `
      <div class="pb-lbl" style="margin:8px 0 3px">Насколько</div>
      ${logical
        ? `<select class="meta-sel" style="width:100%" onchange="uiSetMod('${id}',${i},'value',this.value)">
            <option value="да"${mod.value === true ? ' selected' : ''}>да</option>
            <option value="нет"${mod.value !== true ? ' selected' : ''}>нет</option>
          </select>`
        // Тот же редактор формул, что у полей системы: подсказка по лейблам,
        // чипсы, разбор. «+#prof_bonus к Классу брони» набирается по-человечески.
        : renderFormulaInput(`mod.${id}.${i}.value`, {
          placeholder: 'число или формула: наберите «Бонус»',
          read: () => (literal ? String(mod.value ?? '') : mod.value.expr),
          write: expr => writeModValue(id, i, expr),
        })}`}

    <div class="pb-lbl" style="margin:8px 0 3px">Когда действует</div>
    ${renderFormulaInput(`mod.${id}.${i}.cond`, {
      placeholder: 'всегда — оставьте пустым',
      read: () => mod.condition || '',
      write: expr => setMod(id, i, 'condition', expr),
    })}
  </div>`;
}

// Числовое поле: с ним есть смысл сравнивать бросок и из него есть смысл
// вычитать урон. Текстовые и логические сюда не годятся — «против чего: Раса»
// молча давало бы вечный промах.
const isNumericField = f =>
  f.value.kind !== 'stored' ? f.value.kind !== 'text' : f.value.type === 'number';

function actionBody(action) {
  const env = action.envelope;
  const numericFields = state.system.fields.filter(isNumericField)
    .map(f => ({ tag: f.tag, label: f.label }));
  // Урон льётся только в хранимое поле: вычисляемое считает движок, писать в него
  // событию нечего, и раньше это молча ничего не делало.
  const writableFields = state.system.fields
    .filter(f => f.value.kind === 'stored' && f.value.type === 'number')
    .map(f => ({ tag: f.tag, label: f.label }));
  const fields = numericFields;
  const rolls = targets(state.system).filter(t => t.kind === 'roll');
  const pick = (label, path, value, list) => `
    <div class="bon-row" style="grid-template-columns:130px 1fr;border:none">
      <span style="font-size:11px;color:var(--muted)">${label}</span>
      <select class="meta-sel" onchange="uiSetEnvelope('${action.id}','${path}',this.value)">
        ${list.map(t => `<option value="${t.tag}"${value === t.tag ? ' selected' : ''}>${esc(t.label)}</option>`).join('')}
      </select>
    </div>`;

  const shape = `
    <div class="bon-row" style="grid-template-columns:130px 1fr;border:none">
      <span style="font-size:11px;color:var(--muted)">Что это</span>
      <select class="meta-sel" onchange="uiSetEnvelope('${action.id}','kind',this.value)">
        <option value="attack"${env.kind === 'attack' ? ' selected' : ''}>Атака по цели</option>
        <option value="save"${env.kind === 'save' ? ' selected' : ''}>Спасбросок цели</option>
      </select>
    </div>`;

  const body = env.kind === 'attack'
    ? pick('Бонус атаки', 'roll.bonus', ref(env.roll.bonus), fields)
      + pick('Мишень броска', 'roll.target', env.roll.target, rolls)
      + pick('Против чего', 'versus', env.versus, fields)
      + pick('Куда урон', 'onHit.applyTo', env.onHit.applyTo, writableFields)
      + dice('Кубы урона', 'onHit.damage.dice', env.onHit.damage.dice, action.id)
    : pick('Чем спасается', 'saveTag', env.saveTag, fields)
      + pick('Сложность', 'dc', ref(env.dc), fields)
      + pick('Куда урон', 'onFail.applyTo', (env.onFail || {}).applyTo, writableFields)
      + dice('Кубы урона', 'onFail.damage.dice', ((env.onFail || {}).damage || {}).dice, action.id);

  return `<div class="pb">
    <div class="pb-lbl">Конверт намерения</div>
    ${shape}${body}
  </div>`;
}

function dice(label, path, value, id) {
  return `<div class="bon-row" style="grid-template-columns:130px 1fr;border:none">
    <span style="font-size:11px;color:var(--muted)">${label}</span>
    <input class="bon-v" style="text-align:left" value="${esc(value || '1d6')}" placeholder="напр. 2d6"
           oninput="uiSetEnvelope('${id}','${path}',this.value)">
  </div>`;
}

const ref = expr => String(expr ?? '').replace(/^#/, '');

// ── правки ──────────────────────────────────────────────────────────────────

export function find(id) {
  return allRecords(state.compendium).find(r => r.id === id) || null;
}

// Возвращает живой объект из компендиума, а не копию из allRecords.
function live(id) {
  const { items, effects, actions } = state.compendium;
  return items.find(r => r.id === id) || effects.find(r => r.id === id) || actions.find(r => r.id === id) || null;
}

export function pickRecord(id) {
  state.activeRecordId = id;
}

export function createRecord(kind) {
  const first = state.system.fields[0].tag;
  const roll = (state.system.rolls[0] || {}).tag;
  const formulaTag = (state.system.fields.find(f => f.value.kind === 'formula') || state.system.fields[0]).tag;

  if (kind === 'item') {
    const id = newRecordId('item');
    state.compendium.items.push({
      id, label: 'Новый предмет', slot: 'misc', description: '',
      modifiers: [{ kind: 'value', target: first, op: 'add', value: 1, stacking: 'sum', condition: null }],
    });
    state.activeRecordId = id;
    return;
  }
  if (kind === 'effect') {
    const id = newRecordId('fx');
    state.compendium.effects.push({
      id, label: 'Новый эффект', icon: '✦', duration: { kind: 'scene' }, description: '',
      modifiers: [{ kind: 'roll', target: roll, effect: 'disadvantage', method: 'rerollBest', condition: null }],
    });
    state.activeRecordId = id;
    return;
  }

  const spell = kind === 'spell';
  const id = newRecordId(spell ? 'spell' : 'act');
  state.compendium.actions.push({
    id, kind: spell ? 'spell' : 'action',
    label: spell ? 'Новое заклинание' : 'Новое действие', description: '',
    envelope: {
      kind: 'attack',
      roll: { die: 20, bonus: '#' + formulaTag, target: roll },
      versus: formulaTag,
      onHit: { damage: { dice: '1d6' }, applyTo: first },
    },
  });
  state.activeRecordId = id;
}

export function deleteRecord(id) {
  const { compendium } = state;
  compendium.items = compendium.items.filter(r => r.id !== id);
  compendium.effects = compendium.effects.filter(r => r.id !== id);
  compendium.actions = compendium.actions.filter(r => r.id !== id);

  for (const s of state.sheets) {
    s.equipped = s.equipped.filter(e => e !== id);
    s.actions = s.actions.filter(a => a !== id);
    s.effects = s.effects.filter(e => e.effectId !== id);
  }
  if (state.activeRecordId === id) state.activeRecordId = null;
  log(`Запись убрана из компендиума и со всех персонажей.`);
}

export function setRecord(id, key, value) {
  const record = live(id);
  if (record) record[key] = value;
}

const firstField = () => state.system.fields[0].tag;
const firstRoll = () => (state.system.rolls[0] || {}).tag;

export function addMod(id) {
  const record = live(id);
  const asRoll = record.kind === 'effect' && !(record.modifiers || []).length;
  record.modifiers = record.modifiers || [];
  record.modifiers.push(asRoll
    ? { kind: 'roll', target: firstRoll(), effect: 'disadvantage', method: 'rerollBest', condition: null }
    : { kind: 'value', target: firstField(), op: 'add', value: 1, stacking: 'sum', condition: null });
}

export function deleteMod(id, index) {
  live(id).modifiers.splice(index, 1);
}

// Число остаётся литералом, всё прочее — формулой. Разделение явное: логических
// литералов в грамматике нет, и «истину» формулой не выразить.
export function writeModValue(id, index, expr) {
  const mod = live(id).modifiers[index];
  const trimmed = String(expr).trim();
  const asNumber = Number(trimmed);
  mod.value = !trimmed ? 0 : Number.isNaN(asNumber) ? { expr: trimmed } : asNumber;
}

export function setMod(id, index, key, raw) {
  const record = live(id);
  const mod = record.modifiers[index];

  // Смена породы: у значения и у броска разные мишени и разные поля,
  // поэтому модификатор пересобирается целиком, а не правится по кусочку.
  if (key === 'kind') {
    record.modifiers[index] = raw === 'roll'
      ? { kind: 'roll', target: firstRoll(), op: 'add', value: 1, stacking: 'sum', condition: mod.condition ?? null }
      : { kind: 'value', target: firstField(), op: 'add', value: 1, stacking: 'sum', condition: mod.condition ?? null };
    return;
  }

  // Что именно делает: для значения это операция, для броска — прибавка
  // либо преимущество с помехой. Прибавка складывается, преимущество нет.
  if (key === 'behaviour') {
    if (mod.kind !== 'roll') { mod.op = raw; return; }

    if (raw === 'bonus') {
      record.modifiers[index] = {
        kind: 'roll', target: mod.target, op: 'add', value: 1,
        stacking: 'sum', condition: mod.condition ?? null,
      };
    } else {
      record.modifiers[index] = {
        kind: 'roll', target: mod.target, effect: raw,
        method: mod.method || 'rerollBest', condition: mod.condition ?? null,
      };
    }
    return;
  }

  if (key === 'value') {
    // Число — литерал, всё прочее — формула. Разделение явное: логическое
    // «истина» в грамматике формул не выражается, литералов там нет.
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

// Правка конверта по пути вида «onHit.damage.dice». Теги приходят из
// выпадающих списков, поэтому проверять их на существование не нужно.
export function setEnvelope(id, path, value) {
  const action = live(id);
  const env = action.envelope;

  if (path === 'kind') return reshape(action, value);

  const parts = path.split('.');
  const last = parts.pop();
  let node = env;
  for (const key of parts) {
    if (!node[key]) node[key] = {};
    node = node[key];
  }
  // Ссылки на поля хранятся с решёткой, кубы и мишени бросков — как есть.
  node[last] = last === 'bonus' || last === 'dc' ? '#' + value : value;
}

function reshape(action, kind) {
  const first = state.system.fields[0].tag;
  const roll = (state.system.rolls[0] || {}).tag;
  const formulaTag = (state.system.fields.find(f => f.value.kind === 'formula') || state.system.fields[0]).tag;

  action.envelope = kind === 'attack'
    ? {
      kind: 'attack',
      roll: { die: 20, bonus: '#' + formulaTag, target: roll },
      versus: formulaTag,
      onHit: { damage: { dice: '1d6' }, applyTo: first },
    }
    : {
      kind: 'save',
      saveTag: formulaTag,
      dc: '#' + formulaTag,
      onFail: { damage: { dice: '1d6' }, applyTo: first, effect: null },
      onSuccess: null,
    };
}
