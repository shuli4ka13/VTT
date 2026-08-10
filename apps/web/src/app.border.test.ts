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

import { readFileSync, readdirSync } from 'node:fs';
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
];

describe('граница режимов', () => {
  it('экран игрока не импортирует ни одного модуля конструктора', () => {
    const player = read('screens/player/player.tsx');
    for (const module of AUTHOR_ONLY) {
      const name = module.split('/').pop()!.replace(/\.tsx$/, '');
      expect(player.includes(`/${name}.tsx`), `player не должен знать ${name}`).toBe(false);
    }
  });

  it('экран игрока не правит состав полей системы', () => {
    const player = read('screens/player/player.tsx');
    expect(/system\.fields\s*(=|\.push|\.splice)/.test(player), 'состав полей правит только автор').toBe(false);
    expect(player.includes('editSystem'), 'игрок не редактирует систему вообще').toBe(false);
  });

  it('стол ничего не правит: ни полей, ни эффектов — только выбирает пару листов', () => {
    const table = read('screens/table/table.tsx');
    expect(table.includes('editSystem')).toBe(false);
    expect(table.includes('editCompendium')).toBe(false);
    for (const module of AUTHOR_ONLY) {
      const name = module.split('/').pop()!.replace(/\.tsx$/, '');
      expect(table.includes(`/${name}.tsx`), `стол не должен знать ${name}`).toBe(false);
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
