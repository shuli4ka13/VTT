import { group, test, eq, throws } from './harness.ts';
import { PLAYABLE_WORLDS } from '../src/model/systems.ts';
import { exchange } from './play.ts';
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
  const rolled = out.reports.flatMap(entry => entry.report.trace).find(t => (t as { step?: string; within?: string }).step === 'brosok' && (t as { within?: string }).within === 'attack_roll') as { bonus: number };
  return rolled.bonus;
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
      { id: 'hit_brosok', type: 'roll', die: 'lead_die', bonus: { expr: '@wield.attack' }, tags: ['ataka'], by: { expr: '@deystvuyuschiy' } },
    ]);
    throws(() => firstBonus(system));
  });
});

group('D&D: критическое попадание — всегда попадание', () => {
  test('Улучшенный критический: 19 на кости против КБ 40 — крит и попадание, а не «крит, но промах»', () => {
    const system = JSON.parse(JSON.stringify(dnd.system)) as System;
    (system.effects.attack_roll!.steps![1] as { versus: unknown }).versus = { expr: '40' };
    const sheets = (JSON.parse(JSON.stringify(dnd.sheets)) as Sheet[]).map(sheet => (sheet.id === 'arven' ? { ...sheet, values: { ...sheet.values, crit_from: 19 } } : sheet));
    const out = exchange({ system, compendium: dnd.compendium as Compendium, die: () => 19, sheets, actionId: 'longsword:0', fromId: 'arven', toId: 'goblin' });
    const checked = out.reports.flatMap(entry => entry.report.trace).find(t => (t as { step?: string; within?: string }).step === 'proverka' && (t as { within?: string }).within === 'attack_roll') as { success: boolean };
    eq(checked.success, true);
  });
  test('итог «исход» — промах, попадание или крит; крит от порога персонажа', () => {
    const outcome = (die: number): number => {
      const system = JSON.parse(JSON.stringify(dnd.system)) as System;
      system.effects.strike!.steps!.splice(2, 0, { id: 'исход', type: 'roll', fixed: { expr: 'if(@brosok.ishod == "krit", 3, if(@brosok.ishod == "popadanie", 2, 1))' } } as never);
      eq(errorsOf(lintSystem(system)).length, 0);
      const out = exchange({ system, compendium: dnd.compendium as Compendium, die: () => die, sheets: dnd.sheets as Sheet[], actionId: 'longsword:0', fromId: 'arven', toId: 'goblin' });
      return (out.reports.flatMap(entry => entry.report.trace).find(t => (t as { step?: string }).step === 'исход') as { total: number }).total;
    };
    eq(outcome(1), 1);
    eq(outcome(12), 2);
    eq(outcome(19), 3, 'у Арвена Улучшенный критический — крит от 19');
  });
  test('колонка таблицы через итог-выбор: «попадание — исход — множитель костей» 0 / 1 / 2', () => {
    const factor = (die: number): number => {
      const system = JSON.parse(JSON.stringify(dnd.system)) as System;
      system.effects.strike!.steps!.splice(2, 0, { id: 'множитель', type: 'roll', fixed: { expr: '@brosok.ishod.dice_mul' } } as never);
      eq(errorsOf(lintSystem(system)).length, 0);
      const out = exchange({ system, compendium: dnd.compendium as Compendium, die: () => die, sheets: dnd.sheets as Sheet[], actionId: 'longsword:0', fromId: 'arven', toId: 'goblin' });
      return (out.reports.flatMap(entry => entry.report.trace).find(t => (t as { step?: string }).step === 'множитель') as { total: number }).total;
    };
    eq(factor(1), 0);
    eq(factor(12), 1);
    eq(factor(19), 2);
  });
});
