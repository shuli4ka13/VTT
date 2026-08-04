import { group, test, eq, ok } from './harness.js';
import { state } from '../src/ui/state.js';
import { ensureTokens, addToken, moveToken, BOARD } from '../src/ui/mode-table.js';

// Стол — VTT-слой поверх той же машины. Токен — фишка: позиция плюс ССЫЛКА
// на чарник; не персонаж. Один чарник → несколько фишек (омоним «токен»
// из CLAUDE.md). Чарник про фишки не знает ничего: DTO не трогается,
// round-trip тест остаётся зелёным.

group('стол: токены', () => {
  test('каждый лист получает фишку; повторный вызов дублей не плодит', () => {
    state.board.tokens = [];
    ensureTokens();
    eq(state.board.tokens.length, state.sheets.length);
    ensureTokens();
    eq(state.board.tokens.length, state.sheets.length, 'идемпотентно');
  });

  test('один чарник — несколько фишек, все ссылаются на один лист', () => {
    ensureTokens();
    const was = state.board.tokens.length;
    const twin = addToken('arven');
    eq(state.board.tokens.length, was + 1);
    const mine = state.board.tokens.filter(t => t.sheetId === 'arven');
    eq(mine.length, 2, 'двойник — та же Арвен');
    ok(mine[0].id !== mine[1].id, 'но фишки разные');
    ok(mine[0].x !== mine[1].x || mine[0].y !== mine[1].y, 'и стоят в разных клетках');
    state.board.tokens = state.board.tokens.filter(t => t.id !== twin.id);
  });

  test('фишка удалённого листа исчезает при следующей сверке', () => {
    state.sheets.push({ id: 'призрак', systemId: state.system.id, kind: 'npc', name: 'Призрак', values: {}, equipped: [], effects: [], actions: [] });
    ensureTokens();
    ok(state.board.tokens.some(t => t.sheetId === 'призрак'));
    state.sheets = state.sheets.filter(s => s.id !== 'призрак');
    ensureTokens();
    ok(!state.board.tokens.some(t => t.sheetId === 'призрак'), 'фишка не пережила свой чарник');
  });

  test('перенос фишки прищёлкивается к клетке и не выходит за поле', () => {
    ensureTokens();
    const token = state.board.tokens[0];
    moveToken(token.id, 3, 2);
    eq(token.x, 3); eq(token.y, 2);
    moveToken(token.id, -5, 99);
    eq(token.x, 0, 'левее поля нельзя');
    eq(token.y, BOARD.rows - 1, 'ниже поля нельзя');
  });

  test('фишки живут в state, а не в чарнике: DTO цел', () => {
    ensureTokens();
    for (const sheet of state.sheets) {
      ok(!('tokens' in sheet), 'токен ссылается на чарник, не наоборот');
    }
  });
});
