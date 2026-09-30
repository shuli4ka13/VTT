import { group, test, eq, throws } from './harness.ts';
import { PLAYABLE_WORLDS } from '../src/model/systems.ts';
import { exchange } from '../src/events/exchange.ts';
import { lintSystem, errorsOf } from '../src/model/lint.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const dnd = PLAYABLE_WORLDS.find(w => (w.system as System).id === 'dnd5e')!;

const withStrikeArgs = (args: Record<string, unknown>, strikeSteps?: unknown[]): System => {
  const system = JSON.parse(JSON.stringify(dnd.system)) as System;
  const weapon = system.tables!.weapon!;
  weapon.bindings![0]!.args = { ...weapon.bindings![0]!.args, ...args } as never;
  if (strikeSteps) system.effects.strike!.steps = strikeSteps as never;
  return system;
};

const firstBonus = (system: System): number => {
  const sheets = dnd.sheets as Sheet[];
  const out = exchange({
    system, compendium: dnd.compendium as Compendium, die: () => 10, sheets,
    actionId: 'longsword:0', fromId: 'arven', toId: 'goblin',
  });
  const threshold = out.reports.flatMap(entry => entry.report.trace).find(t => (t as { type?: string }).type === 'threshold') as { bonus: number };
  return threshold.bonus;
};

group('формула входа в кнопке записи видит свойства записи', () => {
  const plain = firstBonus(dnd.system as System);

  test('@свойство.столбец — ячейка таблицы по свойству записи, как ссылка на столбец', () => {
    eq(firstBonus(withStrikeArgs({ attack_with: '@wield.attack' })), plain);
  });

  test('с ним можно считать дальше: @wield.attack + 1', () => {
    eq(firstBonus(withStrikeArgs({ attack_with: '@wield.attack + 1' })), plain + 1);
  });

  test('так же, когда конструктор сохранил набранное как формулу { expr }', () => {
    eq(firstBonus(withStrikeArgs({ attack_with: { expr: '1 + @wield.attack' } })), plain + 1);
  });

  test('проверка системы не считает такие имена висячими', () => {
    const system = withStrikeArgs({ attack_with: '@wield.attack + 1' });
    eq(errorsOf(lintSystem(system, dnd.compendium as Compendium)).map(p => p.text).join('\n'), '');
  });

  test('в шагах самого эффекта свойства записи по имени не видны — только через вход', () => {
    const system = withStrikeArgs({}, [
      { id: 'hit', type: 'threshold', roll: { die: { constant: 'lead_die' }, bonus: { expr: '@wield.attack' }, tags: ['атака'] }, versus: { expr: '@получатель.ac' } },
    ]);
    throws(() => firstBonus(system));
  });
});
