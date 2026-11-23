export const NAMES = {
  holder: 'holder',
  row: 'row',
  item: 'item',
  desk: 'desk',
  combat: 'combat',
  rolled: 'rolled',
  roll: 'roll',
  number: 'number',
  threshold: 'threshold',
  success: 'success',
  margin: 'margin',
  roller: 'roller',
  against: 'against',
  mover: 'mover',
  sheet: 'sheet',
  results: 'results',
  tags: 'tags',
  left: 'left',
  effect: 'effect',
  throughArmor: 'through_armor',
  yes: 'yes',
  no: 'no',
} as const;

export type ServiceName = keyof typeof NAMES;

export const NAME_LABELS: Record<ServiceName, string> = {
  holder: 'носитель',
  row: 'строка',
  item: 'вещь',
  desk: 'стол',
  combat: 'бой',
  rolled: 'выпало',
  roll: 'бросок',
  number: 'число',
  threshold: 'порог',
  success: 'успех',
  margin: 'степени',
  roller: 'бросающий',
  against: 'против',
  mover: 'ходит',
  sheet: 'лист',
  results: 'итоги',
  tags: 'метки',
  left: 'осталось',
  effect: 'эффект',
  throughArmor: 'сквозь броню',
  yes: 'да',
  no: 'нет',
};

const BY_NAME = new Map<string, ServiceName>((Object.keys(NAMES) as ServiceName[]).map(id => [NAMES[id], id]));

export const nameLabel = (name: string): string | undefined => {
  const id = BY_NAME.get(name);
  return id ? NAME_LABELS[id] : undefined;
};

export const saidName = (name: string): string => {
  const dot = name.indexOf('.');
  const head = dot < 0 ? name : name.slice(0, dot);
  const label = nameLabel(head);
  return label ? `${label}${dot < 0 ? '' : name.slice(dot)}` : name;
};
