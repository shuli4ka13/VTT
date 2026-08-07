// Шаблоны из образцовых систем — «намешать в свою систему море всего».
//
// Принцип один на все палитры: образец — ДОНОР, копия — своя, донор не
// меняется. Копия приезжает РАБОТОСПОСОБНОЙ: эффект тянет свою кость, мишень
// броска и механику преимущества, блок полей — зависимости формул и таблицы.
// Приехать должно работающее, а не огрызок со ссылками в пустоту.
//
// Раскладка палитры эффектов — по МЕХАНИКАМ, а не по системам: собирая свою
// атаку, человек хочет видеть рядом «как это делает 5e» и «как киберпанк».
// Система-донор при этом не исчезает — она подпись на карточке и фильтр.
// Две оси одной карточки: категория говорит ЧТО это, подпись — ОТКУДА взято.
//
// Ссылки на свойства записей ({ prop: 'damage_dice' }) не резолвятся при
// копировании намеренно: свойство объявляет РОД записи, рода подтягиваются
// своим шаблоном на сцене «Записи» — приговор эффекта скажет, чего не хватает.

import { state, esc } from './state.js';
import { SAMPLE_SYSTEMS, SAMPLE_WORLDS } from '../model/systems.js';
import { compile } from '../formula/index.js';
import { isPipeline } from '../engine/effects.js';
import { bindingsOf } from '../events/envelope.js';

// ── копирование ─────────────────────────────────────────────────────────────
// Два режима переноса, и разница принципиальна:
//   copy…    — явная копия по клику: конфликт имён решается новым ключом;
//   ensure…  — зависимость приезжает ВСЛЕД за копией: уже есть — переиспользуем,
//              ничего не затираем и не дублируем.

export function ensureRollFrom(donor, tag) {
  if ((state.system.rolls || []).some(r => r.tag === tag)) return;
  const src = (donor.rolls || []).find(r => r.tag === tag);
  if (src) (state.system.rolls || (state.system.rolls = [])).push(structuredClone(src));
}

export function ensureConstantFrom(donor, name) {
  if ((state.system.constants || {})[name]) return;
  const src = (donor.constants || {})[name];
  if (src) (state.system.constants || (state.system.constants = {}))[name] = structuredClone(src);
}

function ensureMethod(id) {
  if (!id) return;
  const advantage = state.system.advantage || (state.system.advantage = { methods: {} });
  (advantage.methods || (advantage.methods = {}))[id] = true;
}

function ensureKindFrom(donor, rk) {
  if (!rk || (state.system.records || {})[rk]) return;
  const src = (donor.records || {})[rk];
  if (src) (state.system.records || (state.system.records = {}))[rk] = structuredClone(src);
}

function ensureCostFrom(donor, cost) {
  if (!cost || (state.system.action_types || {})[cost]) return;
  const src = (donor.action_types || {})[cost];
  if (src) (state.system.action_types || (state.system.action_types = {}))[cost] = structuredClone(src);
}

// Что эффекту нужно, чтобы работать: кость, на которую ссылаются его броски,
// мишени этих бросков, механики преимущества его модификаторов, тип действия.
function pullEffectDeps(donor, effect) {
  ensureCostFrom(donor, effect.cost);
  for (const step of effect.steps || []) {
    const constant = step.roll && step.roll.die && step.roll.die.constant;
    if (constant) ensureConstantFrom(donor, constant);
    const check = step.roll && step.roll.check;
    if (check) ensureRollFrom(donor, check);
  }
  for (const mod of effect.modifiers || []) {
    if (mod.kind !== 'roll') continue;
    ensureRollFrom(donor, mod.target);
    if (mod.effect) ensureMethod(mod.method);
  }
}

export function copyEffectFrom(donor, effectId) {
  const effects = state.system.effects || (state.system.effects = {});
  let id = effectId;
  let n = 1;
  while (effects[id]) id = `${effectId}_${++n}`;
  const effect = structuredClone(donor.effects[effectId]);
  effects[id] = effect;
  pullEffectDeps(donor, effect);
  state.activeRuleId = id;
  return id;
}

// Эффект-зависимость сохраняет родной id: на него ссылаются записи компендиума
// и правила комнаты, и переименование их порвало бы.
function ensureEffectFrom(donor, effectId) {
  if (!effectId || (state.system.effects || {})[effectId]) return;
  const src = (donor.effects || {})[effectId];
  if (!src) return;
  const effect = structuredClone(src);
  (state.system.effects || (state.system.effects = {}))[effectId] = effect;
  pullEffectDeps(donor, effect);
}

