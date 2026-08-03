// Конструктор правил разрешения. Живёт ТОЛЬКО в режиме автора: правка шага —
// это смена закона мира, как правка формулы поля.
//
// Интерфейс ВЫВОДИТСЯ из данных, а не дублирует их:
//   · список типов шагов и форма каждой карточки — из реестра (module.slots);
//   · выпадашка допустимых ссылок — из параметров правила, результатов
//     предыдущих шагов (module.outputs) и объявленных тегов;
//   · словарь источников величины — из amount-sources.js, с примерами систем.
// Добавили тип шага модулем — карточка нарисовалась сама, этот файл не правится.
//
// Как и всюду в режиме автора, ни одного значения на экране: вместо результата —
// приговор о разборе («правило верное · шагов: 4 · может оборваться на 1 и 3»).

import { state, esc } from './state.js';
import { registry } from '../engine/steps/index.js';
import { AMOUNT_SOURCES } from '../model/amount-sources.js';
import { compile } from '../formula/index.js';

// Человеческие слова для машинных значений слотов-выборов. Неизвестное значение
// показывается как есть — это честнее, чем прятать.
const WORDS = {
  sender: 'бросает отправитель', target: 'бросает цель',
  success: 'дальше при успехе', fail: 'дальше при провале',
  less: 'меньше порога — обрыв', atMost: 'не выше порога — обрыв', never: 'никогда (только разница)',
  add: '+ прибавить', subtract: '− вычесть', set: '= присвоить',
};
const word = v => WORDS[v] || v;

export function renderRuleSection() {
  const rules = Object.entries(state.system.rules || {});
  if (!rules.length) {
    return `<div class="pal-sec">Правила разрешения</div>
      <button class="add-row" onclick="uiRuleAdd()">+ первая механика системы</button>`;
  }

  if (!state.activeRuleId || !(state.system.rules || {})[state.activeRuleId]) {
    state.activeRuleId = rules[0][0];
  }
  const [id, rule] = rules.find(([rid]) => rid === state.activeRuleId);

  return `
    <div class="pal-sec">Правила разрешения</div>
    <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:6px">
      ${rules.map(([rid, r]) => `
        <button class="die-o${rid === id ? ' on' : ''}" style="${rid === id ? 'border-color:var(--accent);color:var(--accent);' : ''}"
                onclick="uiRulePick('${rid}')">${esc(r.label || rid)}</button>`).join('')}
      <button class="die-o" title="новая механика" onclick="uiRuleAdd()">+</button>
    </div>
    <div style="display:flex;gap:4px;align-items:center;margin-bottom:4px">
      <input class="ar-cond" id="rule-label-${id}" style="flex:1" value="${esc(rule.label || '')}"
             placeholder="Название механики" oninput="uiRuleRename('${id}',this.value)">
      <button class="ar-del" style="position:static" title="удалить механику" onclick="uiRuleDelete('${id}')">×</button>
    </div>
    ${verdictRow(rule)}
    ${(rule.steps || []).map((step, i) => stepCard(id, rule, step, i)).join(`
      <div style="text-align:center;color:var(--muted);font-size:11px;line-height:1">↓</div>`)}
    <div class="ar-row" style="margin-top:6px">
      <select class="meta-sel" id="rule-add-type">
        ${[...registry.values()].filter(m => !m.type.includes('заглушка')).map(m =>
          `<option value="${m.type}">${esc(m.label)} — ${esc(m.hint || '')}</option>`).join('')}
      </select>
    </div>
    <button class="add-row" onclick="uiRuleAddStep('${id}', document.getElementById('rule-add-type').value)">+ шаг в конец цепочки</button>
    ${paramEditor(id, rule)}`;
}

// ── приговор о разборе ───────────────────────────────────────────────────────
// Считать нечего и не по чему: персонажа в режиме автора нет. Зато можно
// разобрать: типы известны, выражения парсятся, ссылки бьют по существующему.

