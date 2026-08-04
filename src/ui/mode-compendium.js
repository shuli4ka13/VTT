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
import { AMOUNT_SOURCES } from '../model/amount-sources.js';
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
        <span class="ie-icon">${r.rule ? '⚙' : KIND[r.kind].icon}</span>
        <div style="flex:1;min-width:0">
          <div class="ie-name">${esc(r.label)}</div>
          <div class="ie-sub">${r.rule ? 'вызов правила' : KIND[r.kind].word}${used[r.id] ? ` · у ${used[r.id]}` : ' · ни у кого'}</div>
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
    record.kind === 'action' || record.kind === 'spell' ? actionBody(record)
      : record.kind === 'item' ? weaponPropsBody(record) + activitiesBody(record) + modifiersBody(record)
        : record.rule ? ruleCallBody(record)
          : modifiersBody(record);

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

// Активности — действия, которые предмет даёт владельцу, пока надет
// (как в Foundry: у меча своя атака). Активность — только ссылка на
// эффект-вызов; конвейер живёт в правиле системы.
function activitiesBody(record) {
  const calls = state.compendium.effects.filter(e => e.rule);
  return `<div class="pb">
    <div class="pb-lbl">Активности — даёт, пока надет</div>
    ${(record.activities || []).map((act, i) => `
      <div class="bon-row" style="grid-template-columns:110px 1fr 20px;border:none">
        <input class="bon-v" style="text-align:left" value="${esc(act.label || '')}" placeholder="Атака"
               oninput="uiItemActSet('${record.id}',${i},'label',this.value)">
        <select class="meta-sel" onchange="uiItemActSet('${record.id}',${i},'effect',this.value)">
          ${calls.map(e => `<option value="${e.id}"${act.effect === e.id ? ' selected' : ''}>${esc(e.label)}</option>`).join('')}
        </select>
        <button class="row-del" style="opacity:.7" onclick="uiItemActDel('${record.id}',${i})">✕</button>
      </div>`).join('')}
    ${calls.length
      ? `<button class="add-row" onclick="uiItemActAdd('${record.id}')">+ активность</button>`
      : '<div class="sys-hint">Сначала заведите эффект-вызов правила.</div>'}
  </div>`;
}