// Правило комнаты — тот же пассивный эффект, просто включённый на всех.
// Приезжает работоспособным: с мишенью броска и объявлением механики.
export function copyRoomRuleFrom(donor, effectId) {
  ensureEffectFrom(donor, effectId);
  const room = state.system.room_rules || (state.system.room_rules = []);
  if (!room.includes(effectId) && (state.system.effects || {})[effectId]) room.push(effectId);
}

// ОДИН ШАГ из чужого конвейера — самый мелкий калибр палитры и то самое
// «взять шаблон урона из киберпанка». Шаг вставляется в эффект, открытый
// сейчас в центре экрана; новых данных для этого не нужно — шаги и так
// лежат данными внутри эффектов-доноров.
export function copyStepFrom(donor, effectId, index) {
  const target = (state.system.effects || {})[state.activeRuleId];
  if (!target || !isPipeline(target)) return null;
  const src = ((donor.effects || {})[effectId] || {}).steps || [];
  const step = src[index];
  if (!step) return null;

  const clone = structuredClone(step);
  // Имя результата обязано быть уникальным внутри конвейера: на него
  // ссылаются следующие шаги через { ref }.
  if (clone.id) {
    let name = clone.id;
    let n = 1;
    while ((target.steps || []).some(s => s.id === name)) name = `${clone.id}_${++n}`;
    clone.id = name;
  }
  (target.steps || (target.steps = [])).push(clone);
  pullEffectDeps(donor, { steps: [clone] });
  return clone;
}

// Готовая запись компендиума. Приезжает РАБОЧЕЙ ЦЕПОЧКОЙ: запись тянет свой
// род (а с ним привязки и объявления свойств), привязки тянут эффекты,
// эффекты — кость и мишень. Поля листа НЕ тянутся: записи комбинируют
// объявленное, недостающее поле — повод скопировать блок.
export function copyRecordFrom(world, recordId) {
  const { system: donor, compendium: book } = world;
  const mine = state.compendium;
  if ([...mine.items, ...mine.actions].some(r => r.id === recordId)) return recordId;

  const shelf = ['items', 'actions'].find(k => (book[k] || []).some(r => r.id === recordId));
  if (!shelf) return null;
  const clone = structuredClone(book[shelf].find(r => r.id === recordId));
  mine[shelf].push(clone);

  ensureKindFrom(donor, clone.rk);
  for (const binding of bindingsOf(clone, donor)) ensureEffectFrom(donor, binding.effect);
  for (const mod of clone.modifiers || []) {
    if (mod.kind !== 'roll') continue;
    ensureRollFrom(donor, mod.target);
    if (mod.effect) ensureMethod(mod.method);
  }
  return recordId;
}

// Блок — группа полей. Вместе с полем едут его зависимости по формуле
// (даже из других блоков: «Навыки» притянут «Модификаторы», те — «Характеристики»)
// и таблицы табличных полей. Уже существующий тег переиспользуется: смешение,
// а не затирание.
export function copyBlockFrom(donor, group) {
  const queue = donor.fields.filter(f => f.group === group).map(f => f.tag);
  const seen = new Set(queue);

  while (queue.length) {
    const tag = queue.shift();
    const src = donor.fields.find(f => f.tag === tag);
    if (!src) continue; // зависимость вне донора — приговор формулы покажет
    if (state.system.fields.some(f => f.tag === tag)) continue;

    state.system.fields.push(structuredClone(src));

    if (src.value.kind === 'table' && !(state.system.tables || {})[src.value.table]) {
      const table = (donor.tables || {})[src.value.table];
      if (table) (state.system.tables || (state.system.tables = {}))[src.value.table] = structuredClone(table);
    }

    const expr = src.value.kind === 'formula' ? src.value.expr
      : src.value.kind === 'table' ? src.value.arg : '';
    if (!expr) continue;
    try {
      for (const dep of compile(expr).deps) {
        if (!seen.has(dep)) { seen.add(dep); queue.push(dep); }
      }
    } catch { /* формула донора не разобралась — поле уже скопировано, приговор скажет */ }
  }
}

export function copyTableFrom(donor, tableName) {
  const tables = state.system.tables || (state.system.tables = {});
  let name = tableName;
  let n = 1;
  while (tables[name]) name = `${tableName}_${++n}`;
  tables[name] = structuredClone(donor.tables[tableName]);
  return name;
}

export const donorById = id => SAMPLE_SYSTEMS.find(s => s.id === id) || null;
export const worldById = id => SAMPLE_WORLDS.find(w => w.system.id === id) || null;

