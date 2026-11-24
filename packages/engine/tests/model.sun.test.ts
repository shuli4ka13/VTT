import { describe, expect, it } from 'vitest';
import { rollMeddle, seamsOf, standsOf, sunOf } from '../src/model/sun.ts';
import { SAMPLE_SYSTEMS } from '../src/model/systems.ts';
import { inTongue } from '../src/words/tongue.ts';
import type { Effect, System } from '../src/model/types.ts';

const dnd = SAMPLE_SYSTEMS[0] as System;

const withEffect = (id: string, effect: Record<string, unknown>): System => {
  const copy = structuredClone(dnd);
  copy.effects[id] = effect as Effect;
  return copy;
};

const rayAt = (system: System, id: string, step: number): string =>
  sunOf(system, id)!.rays.find(ray => ray.span?.part === 'steps' && ray.span.from <= step && step <= ray.span.to)!.key;

const BROSOK = dnd.effects.strike!.steps!.findIndex(step => step.id === 'brosok');

describe('пузыри: счётчик у броска', () => {
  it('бросок атаки D&D правят 13 источников, вмешаются четыре подписки «кости выпали»', () => {
    const meddle = rollMeddle(dnd, 'attack_roll', { part: 'steps', index: 0 })!;
    expect([...meddle.sources].sort()).toEqual([
      'baned', 'blessed', 'blurred', 'dodging', 'exhaustion_rule', 'frightened', 'helped', 'helpless', 'hidden', 'lit', 'poisoned', 'prone', 'reckless',
    ]);
    expect(meddle.asks.map(ask => ask.effect).sort()).toEqual(['bardic_ready', 'inspire', 'lucky_point', 'precision_attack']);
    expect(meddle.sure).toEqual(['ataka']);
    expect(meddle.open).toBe(false);
  });

  it('у шага-вызова счётчик берётся из броска внутри вызванного — одинаково у обеих атак', () => {
    for (const id of ['strike', 'spell_strike']) {
      const at = dnd.effects[id]!.steps!.findIndex(step => step.id === 'brosok');
      const meddle = rollMeddle(dnd, id, { part: 'steps', index: at })!;
      expect(meddle.sources).toHaveLength(13);
      expect(meddle.asks).toHaveLength(4);
    }
  });

  it('метка, которой может не быть, оставляет все три правки «Лежит»; записанная текстом — снимает правку «не вплотную»', () => {
    const loose = rollMeddle(dnd, 'attack_roll', { part: 'steps', index: 0 })!.edits.filter(edit => edit.source === 'prone');
    expect(loose).toHaveLength(3);
    expect(loose.map(edit => edit.needs.includes('vplotnuyu')).sort()).toEqual([false, false, true]);
    expect(loose.map(edit => edit.side).sort()).toEqual(['against', 'against', 'roller']);
    const close = withEffect('t_udar', { label: 'Удар вплотную', steps: [{ id: 'b', type: 'roll', die: 'lead_die', tags: ['ataka', 'vplotnuyu'] }] });
    const tight = rollMeddle(close, 't_udar', { part: 'steps', index: 0 })!.edits.filter(edit => edit.source === 'prone');
    expect(tight).toHaveLength(2);
    expect(tight.every(edit => edit.needs.length === 0)).toBe(true);
  });

  it('подписка «кости выпали», которой нужна другая метка, не считается', () => {
    const meddle = rollMeddle(dnd, 'attack_roll', { part: 'steps', index: 0 })!;
    expect(meddle.asks.map(ask => ask.effect)).not.toContain('savage_attacker');
    expect(meddle.asks.map(ask => ask.effect)).not.toContain('guided');
  });

  it('у вызова «Урон» считаются правки его величины', () => {
    const at = dnd.effects.strike!.steps!.findIndex(step => step.type === 'emit' && step.effect === 'damage');
    const meddle = rollMeddle(dnd, 'strike', { part: 'steps', index: at })!;
    expect(meddle.call).toBe('damage');
    expect(meddle.sources).toContain('shield_up');
    expect(meddle.asks).toEqual([]);
  });
});

