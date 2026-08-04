// Режим игрока: лист персонажа.
//
// Кнопок добавления и удаления полей здесь НЕТ В РАЗМЕТКЕ — не скрыты стилями,
// а не создаются вовсе. Модуль не импортирует ничего, что правит состав полей.
//
// Что игроку можно: вводить значения, надевать предметы, вешать и снимать
// эффекты, брать записи из компендиума и заводить новые. Правило границы:
// новый ТЕГ вводит только автор; комбинировать существующие можно отсюда.

import { state, sheet, field, pass, rollOf, valueOf, show, newRecordId, esc, log } from './state.js';
import { targets, labelOf } from '../engine/targets.js';
import { registry } from '../engine/steps/index.js';
import { send, receive, availableActions } from '../events/envelope.js';
import { randomDie } from '../engine/dice.js';

export function renderPlayer() {
  renderSheetList();
  renderSheetBody();
  renderBelongings();
}

function renderSheetList() {
  document.getElementById('player-sheets').innerHTML = state.sheets.map(s => `
    <div class="char-entry${s.id === state.activeSheetId ? ' on' : ''}" onclick="uiPickSheet('${s.id}')">
      <span class="char-type ${s.kind}">${s.kind === 'pc' ? 'ИГ' : 'НПС'}</span>
      <input class="char-name-inp" type="text" id="name-${s.id}" value="${esc(s.name)}"
             onclick="event.stopPropagation()" oninput="uiRenameSheet('${s.id}', this.value)">
      <button class="char-entry-del" onclick="event.stopPropagation();uiDelSheet('${s.id}')">✕</button>
    </div>`).join('');
}

function renderSheetBody() {
  const host = document.getElementById('player-sheet');
  const current = sheet();

  if (!current) {
    host.innerHTML = '<div class="empty-hint">Выберите персонажа слева</div>';
    return;
  }

  const p = pass();


  const groups = new Map();
  for (const f of state.system.fields) {
    if (!groups.has(f.group)) groups.set(f.group, []);
    groups.get(f.group).push(f);
  }

  host.innerHTML = `<div class="cs-block" style="background:var(--s2)">
      <input class="blk-name" type="text" id="sheet-name" value="${esc(current.name)}"
             oninput="uiRenameSheet('${current.id}', this.value)">
      <div class="blk-type" style="margin:0">${current.kind === 'pc' ? 'персонаж игрока' : 'НПС ведущего'}</div>
    </div>` +
    [...groups].map(([group, fields]) => {
      // Подача блока выводится из того, что в нём лежит, а не из его названия.
      const textual = fields.every(f => f.value.kind === 'stored' && f.value.type === 'text');

      const body = textual
        ? fields.map(f => textRow(f, p)).join('')
        : `<div class="stat-grid">${fields.map(f => cell(f, p)).join('')}</div>`;

      return `<div class="cs-block"><div class="blk-type">${esc(group)}</div>${body}</div>`;
    }).join('')
    + belongingsBlocks(current, p);
}

// Снаряжение и эффекты видны НА ЛИСТЕ, а не только в панели сбоку.
// В черновике активные эффекты были цветными бейджами на токене; здесь так же,
// только на чарнике. Клик по бейджу снимает.
function belongingsBlocks(current, p) {
  const { items, effects } = state.compendium;
  const worn = current.equipped.map(id => items.find(i => i.id === id)).filter(Boolean);
  const hung = current.effects.map(e => effects.find(f => f.id === e.effectId)).filter(Boolean);

  const gear = worn.length
    ? worn.map(item => `<div class="lst-row" style="grid-template-columns:1fr auto 18px">
        <span style="font-size:12px">${esc(item.label)}</span>
        <span class="lst-badge">${modifierSummary(item, p)}</span>
        <button class="row-del" onclick="uiEquip('${item.id}')" title="снять">✕</button>
      </div>`).join('')
    : '<div class="char-empty-hint">Ничего не надето.</div>';

  const fx = hung.length
    ? `<div class="tok-fx-active">${hung.map(effect => {
      const tone = toneOf(effect);
      return `<div class="tok-fx-badge" style="background:${tone.bg};border:1px solid ${tone.border};color:${tone.color}"
                   onclick="uiHang('${effect.id}')" title="снять">
        <span>${esc(effect.icon || '✦')}</span>
        <span>${esc(effect.label)}</span>
        <span style="opacity:.75;font-size:10px">${modifierSummary(effect, p)}</span>
        <span class="tok-fx-x">✕</span>
      </div>`;
    }).join('')}</div>`
    : '<div class="char-empty-hint">Эффектов нет.</div>';

  return `<div class="cs-block"><div class="blk-type">Снаряжение</div>${gear}</div>
    <div class="cs-block"><div class="blk-type">Эффекты</div>${fx}</div>`;
}