// Свойства оружия: СОСТАВ объявлен системой (system.records.weapon), запись
// только заполняет значения. Нет объявления — нет и раздела: компендиум
// определяется изначальной механикой, а не наоборот.
function weaponPropsBody(record) {
  const schema = (state.system.records || {}).weapon;
  if (!schema) return '';
  const props = record.props || {};
  return `<div class="pb">
    <div class="pb-lbl">${esc(schema.label)} — свойства из системы</div>
    ${(schema.props || []).map(p => `
      <div class="bon-row" style="grid-template-columns:130px 1fr;border:none">
        <span style="font-size:11px;color:var(--muted)">${esc(p.label)}</span>
        <input class="bon-v" style="text-align:left" value="${esc(props[p.key] ?? '')}"
               placeholder="${p.kind === 'dice' ? 'напр. 1d8' : 'число'}"
               oninput="uiSetWeaponProp('${record.id}','${p.key}',this.value)">
      </div>`).join('')}
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

// Действие — ИСТОЧНИК: оружие плюс ссылка на эффект-вызов. Самого пайплайна
// здесь нет и не было бы куда положить: шаги живут в правиле системы.
function actionBody(action) {
  const calls = state.compendium.effects.filter(e => e.rule);
  return `<div class="pb">
    <div class="pb-lbl">Что происходит при применении</div>
    <div class="bon-row" style="grid-template-columns:130px 1fr;border:none">
      <span style="font-size:11px;color:var(--muted)">Эффект</span>
      <select class="meta-sel" onchange="uiSetRecord('${action.id}','effect',this.value)">
        ${calls.length
          ? calls.map(e => `<option value="${e.id}"${action.effect === e.id ? ' selected' : ''}>${esc(e.label)}</option>`).join('')
          : '<option>— в компендиуме нет эффектов-вызовов —</option>'}
      </select>
    </div>
    ${weaponRow(action)}
  </div>`;
}

function weaponRow(action) {
  return `<div class="bon-row" style="grid-template-columns:130px 1fr;border:none">
    <span style="font-size:11px;color:var(--muted)">Оружие</span>
    <select class="meta-sel" onchange="uiSetWeapon('${action.id}',this.value)">
      <option value=""${action.weapon ? '' : ' selected'}>— без оружия —</option>
      ${state.compendium.items.map(w =>
    `<option value="${w.id}"${action.weapon === w.id ? ' selected' : ''}>${esc(w.label)}</option>`).join('')}
    </select>
  </div>`;
}

// Эффект-вызов: правило по имени плюс форма параметров, ВЫВЕДЕННАЯ из
// объявления правила. Правило объявило три параметра — здесь три поля.
// Шагов в этом редакторе нет: не скрыты, а не созданы — граница режимов.
function ruleCallBody(record) {
  const rules = Object.entries(state.system.rules || {});
  const rule = (state.system.rules || {})[record.rule];

  const head = `<div class="bon-row" style="grid-template-columns:130px 1fr;border:none">
    <span style="font-size:11px;color:var(--muted)">Правило системы</span>
    <select class="meta-sel" onchange="uiSetEffectRule('${record.id}',this.value)">
      ${rules.map(([id, r]) => `<option value="${id}"${record.rule === id ? ' selected' : ''}>${esc(r.label || id)}</option>`).join('')}
    </select>
  </div>`;

  if (!rule) {
    return `<div class="pb"><div class="pb-lbl">Вызов правила</div>${head}
      <div class="sys-hint" style="color:var(--red)">система не объявляет правила «${esc(record.rule)}»</div></div>`;
  }

  return `<div class="pb">
    <div class="pb-lbl">Вызов правила — только параметры</div>
    ${head}
    ${(rule.params || []).map(p => paramRow(record, p)).join('')}
  </div>`;
}

function paramRow(record, decl) {
  const value = (record.params || {})[decl.key];
  const label = `${decl.label || decl.key}${decl.of === 'target' ? ' (считает цель)' : ''}`;

  if (decl.kind === 'expr') {
    return `<div class="pb-lbl" style="margin:10px 0 3px">${esc(label)}</div>
      ${renderFormulaInput(`fx.${record.id}.${decl.key}`, {
        placeholder: 'число или формула: наберите лейбл поля',
        read: () => String(value ?? ''),
        write: text => setEffectParam(record.id, decl.key, text),
      })}`;
  }

  let control;
  if (decl.kind === 'tag') {
    const fields = state.system.fields.filter(isNumericField);
    control = `<select class="meta-sel" onchange="uiSetEffectParam('${record.id}','${decl.key}',this.value)">
      ${fields.map(f => `<option value="${f.tag}"${value === f.tag ? ' selected' : ''}>${esc(f.label)}</option>`).join('')}
    </select>`;
  } else if (decl.kind === 'choice') {
    const options = decl.options || AMOUNT_SOURCES.map(s => s.id);
    control = `<select class="meta-sel" onchange="uiSetEffectParam('${record.id}','${decl.key}',this.value)">
      ${options.map(o => {
        const entry = AMOUNT_SOURCES.find(s => s.id === o);
        return `<option value="${o}"${value === o ? ' selected' : ''}>${esc(entry ? entry.label : o)}</option>`;
      }).join('')}
    </select>`;
  } else if (decl.kind === 'effect') {
    const wearable = state.compendium.effects.filter(e => !e.rule);
    control = `<select class="meta-sel" onchange="uiSetEffectParam('${record.id}','${decl.key}',this.value)">
      ${wearable.map(e => `<option value="${e.id}"${value === e.id ? ' selected' : ''}>${esc(e.label)}</option>`).join('')}
    </select>`;
  } else {
    control = `<input class="bon-v" style="text-align:left" value="${esc(value ?? '')}"
      placeholder="${decl.kind === 'dice' ? 'напр. 2d6' : 'число'}"
      oninput="uiSetEffectParam('${record.id}','${decl.key}',this.value)">`;
  }

  return `<div class="bon-row" style="grid-template-columns:130px 1fr;border:none">
    <span style="font-size:11px;color:var(--muted)">${esc(label)}</span>${control}
  </div>`;
}


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

// Заготовка параметров под объявление правила: у автора эффекта форма
// с первого мгновения заполнена чем-то законным, а не пустотой.
export function defaultParams(rule) {
  const params = {};
  for (const decl of (rule || {}).params || []) {
    if (decl.kind === 'expr') {
      const f = state.system.fields.find(x => x.value.kind === 'formula') || state.system.fields[0];
      params[decl.key] = '#' + f.tag;
    } else if (decl.kind === 'tag') {
      const f = state.system.fields.find(x => x.value.kind === 'stored' && x.value.type === 'number');
      params[decl.key] = (f || state.system.fields[0]).tag;
    } else if (decl.kind === 'dice') params[decl.key] = '1d6';
    else if (decl.kind === 'number') params[decl.key] = 10;
    else if (decl.kind === 'choice') params[decl.key] = (decl.options || ['roll'])[0];
    else if (decl.kind === 'effect') {
      const e = state.compendium.effects.find(x => !x.rule);
      if (e) params[decl.key] = e.id;
    }
  }
  return params;
}

function newRuleCall() {
  const [ruleId, rule] = Object.entries(state.system.rules || {})[0] || [];
  const id = newRecordId('call');
  state.compendium.effects.push({
    id, kind: 'rule', label: 'Новый вызов правила', description: '',
    rule: ruleId || '', params: defaultParams(rule),
  });
  return id;
}

export function createRecord(kind) {
  const first = state.system.fields[0].tag;
  const roll = (state.system.rolls[0] || {}).tag;

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
  if (kind === 'rulecall') {
    state.activeRecordId = newRuleCall();
    return;
  }

  // Действие ссылается на эффект-вызов; если вызовов ещё нет — заводим
  // заготовку тут же, чтобы действие родилось работоспособным.
  const spell = kind === 'spell';
  const id = newRecordId(spell ? 'spell' : 'act');
  const call = state.compendium.effects.find(e => e.rule) || { id: newRuleCall() };
  state.compendium.actions.push({
    id, kind: spell ? 'spell' : 'action',
    label: spell ? 'Новое заклинание' : 'Новое действие', description: '',
    effect: call.id,
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

export function setWeapon(id, value) {
  const action = live(id);
  if (value) action.weapon = value;
  else delete action.weapon;
}

// ── активности предмета ─────────────────────────────────────────────────────

export function addActivity(id) {
  const item = live(id);
  const firstCall = state.compendium.effects.find(e => e.rule);
  item.activities = item.activities || [];
  item.activities.push({ label: 'Атака', effect: firstCall ? firstCall.id : '' });
}

export function deleteActivity(id, index) {
  live(id).activities.splice(index, 1);
}

export function setActivity(id, index, key, value) {
  live(id).activities[index][key] = value;
}

// ── эффект-вызов: правило и параметры ───────────────────────────────────────

// Смена правила пересобирает параметры под новое объявление: у другого
// правила другие слоты, и старые значения к ним не приложить.
export function setEffectRule(id, ruleId) {
  const record = live(id);
  record.rule = ruleId;
  record.params = defaultParams((state.system.rules || {})[ruleId]);
}

export function setEffectParam(id, key, raw) {
  const record = live(id);
  const decl = (((state.system.rules || {})[record.rule] || {}).params || []).find(p => p.key === key);
  record.params = record.params || {};
  const value = typeof raw === 'string' ? raw.trim() : raw;
  if (value === '' || value === undefined) { delete record.params[key]; return; }
  record.params[key] = decl && decl.kind === 'number' && !Number.isNaN(Number(value))
    ? Number(value)
    : value;
}

export function setWeaponProp(id, key, raw) {
  const record = live(id);
  const schema = ((state.system.records || {}).weapon || {}).props || [];
  const kind = (schema.find(p => p.key === key) || {}).kind;
  const value = String(raw).trim();
  record.props = record.props || {};
  if (!value) { delete record.props[key]; return; }
  record.props[key] = kind === 'number' && !Number.isNaN(Number(value)) ? Number(value) : value;
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

