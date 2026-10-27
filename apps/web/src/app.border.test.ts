// @vitest-environment node
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
  'constructor/effects/effects-tab.tsx',
  'constructor/effects/effect-editor.tsx',
  'constructor/effects/launch-card.tsx',
  'constructor/effects/chain.tsx',
  'constructor/effects/params-editor.tsx',
  'constructor/effects/cards/group-card.tsx',
  'constructor/effects/cards/check-body.tsx',
  'constructor/effects/cards/change-body.tsx',
  'constructor/effects/cards/send-body.tsx',
  'constructor/effects/cards/number-body.tsx',
  'constructor/effects/cards/condition-fold.tsx',
  'constructor/records-tab.tsx',
  'constructor/step-card.tsx',
  'constructor/slots.tsx',

  'constructor/rules/rules-tab.tsx',
  'constructor/rules/dice-section.tsx',
  'constructor/rules/roll-edits-section.tsx',
  'constructor/rules/rolls-section.tsx',
  'constructor/rules/tables-section.tsx',
];

const PLAY_SCREENS = ['screens/play/sheet.tsx', 'screens/play/table.tsx', 'screens/play/lobby.tsx'];

const AUTHOR_MARKERS = ['не хватило — действие не состоится', 'Библиотека эффектов', 'Висит на владельце', 'Готовое из образцов'];
const PLAY_MARKERS = ['Кто действует?', 'За столом', 'Создать стол'];

const sourceOf = (dirs: string[]): string =>
  dirs.flatMap(dir => [...walk(join(src, dir))])
    .filter(file => !/\.test\.tsx?$/.test(file))
    .map(file => readFileSync(file, 'utf8')).join('\n');

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
      expect(/editColumn|editRules|withColumn/.test(code), `${screen}: состав полей неприкосновенен`)
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

    for (const screen of PLAY_SCREENS) {
      expect(read(screen).includes("store/world.ts"), `${screen} обязан читать комнату`).toBe(false);
    }
  });

  it('компендиум не заводит новых тегов — только заполняет объявленное', () => {
    const compendium = read('screens/compendium/compendium.tsx');
    expect(compendium.includes('editSystem'), 'компендиум систему не правит').toBe(false);

    expect(compendium.includes('step-card.tsx'), 'шагов в компендиуме нет').toBe(false);
  });

  it('общий каталог листа ничего не знает ни про сторы, ни про сокет', () => {
    const files = [...walk(join(src, 'sheet'))];
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const code = readFileSync(file, 'utf8');
      for (const forbidden of ['store/', 'api/socket', 'useWorld', 'useRoom', 'tableSocket']) {
        expect(code.includes(forbidden), `${file} знает «${forbidden}»`).toBe(false);
      }
    }
  });

  it('негативный контроль: проверка ловит нарушение, а не совпадение', () => {

    const fake = "import { SheetTab } from '../constructor/sheet-tab.tsx';";
    expect(fake.includes('/sheet-tab.tsx')).toBe(true);
  });
});

describe('вид отделён от логики', () => {
  it('инлайновых стилей почти нет — вид живёт в CSS', () => {

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

      if (file.endsWith('.test.ts') || file.endsWith('.test.tsx')) continue;
      expect(banned.test(readFileSync(file, 'utf8')), file).toBe(false);
    }
  });

  it('экраны не знают ни одного имени стата', () => {

    const stats = /\b(str_mod|dex_mod|hp_max|hp_current|ac_base|prof_bonus|attack_bonus)\b|['"/](hp|health|хит|мана|stamina)[|'"/]/i;
    for (const file of walk(join(src, 'screens'))) {
      if (file.endsWith('.test.ts') || file.endsWith('.test.tsx')) continue;
      const code = readFileSync(file, 'utf8');

      const withoutHints = code.replace(/placeholder="[^"]*"/g, '');
      expect(stats.test(withoutHints), `${file} называет конкретный стат`).toBe(false);
    }
  });
});

describe('граница держится СБОРКОЙ, а не только импортами', () => {
  it('маркеры живые: каждый встречается в исходниках своей стороны', () => {
    const author = sourceOf(['screens/constructor', 'screens/compendium']);
    const play = sourceOf(['screens/play']);
    for (const trace of AUTHOR_MARKERS) expect(author.includes(trace), `маркер автора «${trace}» мёртв`).toBe(true);
    for (const trace of PLAY_MARKERS) expect(play.includes(trace), `маркер партии «${trace}» мёртв`).toBe(true);
  });


  const dist = join(src, '..', 'dist');

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

    for (const trace of AUTHOR_MARKERS) {
      expect(play.includes(trace), `в сборку партии просочилось «${trace}»`).toBe(false);
    }
  });

  it('автору не уезжает стол — граница двусторонняя', () => {
    const author = bundleOf('apps/author.tsx');
    if (!author) return;
    for (const trace of PLAY_MARKERS) {
      expect(author.includes(trace), `в сборку автора просочилось «${trace}»`).toBe(false);
    }
  });
});

describe('формулу правят одним полем', () => {
  it('редактор формул напрямую берут только поле и строка формул — остальные зовут FormulaField', () => {
    const allowed = new Set(['ui/formula-chips.tsx', 'ui/formula-field.tsx', 'ui/formula-bar.tsx']);
    const direct = [...walk(src)]
      .map(path => path.slice(src.length))
      .filter(path => !/\.test\.tsx?$/.test(path) && !allowed.has(path))
      .filter(path => /from '[^']*formula-chips\.tsx'/.test(read(path)) && /\bFormulaChips\b/.test(read(path)));
    expect(direct, direct.join('\n')).toEqual([]);
  });
});