export function verdictOf(rule) {
  const ids = new Set();
  const params = new Set((rule.params || []).map(p => p.key));
  const steps = rule.steps || [];

  for (const [i, step] of steps.entries()) {
    const mod = registry.get(step.type);
    if (!mod) return { ok: false, text: `шаг ${i + 1}: неизвестный тип «${step.type}»` };
    // Своя проверка модуля: источник без своего слота, порог без кости.
    const trouble = mod.lint && mod.lint(step);
    if (trouble) return { ok: false, text: `шаг ${i + 1}: ${trouble}` };
    try {
      walkRefs(step, ref => {
        if ('expr' in ref) compile(String(ref.expr));
        if ('param' in ref && !params.has(ref.param)) {
          throw new Error(`параметр «${ref.param}» не объявлен правилом`);
        }
        if ('ref' in ref && !ids.has(String(ref.ref).split('.')[0])) {
          throw new Error(`ссылка на шаг «${String(ref.ref).split('.')[0]}», которого выше нет`);
        }
      });
    } catch (err) {
      return { ok: false, text: `шаг ${i + 1}: ${err.message}` };
    }
    if (step.id) ids.add(step.id);
  }

  const breakers = steps.map((s, i) => (registry.get(s.type).mayBreak ? i + 1 : null)).filter(Boolean);
  return {
    ok: true,
    text: `правило верное · шагов: ${steps.length}`
      + (breakers.length ? ` · может оборваться на ${breakers.join(' и ')}` : ''),
  };
}

function walkRefs(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (['expr', 'param', 'ref', 'item', 'tag', 'const'].some(k => k in node)) return visit(node);
  for (const value of Object.values(node)) walkRefs(value, visit);
}

function verdictRow(rule) {
  const v = verdictOf(rule);
  return `<div class="sys-hint" style="margin-bottom:6px;color:${v.ok ? 'var(--green)' : 'var(--red)'}">${esc(v.text)}</div>`;
}

// ── карточка шага ────────────────────────────────────────────────────────────

function stepCard(ruleId, rule, step, index) {
  const mod = registry.get(step.type);
  if (!mod) {
    return `<div class="auto-rule" style="padding:8px 9px;border-color:var(--red)">
      шаг ${index + 1} · неизвестный тип «${esc(step.type)}»
      <button class="ar-del" onclick="uiRuleDelStep('${ruleId}',${index})">×</button></div>`;
  }

  return `<div class="auto-rule" style="padding:8px 9px">
    <button class="ar-del" onclick="uiRuleDelStep('${ruleId}',${index})">×</button>
    <div class="ar-row" style="font-size:11px">
      <b>${index + 1} · ${esc(mod.label)}</b>
      ${step.id ? `<span style="color:var(--muted)">→ «${esc(step.id)}»</span>` : ''}
      ${mod.hint ? `<span class="info-dot" title="${esc(mod.hint)}">i</span>` : ''}
    </div>
    ${mod.slots.map(slot => slotRow(ruleId, rule, step, index, slot)).join('')}
  </div>`;
}

function slotRow(ruleId, rule, step, index, slot) {
  const set = (key, extra = '') =>
    `onchange="uiRuleSlot('${ruleId}',${index},'${key}',this.value${extra})"`;

  if (slot.kind === 'choice') {
    // Для источника величины — словарь с примерами систем, как у механик преимущества.
    const dict = slot.key === 'source' ? AMOUNT_SOURCES : null;
    const current = plain(step[slot.key]) ?? slot.options[0];
    const chosen = dict && dict.find(s => s.id === current);
    return row(slot.label, `
      <select class="meta-sel" style="flex:1;min-width:0" ${set(slot.key)}>
        ${slot.options.map(o => {
          const entry = dict && dict.find(s => s.id === o);
          const text = entry ? `${entry.label} — ${entry.examples.map(e => e.system).join(', ')}` : word(o);
          return `<option value="${o}"${o === current ? ' selected' : ''}>${esc(text)}</option>`;
        }).join('')}
      </select>
      ${chosen ? `<span class="info-dot" title="${esc(chosen.hint + '\n' + chosen.examples.map(e => `${e.system}: ${e.example}`).join('\n'))}">i</span>` : ''}`);
  }

  if (slot.kind === 'flag') {
    const on = !!step[slot.key];
    return row(slot.label, `
      <div class="chk-row${on ? ' on' : ''}" style="padding:2px 0" onclick="uiRuleSlot('${ruleId}',${index},'${slot.key}',${!on})">
        <div class="chk-box">✓</div>
        <div class="chk-lbl"><span style="font-size:11px">${on ? 'считаются (сопротивления цели)' : 'не считаются'}</span></div>
      </div>`);
  }

  if (slot.kind === 'roll') {
    // Составной слот броска: кость-константа, бонус, мишень модификаторов.
    const roll = step.roll || {};
    const dice = Object.entries(state.system.constants || {}).filter(([, c]) => c.kind === 'die');
    const rolls = (state.system.rolls || []);
    return row('Кость', `
        <select class="meta-sel" style="flex:1;min-width:0" onchange="uiRuleSlot('${ruleId}',${index},'roll.die',this.value)">
          ${dice.length
            ? dice.map(([name, c]) => `<option value="${name}"${(roll.die || {}).constant === name ? ' selected' : ''}>${esc(c.label)} (${dieWord(c)})</option>`).join('')
            : '<option>— в системе нет констант-костей —</option>'}
        </select>`)
      + refRow(ruleId, rule, step, index, { key: 'roll.bonus', label: 'Бонус' }, roll.bonus)
      + row('Модификаторы', `
        <select class="meta-sel" style="flex:1;min-width:0" onchange="uiRuleSlot('${ruleId}',${index},'roll.check',this.value)">
          <option value="">— без мишени броска —</option>
          ${rolls.map(r => `<option value="${r.tag}"${roll.check === r.tag ? ' selected' : ''}>${esc(r.label)}</option>`).join('')}
        </select>`);
  }

  // 'ref' и 'tag' — ссылка: выпадашка допустимых значений вместо свободного текста.
  return refRow(ruleId, rule, step, index, slot, step[slot.key]);
}

