// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SUN_KINDS } from '@vtt/engine';
import { KIND_LOOK, KIND_ORDER } from './kinds.ts';

const css = readFileSync(resolve(__dirname, '../../../../ui/tokens.css'), 'utf8');

const token = (name: string): string => {
  const found = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`).exec(css);
  if (!found) throw new Error(`нет токена ${name}`);
  return found[1]!;
};

const channel = (hex: string, at: number): number => {
  const value = parseInt(hex.slice(1 + at * 2, 3 + at * 2), 16) / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};

const luminance = (hex: string): number => 0.2126 * channel(hex, 0) + 0.7152 * channel(hex, 1) + 0.0722 * channel(hex, 2);

export const contrast = (a: string, b: string): number => {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (high + 0.05) / (low + 0.05);
};

describe('виды пузырей', () => {
  it('в словаре движка те же четырнадцать видов, что и в разметке', () => {
    expect(KIND_ORDER).toHaveLength(14);
    expect([...KIND_ORDER].sort()).toEqual(Object.keys(SUN_KINDS).sort());
    expect([...KIND_ORDER].sort()).toEqual(Object.keys(KIND_LOOK).sort());
  });

  it('значки разные: вид читается без цвета', () => {
    const icons = KIND_ORDER.map(kind => KIND_LOOK[kind].icon);
    expect(new Set(icons).size).toBe(14);
    icons.forEach(icon => expect([...icon]).toHaveLength(1));
  });

  for (const kind of KIND_ORDER) {
    it(`«${kind}»: текст на заливке не ниже 4.5:1, рамка видна на фоне не ниже 3:1`, () => {
      expect(contrast(token(`sun-${kind}-text`), token(`sun-${kind}-bg`))).toBeGreaterThanOrEqual(4.5);
      expect(contrast(token(`sun-${kind}-line`), token('bg'))).toBeGreaterThanOrEqual(3);
    });
  }

  it('расчёт контраста верен: чёрное на белом даёт 21', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
  });
});
