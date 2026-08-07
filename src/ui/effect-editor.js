// Конструктор эффектов. Живёт ТОЛЬКО в режиме автора: правка эффекта — это
// смена закона мира, как правка формулы поля.
//
// Эффект — единица автоматизации, и род у него один из трёх:
//   ⚔ активируемый — жмёшь сам; конвейер шагов
//   ⚡ триггерный   — срабатывает на чужое событие; тот же конвейер
//   ✦ пассивный    — висит и правит цифры; модификаторы
//
// Род определяет НАГРУЗКУ, и потому переключатель рода наверху карточки: он
// решает, конвейер здесь или модификаторы. Помеха с преимуществом — не род,
// а нагрузка пассивного; «действует на всех» — вообще не свойство эффекта,
// а строка в правилах комнаты (mode-author.js). Эффект не знает, где включён.
//
// Раскладка — идиома черновика «список · редактор · палитра»:
//   слева   библиотека эффектов, сгруппированная по роду,
//   в центре карточка: род, оси, и КОНВЕЙЕР шагов на хребте (или модификаторы),
//   справа  палитра типов шагов; клик кладёт шаг в конец цепочки.
//
// Интерфейс ВЫВОДИТСЯ из данных, а не дублирует их:
//   · палитра и форма каждой карточки — из реестра (module.slots, module.icon);
//   · выпадашка допустимых ссылок — из параметров эффекта, результатов
//     предыдущих шагов (module.outputs) и объявленных тегов;
//   · приговор о разборе — из статических проверок (module.lint).
// Добавили тип шага модулем — карточка, палитра и журнал нарисовались сами.
//
// Как и всюду в режиме автора, ни одного значения на экране: вместо результата —
// приговор («эффект верный · шагов: 4 · может оборваться на 1»).

import { state, esc, newEffectId } from './state.js';
import { registry } from '../engine/steps/index.js';
import { AMOUNT_SOURCES } from '../model/amount-sources.js';
import { ACTIVATIONS, DURATIONS, STACKING, TRIGGER_MOMENTS } from '../model/effect-kinds.js';
import { activationOf, durationOf, stackingOf, isPipeline, usesMax } from '../engine/effects.js';
import { modifiersBody, defaultModifier, ownerKey } from './modifiers-editor.js';
import { compile } from '../formula/index.js';

// Человеческие слова для машинных значений слотов-выборов. Неизвестное значение
// показывается как есть — это честнее, чем прятать.
const WORDS = {
  sender: 'бросает отправитель', target: 'бросает цель',
  success: 'дальше при успехе', fail: 'дальше при провале',
  less: 'меньше порога — обрыв', atMost: 'не выше порога — обрыв', never: 'никогда (только разница)',
  add: '+ прибавить', subtract: '− вычесть', set: '= присвоить',
  apply: 'наложить', remove: 'снять',
  atLeast: 'не меньше порога — успех (5e: d20 вверх)',
  notOver: 'не выше порога — успех (CoC/GURPS: бросок вниз)',
  over: 'строго больше порога — успех',
  under: 'строго меньше порога — успех',
};
const word = v => WORDS[v] || v;

const activeEffect = () => {
  const effects = state.system.effects || {};
  if (!state.activeRuleId || !effects[state.activeRuleId]) {
    state.activeRuleId = Object.keys(effects)[0] || null;
  }
  return state.activeRuleId ? [state.activeRuleId, effects[state.activeRuleId]] : [null, null];
};

// ── левая колонка: библиотека эффектов ──────────────────────────────────────

export function renderRuleList() {
  const effects = Object.entries(state.system.effects || {});
  const [activeId] = activeEffect();
  const room = new Set(state.system.room_rules || []);

  document.getElementById('rules-list').innerHTML = `
    ${Object.entries(ACTIVATIONS).map(([activation, decl]) => {
      const mine = effects.filter(([, e]) => activationOf(e) === activation);
      if (!mine.length) return '';
      return `<div class="pal-sec">${decl.icon} ${esc(decl.label)}</div>
        ${mine.map(([id, effect]) => {
          const v = verdictOf(effect);
          return `<div class="item-entry${id === activeId ? ' on' : ''}" onclick="uiEffPick('${id}')">
            <span class="ie-icon" style="color:${v.ok ? 'var(--green)' : 'var(--red)'}">●</span>
            <div style="flex:1;min-width:0">
              <div class="ie-name">${esc(effect.label || id)}</div>
              <div class="ie-sub">${esc(subtitle(effect))}${room.has(id) ? ' · в правилах комнаты' : ''}</div>
            </div>
          </div>`;
        }).join('')}`;
    }).join('')}

    <div class="pal-sec" style="margin-top:10px">Создать с нуля</div>
    ${Object.entries(ACTIVATIONS).map(([activation, decl]) =>
      `<button class="add-row" onclick="uiEffAdd('${activation}')" title="${esc(decl.hint)}">
        + ${decl.icon} ${esc(decl.label.toLowerCase())}</button>`).join('')}`;
}

