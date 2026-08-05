import { group, test, eq } from './harness.js';
import { state } from '../src/ui/state.js';
import { renameSystem } from '../src/ui/mode-author.js';

// system.name уезжает в публикацию мира на сервер (net.js), но нигде в
// конструкторе не правился — мир публиковался под именем, которое автор
// не выбирал.

group('имя системы редактируется в режиме автора', () => {
  test('renameSystem меняет system.name', () => {
    const before = state.system.name;
    renameSystem('Мой домашний хоумбрю');
    eq(state.system.name, 'Мой домашний хоумбрю');
    state.system.name = before;
  });
});
