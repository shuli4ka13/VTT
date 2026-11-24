import { describe, expect, it } from 'vitest';
import { chainOf, mapOf, tagLinks, type ChainNode } from '../src/model/sun-map.ts';
import { SAMPLE_WORLDS } from '../src/model/systems.ts';
import type { Compendium, Effect, System } from '../src/model/types.ts';

const world = SAMPLE_WORLDS[0] as { system: System; compendium: Compendium };
const dnd = world.system;

const flat = (node: ChainNode): ChainNode[] => [node, ...node.children.flatMap(flat)];

describe('цепочка записи', () => {
  it('Волшебная стрела: кнопка, плата, урон по порядку — и Щит сбоку', () => {
    const chain = chainOf(dnd, world.compendium, 'magic_missile')!;
    expect(chain.nodes).toHaveLength(1);
    const root = chain.nodes[0]!;
    expect(root).toMatchObject({ effect: 'spell_auto', via: 'button', said: 'Сотворить' });
    expect(root.seams.map(seam => seam.by)).toContain('shield');
    expect(root.children.map(child => child.via)).toEqual(['cost', 'call']);
    const damage = root.children.find(child => child.effect === 'damage')!;
    expect(damage.meddle!.sources).toContain('shield_up');
    expect(damage.seams.map(seam => seam.by)).toContain('concentration');
  });

  it('цепочка идёт по записи, а не по всем записям того же эффекта: состояния чужих заклинаний не подмешиваются', () => {
    const fireball = chainOf(dnd, world.compendium, 'fireball')!.nodes.flatMap(flat);
    const record = world.compendium.records!.find(one => one.id === 'fireball')!;
    const own = Object.values(record.cells ?? {}).filter(value => typeof value === 'string');
    for (const node of fireball.filter(one => one.via === 'state')) expect(own).toContain(node.effect);
  });

  it('круг вызовов обрывается пометкой, а не зависает', () => {
    const system = structuredClone(dnd);
    const call = (effect: string): Record<string, unknown> => ({ type: 'emit', effect, args: {} });
    system.effects.t_a = { label: 'А', steps: [call('t_b')] } as Effect;
    system.effects.t_b = { label: 'Б', steps: [call('t_a')] } as Effect;
    system.tables!.t_knopki = { label: 'Кнопки', shape: 'book', use: 'action', columns: [], bindings: [{ label: 'Нажать', effect: 't_a' }] } as never;
    const book: Compendium = { records: [{ id: 't_zapis', label: 'Запись', table: 't_knopki', cells: {} } as never] };
    const nodes = chainOf(system, book, 't_zapis')!.nodes.flatMap(flat);
    expect(nodes.map(node => node.effect)).toEqual(['t_a', 't_b', 't_a']);
    expect(nodes[2]!.again).toBe(true);
  });

  it('у каждой записи каждого образца цепочка строится', () => {
    for (const sample of SAMPLE_WORLDS as { system: System; compendium: Compendium }[]) {
      for (const record of sample.compendium.records ?? []) expect(chainOf(sample.system, sample.compendium, record.id)).not.toBeNull();
    }
  });
});

describe('связи метки и карта', () => {
  it('метка «Атака»: носят обе атаки, на бросок ставит «Бросок атаки», слышит Щит, правят тринадцать эффектов', () => {
    const links = tagLinks(dnd, 'ataka', world.compendium);
    expect(links.carries.sort()).toEqual(['spell_strike', 'strike']);
    expect(links.marks).toEqual(['attack_roll']);
    expect(links.hears).toEqual([{ effect: 'shield', handler: 0, phase: 'before' }]);
    expect(new Set(links.edits.map(edit => edit.effect)).size).toBe(13);
    expect(links.contract!.outputs!.map(output => output.key)).toContain('popal');
  });

  it('в образце D&D подписок по имени чужого эффекта нет; добавленная — находится, чтение чужого шага — тоже', () => {
    expect(mapOf(dnd, world.compendium).leaks.filter(leak => leak.kind !== 'silent-tag')).toEqual([]);
    const system = structuredClone(dnd);
    system.effects.t_po_imeni = { label: 'По имени', activation: 'passive', on: [{ on: 'after:strike', if: { expr: '@uron.total > 5' }, steps: [] }] } as Effect;
    const leaks = mapOf(system, world.compendium).leaks.filter(leak => leak.kind !== 'silent-tag');
    expect(leaks).toEqual([
      { kind: 'by-name', effect: 't_po_imeni', handler: 0, of: 'strike' },
      { kind: 'inner', effect: 't_po_imeni', handler: 0, of: 'strike', names: ['uron'] },
    ]);
  });

  it('метка с договором, которую никто не слышит и не правит, названа', () => {
    const system = structuredClone(dnd);
    system.tags!.t_tihaya = { label: 'Тихая' };
    expect(mapOf(system).leaks).toContainEqual({ kind: 'silent-tag', tag: 't_tihaya' });
  });

  it('карта: связи ведут к существующим эффектам и меткам', () => {
    for (const sample of SAMPLE_WORLDS as { system: System; compendium: Compendium }[]) {
      const map = mapOf(sample.system, sample.compendium);
      const known = new Set([...map.effects.map(one => one.id), ...map.tags.map(one => one.id), '*']);
      for (const link of map.links) {
        expect(known.has(link.from)).toBe(true);
        if (link.kind !== 'calls' && link.kind !== 'applies') expect([link.to, known.has(link.to)]).toEqual([link.to, true]);
      }
    }
  });
});
