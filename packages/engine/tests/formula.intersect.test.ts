import { describe, it, expect } from 'vitest';
import { compile } from '../src/formula/index.ts';

const run = (source: string, names: Record<string, unknown>) => compile(source).evaluate(name => names[name] ?? null, {});

describe('«пересекаются»: есть ли общие элементы у двух списков', () => {
  it('метки проверки и запрещённые метки качеств', () => {
    expect(run('пересекаются(@метки, @запреты)', { метки: ['проверка', 'charisma', 'убеждение'], запреты: ['charisma'] })).toBe(true);
    expect(run('пересекаются(@метки, @запреты)', { метки: ['проверка', 'logic'], запреты: ['charisma'] })).toBe(false);
  });

  it('пустое и одиночное значение — как список из нуля и одного', () => {
    expect(run('пересекаются(@метки, @запреты)', { метки: ['атака'], запреты: null })).toBe(false);
    expect(run('пересекаются(@метки, "атака")', { метки: ['атака'] })).toBe(true);
  });
});
