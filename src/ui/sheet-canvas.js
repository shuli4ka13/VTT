// Канвас чарника: блоки черновика, но нарисованные по объявленным полям системы.
//
// В черновике блоки принадлежали персонажу и поля опознавались по набранному имени
// (reference/index.html:1012, :1096). Здесь блок — представление группы полей
// системы, а имя поля разделено надвое: машинный тег и человеческий лейбл.
// Поэтому переименование в поле ниже ничего не ломает — проверяется критерием №2.

import { state, sheet, field, pass, rollOf, valueOf, show, newTag, esc, log } from './state.js';
import { send, receive } from '../events/envelope.js';
import { randomDie } from '../engine/dice.js';

// Типы блоков палитры, которые в PoC живые. Остальные требуют шаблона листа —
// отдельного слоя между системой и чарником, которого здесь намеренно нет.
const LIVE = {
  stat: { label: 'Характеристики', make: group => addField(group, { kind: 'stored', type: 'number', default: 10 }) },
  check: { label: 'Проверка', make: group => addField(group, { kind: 'formula', expr: '1' }) },
};

export function renderCanvas() {
  const canvas = document.getElementById('cs-canvas');
  const p = pass();
  const groups = new Map();
  for (const f of state.system.fields) {
    if (!groups.has(f.group)) groups.set(f.group, []);
    groups.get(f.group).push(f);
  }

  canvas.innerHTML =
    [...groups].map(([group, fields]) => block(group, fields, p)).join('') +
    state.system.actions.map(action => actionBlock(action, p)).join('');
}

function block(group, fields, p) {
  const cells = fields.map(f => cell(f, p)).join('');
  return `<div class="cs-block">
    <div class="blk-type">${esc(group)}</div>
    <div class="stat-grid">${cells}</div>
    <button class="add-row" onclick="uiAddField('${esc(group)}')">+ добавить характеристику</button>
  </div>`;
}

function cell(f, p) {
  const computed = f.value.kind !== 'stored';
  const result = valueOf(f.tag, p);
  const selected = state.activeTag === f.tag ? ' style="outline:1px solid var(--accent)"' : '';

  let valueEl;
  if (!result.ok) {
    valueEl = `<span class="sv" style="color:var(--red);font-size:11px" title="${esc(result.error)}">ошибка</span>`;
  } else if (computed) {
    // Вычисленное значение read-only и синее — как в черновике для формульного max.
    valueEl = `<span class="sv" style="color:var(--blue)" title="вычислено движком">${esc(show(result.value))}</span>`;
  } else if (f.value.type === 'boolean') {
    valueEl = `<span class="sv" style="cursor:pointer" onclick="uiToggle('${f.tag}')">${result.value ? '✔' : '—'}</span>`;
  } else {
    valueEl = `<input class="sv" id="val-${f.tag}" type="number" value="${esc(result.value)}" oninput="uiSetValue('${f.tag}', this.value)">`;
  }

  return `<div class="stat-cell"${selected} onclick="uiPickField('${f.tag}')">
    ${computed ? '' : `<button class="row-del" onclick="event.stopPropagation();uiDelField('${f.tag}')">✕</button>`}
    ${valueEl}
    <input class="sl" id="lbl-${f.tag}" value="${esc(f.label)}" title="переименование не ломает формулы"
           onclick="event.stopPropagation()" oninput="uiRename('${f.tag}', this.value)">
  </div>`;
}

// Действие черновика — блок «проверка» с кнопкой броска. Здесь бросок настоящий:
// собирается конверт и отправляется другому чарнику.
function actionBlock(action, p) {
  const others = state.sheets.filter(s => s.id !== state.activeSheetId);
  const mode = action.envelope.kind === 'attack'
    ? rollOf(action.envelope.roll.target, p).mode
    : 'normal';

  return `<div class="cs-block">
    <div class="blk-type">действие</div>
    <div class="blk-name">${esc(action.label)}</div>
    <div style="font-size:11px;color:var(--muted);margin-bottom:6px">
      ${action.envelope.kind === 'attack'
        ? `бросок по ${esc(action.envelope.versus)} цели · ${modeWord(mode)}`
        : `спасбросок ${esc(action.envelope.saveTag)} против своей сложности`}
    </div>
    <div style="display:flex;gap:6px;flex-wrap:wrap">
      ${others.map(t => `<button class="die-o" onclick="uiSend('${action.id}','${t.id}')">⚄ по ${esc(t.name)}</button>`).join('')}
    </div>
  </div>`;
}

