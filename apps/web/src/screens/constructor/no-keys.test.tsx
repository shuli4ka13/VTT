// @vitest-environment jsdom
import { noKeys } from '../../testing/no-keys.tsx';

noKeys('13th Age');
noKeys('Blades in the Dark');
noKeys('D&D 5e', 0, 2);
noKeys('D&D 5e', 1, 2);
noKeys('Daggerheart');
noKeys('Киберпанк RED');
for (const part of [0, 1, 2, 3]) noKeys('Shadowrun: Шестой мир', part, 4);
