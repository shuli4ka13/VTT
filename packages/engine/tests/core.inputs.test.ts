import { group, test, throws, eq } from './harness.ts';
import { exchange } from './play.ts';
import { PLAYABLE_WORLDS } from '../src/model/systems.ts';

const world: any = PLAYABLE_WORLDS.find((one: any) => one.system.id === 'dnd5e')!;
const hit = (inputs: Record<string, number | string>) => exchange({
  system: world.system, compendium: world.compendium, die: () => 10, sheets: world.sheets,
  actionId: 'longsword:0', fromId: 'arven', toIds: ['goblin'], inputs,
} as never);

group('ответы со стола — только на заданные вопросы', () => {
  test('подменить цену атаки ответом нельзя', () => {
    throws(() => hit({ цена: 'cost_reaction' }), 'лишнее значение «цена»');
  });

  test('подменить урон во вложенном вызове нельзя', () => {
    throws(() => hit({ amount: 0 }), 'лишнее значение «amount»');
  });

  test('вопрос платы «каким кругом» принимается', () => {
    const r = exchange({
      system: world.system, compendium: world.compendium, die: () => 10, sheets: world.sheets,
      actionId: 'guiding_bolt:0', fromId: 'mirra', toIds: ['goblin'], inputs: { slot: 2 },
    } as never);
    eq(r.log.some((line: string) => line.includes('2-й круг')), true);
  });
});

group('плата из входа проверяется до игры', () => {
  test('плата «действие и ячейка» ждёт «Круг» у записи — без свойства ошибка словами', async () => {
    const { lintSystem, errorsOf } = await import('../src/model/lint.ts');
    const system = structuredClone(world.system);
    eq(errorsOf(lintSystem(system, world.compendium)).some((p: any) => p.text.includes('ждёт свойство')), false);
    system.tables.spell_attack.columns = system.tables.spell_attack.columns.filter((c: any) => c.key !== 'spell_level');
    const texts = errorsOf(lintSystem(system, world.compendium)).map((p: any) => p.text);
    eq(texts.some((t: string) => t.includes('плата «Стоимость: действие и ячейка» ждёт свойство «Круг заклинания»')), true);
  });
});
