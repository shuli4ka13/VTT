// @vitest-environment jsdom
import { english, englishLeft } from '../../testing/english.tsx';
import { leftIo } from '../../i18n/left/io.tools.ts';

english('13th Age', 'constructor');
english('Blades in the Dark', 'constructor');
english('D&D 5e', 'constructor', 0, 2);
english('D&D 5e', 'constructor', 1, 2);
english('Daggerheart', 'constructor');
english('Киберпанк RED', 'constructor');
for (const part of [0, 1, 2, 3]) english('Shadowrun: Шестой мир', 'constructor', part, 4);
englishLeft('constructor', leftIo('constructor'));
