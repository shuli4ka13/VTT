// Права — список СПОСОБНОСТЕЙ. Роль никто не выбирает в выпадашке:
// она ВЫВОДИТСЯ из владения, как у Foundry и Owlbear:
//   опубликовал мир   → автор этого мира;
//   создал комнату    → её ведущий (gm);
//   вступил по ссылке → игрок.
// /me отдаёт личность; способности появляются в контексте комнаты.
// Проверяет их СЕРВЕР на каждом действии: скрытые кнопки — UX, не безопасность.
//
// Суффикс :own / :any — чьими вещами можно распоряжаться; «any» покрывает «own».

export const ROOM_ROLES = {
  gm: ['sheet.edit:any', 'envelope.send:any'],
  player: ['sheet.edit:own', 'envelope.send:own'],
};

export function can(permissions, wanted) {
  if (permissions.includes(wanted)) return true;
  const [name, scope] = wanted.split(':');
  return scope === 'own' && permissions.includes(`${name}:any`);
}