describe('пузыри: привязки', () => {
  it('Щит встаёт после шага, который даёт «попал», — в обеих атаках, по метке', () => {
    for (const id of ['strike', 'spell_strike']) {
      const at = dnd.effects[id]!.steps!.findIndex(step => step.id === 'brosok');
      const seam = seamsOf(dnd, id).find(one => one.by === 'shield')!;
      expect(seam.found).toBe(true);
      expect(seam.side).toBe('after');
      expect(seam.via).toBe('tag');
      expect(seam.ray).toBe(rayAt(dnd, id, at));
    }
  });

  it('новый висящий эффект на метку появляется в обеих атаках без правки атак', () => {
    const system = withEffect('t_strazh', { label: 'Страж', activation: 'passive', on: [{ on: 'before:ataka', if: { expr: '@cel == @holder' }, steps: [] }] });
    for (const id of ['strike', 'spell_strike']) {
      const seam = seamsOf(system, id).find(one => one.by === 't_strazh')!;
      expect(seam.found).toBe(true);
      expect(seam.ray).toBe(rayAt(system, id, system.effects[id]!.steps!.findIndex(step => step.type === 'each')));
    }
    expect(standsOf(system, 't_strazh').map(stand => stand.effect).sort()).toEqual(['spell_strike', 'strike']);
  });

  it('запасное место: «до» без чтения исхода — перед лучом броска, «после» и «завершено» — на замыкающем луче', () => {
    const system = withEffect('t_tri', {
      label: 'Три подписки', activation: 'passive',
      on: [
        { on: 'before:ataka', if: { expr: '@holder.hp_current > 0' }, steps: [] },
        { on: 'after:ataka', steps: [] },
        { on: 'done:ataka', if: { expr: '@popal' }, steps: [] },
      ],
    });
    const [before, after, done] = seamsOf(system, 'strike').filter(one => one.by === 't_tri');
    expect(before).toMatchObject({ found: false, side: 'before', ray: rayAt(system, 'strike', BROSOK) });
    expect(after).toMatchObject({ found: false, side: 'after', ray: 'after' });
    expect(done).toMatchObject({ found: false, side: 'after', ray: 'after' });
    const sun = sunOf(system, 'strike')!;
    expect(sun.rays.at(-1)).toMatchObject({ key: 'after', span: null });
    expect(sunOf(dnd, 'strike')!.rays.some(ray => ray.key === 'after')).toBe(false);
  });

  it('подписка по имени эффекта читает его шаг напрямую и встаёт после этого шага', () => {
    const system = withEffect('t_dobavka', { label: 'Добавка', activation: 'passive', on: [{ on: 'after:strike', if: { expr: '@uron.total > 5' }, steps: [] }] });
    const seam = seamsOf(system, 'strike').find(one => one.by === 't_dobavka')!;
    expect(seam.via).toBe('id');
    expect(seam.found).toBe(true);
    expect(seam.ray).toBe(rayAt(system, 'strike', system.effects.strike!.steps!.findIndex(step => step.id === 'uron')));
  });

  it('у каждой подписки одного эффекта своя привязка', () => {
    const own = seamsOf(dnd, 'strike').filter(one => one.by === 'sneak_attack');
    expect(own.map(one => one.handler)).toEqual([0, 1]);
  });
});

describe('пузыри: лучи', () => {
  it('Атака: плата первой, цикл помечает повтор, мягкий «Стоп» складывается в луч-вопрос, вызов броска — стадия «бросок»', () => {
    const sun = sunOf(dnd, 'strike')!;
    expect(sun.launch).toBe('manual');
    expect(sun.rays[0]).toMatchObject({ stage: 'cost', kind: 'cost', number: 1 });
    expect(sun.rays.map(ray => ray.number)).toEqual(sun.rays.map((_, index) => index + 1));
    const each = sun.rays.find(ray => ray.stage === 'target')!;
    expect(each.repeat).toBe(false);
    expect(sun.rays.filter(ray => ray.number > each.number).every(ray => ray.repeat)).toBe(true);
    expect(sun.rays.find(ray => ray.kind === 'ask' && ray.span!.to > ray.span!.from)).toMatchObject({ label: 'цель за полным укрытием' });
    const roll = sun.rays.find(ray => ray.key === rayAt(dnd, 'strike', BROSOK))!;
    expect(roll.stage).toBe('roll');
    expect(roll.bubbles.map(bubble => bubble.role)).toEqual(expect.arrayContaining(['reads', 'calls', 'meddle', 'gives', 'seam']));
    expect(roll.bubbles.find(bubble => bubble.role === 'meddle')!.label).toBe('13 · 4');
    const hit = sun.rays.find(ray => ray.label === 'попал?')!;
    expect(sun.rays.filter(ray => ray.under === hit.key).length).toBeGreaterThan(1);
  });

  it('Урон: что меняет — пузыри полей, что читает — входы и итоги', () => {
    const sun = sunOf(dnd, 'damage')!;
    const sets = sun.rays.flatMap(ray => ray.bubbles.filter(bubble => bubble.role === 'sets' && bubble.kind === 'field').map(bubble => bubble.ref!.field));
    expect(sets).toEqual(['hp_temp', 'hp_current']);
    expect(sun.rays[0]!.bubbles.find(bubble => bubble.kind === 'input')!.ref).toEqual({ param: 'amount' });
  });

  it('Щит: у каждой подписки — «когда» с местами привязки, «только если», «решает», плата и шаги', () => {
    const sun = sunOf(dnd, 'shield')!;
    expect(sun.launch).toBe('auto');
    const first = sun.rays.filter(ray => ray.group === 0);
    expect(first.map(ray => ray.stage)).toEqual(['when', 'onlyIf', 'decides', 'cost', 'does']);
    expect(first[0]!.kind).toBe('heard');
    expect(first[0]!.bubbles.map(bubble => bubble.stand!.effect).sort()).toEqual(['spell_strike', 'strike']);
    expect(first[4]!.bubbles.find(bubble => bubble.kind === 'state')!.ref).toEqual({ effect: 'shield_up' });
    expect(sun.stands.filter(stand => stand.handler === 1).map(stand => stand.effect)).toEqual(['spell_auto']);
  });

  it('слова стадий переводятся', () => {
    const sun = inTongue('en', () => sunOf(dnd, 'strike')!);
    expect(sun.rays[0]!.label).toBe('cost');
  });
});