const subtitle = effect => (isPipeline(effect)
  ? `шагов: ${(effect.steps || []).length} · параметров: ${(effect.params || []).length}`
  : `модификаторов: ${(effect.modifiers || []).length}`);

// ── центр: карточка активного эффекта ───────────────────────────────────────

export function renderRuleCanvas() {
  const host = document.getElementById('rules-canvas');
  const [id, effect] = activeEffect();

  if (!effect) {
    host.innerHTML = '<div class="empty-ed">Заведите первый эффект<br>кнопкой слева</div>';
    return;
  }

  host.innerHTML = `
    <div style="display:flex;gap:8px;align-items:center">
      <input class="blk-name" id="eff-label-${id}" style="font-size:16px;margin:0" value="${esc(effect.label || '')}"
             placeholder="Название эффекта" oninput="uiEffRename('${id}',this.value)">
      <button class="row-del" style="opacity:.7" title="удалить эффект" onclick="uiEffDelete('${id}')">✕</button>
    </div>

    ${activationRow(id, effect)}
    ${verdictRow(effect)}
    ${axesRow(id, effect)}
    ${activationOf(effect) === 'triggered' ? triggerRow(id, effect) : ''}

    ${isPipeline(effect) ? pipelineBody(id, effect) : modifiersBody(ownerKey('effect', id), effect)}`;
}

// Род — первое, что выбирают: он решает, конвейер здесь или модификаторы.
function activationRow(id, effect) {
  const current = activationOf(effect);
  return `<div class="rl-slots" style="margin-top:8px">
    ${Object.entries(ACTIVATIONS).map(([key, decl]) => `
      <div class="pal-item${key === current ? ' on' : ''}" style="${key === current ? 'border-color:var(--accent)' : ''}"
           onclick="uiEffActivation('${id}','${key}')" title="${esc(decl.hint)}">
        <span class="pal-icon">${decl.icon}</span>
        <div><div class="pal-t">${esc(decl.label)}</div></div>
      </div>`).join('')}
  </div>`;
}

// Оси, независимые от рода: категория (слово для палитры), стоимость,
// длительность, стакинг. Показываем только те, что для этого рода осмысленны.
function axesRow(id, effect) {
  const activation = activationOf(effect);
  const costs = Object.entries(state.system.action_types || {});
  const durations = Object.entries(DURATIONS)
    .filter(([, d]) => d.forActivations.includes(activation));

  return `<div class="rl-slots" style="margin-top:8px">
    ${cell('Категория (полка в палитре)', `
      <input value="${esc(effect.category || '')}" placeholder="Атака, Лечение, Состояния…"
             oninput="uiEffSet('${id}','category',this.value)">`,
      'Слово для палитры, не тег: движок на него не ссылается, переименование ничего не ломает.')}

    ${activation === 'manual' ? cell('Стоимость', `
      <select onchange="uiEffSet('${id}','cost',this.value)">
        <option value="">— без стоимости —</option>
        ${costs.map(([key, t]) => `<option value="${key}"${effect.cost === key ? ' selected' : ''}>${esc(t.label)}</option>`).join('')}
      </select>`,
      'Раундов в прототипе нет: это бейдж на кнопке, а не запрет.') : ''}

    ${durations.length ? cell('Длительность', `
      <select onchange="uiEffSet('${id}','duration',this.value)">
        ${durations.map(([key, d]) => `<option value="${key}"${durationOf(effect) === key ? ' selected' : ''}>${esc(d.label)}</option>`).join('')}
      </select>`,
      (DURATIONS[durationOf(effect)] || {}).hint) : ''}

    ${durationOf(effect) === 'uses' ? cell('Сколько срабатываний', `
      <input value="${usesMax(effect) ?? 1}" placeholder="3"
             oninput="uiEffSet('${id}','uses',this.value)">`,
      'Остаток — личное число персонажа: живёт в его записи на листе, не здесь.') : ''}

    ${activation !== 'manual' ? cell('Повторное наложение', `
      <select onchange="uiEffSet('${id}','stacking',this.value)">
        ${Object.entries(STACKING).map(([key, s]) => `<option value="${key}"${stackingOf(effect) === key ? ' selected' : ''}>${esc(s.label)}</option>`).join('')}
      </select>`,
      (STACKING[stackingOf(effect)] || {}).hint) : ''}
  </div>`;
}

