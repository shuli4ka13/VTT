import { describe, it, expect } from 'vitest';
import { SAMPLE_SYSTEMS } from '@vtt/engine/samples';
import { explainName } from './lookup.ts';
import { usageIndex } from './usage.ts';

const dnd = SAMPLE_SYSTEMS.find(s => s.id === 'dnd5e')!;
const usage = usageIndex(dnd);
const explain = (name: string, effect: string | null = null) => explainName(dnd, undefined, effect, name, usage);

describe('откуда это: щелчок по фишке объясняет имя', () => {
  it('поле листа: как получается, где видно, кто пользуется, чей лист', () => {
    const told = explain('holder.ac');
    expect(told.kind).toBe('колонка листа');
    expect(told.facts).toContainEqual(['чьё', 'лист «носитель»']);
    expect(told.shown[0]).toMatch(/^на листе, блок/);
    expect(told.users.length).toBeGreaterThan(0);
    expect(told.go?.pick).toEqual({ activeTab: 'sheet', activeFieldTag: 'ac' });
  });

  it('вход эффекта: кто и что передаёт', () => {
    const told = explain('save_by', 'cantrip_save');
    expect(told.kind).toBe('вход эффекта');
    expect(told.facts).toContainEqual(['тип', 'из таблицы']);
    expect(told.from.some(line => line.includes('свойство записи «save_by»'))).toBe(true);
  });

  it('колонка выбранной строки у листа цели', () => {
    const told = explain('цель.save_by.save', 'cantrip_save');
    expect(told.kind).toBe('колонка по выбору');
    expect(told.title).toBe('Характеристики → Спасбросок');
    expect(told.go?.pick).toEqual({ activeTab: 'dictionaries', activeTableId: 'abilities' });
  });

  it('метка броска и кость системы', () => {
    expect(explain('ataka')).toMatchObject({ kind: 'метка броска', facts: expect.arrayContaining([['Успех', 'попадание']]) });
    expect(explain('цель.lead_die')).toMatchObject({
      kind: 'кость системы', facts: expect.arrayContaining([['кто бросает', '«цель»']]),
    });
  });

  it('незнакомое имя так и называется', () => {
    expect(explain('нет_такого').kind).toBe('не найдено');
  });

  it('висящий эффект — число «сколько раз висит»', () => {
    const told = explain('цель.paralyzed');
    expect(told.kind).toBe('висит на листе');
    expect(told.facts).toContainEqual(['чьё', 'лист «цель»']);
    expect(told.go?.pick).toEqual({ activeTab: 'effects', activeEffectId: 'paralyzed' });
  });
});
