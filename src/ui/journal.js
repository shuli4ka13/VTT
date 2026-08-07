// Журнал события — трасса правила, шаг за шагом с числами. Строку каждого
// шага пишет ЕГО модуль (traceLine в src/engine/steps/*): новый тип шага
// приносит свою подачу сам, интерфейс по типам не ветвится.
//
// Один и тот же журнал читают экран игрока и стол: «Арвен → Мирра» — это
// и есть общение чарников по правилам системы, как его ни показывай.

import { state, esc } from './state.js';
import { labelOf } from '../engine/targets.js';
import { registry } from '../engine/steps/index.js';
import { effectLabelOf } from '../events/envelope.js';

export function describeReport(from, to, report) {
  // Ответка подписывается иначе: это не ход игрока, а сработавший триггер.
  // Читатель журнала должен видеть, что второй строкой мир ответил сам.
  const arrow = report.reply ? '⚡ →' : '→';
  const head = `<b>${esc(from.name)}</b> ${arrow} <b>${esc(to.name)}</b> · ${esc(report.label)}`;

  const helpers = {
    labelOf: tag => labelOf(state.system, tag),
    effectLabel: id => effectLabelOf(state.system, id),
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
    : '<span class="roll-success">эффект отработал до конца</span>';

  // Израсходованное срабатывание — часть события, а не отдельная новость:
  // человек должен видеть, сколько ответок у него осталось.
  const spent = (report.spent || []).map(id =>
    `<span class="roll-note">${esc(effectLabelOf(state.system, id))}: срабатывание израсходовано</span>`);

  return [head, ...lines, verdict, ...spent].join('<br>');
}
