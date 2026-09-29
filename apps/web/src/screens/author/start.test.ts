import { describe, it, expect } from 'vitest';
import { copyTitle } from './start.tsx';

describe('имя копии не повторяет уже существующее', () => {
  it('первая копия — «— копия», следующие нумеруются', () => {
    expect(copyTitle('D&D 5e', [])).toBe('D&D 5e — копия');
    expect(copyTitle('D&D 5e', ['D&D 5e — копия'])).toBe('D&D 5e — копия 2');
    expect(copyTitle('D&D 5e', ['D&D 5e — копия', 'D&D 5e — копия 2'])).toBe('D&D 5e — копия 3');
  });

  it('копия копии не наращивает хвост «— копия — копия»', () => {
    expect(copyTitle('D&D 5e — копия 2', ['D&D 5e — копия', 'D&D 5e — копия 2'])).toBe('D&D 5e — копия 3');
  });
});
