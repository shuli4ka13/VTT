import { group, test, eq, ok } from './harness.ts';
import { send } from '../src/events/envelope.ts';
import { deliver, deliverMany } from '../src/events/exchange.ts';
import { system, arven, mirra, compendium } from './fixtures.ts';
import type { Sheet } from '../src/model/types.ts';

const queue = (...values: number[]) => {
  const rest = [...values];
  return () => {
    if (!rest.length) throw new Error('кубик бросили больше раз, чем ожидал тест');
    return rest.shift()!;
  };
};

const clone = (sheet: Sheet, id: string): Sheet => ({ ...sheet, id, name: id });

group('один конверт на несколько целей', () => {
  const targets = [clone(mirra, 'цель-1'), clone(mirra, 'цель-2'), clone(mirra, 'цель-3')];

  test('число бросается один раз на действие, а порог — по каждой цели', () => {
    const die = queue(15, 6);
    const envelope = send('longsword-item:0', { system, compendium, die, sheet: arven, against: targets[0]! });

    const out = deliverMany({
      system, compendium, die: queue(), sheets: [arven, ...targets],
      envelope, fromId: arven.id, toIds: targets.map(t => t.id),
    });

    eq(out.reports.length, 3, 'по отчёту на цель');
    const hits = out.sheets.filter(s => s.id.startsWith('цель')).map(s => Number(s.values.hp_current));
    eq(new Set(hits).size, 1, 'урон одинаковый — кости брошены один раз');
    ok(hits[0]! < Number(mirra.values.hp_current), `хиты не изменились: ${hits.join(',')}`);
  });

  test('одна цель в списке — то же самое, что прежний одиночный путь', () => {
    const envelope = send('longsword-item:0', { system, compendium, die: queue(15, 6), sheet: arven, against: mirra });
    const single = deliver({ system, compendium, die: queue(), sheets: [arven, mirra], envelope, fromId: arven.id, toId: mirra.id });
    const many = deliverMany({ system, compendium, die: queue(), sheets: [arven, mirra], envelope, fromId: arven.id, toIds: [mirra.id] });
    eq(JSON.stringify(many.sheets), JSON.stringify(single.sheets));
    eq(JSON.stringify(many.reports), JSON.stringify(single.reports));
  });

  test('цели, которой нет в комнате, хватает внятной ошибки', () => {
    const envelope = send('longsword-item:0', { system, compendium, die: queue(15, 6), sheet: arven, against: mirra });
    let caught: unknown;
    try {
      deliverMany({ system, compendium, die: queue(), sheets: [arven, mirra], envelope, fromId: arven.id, toIds: [mirra.id, 'нет-такой'] });
    } catch (err) { caught = err; }
    ok(String(caught).includes('нет-такой'), String(caught));
  });
});
