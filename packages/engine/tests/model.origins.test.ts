import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { originsOf } from '../src/model/origins.ts';

const dnd = JSON.parse(readFileSync(new URL('../../../samples/dnd5e.world.json', import.meta.url), 'utf8'));
const param = (effect: string, key: string) => dnd.system.effects[effect].params.find((p: { key: string }) => p.key === key);
const texts = (effect: string, key: string) => originsOf(dnd.system, dnd.compendium, effect, param(effect, key)).map(o => o.text);

describe('откуда приходит вход эффекта', () => {
  it('«Атака»: кто действует — кнопка оружия, кость урона — клетка записи', () => {
    expect(texts('strike', 'действующий')).toContain('«Удар» у «Оружие»: кто нажал');
    expect(texts('strike', 'damage_dice')).toContain('клетка «Оружие · Кость урона»');
    expect(texts('strike', 'attack_with')).toContain('«Удар» у «Оружие»: считается само');
  });
  it('«Урон»: лист — сам (текущая цель), тип урона — сам из «Атака»', () => {
    expect(texts('damage', 'лист')).toContain('сам: текущая цель');
    expect(texts('damage', 'damage_type')).toContain('сам из «Атака»');
    expect(texts('damage', 'amount')).toContain('из «Атака»');
  });
});