// Что запись делает — одной строкой, лейблами. Тегов игрок не видит.
function modifierSummary(record, p) {
  const mods = record.modifiers || [];
  if (!mods.length) return '—';

  return mods.map(mod => {
    const target = state.system.fields.find(f => f.tag === mod.target)
      || (state.system.rolls || []).find(r => r.tag === mod.target)
      || { label: mod.target };
    const name = target.label || target.tag;

    if (mod.effect) return `${mod.effect === 'advantage' ? 'преимущество' : 'помеха'}: ${esc(name)}`;

    const raw = mod.value && typeof mod.value === 'object' ? mod.value.expr : mod.value;
    // Ссылку показываем лейблом, логическое — словом. Ни тегов, ни «true» на экране.
    const shown = typeof raw === 'boolean' ? show(raw)
      : typeof raw === 'string' && raw.startsWith('#')
        ? (state.system.fields.find(f => '#' + f.tag === raw) || {}).label || raw
        : String(raw);
    const sign = mod.op === 'set' ? '= ' : mod.op === 'mul' ? '×' : Number(raw) < 0 ? '' : '+';
    return `${esc(name)} ${sign}${esc(shown)}`;
  }).join(' · ');
}

// Красный, зелёный или нейтральный — выводится из того, что эффект делает,
// а не из отдельного поля «тип». Помеха и минус — плохо, преимущество и плюс — хорошо.
function toneOf(effect) {
  const mods = effect.modifiers || [];
  const bad = mods.some(m => m.effect === 'disadvantage' || Number(m.value) < 0);
  const good = mods.some(m => m.effect === 'advantage' || Number(m.value) > 0);

  if (bad && !good) return { bg: 'rgba(248,113,113,.1)', border: 'rgba(248,113,113,.35)', color: 'var(--red)' };
  if (good && !bad) return { bg: 'rgba(74,222,128,.1)', border: 'rgba(74,222,128,.35)', color: 'var(--green)' };
  return { bg: 'var(--s2)', border: 'var(--border2)', color: 'var(--text)' };
}

function cell(f, p) {
  const result = valueOf(f.tag, p);
  const computed = f.value.kind !== 'stored';

  let control;
  if (!result.ok) {
    control = `<span class="sv" style="color:var(--red);font-size:11px" title="${esc(result.error)}">ошибка</span>`;
  } else if (computed) {
    // Вычисляемое поле — только для чтения. Его считает движок, а не игрок.
    control = `<span class="sv" style="color:var(--blue)" title="считает движок, вводить нельзя">${esc(show(result.value))}</span>`;
  } else if (f.value.type === 'boolean') {
    control = `<span class="sv" style="cursor:pointer" onclick="uiToggle('${f.tag}')">${result.value ? '✔' : '—'}</span>`;
  } else {
    control = `<input class="sv" id="val-${f.tag}" type="number" value="${esc(result.value)}"
                      oninput="uiSetValue('${f.tag}', this.value)">`;
  }

  return `<div class="stat-cell">
    ${control}
    <span class="sl" style="display:block">${esc(f.label)}</span>
  </div>`;
}

function textRow(f, p) {
  const result = valueOf(f.tag, p);
  return `<div class="txt-row" style="grid-template-columns:118px 1fr">
    <span class="txt-k">${esc(f.label)}</span>
    <input class="txt-v" type="text" id="val-${f.tag}" value="${esc(result.ok ? result.value : '')}"
           placeholder="—" oninput="uiSetValue('${f.tag}', this.value)">
  </div>`;
}

