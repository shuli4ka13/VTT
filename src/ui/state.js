// Состояние интерфейса. Всё в памяти — сохранение вне скоупа PoC.
//
// Три режима, и это не косметика:
//
//   author     правит СИСТЕМУ — состав полей, лейблы, формулы, правила комнаты.
//              Персонаж не нужен и не выбран: значений на экране нет вовсе.
//   player     правит ЧАРНИК — значения, снаряжение, эффекты, список действий.
//              Состав полей не трогает: кнопок для этого нет в разметке.
//   compendium правит ЗАПИСИ — предметы, эффекты, действия, заклинания.
//
// Граница проходит по тегам: вводит НОВЫЙ ТЕГ — режим автора; только
// комбинирует существующие — можно и из режима игрока.
//
// Образцовые данные копируются, чтобы правки мышкой не портили модули модели.

import { system as sampleSystem } from '../model/system.js';
import { arven, mirra } from '../model/sheets.js';
import { compendium as sampleCompendium } from '../model/compendium.js';
import { calc, newPass } from '../engine/calc.js';
import { resolveRoll } from '../engine/modifiers.js';

export const MODES = {
  author: { label: 'Конструктор листа', badge: 'режим автора' },
  player: { label: 'Персонаж', badge: 'режим игрока' },
  compendium: { label: 'Компендиум', badge: 'общая библиотека' },
  table: { label: 'Стол', badge: 'VTT · фишки' },
};

export const state = {
  mode: 'player',

  system: structuredClone(sampleSystem),
  compendium: structuredClone(sampleCompendium),
  sheets: [structuredClone(arven), structuredClone(mirra)],

  // В режиме автора персонаж не выбран вовсе — конструктор обязан работать без него.
  activeSheetId: arven.id,

  activeTag: null,       // поле, открытое в конструкторе
  authorView: 'sheet',   // сцена режима автора: 'sheet' (поля) | 'rules' (механики)
  activeRuleId: null,    // правило, открытое в конструкторе правил

  // Слот формулы, который сейчас правят. Редактор формул один на всю программу,
  // и активен всегда ровно один слот — тот, где стоит каретка.
  formula: { key: null, draft: '', at: 0, index: 0, dismissed: true },
  caret: null,           // { key, at } — куда вернуть каретку после перерисовки

  activeRecordId: null,  // запись компендиума
  brokenModifiers: null,
  log: [],

  // Стол. ТОКЕН здесь — фишка: позиция + ссылка на чарник, НЕ персонаж
  // (омоним «токен», см. CLAUDE.md). Один чарник → сколько угодно фишек.
  // Чарник про фишки не знает: board живёт в состоянии интерфейса.
  board: { tokens: [] },
  table: { selected: null, action: null },  // выбранная фишка и взведённое действие
};

export const sheet = () => state.sheets.find(s => s.id === state.activeSheetId) || null;
export const field = tag => state.system.fields.find(f => f.tag === tag) || null;

// Один проход на одну перерисовку: мемоизация внутри, между перерисовками — нет.
// Без выбранного персонажа прохода нет — и это нормально: в конструкторе
// считать нечего и не по чему.
export function pass() {
  const current = sheet();
  if (!current) return null;
  try {
    return newPass(state.system, current, { compendium: state.compendium });
  } catch (err) {
    state.brokenModifiers = err.message;
    return newPass(state.system, current);
  }
}

// Значение поля или причина, по которой его не удалось посчитать.
// Интерфейс обязан переживать любое промежуточное состояние правки:
// недописанную формулу, условие на полуслове, мишень на удалённое поле.
export function valueOf(tag, p = pass()) {
  if (!p) return { ok: false, error: 'персонаж не выбран' };
  try {
    return { ok: true, value: calc(state.system, p.sheet, tag, p) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export function rollOf(tag, p = pass()) {
  if (!p) return { tag, mode: 'normal', methods: [], sources: [] };
  try {
    return resolveRoll(state.system, p.sheet, tag, p);
  } catch (err) {
    return { tag, mode: 'normal', methods: [], sources: [], error: err.message };
  }
}

export const show = value =>
  typeof value === 'boolean' ? (value ? 'да' : 'нет')
    : typeof value === 'number' ? (Number.isInteger(value) ? String(value) : value.toFixed(2))
      : String(value);

// Машинный тег. Генерируется при создании поля и дальше неизменен.
// Пользователь его не вводит и в норме не видит.
let counter = 0;
export function newTag(prefix = 'fld') {
  let tag;
  do { tag = `${prefix}_${++counter}`; } while (field(tag));
  return tag;
}

// Идентификатор записи компендиума. Это НЕ тег: на него не ссылаются формулы,
// он лишь адрес записи в библиотеке. Потому его и волен завести игрок.
export function newRecordId(prefix) {
  const taken = new Set([
    ...state.compendium.items.map(r => r.id),
    ...state.compendium.effects.map(r => r.id),
    ...state.compendium.actions.map(r => r.id),
  ]);
  let n = 1;
  while (taken.has(`${prefix}_${n}`)) n++;
  return `${prefix}_${n}`;
}

export function log(html) {
  state.log.unshift(html);
  state.log.length = Math.min(state.log.length, 30);
}

export const esc = s => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