// Триггер: что слушаем, когда и при каком условии. Условие — структурная
// ссылка, как слоты шагов: { ref: 'hit.success' } смотрит в результат шага
// СОБЫТИЯ, и выпадашка выводится из выходов того эффекта, что мы слушаем.
function triggerRow(id, effect) {
  const trigger = effect.trigger || {};
  const listenable = Object.entries(state.system.effects || {})
    .filter(([key, e]) => key !== id && isPipeline(e));

  return `<div class="rl-slots" style="margin-top:8px">
    ${cell('Слушаем эффект', `
      <select onchange="uiEffTrigger('${id}','on',this.value)">
        <option value="">— не выбрано —</option>
        ${listenable.map(([key, e]) => `<option value="${key}"${trigger.on === key ? ' selected' : ''}>${esc(e.label || key)}</option>`).join('')}
      </select>`,
      'Триггер срабатывает, когда по владельцу применили именно этот эффект.')}

    ${cell('Когда', `
      <select onchange="uiEffTrigger('${id}','when',this.value)">
        ${Object.entries(TRIGGER_MOMENTS).map(([key, m]) => `<option value="${key}"${(trigger.when || 'resolved') === key ? ' selected' : ''}>${esc(m.label)}</option>`).join('')}
      </select>`,
      TRIGGER_MOMENTS[trigger.when || 'resolved'].hint)}

    ${cell('Условие', `
      <select onchange="uiEffTrigger('${id}','condition',this.value)">
        <option value="">— всегда —</option>
        ${triggerConditions(trigger.on).map(([code, label]) =>
          `<option value="${esc(code)}"${encodeRef(trigger.condition) === code ? ' selected' : ''}>${esc(label)}</option>`).join('')}
      </select>`,
      'Смотрит в трассу события: попали ли, сколько превысили.')}
  </div>`;
}

// Что можно спросить у события: именованные результаты шагов того эффекта,
// который мы слушаем. Тот же module.outputs, что питает ссылки в слотах.
function triggerConditions(onId) {
  const source = (state.system.effects || {})[onId];
  if (!source) return [];
  const options = [];
  for (const step of source.steps || []) {
    const mod = registry.get(step.type);
    if (!step.id || !mod) continue;
    for (const out of mod.outputs || []) {
      options.push([`ref:${step.id}${out.path}`, `шаг «${step.id}» · ${out.label}`]);
    }
  }
  return options;
}

function verdictRow(effect) {
  const v = verdictOf(effect);
  return `<div class="rl-verdict" style="color:${v.ok ? 'var(--green)' : 'var(--red)'}">
    ${v.ok ? '✓' : '✗'} ${esc(v.text)}</div>`;
}

function pipelineBody(id, effect) {
  const steps = effect.steps || [];
  return `
    <div class="pal-sec" style="margin-top:12px">${activationOf(effect) === 'triggered'
      ? 'Вход — параметры, их заполняет сам эффект ниже'
      : 'Вход — параметры, их заполнит запись компендиума'}</div>
    ${paramEditor(id, effect)}
    ${activationOf(effect) === 'triggered' ? argsEditor(id, effect) : ''}

    <div class="pal-sec" style="margin-top:14px">Цепочка шагов</div>
    ${steps.length ? `<div class="rl-flow">
        ${steps.map((step, i) => stepCard(id, effect, step, i)).join('')}
      </div>`
    : '<div class="sys-hint">Шагов пока нет — возьмите первый из палитры справа.</div>'}`;
}

// У триггерного эффекта нет записи компендиума, которая заполнила бы его
// параметры: он сам себе источник. Поэтому аргументы живут на нём же.
function argsEditor(id, effect) {
  const params = effect.params || [];
  if (!params.length) return '';
  const args = effect.args || {};
  return `<div class="pal-sec" style="margin-top:10px">Чем заполнены</div>
    ${params.map(p => `
      <div class="bon-row" style="grid-template-columns:130px 1fr;border:none">
        <span style="font-size:11px;color:var(--muted)">${esc(p.label || p.key)}</span>
        <input value="${esc(args[p.key] ?? '')}" placeholder="${esc(argHint(p))}"
               oninput="uiEffArg('${id}','${p.key}',this.value)">
      </div>`).join('')}`;
}

