// Журнал события — трасса правила, шаг за шагом с числами. Строку каждого
// шага пишет ЕГО модуль (traceLine в src/engine/steps/*): новый тип шага
// приносит свою подачу сам, интерфейс по типам не ветвится.
//
// Один и тот же журнал читают экран игрока и стол: «Арвен → Мирра» — это
// и есть общение чарников по правилам системы, как его ни показывай.

import { state, esc } from './state.js';
import { labelOf } from '../engine/targets.js';
import { registry } from '../engine/steps/index.js';

export function describeReport(from, to, report) {
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
