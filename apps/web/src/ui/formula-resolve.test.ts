import { describe, it, expect } from 'vitest';
import { resolveNames, NO_NAME } from './formula-resolve.ts';

const KNOWN = [
  { tag: 'урон_оружия', label: 'Урон оружия' },
  { tag: 'бросок', label: 'бросок' },
  { tag: 'бросок.total', label: 'бросок → сколько вышло всего' },
  { tag: 'цель', label: 'Цель' },
  { tag: 'цели', label: 'Цели' },
  { tag: 'действующий', label: 'Кто действует' },
  { tag: 'цель.ac', label: 'Класс брони' },
  { tag: 'действующий.ac', label: 'Класс брони' },
  { tag: 'цель.hp', label: 'Хиты' },
  { tag: 'действующий.hp', label: 'Хиты' },
  { tag: 'сила', label: 'Сила' },
];
const done = (text: string) => resolveNames(text, KNOWN, { final: true });
const live = (text: string, caret = text.length) => resolveNames(text, KNOWN, { caret });

describe('узнавание имён в наборе формулы', () => {
  it('дописанное название при сохранении становится именем — и одним словом, и несколькими', () => {
    expect(done('урон оружия').text).toBe('@урон_оружия');
    expect(done('Сила + 1').text).toBe('@сила + 1');
    expect(done('кто действует').text).toBe('@действующий');
  });

  it('пока слово набирают, его не трогают; разделитель после него — узнаёт', () => {
    expect(live('сил').text).toBe('сил');
    expect(live('сила').text).toBe('сила');
    expect(live('сила ').text).toBe('сила ');
    expect(live('сила +').text).toBe('@сила +');
    expect(live('урон оружия * 2').text).toBe('@урон_оружия * 2');
  });

  it('курсор остаётся там же относительно текста', () => {
    const out = live('сила + ');
    expect(out.text).toBe('@сила + ');
    expect(out.caret).toBe(out.text.length);
  });

  it('точка после имени листа: имя узнаётся, точка остаётся — дальше откроется список его полей', () => {
    expect(live('цель.').text).toBe('@цель.');
    expect(done('цель.класс брони').text).toBe('@цель.ac');
    expect(done('цель.ac >= 10').text).toBe('@цель.ac >= 10');
    expect(done('бросок.total').text).toBe('@бросок.total');
  });

  it('название, которое есть у нескольких листов, само не подставляется', () => {
    const out = done('класс брони');
    expect(out.text).toBe('класс брони');
    expect(out.unknown.map(NO_NAME)).toEqual(['«класс брони» есть у нескольких — выберите в списке, чьё']);
  });

  it('слова формул, функции, кости, числа и текст в кавычках — не имена', () => {
    for (const text of ['если(@сила > 1, 2, 3)', 'не да и нет', 'округлить вниз(5 / 2)', '2d6 + 1', '"сила"', 'большее из(1, 2)', 'if(@сила > 1, 2, 3)', 'floor(5 / 2)']) {
      expect(done(text).text, text).toBe(text);
      expect(done(text).unknown, text).toEqual([]);
    }
    expect(done('если(сила > 1, урон оружия, 0)').text).toBe('если(@сила > 1, @урон_оружия, 0)');
  });

  it('уже узнанное не трогается: формула с «@» выходит как вошла', () => {
    for (const text of ['@сила + @цель.ac', '@цель.навыки.[@сила].итог', 'первый(@цели)', 'first(@цели)']) expect(done(text).text).toBe(text);
  });

  it('неузнанное слово называется по-человечески и с ближайшим именем', () => {
    expect(done('цел + 1').unknown.map(NO_NAME)).toEqual(['нет имени «цел» — ближайшее: «Цель»']);
    expect(done('абракадабра').unknown.map(NO_NAME)).toEqual(['нет имени «абракадабра»']);
  });

  it('недописанная формула (незакрытая кавычка) не ломает набор', () => {
    expect(live('"не закр').text).toBe('"не закр');
  });
});

import { SAMPLE_WORLDS, LITE_WORLDS } from '@vtt/engine/samples';
import { fieldsOf } from '@vtt/engine';

describe('разбор не трогает то, что не набирали', () => {
  it('каждая формула каждого образца выходит из разбора той же строкой', () => {
    const changed: string[] = [];
    let seen = 0;
    for (const world of [...SAMPLE_WORLDS, ...LITE_WORLDS]) {
      const system = world.system;
      const keys = new Set<string>();
      const collect = (value: unknown): void => {
        if (!value || typeof value !== 'object') return;
        for (const [name, inner] of Object.entries(value)) {
          if ((name === 'id' || name === 'key' || name === 'as') && typeof inner === 'string') keys.add(inner);
          collect(inner);
        }
      };
      collect(system);
      const known = [
        ...[...keys].map(tag => ({ tag, label: tag })),
        ...fieldsOf(system).map(field => ({ tag: field.tag, label: field.label })),
        ...Object.entries(system.effects ?? {}).flatMap(([, effect]) => (effect.params ?? []).map(param => ({ tag: param.key, label: param.label ?? param.key }))),
      ];
      const walk = (value: unknown): void => {
        if (!value || typeof value !== 'object') return;
        const expr = (value as { expr?: unknown }).expr;
        if (typeof expr === 'string') {
          seen += 1;
          const out = resolveNames(expr, known, { final: true }).text;
          if (out !== expr) changed.push(`${world.title}: ${expr} → ${out}`);
        }
        Object.values(value).forEach(walk);
      };
      walk(system);
      walk(world.compendium);
    }
    expect(seen).toBeGreaterThan(1000);
    expect(changed.slice(0, 10)).toEqual([]);
  }, 30000);

  it('«@подпись» при сохранении становится «@ключ», хвост пути остаётся', () => {
    const names = [{ tag: 'roll_2', label: 'Бросок атаки' }, { tag: 'dmg', label: 'Урон' }];
    expect(resolveNames('@Бросок_атаки + 1', names, { final: true }).text).toBe('@roll_2 + 1');
    expect(resolveNames('@урон', names, { final: true }).text).toBe('@dmg');
    expect(resolveNames('@бросок_атаки.total * 2', names, { final: true }).text).toBe('@roll_2.total * 2');
  });

  it('совпавший ключ не трогают, двусмысленную подпись не меняют', () => {
    const names = [{ tag: 'a', label: 'b' }, { tag: 'b', label: 'Второй' }, { tag: 'c', label: 'Дубль' }, { tag: 'd', label: 'Дубль' }];
    expect(resolveNames('@b + @дубль', names, { final: true }).text).toBe('@b + @дубль');
    expect(resolveNames('@Второй', names, { final: true }).text).toBe('@b');
  });
});