const argHint = p => ({
  expr: '#тег + 2', tag: 'тег поля', dice: '1d4',
  number: 'число', effect: 'id эффекта', choice: 'roll / item / margin',
}[p.kind] || 'значение');

// ── правая колонка: палитра типов шагов ─────────────────────────────────────

export function renderStepPalette() {
  const [id, effect] = activeEffect();
  const host = document.getElementById('rules-palette');

  if (effect && !isPipeline(effect)) {
    host.innerHTML = `<div class="sys-hint">У пассивного эффекта конвейера нет:
      его нагрузка — модификаторы, они правятся в карточке слева.<br><br>
      Нужен конвейер — смените род на активируемый или триггерный.</div>`;
    return;
  }

  const mods = [...registry.values()];
  host.innerHTML = `
    ${mods.map(m => `
      <div class="pal-item" ${id ? `onclick="uiEffAddStep('${id}','${m.type}')"` : ''}>
        <span class="pal-icon">${m.icon || '□'}</span>
        <div><div class="pal-t">${esc(m.label)}</div><div class="pal-s">${esc(m.hint || '')}</div></div>
      </div>`).join('')}
    <div class="sys-hint" style="margin-top:10px">Клик кладёт шаг в конец цепочки.
      Шаг получает имя, и следующие шаги ссылаются на его результат по этому имени.</div>`;
}

// ── приговор о разборе ───────────────────────────────────────────────────────
// Считать нечего и не по чему: персонажа в режиме автора нет. Зато можно
// разобрать: типы известны, выражения парсятся, ссылки бьют по существующему.

export function verdictOf(effect) {
  if (!isPipeline(effect)) return passiveVerdict(effect);

  const ids = new Set();
  const params = new Set((effect.params || []).map(p => p.key));
  const steps = effect.steps || [];

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
          throw new Error(`параметр «${ref.param}» не объявлен эффектом`);
        }
        if ('ref' in ref && !ids.has(String(ref.ref).split('.')[0])) {
          throw new Error(`ссылка на шаг «${String(ref.ref).split('.')[0]}», которого выше нет`);
        }
        // Свойство записи объявляет РОД, а не эффект. Приехал шаг из чужой
        // системы, а рода за ним не приехало — ссылка бьёт в пустоту, и молчать
        // об этом нельзя: упадёт только при отправке, у игрока за столом.
        const prop = 'prop' in ref ? ref.prop : ref.item;
        if (prop !== undefined && !ref.optional && !declaredProps().has(prop)) {
          throw new Error(`свойство «${prop}» не объявлено ни одним родом записей`);
        }
      });
    } catch (err) {
      return { ok: false, text: `шаг ${i + 1}: ${err.message}` };
    }
    if (step.id) ids.add(step.id);
  }

  if (activationOf(effect) === 'triggered') {
    const trouble = triggerTrouble(effect);
    if (trouble) return { ok: false, text: trouble };
  }

  const breakers = steps.map((s, i) => {
    const mod = registry.get(s.type);
    const breaks = mod.breakLine ? mod.breakLine(s) !== null : mod.mayBreak;
    return breaks ? i + 1 : null;
  }).filter(Boolean);
  return {
    ok: true,
    text: `эффект верный · шагов: ${steps.length}`
      + (breakers.length ? ` · может оборваться на ${breakers.join(' и ')}` : ''),
  };
}

// Триггер без источника молчал бы навсегда — а молчащий эффект выглядит
// как рабочий. Поэтому это ошибка разбора, а не мелочь.
function triggerTrouble(effect) {
  const trigger = effect.trigger || {};
  if (!trigger.on) return 'триггер не выбрал, какой эффект слушать — сработать ему не на что';
  if (!(state.system.effects || {})[trigger.on]) {
    return `триггер слушает эффект «${trigger.on}», которого в библиотеке нет`;
  }
  const args = effect.args || {};
  const missing = (effect.params || []).filter(p => !String(args[p.key] ?? '').trim());
  if (missing.length) {
    return `не заполнены аргументы: ${missing.map(p => p.label || p.key).join(', ')}`;
  }
  return null;
}

