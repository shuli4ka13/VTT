// Чарники — чистые DTO. Только сохранённые значения.
// Ни одного вычисленного числа здесь нет и появиться не может: сериализатор
// отвергает всё, что не скаляр (см. src/model/serialize.js).
//
// Оба персонажа считаются по одной и той же системе — dnd5e-slice.

export const arven = {
  id: 'arven',
  systemId: 'dnd5e-slice',
  name: 'Арвен',
  values: {
    str: 16,
    dex: 12,
    con: 14,
    int: 10,
    wis: 12,
    cha: 8,
    level: 5,
    athletics_prof: true,
    ac_base: 10,
    armor_heavy: false,
    hp_max: 44,
    hp_current: 44,
  },
  equipped: ['chain-mail'],
  effects: [],
};

export const mirra = {
  id: 'mirra',
  systemId: 'dnd5e-slice',
  name: 'Мирра',
  values: {
    str: 8,
    dex: 18,
    con: 12,
    int: 14,
    wis: 10,
    cha: 16,
    level: 3,
    athletics_prof: false,
    ac_base: 10,
    armor_heavy: false,
    hp_max: 21,
    hp_current: 21,
  },
  equipped: [],
  effects: [],
};

export const sheets = [arven, mirra];
