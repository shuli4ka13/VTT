import { group, test, deepEq, ok } from './harness.ts';
import { PIECES, bringPiece, donorOf } from '../src/model/pieces.ts';
import { lintSystem, errorsOf } from '../src/model/lint.ts';
import { calledOf, isPipeline } from '../src/engine/effects.ts';
import { availableActions } from '../src/events/envelope.ts';
import { withLibrary } from '../src/model/owned.ts';
import type { System, Sheet } from '../src/model/types.ts';

const unreachable = (system: System): string[] => {
  const reach = new Set<string>([...system.grants ?? [], ...calledOf(system).map(([key]) => key)]);
  for (const kind of Object.values(system.records ?? {})) {
    for (const b of kind.bindings ?? []) reach.add(b.effect);
    for (const id of kind.grants ?? []) reach.add(id);
  }
  for (const record of system.library ?? []) for (const b of record.bindings ?? []) reach.add(b.effect);
  for (const effect of Object.values(system.effects)) for (const id of effect.grants ?? []) reach.add(id);
  return Object.entries(system.effects).filter(([id, e]) => isPipeline(e) && !reach.has(id)).map(([id]) => id);
};

const empty = (): System => ({ id: 'новая', name: 'Новая', fields: [], effects: {} } as unknown as System);

group('куски систем: взять кусок со всем, от чего он зависит', () => {
  for (const piece of PIECES) {
    test(`«${piece.label}» в пустой системе не оставляет ошибок`, () => {
      ok(donorOf(piece), `донор «${piece.donor}» есть среди образцов`);
      const { system, added } = bringPiece(empty(), piece);
      ok(added.length > 0, 'что-то приехало');
      const errors = errorsOf(lintSystem(system));
      deepEq(errors.map(e => `${JSON.stringify(e.where)} ${e.text}`).slice(0, 3), []);
    });

    test(`«${piece.label}»: у каждой кнопки есть путь к игроку`, () => {
      deepEq(unreachable(bringPiece(empty(), piece).system), []);
    });
  }
});

group('кусок добавляется, а не заменяет', () => {
  const abilities = PIECES.find(p => p.id === 'd20-abilities')!;
  const death = PIECES.find(p => p.id === 'dnd-death')!;

  test('второй раз ничего не приезжает', () => {
    const once = bringPiece(empty(), abilities).system;
    const twice = bringPiece(once, abilities);
    deepEq(twice.added, []);
    ok(twice.kept.length > 0);
  });

  test('своё одноимённое остаётся своим — кусок его не перезаписывает', () => {
    const mine = { ...empty(), fields: [{ tag: 'str', label: 'Моя сила', value: { kind: 'stored', type: 'number', default: 3 } }] } as unknown as System;
    const out = bringPiece(mine, abilities);
    ok(out.kept.some(p => p.kind === 'field' && p.key === 'str'));
    deepEq(out.system.fields.find(f => f.tag === 'str')!.label, 'Моя сила');
  });

  test('правила куска включаются для всех листов системы', () => {
    const out = bringPiece(empty(), death).system;
    deepEq(out.grants, ['fall', 'wake', 'death_now', 'stabilize']);
  });

  test('все куски D&D вместе — система без ошибок', () => {
    const all = PIECES.filter(p => p.donor === 'dnd5e').reduce((system, piece) => bringPiece(system, piece).system, empty());
    deepEq(errorsOf(lintSystem(all)).map(e => e.text).slice(0, 3), []);
  });
});

group('кусок доводит до игры', () => {
  const take = (...ids: string[]) => ids.reduce((system, id) => bringPiece(system, PIECES.find(p => p.id === id)!).system, empty());
  const hero = (has: string[] = []) => ({ id: 'h', systemId: 'новая', name: 'Герой', values: {}, has: has.map(of => ({ of })), effects: [] } as Sheet);

  test('«Ход в бою»: рывок, уклонение, отход и помощь — кнопки у любого листа без компендиума', () => {
    const system = take('d20-abilities', 'dnd-turn');
    const labels = availableActions(hero(), { system, compendium: { records: [] } }).map(a => a.label);
    for (const label of ['Уклонение', 'Рывок', 'Отход', 'Помощь']) ok(labels.includes(label), label);
  });

  test('«Оружие D&D» приносит примеры оружия: взял меч — появилась атака', () => {
    const system = take('d20-abilities', 'hp-armor', 'dnd-damage', 'dnd-weapons');
    const compendium = withLibrary(system, { records: [] });
    ok(compendium.records!.some(r => r.id === 'longsword'));
    const labels = availableActions(hero(['longsword']), { system, compendium }).map(a => a.label);
    ok(labels.some(label => label.startsWith('Длинный меч')), labels.join(', '));
  });

  test('таблица, из которой вход эффекта берёт значения, приезжает вместе с эффектом', () => {
    const system = take('d20-abilities', 'dnd-weapons');
    const strike = system.effects.strike!;
    for (const param of strike.params ?? []) {
      if (param.kind === 'choice' && param.from) ok(system.tables?.[param.from], `таблица «${param.from}»`);
    }
  });
});

group('подписка на эффект — слабая ссылка', () => {
  const take = (...ids: string[]) => ids.reduce((system, id) => bringPiece(system, PIECES.find(p => p.id === id)!).system, empty());

  test('«Кости двойственности» слушают атаку, но не тащат её за собой', () => {
    ok(!take('dh-duality').effects.hero_attack);
  });

  test('атака, пришедшая другим куском, подхватывается подпиской сама', () => {
    const system = take('dh-duality', 'dh-weapons');
    ok(system.effects.hero_attack);
    ok((system.effects.duality!.on ?? []).some(h => h.on === 'hero_attack'));
    deepEq(errorsOf(lintSystem(system)).map(e => e.text), []);
  });
});