function renderBelongings() {
  const host = document.getElementById('player-belongings');
  const current = sheet();
  if (!current) { host.innerHTML = ''; return; }

  const { items, effects, actions } = state.compendium;
  const others = state.sheets.filter(s => s.id !== current.id);
  const p = pass();
  // Что можно применить: активности НАДЕТЫХ предметов плюс выученные записи.
  // Меч даёт свою атаку сам — как в Foundry; снял — атака пропала.
  const usable = availableActions(current, state.compendium);

  host.innerHTML = `
    <div class="pal-sec">Снаряжение</div>
    ${picker(items, current.equipped, 'uiEquip', 'предметов в компендиуме нет')}
    <button class="add-row" onclick="uiCreate('item')">+ создать предмет</button>

    <div class="pal-sec" style="margin-top:10px">Эффекты</div>
    ${picker(effects.filter(e => !e.rule), current.effects.map(e => e.effectId), 'uiHang', 'эффектов нет')}
    <button class="add-row" onclick="uiCreate('effect')">+ создать эффект</button>

    ${renderRolls(p)}

    <div class="pal-sec" style="margin-top:10px">Действия</div>
    ${picker(actions, current.actions, 'uiLearn', 'действий нет')}
    <button class="add-row" onclick="uiCreate('action')">+ создать действие</button>
    <button class="add-row" onclick="uiCreate('spell')">+ создать заклинание</button>

    ${usable.length && others.length ? `
      <div class="pal-sec" style="margin-top:10px">Применить</div>
      ${usable.map(action => `<div class="auto-rule" style="padding:7px 8px">
          <div style="font-size:12px;margin-bottom:5px">${esc(action.label)}
            ${action.kind === 'item' ? '<span class="hint-kind">от предмета</span>' : ''}</div>
          <div style="display:flex;gap:4px;flex-wrap:wrap">
            ${others.map(t => `<button class="die-o" onclick="uiSend('${action.id}','${t.id}')">⚄ по ${esc(t.name)}</button>`).join('')}
          </div>
        </div>`).join('')}` : ''}`;
}

// Бросков в полной 5e под тридцать, и перечислять все — стена текста.
// Показываем только те, на которых что-то висит; про остальные говорим числом.
function renderRolls(p) {
  const all = targets(state.system).filter(t => t.kind === 'roll')
    .map(t => ({ target: t, roll: rollOf(t.tag, p) }));
  const touched = all.filter(({ roll }) => roll.mode !== 'normal' || roll.bonus);

  if (!touched.length) {
    return `<div class="pal-sec" style="margin-top:10px">Броски</div>`;
  }

  return `<div class="pal-sec" style="margin-top:10px">Броски сейчас</div>
    ${touched.map(({ target, roll }) => {
      // Режим и прибавка — разные вещи и показываются раздельно.
      // «+5 ко всем проверкам» это не преимущество, а число.
      const plus = roll.bonus
        ? `<span style="color:var(--green)">${roll.bonus > 0 ? '+' : ''}${roll.bonus}</span> `
        : '';
      return `<div class="mcs-row" title="${esc(roll.sources.map(s => s.label).join(', '))}">
        <span>${esc(target.label)}</span>
        <span style="color:var(--accent)">${plus}${modeWord(roll.mode)}</span>
      </div>`;
    }).join('')}`;
}

// Один вид списка для всех трёх видов записей: галочка «у меня есть».
function picker(records, taken, handler, emptyText) {
  if (!records.length) return `<div class="sys-hint" style="padding:2px 4px">${emptyText}</div>`;
  const has = new Set(taken);
  return records.map(r => `
    <div class="fx-entry" onclick="${handler}('${r.id}')" style="padding:5px 8px">
      <span class="fx-e-icon">${has.has(r.id) ? '✔' : '·'}</span>
      <span style="flex:1;${has.has(r.id) ? '' : 'color:var(--muted)'}">${esc(r.label)}</span>
      <span class="hint-kind">${kindWord(r)}</span>
    </div>`).join('');
}

const kindWord = r =>
  r.kind === 'spell' ? 'заклинание' : r.kind === 'action' ? 'действие' : r.modifiers ? '' : '';

const modeWord = mode =>
  mode === 'advantage' ? 'преимущество' : mode === 'disadvantage' ? 'помеха' : 'обычный';

// ── правки чарника ──────────────────────────────────────────────────────────

export function pickSheet(id) {
  state.activeSheetId = id;
}

export function newSheet(kind = 'pc') {
  let n = state.sheets.length + 1;
  while (state.sheets.some(s => s.id === `sheet_${n}`)) n++;
  const id = `sheet_${n}`;

  state.sheets.push({
    id,
    systemId: state.system.id,
    kind,
    name: kind === 'pc' ? 'Новый персонаж' : 'Новый НПС',
    values: {},   // всё возьмётся из умолчаний системы
    equipped: [],
    effects: [],
    actions: [],
  });
  state.activeSheetId = id;
}

export function renameSheet(id, name) {
  const target = state.sheets.find(s => s.id === id);
  if (target) target.name = name;
}

export function deleteSheet(id) {
  if (state.sheets.length === 1) {
    log('<b>Последний лист не удаляю</b> — иначе экран станет пустым.');
    return;
  }
  state.sheets = state.sheets.filter(s => s.id !== id);
  if (state.activeSheetId === id) state.activeSheetId = state.sheets[0].id;
}

export function setValue(tag, raw) {
  const type = field(tag).value.type;
  sheet().values[tag] =
    type === 'boolean' ? Boolean(raw)
      : type === 'text' ? String(raw)
        : Number(raw);
}


