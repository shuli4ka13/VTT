// Состояние интерфейса. Всё в памяти — сохранение вне скоупа PoC.
//
// Образцовые данные копируются, чтобы правки мышкой не портили модули модели.
// Система здесь МУТИРУЕТСЯ: правка формулы и добавление поля — это правка данных
// системы, и в том, что движок при этом не трогается, весь смысл (критерий №3).

import { system as sampleSystem } from '../model/system.js';
import { arven, mirra } from '../model/sheets.js';
import { compendium as sampleCompendium } from '../model/compendium.js';
import { calc, newPass } from '../engine/calc.js';
import { resolveRoll } from '../engine/modifiers.js';

export const state = {
  tab: 'char',
  system: structuredClone(sampleSystem),
  compendium: structuredClone(sampleCompendium),
  sheets: [structuredClone(arven), structuredClone(mirra)],
  activeSheetId: arven.id,
  activeTag: null,      // поле, открытое в панели формул
  draft: null,          // черновик формулы (в тегах, не в лейблах)
  activeItemId: null,
  activeEffectId: null,
  brokenModifiers: null,
  caret: null,
  editCaret: null,
  suggestIndex: 0,
  suggestDismissed: false,
  log: [],
};

export const sheet = () => state.sheets.find(s => s.id === state.activeSheetId);
export const field = tag => state.system.fields.find(f => f.tag === tag);

// Один проход на одну перерисовку: мемоизация внутри, между перерисовками — нет.
//
// Интерфейс обязан пережить любое промежуточное состояние правки: недописанное
// условие, мишень на только что удалённое поле. Поэтому и сборка модификаторов,
// и каждое вычисление обёрнуты — ошибка показывается в ячейке, а не роняет экран.
export function pass() {
  try {
    return newPass(state.system, sheet(), { compendium: state.compendium });
  } catch (err) {
    state.brokenModifiers = err.message;
    return newPass(state.system, sheet());
  }
}

export function rollOf(tag, p = pass()) {
  try {
    return resolveRoll(state.system, sheet(), tag, p);
  } catch (err) {
    return { tag, mode: 'normal', methods: [], sources: [], error: err.message };
  }
}

// Значение поля или причина, по которой его не удалось посчитать.
// Интерфейс обязан переживать битую формулу: её как раз сейчас и правят.
export function valueOf(tag, p = pass()) {
  try {
    return { ok: true, value: calc(state.system, sheet(), tag, p) };
  } catch (err) {
    return { ok: false, error: err.message };
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

export function log(html) {
  state.log.unshift(html);
  state.log.length = Math.min(state.log.length, 30);
}

export const esc = s => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