const modeWord = mode =>
  mode === 'advantage' ? 'с преимуществом' : mode === 'disadvantage' ? 'с помехой' : 'обычный';

// ── действия палитры и ячеек ────────────────────────────────────────────────

export function addBlock(type) {
  const live = LIVE[type];
  if (!live) return `Блок «${type}» в прототипе не оживлён: чтобы выбрать ему подачу, нужен шаблон листа — слой между системой и чарником, которого здесь намеренно нет.`;
  live.make(`Новый блок ${state.system.fields.length}`);
  return null;
}

function addField(group, value) {
  const tag = newTag();
  state.system.fields.push({ tag, label: 'Новое поле', group, value });
  state.activeTag = tag;
  state.draft = value.kind === 'formula' ? value.expr : null;
  return tag;
}

export const addFieldTo = group => addField(group, { kind: 'stored', type: 'number', default: 10 });

export function removeField(tag) {
  const used = state.system.fields.filter(f =>
    f.value.kind === 'formula' && f.value.expr.includes('#' + tag));
  if (used.length) {
    log(`<b>Нельзя удалить «${esc(field(tag).label)}»:</b> на него ссылаются ${used.map(f => esc(f.label)).join(', ')}`);
    return;
  }
  state.system.fields = state.system.fields.filter(f => f.tag !== tag);
  for (const s of state.sheets) delete s.values[tag];
  if (state.activeTag === tag) state.activeTag = null;
}

export function rename(tag, label) {
  field(tag).label = label;
}

export function setValue(tag, raw) {
  const f = field(tag);
  sheet().values[tag] = f.value.type === 'boolean' ? Boolean(raw) : Number(raw);
}

export function toggle(tag) {
  const current = valueOf(tag);
  sheet().values[tag] = !current.value;
}

export function dispatch(actionId, targetId) {
  const target = state.sheets.find(s => s.id === targetId);
  const from = sheet();
  const ctx = { system: state.system, compendium: state.compendium, die: randomDie };

  try {
    const envelope = send(actionId, { ...ctx, sheet: from });
    const { sheet: updated, report } = receive(envelope, { ...ctx, sheet: target });
    state.sheets = state.sheets.map(s => (s.id === targetId ? updated : s));
    log(describe(from, target, report));
  } catch (err) {
    log(`<b style="color:var(--red)">Ошибка:</b> ${esc(err.message)}`);
  }
}

function describe(from, to, report) {
  const head = `<b>${esc(from.name)}</b> → <b>${esc(to.name)}</b>`;
  const changes = report.changes.map(c => `${esc(field(c.tag).label)}: ${c.from} → ${c.to}`).join(', ');
  const effects = report.effects.length ? ` · наложено: ${report.effects.map(esc).join(', ')}` : '';

  if (report.kind === 'attack') {
    const dice = report.attack.rolls.join(', ');
    return `${head} · ${esc(report.label)}<br>
      бросок [${dice}] + ${report.attack.bonus} = ${report.attack.total} против ${esc(field(report.versus.tag).label)} ${report.versus.value}
      — <span class="${report.hit ? 'roll-success' : 'roll-fail'}">${report.hit ? 'попадание' : 'мимо'}</span>
      ${changes ? '<br>' + changes : ''}${effects}`;
  }
  return `${head} · ${esc(report.label)}<br>
    спасбросок [${report.save.rolls.join(', ')}] + ${report.save.bonus} = ${report.save.total} против ${report.dc}
    — <span class="${report.success ? 'roll-success' : 'roll-fail'}">${report.success ? 'спасся' : 'провал'}</span>
    ${changes ? '<br>' + changes : ''}${effects}`;
}
