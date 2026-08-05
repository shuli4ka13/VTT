// Права — список СПОСОБНОСТЕЙ, роль — только пресет набора. UI из прав
// выводится, но проверяет их СЕРВЕР на каждом действии: скрытые кнопки — UX,
// а не безопасность (docs/production-split-plan.md, раздел «Права»).
//
// Суффикс :own / :any — чьими вещами можно распоряжаться. «any» покрывает
// «own»: ГМ может всё, что может игрок, плюс чужое.

export const ROLES = {
  author: ['world.publish', 'room.create', 'room.join', 'sheet.edit:any', 'envelope.send:any'],
  gm: ['room.create', 'room.join', 'sheet.edit:any', 'envelope.send:any'],
  player: ['room.join', 'sheet.edit:own', 'envelope.send:own'],
};

export function can(permissions, wanted) {
  if (permissions.includes(wanted)) return true;
  const [name, scope] = wanted.split(':');
  return scope === 'own' && permissions.includes(`${name}:any`);
}