// ── ссылки: выпадашка допустимых значений ────────────────────────────────────

const encodeRef = ref => {
  if (ref === null || ref === undefined) return '';
  if (typeof ref !== 'object') return 'const';
  for (const form of ['param', 'ref', 'item', 'tag']) {
    if (form in ref) return `${form}:${ref[form]}`;
  }
  if ('expr' in ref) return 'expr';
  return 'const';
};

function refOptions(rule, index, slot) {
  const options = [];
  for (const p of rule.params || []) {
    options.push([`param:${p.key}`, `параметр · ${p.label || p.key}`]);
  }
  for (const prior of (rule.steps || []).slice(0, index)) {
    const mod = registry.get(prior.type);
    if (!prior.id || !mod) continue;
    for (const out of mod.outputs || []) {
      options.push([`ref:${prior.id}${out.path}`, `шаг «${prior.id}» · ${out.label}`]);
    }
  }
  for (const p of ((state.system.records || {}).weapon || {}).props || []) {
    options.push([`item:${p.key}`, `оружие · ${p.label}`]);
  }
  for (const f of state.system.fields.filter(numericField)) {
    options.push([`tag:${f.tag}`, `поле цели · ${f.label}`]);
  }
  options.push(['const', 'число…'], ['expr', 'формула…']);
  if (slot.kind !== 'tag') options.push(['', '— пусто —']);
  return options;
}

const numericField = f =>
  f.value.kind !== 'stored' ? f.value.kind !== 'text' : f.value.type === 'number';

function refRow(ruleId, rule, step, index, slot, ref) {
  const code = encodeRef(ref);
  const options = refOptions(rule, index, slot);
  const known = options.some(([v]) => v === code);

  const editor =
    code === 'const' ? `<input class="bon-v" style="width:52px" value="${esc(ref && typeof ref === 'object' ? ref.const ?? '' : ref ?? '')}"
        oninput="uiRuleSlotConst('${ruleId}',${index},'${slot.key}',this.value)">`
      : code === 'expr' ? `<input class="ar-cond" style="flex:1" value="${esc((ref || {}).expr || '')}" placeholder="#тег + 2"
        oninput="uiRuleSlotExpr('${ruleId}',${index},'${slot.key}',this.value)">`
        : '';

  return row(slot.label, `
    <select class="meta-sel" style="flex:1;min-width:0" onchange="uiRuleSlotRef('${ruleId}',${index},'${slot.key}',this.value)">
      ${known ? '' : `<option selected value="${esc(code)}">${esc(code)}</option>`}
      ${options.map(([v, l]) => `<option value="${v}"${v === code ? ' selected' : ''}>${esc(l)}</option>`).join('')}
    </select>${editor}`);
}

// Лейбл над контролом, а не сбоку: правая колонка узкая, и выпадашка
// допустимых значений должна читаться целиком.
function row(label, control) {
  return `<div style="padding:3px 0">
    <div style="font-size:10px;color:var(--muted);margin-bottom:2px">${esc(label)}</div>
    <div style="display:flex;gap:4px;align-items:center;min-width:0">${control}</div>
  </div>`;
}

