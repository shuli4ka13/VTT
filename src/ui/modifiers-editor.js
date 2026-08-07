// Редактор модификаторов. Один на две породы владельцев:
//
//   предмет компендиума — кольчуга задаёт базу доспеха; это свойство ВЕЩИ
//   пассивный эффект системы — «Отравлен» даёт помеху, пока висит
//
// Форма одна, потому что модификатор один и тот же: источник → условие →
// цель → правило стакинга. Кто его носит, редактору знать нужно ровно
// затем, чтобы найти объект и записать правку.
//
// Владелец адресуется строкой «порода:id» — `item:chain-mail`,
// `effect:poisoned`. Строка едет в onclick разметки, поэтому она и есть
// адрес: разбирать её умеет только этот модуль.
//
// Две породы модификаторов, и смешивать их нельзя:
//   value — правит ЗНАЧЕНИЕ, обычная арифметика, складывается по стакингу
//   roll  — правит БРОСОК: преимущество это не «+2», это два кубика и выбор

import { state, esc, field } from './state.js';
import { targets } from '../engine/targets.js';
import { ADVANTAGE_METHODS, enabledMethods } from '../model/advantage-methods.js';
import { renderFormulaInput } from './formula-input.js';

const STACKING = [['sum', 'складывать'], ['max', 'брать наибольший'], ['override', 'последний побеждает']];

// ── адресация владельца ─────────────────────────────────────────────────────

export const ownerKey = (kind, id) => `${kind}:${id}`;

export function ownerOf(key) {
  const at = String(key).indexOf(':');
  const kind = key.slice(0, at);
  const id = key.slice(at + 1);
  if (kind === 'effect') return (state.system.effects || {})[id] || null;
  return state.compendium.items.find(r => r.id === id)
    || state.compendium.actions.find(r => r.id === id)
    || null;
}

// ── разметка ────────────────────────────────────────────────────────────────

export function modifiersBody(key, owner, title = 'Что делает') {
  const fields = targets(state.system).filter(t => t.kind === 'value');
  const rolls = targets(state.system).filter(t => t.kind === 'roll');

  return `<div class="pb">
    <div class="pb-lbl">${esc(title)}</div>
    ${(owner.modifiers || []).map((mod, i) => modRow(key, mod, i, fields, rolls)).join('')}
    <button class="add-row" onclick="uiAddMod('${key}')">+ добавить</button>
  </div>`;
}

function modRow(key, mod, i, fields, rolls) {
  const isRoll = mod.kind === 'roll';
  const behaviour = !isRoll ? mod.op : mod.effect ? mod.effect : 'bonus';
  const literal = !(mod.value && typeof mod.value === 'object');
  const list = isRoll ? rolls : fields;

  const target = field(mod.target);
  const logical = !isRoll && target && target.value.type === 'boolean';

  return `<div class="pb" style="margin-bottom:6px;background:var(--s2)">
    <button class="pb-del" onclick="uiDelMod('${key}',${i})">✕</button>

    <div class="bon-row" style="grid-template-columns:1fr 1fr;border:none">
      <select class="meta-sel" onchange="uiSetMod('${key}',${i},'kind',this.value)">
        <option value="value"${isRoll ? '' : ' selected'}>Правит значение поля</option>
        <option value="roll"${isRoll ? ' selected' : ''}>Правит бросок</option>
      </select>
      <select class="meta-sel" onchange="uiSetMod('${key}',${i},'behaviour',this.value)">
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
      <select class="meta-sel" onchange="uiSetMod('${key}',${i},'target',this.value)">
        ${list.map(t => `<option value="${t.tag}"${mod.target === t.tag ? ' selected' : ''}>${esc(t.label)}</option>`).join('')}
      </select>
      ${mod.effect ? `
        <select class="meta-sel" onchange="uiSetMod('${key}',${i},'method',this.value)">
          ${methodOptions(mod.method).join('')}
        </select>`
      : `<select class="meta-sel" onchange="uiSetMod('${key}',${i},'stacking',this.value)">
          ${STACKING.map(([v, l]) => `<option value="${v}"${(mod.stacking || 'sum') === v ? ' selected' : ''}>${l}</option>`).join('')}
        </select>`}
    </div>

    ${mod.effect ? '' : `
      <div class="pb-lbl" style="margin:8px 0 3px">Насколько</div>
      ${logical
        ? `<select class="meta-sel" style="width:100%" onchange="uiSetMod('${key}',${i},'value',this.value)">
            <option value="да"${mod.value === true ? ' selected' : ''}>да</option>
            <option value="нет"${mod.value !== true ? ' selected' : ''}>нет</option>
          </select>`
        // Тот же редактор формул, что у полей системы: подсказка по лейблам,
        // чипсы, разбор. «+#prof_bonus к Классу брони» набирается по-человечески.
        : renderFormulaInput(`mod.${key}.${i}.value`, {
          placeholder: 'число или формула: наберите «Бонус»',
          read: () => (literal ? String(mod.value ?? '') : mod.value.expr),
          write: expr => writeModValue(key, i, expr),
        })}`}

    <div class="pb-lbl" style="margin:8px 0 3px">Когда действует</div>
    ${renderFormulaInput(`mod.${key}.${i}.cond`, {
      placeholder: 'всегда — оставьте пустым',
      read: () => mod.condition || '',
      write: expr => setMod(key, i, 'condition', expr),
    })}
  </div>`;
}

