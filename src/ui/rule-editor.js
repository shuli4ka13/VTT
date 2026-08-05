// Конструктор правил разрешения. Живёт ТОЛЬКО в режиме автора: правка шага —
// это смена закона мира, как правка формулы поля.
//
// Раскладка — идиома черновика «список · редактор · палитра»:
//   слева   список механик (+ константы системы),
//   в центре КОНВЕЙЕР — карточки шагов на хребте с номерами и метками обрыва,
//   справа  палитра типов шагов: клик кладёт шаг в конец цепочки.
//
// Интерфейс ВЫВОДИТСЯ из данных, а не дублирует их:
//   · палитра и форма каждой карточки — из реестра (module.slots, module.icon);
//   · выпадашка допустимых ссылок — из параметров правила, результатов
//     предыдущих шагов (module.outputs) и объявленных тегов;
//   · приговор о разборе — из статических проверок (module.lint).
// Добавили тип шага модулем — карточка, палитра и журнал нарисовались сами.
//
// Как и всюду в режиме автора, ни одного значения на экране: вместо результата —
// приговор («правило верное · шагов: 4 · может оборваться на 1»).

import { state, esc, log } from './state.js';
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
  atLeast: 'не меньше порога — успех (5e: d20 вверх)',
  notOver: 'не выше порога — успех (CoC/GURPS: бросок вниз)',
  over: 'строго больше порога — успех',
  under: 'строго меньше порога — успех',
};
const word = v => WORDS[v] || v;

const activeRule = () => {
  const rules = state.system.rules || {};
  if (!state.activeRuleId || !rules[state.activeRuleId]) {
    state.activeRuleId = Object.keys(rules)[0] || null;
  }
  return state.activeRuleId ? [state.activeRuleId, rules[state.activeRuleId]] : [null, null];
};

// ── левая колонка: список механик и константы ───────────────────────────────

export function renderRuleList() {
  const rules = Object.entries(state.system.rules || {});
  const [activeId] = activeRule();

  document.getElementById('rules-list').innerHTML = `
    ${rules.map(([id, rule]) => {
      const v = verdictOf(rule);
      return `<div class="item-entry${id === activeId ? ' on' : ''}" onclick="uiRulePick('${id}')">
        <span class="ie-icon" style="color:${v.ok ? 'var(--green)' : 'var(--red)'}">●</span>
        <div style="flex:1;min-width:0">
          <div class="ie-name">${esc(rule.label || id)}</div>
          <div class="ie-sub">шагов: ${(rule.steps || []).length} · параметров: ${(rule.params || []).length}</div>
        </div>
      </div>`;
    }).join('')}
    <button class="add-row" onclick="uiRuleAdd()">+ механика</button>`;
}

// ── центр: конвейер активного правила ───────────────────────────────────────

export function renderRuleCanvas() {
  const host = document.getElementById('rules-canvas');
  const [id, rule] = activeRule();

  if (!rule) {
    host.innerHTML = '<div class="empty-ed">Заведите первую механику<br>кнопкой слева</div>';
    return;
  }

  const steps = rule.steps || [];
  host.innerHTML = `
    <div style="display:flex;gap:8px;align-items:center">
      <input class="blk-name" id="rule-label-${id}" style="font-size:16px;margin:0" value="${esc(rule.label || '')}"
             placeholder="Название механики" oninput="uiRuleRename('${id}',this.value)">
      <button class="row-del" style="opacity:.7" title="удалить механику" onclick="uiRuleDelete('${id}')">✕</button>
    </div>
    ${verdictRow(rule)}

    <div class="pal-sec" style="margin-top:12px">Вход — параметры, их заполнит эффект в компендиуме</div>
    ${paramEditor(id, rule)}

    <div class="pal-sec" style="margin-top:14px">Цепочка шагов</div>
    ${steps.length ? `<div class="rl-flow">
        ${steps.map((step, i) => stepCard(id, rule, step, i)).join('')}
      </div>`
    : '<div class="sys-hint">Шагов пока нет — возьмите первый из палитры справа.</div>'}`;
}

function verdictRow(rule) {
  const v = verdictOf(rule);
  return `<div class="rl-verdict" style="color:${v.ok ? 'var(--green)' : 'var(--red)'}">
    ${v.ok ? '✓' : '✗'} ${esc(v.text)}</div>`;
}

// ── правая колонка: палитра типов шагов ─────────────────────────────────────