describe('пузыри: края расчёта', () => {
  const blades = (SAMPLE_SYSTEMS as System[]).find(system => system.effects.zero_rating_rule)!;

  it('метка, которую бросок получает от правки на лету, открывает дорогу следующим правкам', () => {
    const system = structuredClone(blades);
    system.effects.t_delo = { label: 'Дело', steps: [{ id: 'b', type: 'roll', die: Object.keys(system.constants ?? {})[0] ?? 'd6', tags: ['deystvie'] }] } as Effect;
    const meddle = rollMeddle(system, 't_delo', { part: 'steps', index: 0 })!;
    expect(meddle.tags).toContain('nulevoy');
    expect(meddle.edits.filter(edit => edit.source === 'zero_rating_rule').length).toBe(blades.effects.zero_rating_rule!.modifiers!.length);
  });

  it('вложенные «Если» с «Иначе»: каждый шаг, кроме «Конца», лежит ровно в одном луче, вложенность названа', () => {
    const steps = [
      { type: 'branch', if: { expr: '@deystvuyuschiy.hp_current > 0' } },
      { type: 'apply', target: { expr: '@deystvuyuschiy.hp_temp' }, value: { expr: '1' } },
      { type: 'apply', target: { expr: '@deystvuyuschiy.hp_temp' }, value: { expr: '2' } },
      { type: 'orElse' },
      { type: 'branch', if: { expr: '@deystvuyuschiy.hp_temp > 0' } },
      { type: 'stop', note: { expr: '"хватит"' } },
      { type: 'end' },
      { type: 'end' },
      { type: 'apply', target: { expr: '@deystvuyuschiy.hp_temp' }, value: { expr: '3' } },
    ];
    const system = withEffect('t_vetki', { label: 'Ветки', params: [{ key: 'deystvuyuschiy', label: 'Кто действует', kind: 'sheet' }], steps });
    const sun = sunOf(system, 't_vetki')!;
    const covered = steps.map((_, index) => sun.rays.filter(ray => ray.span!.from <= index && index <= ray.span!.to).length);
    expect(covered).toEqual([1, 1, 1, 1, 1, 1, 1, 0, 1]);
    const open = sun.rays[0]!;
    const other = sun.rays.find(ray => ray.span!.from === 3)!;
    expect(sun.rays.filter(ray => ray.under === open.key).map(ray => ray.span!.from)).toEqual([1, 2, 3]);
    expect(sun.rays.find(ray => ray.span!.from === 4)).toMatchObject({ under: other.key, kind: 'stop', label: 'хватит' });
    expect(sun.rays.at(-1)).toMatchObject({ under: null, stage: 'then' });
  });

  it('незакрытый блок и лишний «Конец» не вешают расчёт и не теряют шаги', () => {
    const apply = { type: 'apply', target: { expr: '@deystvuyuschiy.hp_temp' }, value: { expr: '1' } };
    const params = [{ key: 'deystvuyuschiy', label: 'Кто действует', kind: 'sheet' }];
    const open = sunOf(withEffect('t_bez', { label: 'Без конца', params, steps: [{ type: 'branch', if: { expr: '1 > 0' } }, apply, apply] }), 't_bez')!;
    expect(open.rays).toHaveLength(3);
    const extra = sunOf(withEffect('t_lishniy', { label: 'Лишний', params, steps: [{ type: 'end' }, apply] }), 't_lishniy')!;
    expect(extra.rays.map(ray => ray.span!.from)).toEqual([1]);
  });

  it('подписка на любое действие встаёт привязкой, а в «встаёт в» не разворачивается', () => {
    const system = withEffect('t_vsegda', { label: 'Всегда', activation: 'passive', on: [{ on: 'after:*', steps: [] }] });
    expect(seamsOf(system, 'strike').find(seam => seam.by === 't_vsegda')).toMatchObject({ via: 'any', ray: 'after', found: false });
    expect(standsOf(system, 't_vsegda')).toEqual([]);
  });

  it('метка-формула, которую не развернуть, не роняет счётчик и помечает его открытым', () => {
    const system = withEffect('t_otkryt', {
      label: 'Открытая метка', params: [{ key: 'kto', label: 'Кто', kind: 'sheet' }],
      steps: [{ id: 'b', type: 'roll', die: 'lead_die', tags: [{ expr: '@kto.hp_current' }] }],
    });
    const meddle = rollMeddle(system, 't_otkryt', { part: 'steps', index: 0 })!;
    expect(meddle.open).toBe(true);
    expect(meddle.sources).toContain('prone');
  });

  it('бросок, до которого два пути вызовов, считается один раз и не теряется', () => {
    const system = structuredClone(dnd);
    const call = (effect: string): Record<string, unknown> => ({ type: 'emit', effect, args: {} });
    system.effects.t_d = { label: 'Г', steps: [{ id: 'b', type: 'roll', die: 'lead_die', tags: ['ataka'] }] } as Effect;
    system.effects.t_b = { label: 'Б', steps: [call('t_d')] } as Effect;
    system.effects.t_c = { label: 'В', steps: [call('t_d')] } as Effect;
    system.effects.t_a = { label: 'А', steps: [call('t_b'), call('t_c')] } as Effect;
    expect(rollMeddle(system, 't_a', { part: 'steps', index: 0 })!.sources).toHaveLength(13);
    expect(rollMeddle(system, 't_a', { part: 'steps', index: 1 })!.sources).toHaveLength(13);
  });

  it('у эффекта кнопкой с правками «пока висит» и своей подпиской лучи есть и от шагов, и от подписки', () => {
    const system = withEffect('t_oba', {
      label: 'Оба', steps: [{ id: 'b', type: 'roll', die: 'lead_die' }],
      modifiers: [{ kind: 'edit', call: 'roll', param: 'edits', edit: 'advantage', tags: ['ataka'] }],
      on: [{ on: 'after:uron', steps: [] }],
    });
    const stages = sunOf(system, 't_oba')!.rays.map(ray => ray.stage);
    expect(stages).toEqual(['roll', 'when', 'while']);
  });
});