function methodOptions(current) {
  const enabled = enabledMethods(state.system);
  const stale = current && !enabled.some(m => m.id === current) ? ADVANTAGE_METHODS.find(m => m.id === current) : null;
  if (!enabled.length && !stale) return ['<option value="">— система не объявляет механик преимущества —</option>'];
  return [
    ...enabled.map(m => `<option value="${m.id}"${current === m.id ? ' selected' : ''}>${esc(m.label)}${m.implemented ? '' : ' — не отыгран'}</option>`),
    ...(stale ? [`<option value="${stale.id}" selected>${esc(stale.label)} — выключена в системе</option>`] : []),
  ];
}

// ── правки ──────────────────────────────────────────────────────────────────

const firstField = () => ((state.system.fields[0]) || {}).tag ?? null;
const firstRoll = () => ((state.system.rolls || [])[0] || {}).tag;

// Заготовка нового модификатора: правит бросок объявленной механикой на
// объявленную мишень, если системе есть что объявить, иначе честное значение —
// roll-заготовка без механики или без мишени была бы нерабочей тишком.
export function defaultModifier(system) {
  const method = enabledMethods(system)[0];
  const rollTarget = (system.rolls || [])[0];
  if (method && rollTarget) {
    return { kind: 'roll', target: rollTarget.tag, effect: 'disadvantage', method: method.id, condition: null };
  }
  // Система с чистого листа может не иметь ещё ни одного поля: мишень —
  // честный null, выпадашка мишеней просто пуста, движок ничего не считает.
  const first = system.fields[0];
  return { kind: 'value', target: first ? first.tag : null, op: 'add', value: 1, stacking: 'sum', condition: null };
}

// Первый модификатор ПАССИВНОГО эффекта рождается правящим бросок: эффект
// без модификаторов заводят чаще всего ради помехи. У предмета наоборот —
// его дело бонусы к полям, и roll-заготовку он не получает.
export function addMod(key) {
  const owner = ownerOf(key);
  if (!owner) return;
  const asRoll = key.startsWith('effect:') && !(owner.modifiers || []).length;
  owner.modifiers = owner.modifiers || [];
  owner.modifiers.push(asRoll ? defaultModifier(state.system)
    : { kind: 'value', target: firstField(), op: 'add', value: 1, stacking: 'sum', condition: null });
}

export function deleteMod(key, index) {
  const owner = ownerOf(key);
  if (owner) owner.modifiers.splice(index, 1);
}

// Число остаётся литералом, всё прочее — формулой. Разделение явное: логических
// литералов в грамматике нет, и «истину» формулой не выразить.
export function writeModValue(key, index, expr) {
  const mod = ownerOf(key).modifiers[index];
  const trimmed = String(expr).trim();
  const asNumber = Number(trimmed);
  mod.value = !trimmed ? 0 : Number.isNaN(asNumber) ? { expr: trimmed } : asNumber;
}

export function setMod(key, index, prop, raw) {
  const owner = ownerOf(key);
  if (!owner) return;
  const mod = owner.modifiers[index];

  // Смена породы: у значения и у броска разные мишени и разные поля,
  // поэтому модификатор пересобирается целиком, а не правится по кусочку.
  if (prop === 'kind') {
    owner.modifiers[index] = raw === 'roll'
      ? { kind: 'roll', target: firstRoll(), op: 'add', value: 1, stacking: 'sum', condition: mod.condition ?? null }
      : { kind: 'value', target: firstField(), op: 'add', value: 1, stacking: 'sum', condition: mod.condition ?? null };
    return;
  }

  // Что именно делает: для значения это операция, для броска — прибавка
  // либо преимущество с помехой. Прибавка складывается, преимущество нет.
  if (prop === 'behaviour') {
    if (mod.kind !== 'roll') { mod.op = raw; return; }

    if (raw === 'bonus') {
      owner.modifiers[index] = {
        kind: 'roll', target: mod.target, op: 'add', value: 1,
        stacking: 'sum', condition: mod.condition ?? null,
      };
    } else {
      owner.modifiers[index] = {
        kind: 'roll', target: mod.target, effect: raw,
        method: mod.method || 'rerollBest', condition: mod.condition ?? null,
      };
    }
    return;
  }

  if (prop === 'value') {
    const asNumber = Number(raw);
    mod.value = raw.trim() === '' ? 0
      : raw.trim() === 'да' ? true
        : raw.trim() === 'нет' ? false
          : Number.isNaN(asNumber) ? { expr: raw } : asNumber;
    return;
  }
  if (prop === 'condition') { mod.condition = raw.trim() || null; return; }
  mod[prop] = raw;
}