// ── палитры шаблонов ────────────────────────────────────────────────────────

// Доноры — ВСЕ образцы, включая тот, с которого система начата: удалил
// блок или эффект — сможешь вернуть из образца. Уже существующее не
// прячется, а помечается «уже в системе» (и всё равно копируемо).
const donors = () => SAMPLE_SYSTEMS;

const palItem = (icon, title, sub, onclick, have) =>
  `<div class="pal-item"${have ? ' style="opacity:.45"' : ''} onclick="${onclick}">
    <span class="pal-icon">${icon}</span>
    <div><div class="pal-t">${esc(title)}</div><div class="pal-s">${sub}</div></div>
  </div>`;

// Сцена «Лист», правая колонка: блоки полей образцовых систем.
export function blockTemplatesHtml() {
  const list = donors();
  if (!list.length) return '<div class="sys-hint">Образцовых систем-доноров нет.</div>';
  return `${list.map(sys => {
    const groups = [...new Set(sys.fields.map(f => f.group))];
    return `<div class="pal-sec">${esc(sys.name)}</div>
      ${groups.map(g => {
        const fields = sys.fields.filter(f => f.group === g);
        const have = fields.every(f => state.system.fields.some(x => x.tag === f.tag));
        return `<div class="pal-item"${have ? ' style="opacity:.45"' : ''} onclick="uiCopyBlock('${sys.id}','${esc(g)}')">
          <span class="pal-icon">⊞</span>
          <div><div class="pal-t">${esc(g)}</div>
          <div class="pal-s">${have ? 'уже в системе' : `полей: ${fields.length}`}</div></div>
        </div>`;
      }).join('')}`;
  }).join('')}
  <div class="sys-hint" style="margin-top:8px">Клик — блок приедет в вашу систему
    вместе с зависимостями формул. Донор не изменится.</div>`;
}

// Сцена «Механики», низ палитры. Три яруса, и первый выводится из ПРИРОДЫ
// данных, а не выдумывается: целый эффект, кусок конвейера, словарь системы.
// Слова второго яруса (category) — дешёвые ярлыки: переименование ничего
// не ломает, движок на них не ссылается.
export function effectTemplatesHtml() {
  const only = state.donorFilter || '';
  const pool = donors().filter(sys => !only || sys.id === only);

  return `${donorFilterHtml(only)}
    ${wholeEffectsHtml(pool)}
    ${stepsHtml(pool)}
    ${mechanicsHtml(pool)}
    <div class="sys-hint">Копия приезжает работоспособной: эффект тянет кость,
      мишень и механику. Чего не хватит — скажет приговор.</div>`;
}