export function renderStepPalette() {
  const [id] = activeRule();
  const mods = [...registry.values()].filter(m => !m.type.includes('заглушка'));

  document.getElementById('rules-palette').innerHTML = `
    ${mods.map(m => `
      <div class="pal-item" ${id ? `onclick="uiRuleAddStep('${id}','${m.type}')"` : ''}>
        <span class="pal-icon">${m.icon || '□'}</span>
        <div><div class="pal-t">${esc(m.label)}</div><div class="pal-s">${esc(m.hint || '')}</div></div>
      </div>`).join('')}
    <div class="sys-hint" style="margin-top:10px">Клик кладёт шаг в конец цепочки.
      Шаг получает имя, и следующие шаги ссылаются на его результат по этому имени.</div>`;
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

  const breakers = steps.map((s, i) => {
    const mod = registry.get(s.type);
    const breaks = mod.breakLine ? mod.breakLine(s) !== null : mod.mayBreak;
    return breaks ? i + 1 : null;
  }).filter(Boolean);
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

// ── карточка шага на хребте ──────────────────────────────────────────────────

function stepCard(ruleId, rule, step, index) {
  const mod = registry.get(step.type);
  const node = `<div class="rl-node">${index + 1}</div>`;

  if (!mod) {
    return `<div class="rl-step">${node}
      <div class="rl-card" style="border-color:var(--red)">
        неизвестный тип «${esc(step.type)}»
        <button class="rl-del" onclick="uiRuleDelStep('${ruleId}',${index})">✕</button>
      </div></div>`;
  }

  // Развилка — часть хребта: она про ПОТОК, а не про содержимое карточки.
  // Слова пишет сам шаг (module.breakLine): «промах» и «не пробило» — разные
  // выходы. null — шаг в этой конфигурации не обрывает, линия прямая.
  const exit = mod.breakLine ? mod.breakLine(step) : null;
  const branch = exit
    ? `<div class="rl-branch">⤫ ${esc(exit)} — правило кончается здесь</div>`
    : '';

  return `<div class="rl-step">${node}
    <div class="rl-card">
      <div class="rl-head">
        <span class="rl-type">${mod.icon || '□'} ${esc(mod.label)}</span>
        ${step.id ? `<span class="rl-id" title="под этим именем результат шага виден следующим">«${esc(step.id)}»</span>` : ''}
        ${mod.hint ? `<span class="info-dot" title="${esc(mod.hint)}">i</span>` : ''}
        <button class="rl-del" onclick="uiRuleDelStep('${ruleId}',${index})">✕</button>
      </div>
      <div class="rl-slots">
        ${mod.slots.map(slot => slotCell(ruleId, rule, step, index, slot)).join('')}
      </div>
    </div>
  </div>${branch}`;
}

function slotCell(ruleId, rule, step, index, slot) {
  if (slot.kind === 'choice') {
    // Для источника величины — словарь с примерами систем, как у механик преимущества.
    const dict = slot.key === 'source' ? AMOUNT_SOURCES : null;
    const current = plain(step[slot.key]) ?? slot.options[0];
    const chosen = dict && dict.find(s => s.id === current);
    return cell(slot.label, `
      <select onchange="uiRuleSlot('${ruleId}',${index},'${slot.key}',this.value)">
        ${slot.options.map(o => {
          const entry = dict && dict.find(s => s.id === o);
          const text = entry ? `${entry.label} — ${entry.examples.map(e => e.system).join(', ')}` : word(o);
          return `<option value="${o}"${o === current ? ' selected' : ''}>${esc(text)}</option>`;
        }).join('')}
      </select>`,
      chosen && `${chosen.hint}\n${chosen.examples.map(e => `${e.system}: ${e.example}`).join('\n')}`);
  }

  if (slot.kind === 'flag') {
    const on = !!step[slot.key];
    return cell(slot.label, `
      <div class="chk-row${on ? ' on' : ''}" style="padding:3px 0"
           onclick="uiRuleSlot('${ruleId}',${index},'${slot.key}',${!on})">
        <div class="chk-box">✓</div>
        <div class="chk-lbl"><span style="font-size:11px">${on ? 'считаются — сопротивления цели' : 'не считаются'}</span></div>
      </div>`);
  }

  if (slot.kind === 'roll') {
    // Составной слот броска занимает всю ширину карточки: это три вещи об одном.
    const roll = step.roll || {};
    const dice = Object.entries(state.system.constants || {}).filter(([, c]) => c.kind === 'die');
    const rolls = (state.system.rolls || []);
    return `<div class="rl-cell rl-wide"><div class="rl-slots" style="margin:0">
      ${cell('Кость', `
        <select onchange="uiRuleSlot('${ruleId}',${index},'roll.die',this.value)">
          ${dice.length
            ? dice.map(([name, c]) => `<option value="${name}"${(roll.die || {}).constant === name ? ' selected' : ''}>${esc(c.label)} (${dieWord(c)})</option>`).join('')
            : '<option>— в системе нет констант-костей —</option>'}
        </select>`)}
      ${refCell(ruleId, rule, step, index, { key: 'roll.bonus', label: 'Бонус броска' }, roll.bonus)}
      ${cell('Мишень модификаторов', `
        <select onchange="uiRuleSlot('${ruleId}',${index},'roll.check',this.value)">
          <option value="">— без мишени —</option>
          ${rolls.map(r => `<option value="${r.tag}"${roll.check === r.tag ? ' selected' : ''}>${esc(r.label)}</option>`).join('')}
        </select>`)}
    </div></div>`;
  }

  // 'ref' и 'tag' — ссылка: выпадашка допустимых значений вместо свободного текста.
  return refCell(ruleId, rule, step, index, slot, step[slot.key]);
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
  for (const decl of Object.values(state.system.records || {})) {
    if (decl.kind !== 'item') continue;
    for (const p of decl.props || []) {
      const code = `item:${p.key}`;
      if (!options.some(([v]) => v === code)) options.push([code, `${decl.label} · ${p.label}`]);
    }
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

function refCell(ruleId, rule, step, index, slot, ref) {
  const code = encodeRef(ref);
  const options = refOptions(rule, index, slot);
  const known = options.some(([v]) => v === code);

  const editor =
    code === 'const' ? `<input value="${esc(ref && typeof ref === 'object' ? ref.const ?? '' : ref ?? '')}"
        placeholder="число" oninput="uiRuleSlotConst('${ruleId}',${index},'${slot.key}',this.value)">`
      : code === 'expr' ? `<input value="${esc((ref || {}).expr || '')}" placeholder="#тег + 2"
        oninput="uiRuleSlotExpr('${ruleId}',${index},'${slot.key}',this.value)">`
        : '';

  return cell(slot.label, `
    <select onchange="uiRuleSlotRef('${ruleId}',${index},'${slot.key}',this.value)">
      ${known ? '' : `<option selected value="${esc(code)}">${esc(code)}</option>`}
      ${options.map(([v, l]) => `<option value="${v}"${v === code ? ' selected' : ''}>${esc(l)}</option>`).join('')}
    </select>${editor}`);
}

function cell(label, control, tip) {
  return `<div class="rl-cell">
    <div class="rl-lbl">${esc(label)}${tip ? ` <span class="info-dot" title="${esc(tip)}">i</span>` : ''}</div>
    ${control}
  </div>`;
}

// ── параметры: стабильный ключ + человеческий лейбл ─────────────────────────
// У параметра, как у поля, машинный ключ и человеческий лейбл: ключ
// генерируется при создании и дальше неизменен, шаги ссылаются только на него.
// Форма эффекта в компендиуме перестроится сама — она выводится отсюда.

const PARAM_KINDS = [
  ['expr', 'формула'], ['tag', 'тег поля'], ['dice', 'кости'],
  ['number', 'число'], ['choice', 'выбор источника'], ['effect', 'эффект-состояние'],
];

function paramEditor(ruleId, rule) {
  const params = rule.params || [];
  return `${params.map(p => `
      <div class="rl-param">
        <input id="param-${ruleId}-${p.key}" value="${esc(p.label || '')}"
               placeholder="лейбл параметра" oninput="uiRuleParamSet('${ruleId}','${p.key}','label',this.value)">
        <select onchange="uiRuleParamSet('${ruleId}','${p.key}','kind',this.value)">
          ${PARAM_KINDS.map(([v, l]) => `<option value="${v}"${(p.kind || 'expr') === v ? ' selected' : ''}>${l}</option>`).join('')}
        </select>
        <span class="chk-row${p.of === 'target' ? ' on' : ''}" style="padding:0" title="выражение считает ЦЕЛЬ своим листом"
              onclick="uiRuleParamSet('${ruleId}','${p.key}','of',${p.of === 'target' ? 'false' : 'true'})">
          <span class="chk-box">✓</span><span style="font-size:10px;color:var(--muted)">цель</span>
        </span>
        <button class="rl-del" onclick="uiRuleParamDel('${ruleId}','${p.key}')">✕</button>
      </div>`).join('')}
    <button class="add-row" onclick="uiRuleParamAdd('${ruleId}')">+ параметр</button>`;
}

// ── константы системы: ведущая кость ────────────────────────────────────────

const dieWord = c => (c.dice || []).map(d => `${d.count || 1}к${d.sides}${d.name ? ` «${d.name}»` : ''}`).join(' + ');

// Содержимое секции без заголовка: свёртку и подпись даёт колонка словарей
// (mode-author.js, dictSection) — секция сама не знает, раскрыта ли она.
export function renderConstants() {
  const dice = Object.entries(state.system.constants || {}).filter(([, c]) => c.kind === 'die');

  return `${dice.map(([name, c]) => `
      <div class="auto-rule" style="padding:8px 9px">
        <button class="ar-del" onclick="uiConstDelete('${name}')" title="удалить константу">×</button>
        <div class="ar-row">
          <input value="${esc(c.label)}" placeholder="Название константы" style="flex:1;font-weight:600"
                 oninput="uiConstRename('${name}',this.value)">
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
      </div>`).join('')}
    <button class="add-row" onclick="uiConstAdd()">+ константа-кость</button>`;
}

let constCounter = 0;
function newConstName() {
  let name;
  do { name = `const_${++constCounter}`; } while (state.system.constants && name in state.system.constants);
  return name;
}

export function addConstant() {
  const constants = state.system.constants || (state.system.constants = {});
  const name = newConstName();
  constants[name] = { label: 'Новая кость', kind: 'die', dice: [{ count: 1, sides: 6 }] };
  return name;
}

export function renameConstant(name, label) {
  const c = state.system.constants[name];
  if (c) c.label = label;
}

// Ссылку держит только слот «Кость» шага «порог» (roll.die.constant) —
// тот же принцип защиты, что у поля и у мишени броска.
function constantUsage(name) {
  return Object.values(state.system.rules || {}).some(rule =>
    (rule.steps || []).some(step => step.roll && step.roll.die && step.roll.die.constant === name));
}

export function deleteConstant(name) {
  if (constantUsage(name)) {
    log(`<b>Нельзя удалить «${esc(state.system.constants[name].label)}»:</b> на неё ссылается шаг правила`);
    return;
  }
  delete state.system.constants[name];
}

// ── таблицы по диапазонам: третий способ вычислить поле ─────────────────────
// Ступенчатая прогрессия (бонус мастерства 5e) — не арифметика, а поиск по
// диапазону; движок это умел с самого начала (src/engine/tables.js), заводить
// таблицу и править диапазоны из конструктора было негде.

export function renderTables() {
  const tables = Object.entries(state.system.tables || {});
  return `${tables.map(([name, t]) => `
      <div class="auto-rule" style="padding:8px 9px">
        <button class="ar-del" onclick="uiTableDelete('${name}')" title="удалить таблицу">×</button>
        <div class="ar-row">
          <input value="${esc(t.label || '')}" placeholder="Название таблицы" style="flex:1;font-weight:600"
                 oninput="uiTableRename('${name}',this.value)">
        </div>
        ${(t.ranges || []).map((r, i) => `
          <div class="ar-row">
            <input class="bon-v" style="width:44px" value="${r.from}" title="от"
                   oninput="uiTableRange('${name}',${i},'from',this.value)">
            <span style="font-size:11px;color:var(--muted)">–</span>
            <input class="bon-v" style="width:44px" value="${r.to}" title="до"
                   oninput="uiTableRange('${name}',${i},'to',this.value)">
            <span style="font-size:11px;color:var(--muted)">→</span>
            <input class="bon-v" style="width:44px" value="${r.value}" title="значение"
                   oninput="uiTableRange('${name}',${i},'value',this.value)">
            ${(t.ranges.length > 1) ? `<button class="ar-del" style="position:static" onclick="uiTableRangeDel('${name}',${i})">×</button>` : ''}
          </div>`).join('')}
        <button class="add-row" onclick="uiTableRangeAdd('${name}')">+ диапазон</button>
      </div>`).join('')}
    <button class="add-row" onclick="uiTableAdd()">+ таблица</button>`;
}

let tableCounter = 0;
function newTableName() {
  let name;
  do { name = `table_${++tableCounter}`; } while (state.system.tables && name in state.system.tables);
  return name;
}

export function addTable() {
  const tables = state.system.tables || (state.system.tables = {});
  const name = newTableName();
  tables[name] = { label: 'Новая таблица', ranges: [{ from: 1, to: 1, value: 0 }] };
  return name;
}

export function renameTable(name, label) {
  const t = state.system.tables[name];
  if (t) t.label = label;
}

export function addRange(name) {
  const ranges = state.system.tables[name].ranges;
  const last = ranges[ranges.length - 1];
  const from = last ? last.to + 1 : 1;
  ranges.push({ from, to: from, value: 0 });
}

export function setRange(name, index, key, raw) {
  const n = Number(raw);
  state.system.tables[name].ranges[index][key] = Number.isNaN(n) ? 0 : n;
}

export function deleteRange(name, index) {
  state.system.tables[name].ranges.splice(index, 1);
}

function tableUsage(name) {
  return state.system.fields.some(f => f.value.kind === 'table' && f.value.table === name);
}

export function deleteTable(name) {
  if (tableUsage(name)) {
    log(`<b>Нельзя удалить «${esc(state.system.tables[name].label)}»:</b> на неё ссылается поле листа`);
    return;
  }
  delete state.system.tables[name];
}

// ── правки ───────────────────────────────────────────────────────────────────

const plain = v => (v && typeof v === 'object' ? ('const' in v ? v.const : null) : v);

export function pickRule(id) {
  state.activeRuleId = id;
}

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