describe('пузыри: любой эффект любого образца читается', () => {
  for (const system of SAMPLE_SYSTEMS as System[]) {
    it(`${String((system as { label?: string }).label ?? Object.keys(system.effects).length)}: расчёт не падает, места существуют, привязка и «встаёт в» зеркальны`, () => {
      const before = JSON.stringify(system);
      for (const [id, effect] of Object.entries(system.effects)) {
        const sun = sunOf(system, id)!;
        expect(sun).not.toBeNull();
        const keys = new Set(sun.rays.map(ray => ray.key));
        expect(keys.size).toBe(sun.rays.length);
        for (const ray of sun.rays) {
          expect(ray.label.length).toBeGreaterThan(0);
          if (ray.under) expect(keys.has(ray.under)).toBe(true);
          if (!ray.span) continue;
          expect(ray.span.from).toBeGreaterThanOrEqual(0);
          expect(ray.span.to).toBeGreaterThanOrEqual(ray.span.from);
          if (ray.span.part === 'steps') expect(ray.span.to).toBeLessThan((effect.steps ?? []).length);
        }
        (effect.steps ?? []).forEach((step, index) => {
          const hits = sun.rays.filter(ray => ray.span?.part === 'steps' && ray.span.from <= index && index <= ray.span.to).length;
          expect([id, index, hits]).toEqual([id, index, step.type === 'end' && hits === 0 ? 0 : 1]);
        });
        for (const seam of sun.seams) {
          expect(seam.ray === null || keys.has(seam.ray)).toBe(true);
          if (seam.via === 'any') continue;
          expect(standsOf(system, seam.by).some(stand => stand.effect === id && stand.handler === seam.handler)).toBe(true);
        }
        for (const stand of sun.stands) {
          expect(seamsOf(system, stand.effect).some(seam => seam.by === id && seam.handler === stand.handler)).toBe(true);
        }
      }
      expect(JSON.stringify(system)).toBe(before);
      const one = Object.keys(system.effects)[0]!;
      expect(sunOf(system, one)).toEqual(sunOf(system, one));
    });
  }
});