// Параметры правила — то, что заполнит эффект в компендиуме. У параметра,
// как у поля, машинный ключ и человеческий лейбл: ключ генерируется при
// создании и дальше неизменен, шаги ссылаются только на него. Форма эффекта
// в компендиуме перестроится сама — она выводится из этого объявления.
const PARAM_KINDS = [
  ['expr', 'формула'], ['tag', 'тег поля'], ['dice', 'кости'],
  ['number', 'число'], ['choice', 'выбор источника'], ['effect', 'эффект-состояние'],
];

function paramEditor(ruleId, rule) {
  const params = rule.params || [];
  return `<div class="pal-sec" style="margin-top:8px">Параметры — заполняет эффект</div>
    ${params.map(p => `
      <div style="display:flex;gap:4px;align-items:center;padding:2px 0">
        <input class="ar-cond" id="param-${ruleId}-${p.key}" style="flex:1;min-width:0" value="${esc(p.label || '')}"
               placeholder="лейбл параметра" oninput="uiRuleParamSet('${ruleId}','${p.key}','label',this.value)">
        <select class="meta-sel" onchange="uiRuleParamSet('${ruleId}','${p.key}','kind',this.value)">
          ${PARAM_KINDS.map(([v, l]) => `<option value="${v}"${(p.kind || 'expr') === v ? ' selected' : ''}>${l}</option>`).join('')}
        </select>
        <span class="chk-row${p.of === 'target' ? ' on' : ''}" style="padding:0" title="выражение считает ЦЕЛЬ своим листом"
              onclick="uiRuleParamSet('${ruleId}','${p.key}','of',${p.of === 'target' ? 'false' : 'true'})">
          <span class="chk-box">✓</span><span style="font-size:10px;color:var(--muted)">цель</span>
        </span>
        <button class="ar-del" style="position:static" onclick="uiRuleParamDel('${ruleId}','${p.key}')">×</button>
      </div>`).join('')}
    <button class="add-row" onclick="uiRuleParamAdd('${ruleId}')">+ параметр</button>`;
}

// ── константы системы: ведущая кость ────────────────────────────────────────

const dieWord = c => (c.dice || []).map(d => `${d.count || 1}к${d.sides}${d.name ? ` «${d.name}»` : ''}`).join(' + ');

export function renderConstants() {
  const dice = Object.entries(state.system.constants || {}).filter(([, c]) => c.kind === 'die');
  if (!dice.length) return '';

  return `<div class="pal-sec">Константы системы</div>
    ${dice.map(([name, c]) => `
      <div class="auto-rule" style="padding:8px 9px">
        <div class="ar-row" style="font-size:11px"><b>${esc(c.label)}</b>
          <span class="info-dot" title="Броски правил ссылаются на константу, а не пишут «1d20». Смена кости здесь меняет все броски системы разом.">i</span>
        </div>
        ${(c.dice || []).map((d, i) => `
          <div class="ar-row">
            <input class="bon-v" style="width:34px" value="${d.count || 1}" title="сколько костей"
                   oninput="uiLeadDie('${name}',${i},'count',this.value)">
            <span style="font-size:11px;color:var(--muted)">к</span>
            <input class="bon-v" style="width:44px" value="${d.sides}" title="граней"
                   oninput="uiLeadDie('${name}',${i},'sides',this.value)">
            <input class="ar-cond" style="width:74px" value="${esc(d.name || '')}" placeholder="имя части"
                   title="именованная часть броска: Надежда/Страх в Daggerheart"
                   oninput="uiLeadDie('${name}',${i},'name',this.value)">
            ${(c.dice.length > 1) ? `<button class="ar-del" style="position:static" onclick="uiLeadDie('${name}',${i},'remove','')">×</button>` : ''}
          </div>`).join('')}
        <button class="add-row" onclick="uiLeadDie('${name}',-1,'add','')">+ кость в бросок</button>
      </div>`).join('')}`;
}

// ── правки ───────────────────────────────────────────────────────────────────

const plain = v => (v && typeof v === 'object' ? ('const' in v ? v.const : null) : v);

export function pickRule(id) {
  state.activeRuleId = id;
}

// ── правила: завести, назвать, убрать ───────────────────────────────────────
// Id правила — как тег поля: генерируется при создании, дальше неизменен.
// Эффекты ссылаются на id, переименование лейбла не ломает ни одного.

export function addRule() {
  const rules = state.system.rules || (state.system.rules = {});
  let n = Object.keys(rules).length + 1;
  while (rules[`rule_${n}`]) n++;
  const id = `rule_${n}`;
  rules[id] = { label: 'Новая механика', params: [], steps: [] };
  state.activeRuleId = id;
  return id;
}

