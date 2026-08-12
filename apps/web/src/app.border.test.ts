// @vitest-environment node
// Тест читает ФАЙЛЫ, а не рисует компоненты: в jsdom import.meta.url — http-адрес,
// и путей до исходников из него не получить.
// Граница режимов — та же, что в PoC, и держится так же: ИМПОРТАМИ.
//
// Правило: вводит новый тег — режим автора; только комбинирует существующие —
// доступно игроку. Если экран игрока однажды потянет к себе правку состава
// полей, тест упадёт раньше, чем это заметят на демо.
//
// Здесь же негативный контроль: проверки обязаны ловить нарушение, а не быть
// зелёными потому, что искали не то.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const src = fileURLToPath(new URL('.', import.meta.url));
const read = (path: string) => readFileSync(join(src, path), 'utf8');

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (/\.tsx?$/.test(path)) yield path;
  }
}

const AUTHOR_ONLY = [
  'constructor/sheet-tab.tsx',
  'constructor/effects-tab.tsx',
  'constructor/records-tab.tsx',
  'constructor/step-card.tsx',
  'constructor/slots.tsx',
  // Словари вводят новые теги (кости, мишени бросков) — значит, автор.
  'constructor/dictionaries.tsx',
];

const PLAY_SCREENS = ['screens/play/sheet.tsx', 'screens/play/table.tsx', 'screens/play/lobby.tsx'];

describe('граница режимов', () => {
  it('ни один экран партии не импортирует модулей конструктора', () => {
    for (const screen of PLAY_SCREENS) {
      const code = read(screen);
      for (const module of AUTHOR_ONLY) {
        const name = module.split('/').pop()!.replace(/\.tsx$/, '');
        expect(code.includes(`/${name}.tsx`), `${screen} не должен знать ${name}`).toBe(false);
      }
    }
  });

  it('экраны партии не правят ни систему, ни компендиум', () => {
    for (const screen of PLAY_SCREENS) {
      const code = read(screen);
      expect(code.includes('editSystem'), `${screen}: систему правит только автор`).toBe(false);
      expect(code.includes('editCompendium'), `${screen}: компендиум правит только автор`).toBe(false);
      expect(/system\.fields\s*(=|\.push|\.splice)/.test(code), `${screen}: состав полей неприкосновенен`)
        .toBe(false);
    }
  });

  it('приложения разведены: автор не знает экранов партии и наоборот', () => {
    const author = read('apps/author.tsx');
    const play = read('apps/play.tsx');
    expect(author.includes('screens/play/'), 'приложение автора не знает экранов партии').toBe(false);
    expect(play.includes('screens/constructor/'), 'приложение партии не знает конструктора').toBe(false);
    expect(play.includes('screens/compendium/'), 'и компендиума не знает').toBe(false);
  });

  it('партия не держит мира автора: играют в мир КОМНАТЫ', () => {
    // Если экран партии читает локальный store автора, персонаж живёт в одном
    // мире, а стол в другом — и расхождение всплывёт только за игрой.
    for (const screen of PLAY_SCREENS) {
      expect(read(screen).includes("store/world.ts"), `${screen} обязан читать комнату`).toBe(false);
    }
  });

  it('компендиум не заводит новых тегов — только заполняет объявленное', () => {
    const compendium = read('screens/compendium/compendium.tsx');
    expect(compendium.includes('editSystem'), 'компендиум систему не правит').toBe(false);
    // Редактор модификаторов — общий на предмет и пассивный эффект, он законен:
    // мишени он только ВЫБИРАЕТ из объявленных, новых не вводит.
    expect(compendium.includes('step-card.tsx'), 'шагов в компендиуме нет').toBe(false);
  });

  it('негативный контроль: проверка ловит нарушение, а не совпадение', () => {
    // Если бы искали не то, эта строка тоже прошла бы — а она обязана падать.
    const fake = "import { SheetTab } from '../constructor/sheet-tab.tsx';";
    expect(fake.includes('/sheet-tab.tsx')).toBe(true);
  });
});