export function toggle(tag) {
  const current = valueOf(tag);
  sheet().values[tag] = !current.value;
}

export function equip(id) {
  const current = sheet();
  current.equipped = current.equipped.includes(id)
    ? current.equipped.filter(e => e !== id)
    : [...current.equipped, id];
}

export function hang(id) {
  const current = sheet();
  current.effects = current.effects.some(e => e.effectId === id)
    ? current.effects.filter(e => e.effectId !== id)
    : [...current.effects, { effectId: id }];
}

export function learn(id) {
  const current = sheet();
  current.actions = current.actions.includes(id)
    ? current.actions.filter(a => a !== id)
    : [...current.actions, id];
}

// Созданная запись ложится в ОБЩИЙ компендиум, персонаж получает ссылку.
// Копий внутри персонажа не делаем — потому и уходим сразу в компендиум,
// чтобы было видно: правится общая библиотека.
export function create(kind) {
  const current = sheet();
  const first = state.system.fields[0].tag;
  const roll = (state.system.rolls[0] || {}).tag;

  if (kind === 'item') {
    const id = newRecordId('item');
    state.compendium.items.push({
      id, label: 'Новый предмет', slot: 'misc', description: '',
      modifiers: [{ kind: 'value', target: first, op: 'add', value: 1, stacking: 'sum', condition: null }],
    });
    current.equipped.push(id);
    return handOff(id, 'предмет');
  }

  if (kind === 'effect') {
    const id = newRecordId('fx');
    state.compendium.effects.push({
      id, label: 'Новый эффект', icon: '✦', duration: { kind: 'scene' }, description: '',
      modifiers: [{ kind: 'roll', target: roll, effect: 'disadvantage', method: 'rerollBest', condition: null }],
    });
    current.effects.push({ effectId: id });
    return handOff(id, 'эффект');
  }

  // Действие ссылается на эффект-вызов и не вводит ни тега, ни шага —
  // потому его и волен создать игрок. Если вызовов в библиотеке ещё нет,
  // дальше игрока отправит редактор компендиума.
  const spell = kind === 'spell';
  const id = newRecordId(spell ? 'spell' : 'act');
  const call = state.compendium.effects.find(e => e.rule);
  state.compendium.actions.push({
    id, kind: spell ? 'spell' : 'action',
    label: spell ? 'Новое заклинание' : 'Новое действие',
    description: '',
    effect: call ? call.id : '',
  });
  current.actions.push(id);
  return handOff(id, spell ? 'заклинание' : 'действие');
}

function handOff(id, word) {
  state.mode = 'compendium';
  state.activeRecordId = id;
  log(`Новый ${word} создан <b>в общем компендиуме</b>. Персонаж на него ссылается.`);
}

export function dispatch(actionId, targetId) {
  const target = state.sheets.find(s => s.id === targetId);
  const from = sheet();
  const ctx = { system: state.system, compendium: state.compendium, die: randomDie };

  try {
    const envelope = send(actionId, { ...ctx, sheet: from });
    const { sheet: updated, report } = receive(envelope, { ...ctx, sheet: target });
    // Получатель вернул НОВЫЙ чарник — подменяем целиком, не правя старый.
    state.sheets = state.sheets.map(s => (s.id === targetId ? updated : s));
    log(describe(from, target, report));
  } catch (err) {
    log(`<b style="color:var(--red)">Ошибка:</b> ${esc(err.message)}`);
  }
}

// Журнал — это трасса правила, шаг за шагом с числами. Строку каждого шага
// пишет ЕГО модуль (traceLine в src/engine/steps/*): новый тип шага приносит
// свою подачу сам, интерфейс по типам не ветвится.
function describe(from, to, report) {
  const head = `<b>${esc(from.name)}</b> → <b>${esc(to.name)}</b> · ${esc(report.label)}`;

  const helpers = {
    labelOf: tag => labelOf(state.system, tag),
    effectLabel: id => ((state.compendium.effects || []).find(e => e.id === id) || { label: id }).label,
  };

  const lines = report.trace.map(entry => {
    const mod = registry.get(entry.type);
    const text = mod && mod.traceLine
      ? mod.traceLine(entry, helpers)
      : `${entry.type}: шаг отработал`;
    return esc(text);
  });

  const verdict = report.stopped
    ? `<span class="roll-fail">цепочка оборвана на шаге «${esc(String(report.stopped.step))}»</span>`
    : '<span class="roll-success">правило отработало до конца</span>';

  return `${head}<br>${lines.join('<br>')}<br>${verdict}`;
}
