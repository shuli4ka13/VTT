import { group, test, deepEq, ok } from './harness.ts';
import { PIECES, bringPiece, donorOf } from '../src/model/pieces.ts';
import { lintSystem, errorsOf } from '../src/model/lint.ts';
import type { System } from '../src/model/types.ts';

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