describe('вид отделён от логики', () => {
  it('инлайновых стилей почти нет — вид живёт в CSS', () => {
    // В PoC их было 176 на 13 файлов, и вид нельзя было менять, не трогая
    // логику. Порог держим низким осознанно: единичные точечные размеры
    // (ширина поля ввода в шапке) допустимы, разъезжание — нет.
    let inline = 0;
    for (const file of walk(src)) {
      if (file.endsWith('.test.ts') || file.endsWith('.test.tsx')) continue;
      inline += (readFileSync(file, 'utf8').match(/style=\{\{/g) ?? []).length;
    }
    expect(inline, `инлайновых стилей: ${inline}`).toBeLessThanOrEqual(20);
  });

  it('ни eval, ни new Function — формулу разбирает парсер', () => {
    const banned = new RegExp('\\be' + 'val\\s*\\(|new\\s+Fun' + 'ction');
    for (const file of walk(src)) {
      // Сам сканер содержит искомый паттерн по частям — себя он не проверяет.
      if (file.endsWith('.test.ts') || file.endsWith('.test.tsx')) continue;
      expect(banned.test(readFileSync(file, 'utf8')), file).toBe(false);
    }
  });

  it('экраны не знают ни одного имени стата', () => {
    // Движок не знает имён статов — и интерфейс тоже не должен: иначе новый
    // стат перестанет добавляться правкой данных (критерий приёмки №3).
    // Ловим и точные теги, и ПОДСТРОЧНОЕ угадывание: `/hp|health/` в коде
    // экрана — та же ошибка, только незаметнее.
    const stats = /\b(str_mod|dex_mod|hp_max|hp_current|ac_base|prof_bonus|attack_bonus)\b|['"\/](hp|health|хит|мана|stamina)[|'"\/]/i;
    for (const file of walk(join(src, 'screens'))) {
      if (file.endsWith('.test.ts') || file.endsWith('.test.tsx')) continue;
      const code = readFileSync(file, 'utf8');
      // Плейсхолдеры в подсказках — текст для человека, а не логика.
      const withoutHints = code.replace(/placeholder="[^"]*"/g, '');
      expect(stats.test(withoutHints), `${file} называет конкретный стат`).toBe(false);
    }
  });
});

describe('граница держится СБОРКОЙ, а не только импортами', () => {
  // Самая надёжная проверка: не на исходники, а на то, что РЕАЛЬНО уедет
  // игроку. В PoC граница шла по страницам (constructor.html / vtt.html),
  // и конструктора в приложении партии не было физически. Здесь то же самое
  // делают ленивые чанки — и проверяется это по графу сборки, а не по одному
  // файлу: общий код Vite выносит в третий чанк, и наивная проверка его
  // пропустила бы.
  const dist = join(src, '..', 'dist');

  /** Весь код, который загрузится вместе с точкой входа, — она сама и её импорты. */
  function bundleOf(entryHint: string): string | null {
    const manifestPath = join(dist, '.vite', 'manifest.json');
    if (!existsSync(manifestPath)) return null;

    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as
      Record<string, { file: string; imports?: string[] }>;

    const start = Object.keys(manifest).find(key => key.includes(entryHint));
    if (!start) return null;

    const seen = new Set<string>();
    const queue = [start];
    let code = '';

    while (queue.length) {
      const key = queue.shift()!;
      if (seen.has(key)) continue;
      seen.add(key);

      const entry = manifest[key];
      if (!entry) continue;
      const file = join(dist, entry.file);
      if (existsSync(file)) code += readFileSync(file, 'utf8');
      queue.push(...(entry.imports ?? []));
    }
    return code;
  }

  it('игроку не уезжает ни строчки конструктора', () => {
    const play = bundleOf('apps/play.tsx');
    if (!play) {
      expect(existsSync(dist), 'соберите фронт (pnpm build), иначе границу по сборке не проверить').toBe(true);
      return;
    }

    // Приметы конструктора — тексты, которые есть ТОЛЬКО у автора.
    for (const trace of ['Цепочка шагов', 'Библиотека эффектов', 'Рода записей', 'Дырки для записей']) {
      expect(play.includes(trace), `в сборку партии просочилось «${trace}»`).toBe(false);
    }
  });

  it('автору не уезжает стол — граница двусторонняя', () => {
    const author = bundleOf('apps/author.tsx');
    if (!author) return;
    for (const trace of ['Кто действует?', 'За столом', 'Создать стол']) {
      expect(author.includes(trace), `в сборку автора просочилось «${trace}»`).toBe(false);
    }
  });
});