export function renameRule(id, label) {
  const rule = state.system.rules[id];
  if (rule) rule.label = label;
}

export function deleteRule(id) {
  delete state.system.rules[id];
  if (state.activeRuleId === id) {
    state.activeRuleId = Object.keys(state.system.rules)[0] || null;
  }
}

// ── параметры: стабильный ключ + человеческий лейбл ─────────────────────────

export function addParam(ruleId) {
  const rule = state.system.rules[ruleId];
  const params = rule.params || (rule.params = []);
  let n = params.length + 1;
  while (params.some(p => p.key === `p_${n}`)) n++;
  const key = `p_${n}`;
  params.push({ key, label: '', kind: 'expr' });
  return key;
}

export function deleteParam(ruleId, key) {
  const rule = state.system.rules[ruleId];
  rule.params = (rule.params || []).filter(p => p.key !== key);
}

export function setParam(ruleId, key, prop, value) {
  const param = (state.system.rules[ruleId].params || []).find(p => p.key === key);
  if (!param) return;
  if (prop === 'of') {
    // Сторона — только у выражений: «считает цель» значит, что формула
    // уедет в конверт нетронутой и посчитается листом получателя.
    if (value === true || value === 'true') param.of = 'target';
    else delete param.of;
    return;
  }
  param[prop] = value;
}

export function addStep(ruleId, type) {
  const rule = state.system.rules[ruleId];
  const mod = registry.get(type);
  if (!mod) return;
  const step = { id: freeStepId(rule), type };
  // Заготовка слотов: выборы — первым значением, остальное автор дособерёт.
  for (const slot of mod.slots) {
    if (slot.kind === 'choice') step[slot.key] = slot.options[0];
    if (slot.kind === 'roll') {
      const die = Object.keys(state.system.constants || {})[0];
      step.roll = { die: { constant: die }, bonus: { const: 0 }, check: null };
    }
  }
  rule.steps.push(step);
}

function freeStepId(rule) {
  let n = rule.steps.length + 1;
  while (rule.steps.some(s => s.id === `step_${n}`)) n++;
  return `step_${n}`;
}

export function deleteStep(ruleId, index) {
  state.system.rules[ruleId].steps.splice(index, 1);
}

// Слоты-выборы, флаги и составной бросок. Путь вида «roll.check» — вглубь.
export function setSlot(ruleId, index, key, value) {
  const step = state.system.rules[ruleId].steps[index];
  if (key === 'roll.die') { step.roll = { ...(step.roll || {}), die: { constant: value } }; return; }
  if (key === 'roll.check') { step.roll = { ...(step.roll || {}), check: value || null }; return; }
  if (value === 'true' || value === true) value = true;
  else if (value === 'false' || value === false) value = false;
  step[key] = value;
}

// Ссылка выбрана из выпадашки допустимых значений: форма и адрес одним кодом.
export function setSlotRef(ruleId, index, key, code) {
  writeRef(ruleId, index, key, decodeRef(code));
}

export function setSlotConst(ruleId, index, key, raw) {
  const n = Number(raw);
  writeRef(ruleId, index, key, { const: Number.isNaN(n) ? String(raw) : n });
}

export function setSlotExpr(ruleId, index, key, text) {
  writeRef(ruleId, index, key, { expr: String(text) });
}

function decodeRef(code) {
  if (!code) return undefined;
  if (code === 'const') return { const: 0 };
  if (code === 'expr') return { expr: '' };
  const at = code.indexOf(':');
  return { [code.slice(0, at)]: code.slice(at + 1) };
}

function writeRef(ruleId, index, key, ref) {
  const step = state.system.rules[ruleId].steps[index];
  if (key.startsWith('roll.')) {
    step.roll = { ...(step.roll || {}), [key.slice(5)]: ref };
    return;
  }
  if (ref === undefined) delete step[key];
  else step[key] = ref;
}

export function setLeadDie(name, index, key, raw) {
  const constant = state.system.constants[name];
  if (key === 'add') { constant.dice.push({ count: 1, sides: 6 }); return; }
  if (key === 'remove') { constant.dice.splice(index, 1); return; }
  const die = constant.dice[index];
  if (key === 'name') {
    if (String(raw).trim()) die.name = String(raw).trim(); else delete die.name;
    return;
  }
  const n = Number(raw);
  if (!Number.isNaN(n) && n > 0) die[key] = n;
}