function donorFilterHtml(only) {
  return `<div class="pal-sec" style="margin-top:14px">Готовое из образцов</div>
    <select class="meta-sel" style="width:100%;margin-bottom:6px" onchange="uiDonorFilter(this.value)">
      <option value=""${only ? '' : ' selected'}>все системы</option>
      ${donors().map(s => `<option value="${s.id}"${only === s.id ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}
    </select>`;
}

// Ярус 1 — целые эффекты, разложенные по категориям. Система-донор
// подписана на карточке: полки по типу, бренд на этикетке.
function wholeEffectsHtml(pool) {
  const rows = [];
  for (const sys of pool) {
    for (const [id, effect] of Object.entries(sys.effects || {})) {
      rows.push({ sys, id, effect, category: effect.category || 'Прочее' });
    }
  }
  if (!rows.length) return '';

  return `<div class="pal-sec" style="opacity:.65">Целые эффекты</div>
    ${byCategory(rows).map(([category, items]) => `
      <div class="pal-sec" style="opacity:.5;margin-top:6px">${esc(category)}</div>
      ${items.map(({ sys, id, effect }) => {
        const have = id in (state.system.effects || {});
        return palItem(effect.icon || '⚙', effect.label || id,
          `${esc(sys.name)}${have ? ' · уже в системе' : ''}`,
          `uiCopyEffect('${sys.id}','${id}')`, have);
      }).join('')}`).join('')}`;
}

// Ярус 2 — отдельные шаги донорских конвейеров, вытащенные на верхний
// уровень. Это и есть «шаблон урона из киберпанка»: находится за один
// взгляд, а не через раскрытие чужой атаки.
function stepsHtml(pool) {
  const open = (state.system.effects || {})[state.activeRuleId];
  if (!open || !isPipeline(open)) return '';

  const rows = [];
  for (const sys of pool) {
    for (const [id, effect] of Object.entries(sys.effects || {})) {
      for (const [index, step] of (effect.steps || []).entries()) {
        rows.push({ sys, id, index, step, category: stepCategory(step) });
      }
    }
  }
  if (!rows.length) return '';

  return `<div class="pal-sec" style="opacity:.65;margin-top:10px">Куски конвейеров</div>
    <div class="sys-hint">Клик — шаг вставится в открытый эффект.</div>
    ${byCategory(rows).map(([category, items]) => `
      <div class="pal-sec" style="opacity:.5;margin-top:6px">${esc(category)}</div>
      ${items.map(({ sys, id, index, step }) => palItem('□',
        stepTitle(step, sys, id),
        esc(sys.name),
        `uiCopyStep('${sys.id}','${id}',${index})`, false)).join('')}`).join('')}`;
}

// Ярус 3 — словари системы. Связки, приезжающие гроздью: кость, таблица,
// мишень броска, правило комнаты.
function mechanicsHtml(pool) {
  return `<div class="pal-sec" style="opacity:.65;margin-top:10px">Механики системы</div>
    ${pool.map(sys => `
      ${Object.entries(sys.constants || {}).map(([name, c]) => {
        const have = name in (state.system.constants || {});
        return palItem('⬡', c.label,
          `${esc(sys.name)} · константа ${(c.dice || []).map(d => `${d.count || 1}к${d.sides}`).join(' + ')}${have ? ' · уже в системе' : ''}`,
          `uiCopyConst('${sys.id}','${name}')`, have);
      }).join('')}
      ${Object.entries(sys.tables || {}).map(([name, t]) => {
        const have = name in (state.system.tables || {});
        return palItem('▤', t.label || name,
          `${esc(sys.name)} · диапазонов: ${(t.ranges || []).length}${have ? ' · уже в системе' : ''}`,
          `uiCopyTable('${sys.id}','${name}')`, have);
      }).join('')}
      ${(sys.rolls || []).map(r => {
        const have = (state.system.rolls || []).some(x => x.tag === r.tag);
        return palItem('⌖', r.label, `${esc(sys.name)} · мишень броска${have ? ' · уже в системе' : ''}`,
          `uiCopyRoll('${sys.id}','${r.tag}')`, have);
      }).join('')}
      ${(sys.room_rules || []).map(id => {
        const effect = (sys.effects || {})[id] || {};
        const have = (state.system.room_rules || []).includes(id);
        return palItem('⚖', effect.label || id, `${esc(sys.name)} · правило комнаты${have ? ' · уже включено' : ''}`,
          `uiCopyRoomRule('${sys.id}','${id}')`, have);
      }).join('')}`).join('')}`;
}

// Слово для полки. Не тег: движок на него не ссылается, переименование
// ничего не ломает — то же различение, что #tag против label у поля.
function stepCategory(step) {
  if (step.type === 'amount') return 'Урон и величина';
  if (step.type === 'threshold' || step.type === 'compare') return 'Проверка';
  if (step.type === 'apply') return 'Применение';
  if (step.type === 'status') return 'Состояния';
  return 'Прочее';
}

function stepTitle(step, sys, effectId) {
  const effect = (sys.effects || {})[effectId] || {};
  return `${step.id || step.type} — из «${effect.label || effectId}»`;
}

function byCategory(rows) {
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.category)) map.set(row.category, []);
    map.get(row.category).push(row);
  }
  return [...map.entries()];
}

// Режим компендиума, низ палитры: готовые записи образцов. Клик — запись
// приезжает цепочкой (род, привязки, эффекты) и открывается в редакторе.
export function recordTemplatesHtml() {
  return `<div class="pal-sec" style="margin-top:14px">Готовые записи из образцов</div>
    ${SAMPLE_WORLDS.map(({ system: sys, compendium: book }) => `
      <div class="pal-sec" style="opacity:.65;margin-top:8px">${esc(sys.name)}</div>
      ${['items', 'actions'].flatMap(shelf => (book[shelf] || []).map(r => {
        const decl = (sys.records || {})[r.rk] || {};
        const have = [...state.compendium.items, ...state.compendium.actions]
          .some(x => x.id === r.id);
        return palItem(decl.icon || '□', r.label,
          `${esc(decl.label || shelf)}${have ? ' · уже в библиотеке' : ''}`,
          `uiCopyRecord('${sys.id}','${r.id}')`, have);
      })).join('')}`).join('')}
    <div class="sys-hint">Запись приедет рабочей цепочкой: меч притянет свой род,
      род — эффект «Атака», эффект — кость. Поля листа не тянутся —
      их даёт блок на сцене «Лист».</div>`;
}
