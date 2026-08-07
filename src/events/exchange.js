// Обмен конвертами: один ход целиком, вместе с ответками.
//
// Отправитель шлёт конверт, получатель разрешает его у себя — и, если на нём
// висят триггерные эффекты, отвечает своими конвертами в обратную сторону.
// Каждый ответ считает его получатель, то есть исходный отправитель.
//
// Модуль нужен потому, что «ход» — это не один вызов receive, а цепочка,
// и собирать её у себя не должны ни экран игрока, ни стол, ни сервер:
// иначе ответки работали бы в одном месте и молчали в двух других.
//
// Каскад ограничен глубиной 1 — этим ведает сам конверт (пометка `reply`,
// см. src/events/envelope.js). Здесь про глубину нет ни строчки.

import { send, receive } from './envelope.js';

export function exchange({ system, compendium, die, sheets, actionId, fromId, toId }) {
  const find = id => sheets.find(s => s.id === id) || null;

  const from = find(fromId);
  const to = find(toId);
  if (!from) throw new Error(`не найден отправитель «${fromId}»`);
  if (!to) throw new Error(`не найдена цель «${toId}»`);

  const ctx = { system, compendium, die };
  const envelope = send(actionId, { ...ctx, sheet: from });

  let updated = [...sheets];
  const put = sheet => { updated = updated.map(s => (s.id === sheet.id ? sheet : s)); };
  const live = id => updated.find(s => s.id === id) || null;

  const main = receive(envelope, { ...ctx, sheet: to });
  put(main.sheet);
  const reports = [{ fromId, toId, report: main.report }];

  // Ответки. Их получатель — исходный отправитель, и лист берётся ЖИВОЙ:
  // если бы цель и отправитель совпали (лечение по себе), правки основного
  // конверта иначе потерялись бы.
  for (const reply of main.replies) {
    const target = live(reply.to);
    if (!target) continue;
    const back = receive(reply, { ...ctx, sheet: target });
    put(back.sheet);
    reports.push({ fromId: reply.from, toId: reply.to, report: back.report });
  }

  return { sheets: updated, reports };
}