function passiveVerdict(effect) {
  const mods = effect.modifiers || [];
  if (!mods.length) return { ok: false, text: 'пассивный эффект без модификаторов ничего не делает' };
  for (const [i, mod] of mods.entries()) {
    if (!mod.target) return { ok: false, text: `модификатор ${i + 1}: мишень не выбрана` };
    if (!mod.condition) continue;
    try { compile(String(mod.condition)); } catch (err) {
      return { ok: false, text: `модификатор ${i + 1}: условие — ${err.message}` };
    }
  }
  return { ok: true, text: `эффект верный · модификаторов: ${mods.length}` };
}

// Какие свойства вообще существуют в этой системе. Объявляют их рода записей
// (system.records[rk].props) — компендиум ничего нового не вводит.
function declaredProps() {
  const keys = new Set();
  for (const decl of Object.values(state.system.records || {})) {
    for (const p of decl.props || []) keys.add(p.key);
  }
  return keys;
}

function walkRefs(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (['expr', 'param', 'ref', 'prop', 'item', 'tag', 'const'].some(k => k in node)) return visit(node);
  for (const value of Object.values(node)) walkRefs(value, visit);
}

// ── карточка шага на хребте ──────────────────────────────────────────────────

function stepCard(effectId, effect, step, index) {
  const mod = registry.get(step.type);
  const node = `<div class="rl-node">${index + 1}</div>`;

  if (!mod) {
    return `<div class="rl-step">${node}
      <div class="rl-card" style="border-color:var(--red)">
        неизвестный тип «${esc(step.type)}»
        <button class="rl-del" onclick="uiEffDelStep('${effectId}',${index})">✕</button>
      </div></div>`;
  }

  // Развилка — часть хребта: она про ПОТОК, а не про содержимое карточки.
  // Слова пишет сам шаг (module.breakLine): «промах» и «не пробило» — разные
  // выходы. null — шаг в этой конфигурации не обрывает, линия прямая.
  const exit = mod.breakLine ? mod.breakLine(step) : null;
  const branch = exit
    ? `<div class="rl-branch">⤫ ${esc(exit)} — эффект кончается здесь</div>`
    : '';

  return `<div class="rl-step">${node}
    <div class="rl-card">
      <div class="rl-head">
        <span class="rl-type">${mod.icon || '□'} ${esc(mod.label)}</span>
        ${step.id ? `<span class="rl-id" title="под этим именем результат шага виден следующим">«${esc(step.id)}»</span>` : ''}
        ${mod.hint ? `<span class="info-dot" title="${esc(mod.hint)}">i</span>` : ''}
        <button class="rl-del" onclick="uiEffDelStep('${effectId}',${index})">✕</button>
      </div>
      <div class="rl-slots">
        ${mod.slots.map(slot => slotCell(effectId, effect, step, index, slot)).join('')}
      </div>
    </div>
  </div>${branch}`;
}

function slotCell(effectId, effect, step, index, slot) {
  if (slot.kind === 'choice') {
    // Для источника величины — словарь с примерами систем, как у механик преимущества.
    const dict = slot.key === 'source' ? AMOUNT_SOURCES : null;
    const options = slot.options || Object.keys(slot.choices || {});
    const current = plain(step[slot.key]) ?? options[0];
    const chosen = dict && dict.find(s => s.id === current);
    return cell(slot.label, `
      <select onchange="uiEffSlot('${effectId}',${index},'${slot.key}',this.value)">
        ${options.map(o => {
          const entry = dict && dict.find(s => s.id === o);
          const text = entry ? `${entry.label} — ${entry.examples.map(e => e.system).join(', ')}`
            : (slot.choices && slot.choices[o] ? slot.choices[o].label : word(o));
          return `<option value="${o}"${o === current ? ' selected' : ''}>${esc(text)}</option>`;
        }).join('')}
      </select>`,
      chosen && `${chosen.hint}\n${chosen.examples.map(e => `${e.system}: ${e.example}`).join('\n')}`);
  }

  if (slot.kind === 'flag') {
    const on = !!step[slot.key];
    return cell(slot.label, `
      <div class="chk-row${on ? ' on' : ''}" style="padding:3px 0"
           onclick="uiEffSlot('${effectId}',${index},'${slot.key}',${!on})">
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
        <select onchange="uiEffSlot('${effectId}',${index},'roll.die',this.value)">
          ${dice.length
            ? dice.map(([name, c]) => `<option value="${name}"${(roll.die || {}).constant === name ? ' selected' : ''}>${esc(c.label)} (${dieWord(c)})</option>`).join('')
            : '<option>— в системе нет констант-костей —</option>'}
        </select>`)}
      ${refCell(effectId, effect, step, index, { key: 'roll.bonus', label: 'Бонус броска' }, roll.bonus)}
      ${cell('Мишень модификаторов', `
        <select onchange="uiEffSlot('${effectId}',${index},'roll.check',this.value)">
          <option value="">— без мишени —</option>
          ${rolls.map(r => `<option value="${r.tag}"${roll.check === r.tag ? ' selected' : ''}>${esc(r.label)}</option>`).join('')}
        </select>`)}
    </div></div>`;
  }

  // 'ref' и 'tag' — ссылка: выпадашка допустимых значений вместо свободного текста.
  return refCell(effectId, effect, step, index, slot, step[slot.key]);
}

const dieWord = c => (c.dice || []).map(d => `${d.count || 1}к${d.sides}${d.name ? ` «${d.name}»` : ''}`).join(' + ');

// ── ссылки: выпадашка допустимых значений ────────────────────────────────────

const encodeRef = ref => {
  if (ref === null || ref === undefined) return '';
  if (typeof ref !== 'object') return 'const';
  for (const form of ['param', 'ref', 'prop', 'item', 'tag']) {
    if (form in ref) return `${form}:${ref[form]}`;
  }
  if ('expr' in ref) return 'expr';
  return 'const';
};

function refOptions(effect, index, slot) {
  const options = [];
  for (const p of effect.params || []) {
    options.push([`param:${p.key}`, `параметр · ${p.label || p.key}`]);
  }
  for (const prior of (effect.steps || []).slice(0, index)) {
    const mod = registry.get(prior.type);
    if (!prior.id || !mod) continue;
    for (const out of mod.outputs || []) {
      options.push([`ref:${prior.id}${out.path}`, `шаг «${prior.id}» · ${out.label}`]);
    }
  }
  // Свойства записи-источника. Объявляет их РОД, и рода теперь бывают
  // не только предметные: у атакующего заклинания тоже есть кость урона.
  for (const decl of Object.values(state.system.records || {})) {
    for (const p of decl.props || []) {
      const code = `prop:${p.key}`;
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

function refCell(effectId, effect, step, index, slot, ref) {
  const code = encodeRef(ref);
  const options = refOptions(effect, index, slot);
  const known = options.some(([v]) => v === code);

  const editor =
    code === 'const' ? `<input value="${esc(ref && typeof ref === 'object' ? ref.const ?? '' : ref ?? '')}"
        placeholder="число" oninput="uiEffSlotConst('${effectId}',${index},'${slot.key}',this.value)">`
      : code === 'expr' ? `<input value="${esc((ref || {}).expr || '')}" placeholder="#тег + 2"
        oninput="uiEffSlotExpr('${effectId}',${index},'${slot.key}',this.value)">`
        : '';

  return cell(slot.label, `
    <select onchange="uiEffSlotRef('${effectId}',${index},'${slot.key}',this.value)">
      ${known ? '' : `<option selected value="${esc(code)}">${esc(describeStale(code))}</option>`}
      ${options.map(([v, l]) => `<option value="${v}"${v === code ? ' selected' : ''}>${esc(l)}</option>`).join('')}
    </select>${editor}`);
}

// Ссылка, которой в списке допустимых больше нет: шаг приехал из чужой системы,
// поле удалили, род не объявили. Показать её машинным кодом («prop:damage_dice»)
// — значит заставить человека расшифровывать; поэтому пишем словами, ЧТО именно
// пропало. Значение при этом не затирается: приговор скажет, а решает человек.
function describeStale(code) {
  const at = code.indexOf(':');
  const form = at > 0 ? code.slice(0, at) : code;
  const name = at > 0 ? code.slice(at + 1) : '';
  const words = {
    prop: `свойство записи «${name}» — не объявлено ни одним родом`,
    item: `свойство записи «${name}» — не объявлено ни одним родом`,
    param: `параметр «${name}» — эффект его не объявляет`,
    ref: `результат шага «${name}» — такого шага выше нет`,
    tag: `поле цели «${name}» — система его не объявляет`,
  };
  return words[form] || code;
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
// Форма записи в компендиуме перестроится сама — она выводится отсюда.

const PARAM_KINDS = [
  ['expr', 'формула'], ['tag', 'тег поля'], ['dice', 'кости'],
  ['number', 'число'], ['choice', 'выбор источника'], ['effect', 'эффект-состояние'],
];

function paramEditor(effectId, effect) {
  const params = effect.params || [];
  return `${params.map(p => `
      <div class="rl-param">
        <input id="param-${effectId}-${p.key}" value="${esc(p.label || '')}"
               placeholder="лейбл параметра" oninput="uiEffParamSet('${effectId}','${p.key}','label',this.value)">
        <select onchange="uiEffParamSet('${effectId}','${p.key}','kind',this.value)">
          ${PARAM_KINDS.map(([v, l]) => `<option value="${v}"${(p.kind || 'expr') === v ? ' selected' : ''}>${l}</option>`).join('')}
        </select>
        <span class="chk-row${p.of === 'target' ? ' on' : ''}" style="padding:0" title="выражение считает ЦЕЛЬ своим листом"
              onclick="uiEffParamSet('${effectId}','${p.key}','of',${p.of === 'target' ? 'false' : 'true'})">
          <span class="chk-box">✓</span><span style="font-size:10px;color:var(--muted)">цель</span>
        </span>
        <button class="rl-del" onclick="uiEffParamDel('${effectId}','${p.key}')">✕</button>
      </div>`).join('')}
    <button class="add-row" onclick="uiEffParamAdd('${effectId}')">+ параметр</button>`;
}

// ── правки ───────────────────────────────────────────────────────────────────

const plain = v => (v && typeof v === 'object' ? ('const' in v ? v.const : null) : v);

export function pickEffect(id) {
  state.activeRuleId = id;
}

// Id эффекта — как тег поля: генерируется при создании, дальше неизменен.
// Записи компендиума и правила комнаты ссылаются на id, переименование
// лейбла не ломает ни одной ссылки.
export function addEffect(activation = 'manual') {
  const effects = state.system.effects || (state.system.effects = {});
  const id = newEffectId('eff');
  const decl = ACTIVATIONS[activation] || ACTIVATIONS.manual;

  effects[id] = decl.payload === 'steps'
    ? {
      label: `Новый ${decl.label.toLowerCase()}`, icon: decl.icon, category: '',
      activation, params: [], steps: [],
      ...(activation === 'triggered'
        ? { duration: { kind: 'permanent' }, trigger: { on: '', when: 'resolved', condition: null }, args: {} }
        : {}),
    }
    : {
      label: `Новый ${decl.label.toLowerCase()}`, icon: decl.icon, category: '',
      activation, duration: { kind: 'temporary' }, stacking: 'refresh',
      modifiers: [defaultModifier(state.system)],
    };

  state.activeRuleId = id;
  return id;
}

export function renameEffect(id, label) {
  const effect = (state.system.effects || {})[id];
  if (effect) effect.label = label;
}

export function deleteEffect(id) {
  delete (state.system.effects || {})[id];
  // Правила комнаты — ссылки; удалённый эффект уносит и включение.
  state.system.room_rules = (state.system.room_rules || []).filter(x => x !== id);
  if (state.activeRuleId === id) {
    state.activeRuleId = Object.keys(state.system.effects || {})[0] || null;
  }
}

// Смена рода меняет НАГРУЗКУ: у конвейерных — шаги, у пассивного —
// модификаторы. Чужую нагрузку не выбрасываем: вернул род обратно —
// вернулась и она. Приговор при этом честно скажет, чего не хватает.
export function setActivation(id, activation) {
  const effect = (state.system.effects || {})[id];
  if (!effect || !ACTIVATIONS[activation]) return;
  effect.activation = activation;

  if (ACTIVATIONS[activation].payload === 'steps') {
    effect.params = effect.params || [];
    effect.steps = effect.steps || [];
    if (activation === 'triggered') {
      effect.trigger = effect.trigger || { on: '', when: 'resolved', condition: null };
      effect.args = effect.args || {};
      effect.duration = effect.duration || { kind: 'permanent' };
    } else {
      delete effect.trigger;
    }
  } else {
    effect.modifiers = effect.modifiers || [defaultModifier(state.system)];
    effect.duration = effect.duration || { kind: 'temporary' };
  }
}

export function setEffect(id, prop, raw) {
  const effect = (state.system.effects || {})[id];
  if (!effect) return;

  if (prop === 'duration') { effect.duration = { ...(effect.duration || {}), kind: raw }; return; }
  if (prop === 'uses') {
    const n = Math.max(1, Math.floor(Number(raw) || 1));
    effect.duration = { kind: 'uses', max: n };
    return;
  }
  if (prop === 'cost') {
    if (raw) effect.cost = raw; else delete effect.cost;
    return;
  }
  effect[prop] = raw;
}

export function setTrigger(id, prop, raw) {
  const effect = (state.system.effects || {})[id];
  if (!effect) return;
  const trigger = effect.trigger || (effect.trigger = { on: '', when: 'resolved', condition: null });
  if (prop === 'condition') { trigger.condition = raw ? decodeRef(raw) : null; return; }
  trigger[prop] = raw;
}

export function setArg(id, key, raw) {
  const effect = (state.system.effects || {})[id];
  if (!effect) return;
  const args = effect.args || (effect.args = {});
  if (String(raw).trim()) args[key] = raw; else delete args[key];
}

export function addParam(effectId) {
  const effect = (state.system.effects || {})[effectId];
  const params = effect.params || (effect.params = []);
  let n = params.length + 1;
  while (params.some(p => p.key === `p_${n}`)) n++;
  const key = `p_${n}`;
  params.push({ key, label: '', kind: 'expr' });
  return key;
}

export function deleteParam(effectId, key) {
  const effect = (state.system.effects || {})[effectId];
  effect.params = (effect.params || []).filter(p => p.key !== key);
  if (effect.args) delete effect.args[key];
}

export function setParam(effectId, key, prop, value) {
  const param = ((state.system.effects || {})[effectId].params || []).find(p => p.key === key);
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

export function addStep(effectId, type) {
  const effect = (state.system.effects || {})[effectId];
  const mod = registry.get(type);
  if (!effect || !mod || !isPipeline(effect)) return;
  const step = { id: freeStepId(effect), type };
  // Заготовка слотов: выборы — первым значением, остальное автор дособерёт.
  for (const slot of mod.slots) {
    if (slot.kind === 'choice') step[slot.key] = (slot.options || Object.keys(slot.choices || {}))[0];
    if (slot.kind === 'roll') {
      const die = Object.keys(state.system.constants || {})[0];
      step.roll = { die: { constant: die }, bonus: { const: 0 }, check: null };
    }
  }
  (effect.steps || (effect.steps = [])).push(step);
}

function freeStepId(effect) {
  const steps = effect.steps || [];
  let n = steps.length + 1;
  while (steps.some(s => s.id === `step_${n}`)) n++;
  return `step_${n}`;
}

export function deleteStep(effectId, index) {
  (state.system.effects || {})[effectId].steps.splice(index, 1);
}

// Слоты-выборы, флаги и составной бросок. Путь вида «roll.check» — вглубь.
export function setSlot(effectId, index, key, value) {
  const step = (state.system.effects || {})[effectId].steps[index];
  if (key === 'roll.die') { step.roll = { ...(step.roll || {}), die: { constant: value } }; return; }
  if (key === 'roll.check') { step.roll = { ...(step.roll || {}), check: value || null }; return; }
  if (value === 'true' || value === true) value = true;
  else if (value === 'false' || value === false) value = false;
  step[key] = value;
}

// Ссылка выбрана из выпадашки допустимых значений: форма и адрес одним кодом.
export function setSlotRef(effectId, index, key, code) {
  writeRef(effectId, index, key, decodeRef(code));
}

export function setSlotConst(effectId, index, key, raw) {
  const n = Number(raw);
  writeRef(effectId, index, key, { const: Number.isNaN(n) ? String(raw) : n });
}

export function setSlotExpr(effectId, index, key, text) {
  writeRef(effectId, index, key, { expr: String(text) });
}

function decodeRef(code) {
  if (!code) return undefined;
  if (code === 'const') return { const: 0 };
  if (code === 'expr') return { expr: '' };
  const at = code.indexOf(':');
  return { [code.slice(0, at)]: code.slice(at + 1) };
}

function writeRef(effectId, index, key, ref) {
  const step = (state.system.effects || {})[effectId].steps[index];
  if (key.startsWith('roll.')) {
    step.roll = { ...(step.roll || {}), [key.slice(5)]: ref };
    return;
  }
  if (ref === undefined) delete step[key];
  else step[key] = ref;
}
