import { group, test, eq, ok, deepEq } from './harness.ts';
import { lintSystem, lintStep, errorsOf } from '../src/model/lint.ts';
import { referencesOf, listenerOf, heardNames, holderNameOf } from '../src/model/references.ts';
import { PLAYABLE_SYSTEMS as SAMPLE_SYSTEMS, PLAYABLE_WORLDS as SAMPLE_WORLDS } from '../src/model/systems.ts';
import type { System, Effect, Step } from '../src/model/types.ts';
import { withColumn } from '../src/model/sheet-columns.ts';
import { flattenSystem } from '../src/model/inherit.ts';

const bare = (): System => ({
  id: 'x', name: 'x',
  tables: {
    лист: { shape: 'single', owner: 'sheet', columns: [{ key: 'hp', label: 'Хиты', kind: 'number', default: 10 }] },
    казна: { shape: 'single', owner: 'desk', columns: [{ key: 'страх', label: 'Страх', kind: 'number', default: 0 }] },
  },
  effects: {}, constants: { d20: { kind: 'die', dice: [{ count: 1, sides: 20 }] } },
}) as unknown as System;

const withEffect = (id: string, effect: Partial<Effect>): System => {
  const system = bare();
  system.effects[id] = { label: id, activation: 'manual', steps: [], ...effect } as Effect;
  return system;
};

const WHO = { key: 'действующий', kind: 'sheet' };
const mend = (field: string, amount = '1') => ({ type: 'apply', target: { expr: field }, direction: 'add', value: { expr: amount } }) as unknown as Step;

const texts = (system: System) => lintSystem(system).map(p => `${p.level}: ${p.text}`);
const errorTexts = (system: System) => errorsOf(lintSystem(system)).map(p => p.text);

group('линт: образцы чисты', () => {
  for (const system of SAMPLE_SYSTEMS) {
    test(`${system.name}: ноль ошибок`, () => {
      const world = SAMPLE_WORLDS.find(w => w.system === system);
      eq(errorsOf(lintSystem(system as System, world?.compendium)).map(p => p.text).join('\n'), '');
    });
  }
});

group('линт: висячие ссылки называются словами экрана', () => {
  test('поле, которого нет, — с подсказкой завести его на «Листе»', () => {
    const system = withEffect('hit', { params: [WHO] as never, steps: [mend('@действующий.нет_такого')] });
    const [problem] = errorsOf(lintSystem(system));
    ok(problem?.text.includes('«нет_такого»'), problem?.text);
    ok(problem?.text.includes('Лист'), problem?.text);
    eq(problem?.fix?.tag, 'нет_такого');
    eq(problem?.where.effect, 'hit');
    eq(problem?.where.step, 0);
  });

  test('подписка на появление эффекта, которого нет, — ошибка', () => {
    const system = withEffect('t', { activation: 'passive', on: [{ on: 'gained:нету', steps: [] }] });
    ok(errorTexts(system).some(t => t.includes('эффекта «нету» в системе нет')), errorTexts(system).join('|'));
  });

  test('подписка на вызов эффекта, которого пока нет, — предупреждение, не ошибка: сработает, когда он появится', () => {
    const system = withEffect('t', { activation: 'passive', on: [{ on: 'after:нет_эффекта', steps: [] }] });
    ok(!errorTexts(system).some(t => t.includes('нет_эффекта')), errorTexts(system).join('|'));
    ok(texts(system).some(t => t.startsWith('warn') && t.includes('«нет_эффекта — после»')), texts(system).join('|'));
  });

  test('привязка типа записи к несуществующему эффекту', () => {
    const system = bare();
    system.tables = { weapon: { shape: 'book', use: 'item', label: 'Оружие', bindings: [{ label: 'Удар', effect: 'нету', args: {} }] } } as never;
    const [problem] = errorsOf(lintSystem(system));
    ok(problem?.text.includes('эффекта «нету»'), problem?.text);
    eq(problem?.where.tab, 'records');
    eq(problem?.where.kind, 'weapon');
  });

  test('кость инициативы, таблица поля, правило для всех, правка броска', () => {
    const system = bare();
    system.initiative = { die: 'нет_кости', tags: ['нет_броска'] } as never;
    system.tables = withColumn(system, { key: 'lvl', label: 'Ур', expr: { expr: 'таблица("нет_таблицы", #hp)' } }).tables;
    system.grants = ['нет_правила'];
    system.effects.buff = { label: 'y', activation: 'passive', modifiers: [{ kind: 'edit', call: 'roll', param: 'edits', edit: 'нет_правки' }] } as never;
    const found = errorTexts(system).join('\n');
    for (const key of ['кости «нет_кости»', 'метки броска «нет_броска»', 'таблицы «нет_таблицы»', 'эффекта «нет_правила»', 'правки броска «нет_правки»']) {
      ok(found.includes(key), `нет «${key}» в:\n${found}`);
    }
  });

  test('ссылка на шаг выше по цепочке — законна, ниже — нет', () => {
    const roll = { id: 'бросок', type: 'roll', die: 'd20' } as unknown as Step;
    const okSystem = withEffect('e', { params: [WHO] as never, steps: [roll, mend('@действующий.hp', '@бросок')] });
    eq(errorTexts(okSystem).join(''), '');
    const badSystem = withEffect('e', { params: [WHO] as never, steps: [mend('@действующий.hp', '@бросок'), roll] });
    ok(errorTexts(badSystem).some(t => t.includes('«бросок» выше по цепочке нет')), errorTexts(badSystem).join('|'));
  });

  test('условие блока «Если» ссылается на шаг выше', () => {
    const system = withEffect('e', {
      params: [WHO] as never,
      steps: [{ type: 'branch', if: { expr: '@нет.success' } }, mend('@действующий.hp'), { type: 'end' }] as Step[],
    });
    ok(errorTexts(system).some(t => t.includes('«нет» выше по цепочке нет')), errorTexts(system).join('|'));
  });

  test('вход, которую эффект не объявил', () => {
    const system = withEffect('e', { params: [WHO] as never, steps: [mend('@действующий.hp', '@dmg')] });
    ok(errorTexts(system).some(t => t.includes('«dmg» — нет ни входа, ни шага с таким именем')), errorTexts(system).join('|'));
  });

  test('вход, объявленный эффектом, читается по имени', () => {
    const system = withEffect('e', { params: [WHO, { key: 'сколько', kind: 'number' }] as never, steps: [mend('@действующий.hp', '@сколько')] });
    eq(errorTexts(system).join(''), '');
  });

  test('вход, названный как вызов несуществующего листа, — «вход не объявлен»', () => {
    const system = withEffect('e', { params: [WHO] as never, steps: [{ type: 'apply', target: { expr: '@действующий.hp' }, direction: 'add', value: { expr: '@нету' } }] as never });
    ok(errorTexts(system).some(t => t.includes('«нету» — нет ни входа, ни шага')), errorTexts(system).join('|'));
  });

  test('условие срабатывания смотрит на шаг слушаемого эффекта', () => {
    const system = withEffect('strike', {
      params: [WHO] as never,
      steps: [
        { id: 'бросок', type: 'roll', die: 'd20' },
        { id: 'hit', type: 'check', value: { expr: '@бросок' }, versus: { expr: '10' } },
        { type: 'branch', if: { expr: 'не @hit.success' } }, { type: 'stop' }, { type: 'end' },
      ] as Step[],
    });
    system.effects.thorns = { label: 'Шипы', activation: 'passive', on: [{ on: 'after:strike', if: { expr: '@hit.success' }, steps: [] }] } as never;
    eq(errorTexts(system).join(''), '');
    system.effects.thorns = { label: 'Шипы', activation: 'passive', on: [{ on: 'after:strike', if: { expr: '@miss.success' }, steps: [] }] } as never;
    ok(errorTexts(system).some(t => t.includes('нет шага «miss»')), errorTexts(system).join('|'));
  });

  test('выведенные мишени правок броска (с двоеточием) — не ссылки на виды бросков', () => {
    const system = withEffect('buff', { activation: 'passive', modifiers: [{ kind: 'edit', call: 'roll', param: 'edits', edit: 'adv' }] });
    system.roll_edits = { adv: { label: 'Преимущество', ops: [] } } as never;
    eq(errorTexts(system).join(''), '');
  });

  test('в шагах вызываемого эффекта сумма читается по имени входа — не висячая ссылка', () => {
    const system = bare();
    system.effects.damage = {
      label: 'Урон', params: [{ key: 'раненый', kind: 'sheet' }, { key: 'сколько', label: 'Сколько', kind: 'number', role: 'amount' }],
      steps: [{ type: 'apply', target: { expr: '@раненый.hp' }, direction: 'subtract', value: { expr: '@сколько' } }],
    } as never;
    eq(errorTexts(system).join(''), '');
  });
});

group('линт: чьё поле', () => {
  test('голое имя поля в эффекте — ошибка с подсказкой, как написать', () => {
    const system = withEffect('a', { params: [WHO] as never, steps: [mend('@действующий.hp', '@hp')] });
    ok(errorTexts(system).some(text => text.includes('«hp» — чьё поле?') && text.includes('@носитель.hp') && text.includes('@цель.hp')), errorTexts(system).join('\n'));
  });

  test('голое имя поля в условии подписки — тоже «чьё поле?»', () => {
    const system = withEffect('a', { activation: 'passive', on: [{ on: 'moment:turn-start', if: { expr: '@hp > 1' }, steps: [] }] });
    ok(errorTexts(system).some(text => text.includes('«hp» — чьё поле?')), errorTexts(system).join('\n'));
  });

  test('имя листа в формулах листа не нужно: голое имя вне эффекта — законно', () => {
    const system = bare();
    system.tables = withColumn(system, { key: 'вдвое', label: 'Вдвое', expr: { expr: '@hp * 2' } }).tables;
    eq(errorTexts(system).join(''), '');
  });

  test('поле стола — через @стол; через лист — отказ с подсказкой', () => {
    const good = withEffect('a', { params: [WHO] as never, steps: [mend('@стол.страх')] });
    eq(errorTexts(good).join(''), '');
    const viaSheet = withEffect('a', { params: [WHO] as never, steps: [mend('@действующий.страх')] });
    ok(errorTexts(viaSheet).some(text => text.includes('лежит на столе') && text.includes('@стол.страх')), errorTexts(viaSheet).join('\n'));
    const bareDesk = withEffect('a', { params: [WHO] as never, steps: [mend('@действующий.hp', '@страх')] });
    ok(errorTexts(bareDesk).some(text => text.includes('лежит на столе') && text.includes('@стол.страх')), errorTexts(bareDesk).join('\n'));
  });

  test('поле листа через @стол — отказ: оно лежит на листе', () => {
    const system = withEffect('a', { params: [WHO] as never, steps: [mend('@стол.hp')] });
    ok(errorTexts(system).some(text => text.includes('лежит на листе, а не на столе')), errorTexts(system).join('\n'));
  });

  test('@носитель в подписке — лист, на котором она висит', () => {
    const system = withEffect('a', { activation: 'passive', on: [{ on: 'moment:turn-start', if: { expr: '@ходит == @носитель' }, steps: [mend('@носитель.hp')] }] });
    eq(errorTexts(system).join(''), '');
  });
});

group('линт: слушатели, круги, входы', () => {
  test('«когда» без «что случилось» — ошибка человеческим текстом', () => {
    const system = withEffect('t', { activation: 'passive', on: [{ on: '', steps: [] }] });
    const [problem] = errorsOf(lintSystem(system));
    ok(problem?.text.includes('не сказано, на что срабатывает'), problem?.text);
    eq(problem?.where.part, 'on');
    eq(problem?.where.handler, 0);
  });

  test('«что случилось» знает только свои слова: фазы вызова, кости, моменты, появление и поле', () => {
    const texts = (handler: Record<string, unknown>) => errorTexts(withEffect('r', { activation: 'passive', on: [{ steps: [], ...handler } as never] }));
    ok(texts({ on: 'strike' }).some(t => t.includes('такого «что случилось» нет')));
    ok(texts({ on: 'sneeze:strike' }).some(t => t.includes('такого «что случилось» нет')));
    ok(texts({ on: 'before:' }).some(t => t.includes('такого «что случилось» нет')));
    ok(texts({ on: 'moment:когда-нибудь' }).some(t => t.includes('такого момента нет')));
    ok(texts({ on: 'gained:пусто' }).some(t => t.includes('эффекта «пусто» в системе нет')));
    eq(texts({ on: 'before:strike', confirm: true }).length, 0, 'спросить перед вызовом — законно');
    eq(texts({ on: 'after:strike', confirm: true }).length, 0, 'и после — законно');
    eq(texts({ on: 'done:strike', confirm: true }).length, 0, 'и по завершении — законно');
    eq(texts({ on: 'seen', confirm: true }).length, 0, 'и «кости выпали» — законно');
    eq(texts({ on: 'before:*' }).length, 0, 'любое действие — законно');
    eq(texts({
      on: 'done:strike', if: { expr: 'сколько(@цели.hit.success, да) >= 1' },
      steps: [{ type: 'apply', target: { expr: '@носитель.hp' }, direction: 'add', value: { expr: 'сумма(@цели.dmg)' } }],
    }).length, 0, '«завершено» знает таблицу целей');
    eq(texts({ on: 'done:strike', if: { expr: 'сколько(@цели) >= 2' }, steps: [] }).length, 0, 'и голое @цели — тоже');
  });

  test('подписка видит входы того, что слушает, и переменную его цикла; чужое имя — «чьё поле?»', () => {
    const system = withEffect('удар', {
      params: [WHO, { key: 'цели', kind: 'sheet', many: true, item: { key: 'цель' } }] as never,
      steps: [{ type: 'each', of: 'цели' }, { id: 'hit', type: 'check', value: { expr: '1' }, versus: { expr: '0' } }, { type: 'branch', if: { expr: 'не @hit.success' } }, { type: 'stop' }, { type: 'end' }] as Step[],
    });
    system.effects.r = { label: 'r', activation: 'passive', on: [{ on: 'before:удар', if: { expr: '@цель == @носитель и @действующий != @носитель' }, steps: [] }] } as Effect;
    eq(errorTexts(system).join(''), '');
    system.effects.r = { label: 'r', activation: 'passive', on: [{ on: 'before:удар', if: { expr: '@враг == @носитель' }, steps: [] }] } as Effect;
    ok(errorTexts(system).some(t => t.includes('«враг» — нет ни входа, ни шага')), errorTexts(system).join('|'));
  });

  test('у броска подписка видит бросающего и противника', () => {
    const system = withEffect('r', { activation: 'passive', on: [{ on: 'seen', if: { expr: '@бросающий == @носитель или @против == @носитель' }, steps: [] }] });
    eq(errorTexts(system).join(''), '');
  });

  test('вызовы по кругу: эффект зовёт тот, на который сам и срабатывает', () => {
    const system = withEffect('loop', {
      activation: 'passive',
      on: [{ on: 'after:damage', steps: [{ type: 'emit', effect: 'damage', args: { раненый: { expr: '@раненый' }, сколько: { expr: '1' } } }] as Step[] }],
    });
    system.effects.damage = { label: 'Урон', params: [{ key: 'раненый', kind: 'sheet' }, { key: 'сколько', label: 'Сколько', kind: 'number', role: 'amount' }], steps: [] } as never;
    const found = errorTexts(system).find(t => t.includes('по кругу'));
    ok(found, errorTexts(system).join('|'));
    ok(found!.includes('«loop»') && found!.includes('«Урон»'), found);
  });

  test('без круга — тишина', () => {
    const system = withEffect('a', { params: [WHO] as never, steps: [{ type: 'emit', effect: 'damage', args: { раненый: { expr: '@действующий' }, сколько: { expr: '1' } } }] as Step[] });
    system.effects.damage = { label: 'Урон', params: [{ key: 'раненый', kind: 'sheet' }, { key: 'сколько', label: 'Сколько', kind: 'number', role: 'amount' }], steps: [{ type: 'apply', target: { expr: '@раненый.hp' }, direction: 'subtract', value: { expr: '@сколько' } }] } as never;
    ok(!texts(system).some(t => t.includes('по кругу')));
  });

  test('вызов не заполняет вход вызываемого эффекта — ошибка', () => {
    const system = withEffect('a', { params: [WHO] as never, steps: [{ type: 'emit', effect: 'damage', args: { сколько: { expr: '1' } } }] as Step[] });
    system.effects.damage = { label: 'Урон', params: [{ key: 'раненый', label: 'Раненый', kind: 'sheet' }, { key: 'сколько', kind: 'number' }], steps: [] } as never;
    ok(errorTexts(system).some(t => t.includes('не заполняет его вход «Раненый»')), errorTexts(system).join('|'));
  });

  test('«для каждого» в одной цепочке может быть только один', () => {
    const each = { type: 'each', of: 'цели' } as unknown as Step;
    const system = withEffect('a', { params: [WHO, { key: 'цели', kind: 'sheet', many: true, item: { key: 'цель' } }] as never, steps: [each, mend('@цель.hp'), each] });
    ok(errorTexts(system).some(t => t.includes('может быть только один')), errorTexts(system).join('|'));
  });

  test('эффект зовут, а он ничего не делает — предупреждение', () => {
    const system = withEffect('a', { steps: [{ type: 'emit', effect: 'ping' }] as Step[] });
    system.effects.ping = { label: 'Пинг', tags: ['сигнал'] } as never;
    ok(texts(system).some(t => t.startsWith('warn') && t.includes('«Пинг» вызывают, но он ничего не делает')), texts(system).join('|'));
    eq(errorTexts(system).length, 0);
  });

  test('привязка не закрывает вход эффекта', () => {
    const system = withEffect('strike', { params: [{ key: 'dice', label: 'Кость урона' }], steps: [] });
    system.tables = { weapon: { shape: 'book', use: 'item', label: 'Оружие', columns: [], bindings: [{ label: 'Удар', effect: 'strike', args: {} }] } } as never;
    const [problem] = errorsOf(lintSystem(system));
    ok(problem?.text.includes('не заполняет вход «Кость урона»'), problem?.text);
    eq(problem?.where.binding, 0);
  });

  test('кнопка заполняет входы-листы сама: первый одиночный — нажавший, список — выбранные; лишний лист — ошибка', () => {
    const system = withEffect('strike', { params: [WHO, { key: 'цели', kind: 'sheet', many: true, item: { key: 'цель' } }], steps: [] });
    system.tables = { weapon: { shape: 'book', use: 'item', label: 'Оружие', columns: [], bindings: [{ label: 'Удар', effect: 'strike', args: {} }] } } as never;
    eq(errorTexts(system).join(''), '');
    system.effects.strike = { label: 'strike', activation: 'manual', params: [WHO, { key: 'второй', label: 'Второй', kind: 'sheet' }], steps: [] } as never;
    const [problem] = errorsOf(lintSystem(system));
    ok(problem?.text.includes('не заполняет вход «Второй»'), problem?.text);
  });

  test('необязательный вход-лист кнопка закрывать не обязана', () => {
    const system = withEffect('strike', { params: [WHO, { key: 'второй', label: 'Второй', kind: 'sheet', optional: true }], steps: [] });
    system.tables = { weapon: { shape: 'book', use: 'item', label: 'Оружие', columns: [], bindings: [{ label: 'Удар', effect: 'strike', args: {} }] } } as never;
    eq(errorTexts(system).join(''), '');
  });

  test('вход, которую спрашивают за столом, привязка закрывать не обязана', () => {
    const system = withEffect('strike', { params: [{ key: 'дистанция', label: 'Дистанция', ask: { by: 'actor' } }], steps: [] });
    system.tables = { weapon: { shape: 'book', use: 'item', label: 'Оружие', columns: [], bindings: [{ label: 'Удар', effect: 'strike', args: {} }] } } as never;
    eq(errorTexts(system).join(''), '');
  });

  test('привязка берёт свойство, которого у этого типа нет', () => {
    const system = withEffect('strike', { params: [{ key: 'dice' }], steps: [] });
    system.tables = {
      weapon: { shape: 'book', use: 'item', label: 'Оружие', columns: [{ key: 'dmg' }], bindings: [{ label: 'Удар', effect: 'strike', args: { dice: { expr: '@other' } } }] },
      armor: { shape: 'book', use: 'item', label: 'Броня', columns: [{ key: 'other' }] },
    } as never;
    ok(errorTexts(system).some(t => t.includes('«other» не объявлено у этого типа')), errorTexts(system).join('|'));
  });

  test('активируемый эффект, который никто не даёт — предупреждение, не ошибка', () => {
    const system = withEffect('lonely', { steps: [] });
    const withBook = lintSystem(system, { records: [] } as never)
      .map(p => `${p.level}: ${p.text}`);
    ok(withBook.some(t => t.startsWith('warn') && t.includes('никак не запускается')), withBook.join('|'));
    eq(errorTexts(system).length, 0);
  });

  test('без компендиума о ненайденных запусках не предупреждают: книгу автор системы не видит', () => {
    const system = withEffect('lonely', { steps: [] });
    eq(texts(system).filter(t => t.includes('никак не запускается')).length, 0);
  });
});

group('линт одного шага — то, что раньше считал конструктор', () => {
  const effect = { label: 'e', activation: 'manual', params: [], steps: [] } as unknown as Effect;

  test('обязательный слот пуст', () => {
    const problem = lintStep({ type: 'apply' } as Step, bare(), effect, []);
    ok(problem?.text.includes('не заполнено'), problem?.text);
  });

  test('неизвестный тип называет тип', () => {
    ok(lintStep({ type: 'котик' } as Step, bare(), effect, [])?.text.includes('«котик»'));
  });

  test('формула с именем шага выше — не беда, с чужим именем — беда', () => {
    const step = { type: 'apply', target: { expr: '@носитель.hp' }, value: { expr: '@n + 1' } } as unknown as Step;
    eq(lintStep(step, bare(), effect, [{ id: 'n', type: 'roll' }]), null);
    const problem = lintStep(step, bare(), effect, []);
    eq(problem?.fix?.tag, 'n');
  });
});

group('ссылки и слушатели', () => {
  test('referencesOf образца видит привязки, инициативу и правила комнаты', () => {
    const refs = referencesOf(SAMPLE_SYSTEMS[0] as System);
    ok(refs.some(r => r.kind === 'effect' && r.from.tab === 'records'));
    ok(refs.some(r => r.kind === 'constant' && r.from.section === 'initiative'));
    ok(refs.some(r => r.kind === 'effect' && r.from.section === 'grants'));
  });

  test('listenerOf разбирает «что случилось» и пустоту', () => {
    deepEq(listenerOf({ on: 'after:damage' }), { kind: 'call', phase: 'after', key: 'damage' });
    deepEq(listenerOf({ on: 'before:*' }), { kind: 'call', phase: 'before', key: '*' });
    deepEq(listenerOf({ on: 'done:strike' }), { kind: 'call', phase: 'done', key: 'strike' });
    deepEq(listenerOf({ on: 'seen' }), { kind: 'seen' });
    deepEq(listenerOf({ on: 'moment:turn-start' }), { kind: 'moment', key: 'turn-start' });
    deepEq(listenerOf({ on: 'field:hp' }), { kind: 'field', key: 'hp' });
    deepEq(listenerOf({ on: 'gained:poisoned' }), { kind: 'gained', key: 'poisoned' });
    deepEq(listenerOf({ on: 'lost:poisoned' }), { kind: 'lost', key: 'poisoned' });
    eq(listenerOf({ on: 'strike' }).kind, 'unknown');
    eq(listenerOf({ on: 'before:' }).kind, 'unknown');
    eq(listenerOf({ on: '' }).kind, 'empty');
    eq(listenerOf({}).kind, 'empty');
  });

  test('heardNames: имена, которые слушатель получает от того, что случилось', () => {
    const system = withEffect('удар', {
      params: [WHO, { key: 'цели', kind: 'sheet', many: true, item: { key: 'цель' } }, { key: 'бонус', kind: 'number' }] as never,
      steps: [{ type: 'each', of: 'цели' }, { id: 'hit', type: 'check', value: { expr: '1' }, versus: { expr: '0' } }, { type: 'branch', if: { expr: 'не @hit.success' } }, { type: 'stop' }, { type: 'end' }] as Step[],
    });
    deepEq(heardNames(system, listenerOf({ on: 'seen' })).sheets, ['бросающий', 'против']);
    deepEq(heardNames(system, listenerOf({ on: 'moment:turn-start' })).sheets, ['ходит']);
    deepEq(heardNames(system, listenerOf({ on: 'gained:x' })).sheets, ['лист']);
    const struck = heardNames(system, listenerOf({ on: 'after:удар' }));
    deepEq(struck.sheets, ['действующий', 'цели', 'цель']);
    deepEq(struck.seeds, ['бонус', 'hit', 'метки']);
    const done = heardNames(system, listenerOf({ on: 'done:удар' }));
    ok(done.seeds.includes('итоги'));
    ok(!done.seeds.includes('hit'), 'итог шага внутри цикла у каждой цели свой — в «завершено» его нет');
  });
});

group('линт: моменты хода', () => {
  test('известный момент — законный слушатель', () => {
    const system = withEffect('яд', { activation: 'passive', on: [{ on: 'moment:turn-start', steps: [] }] });
    eq(errorsOf(lintSystem(system)).map(p => p.text).join(''), '');
  });

  test('выдуманный момент назван, и список известных показан', () => {
    const system = withEffect('яд', { activation: 'passive', on: [{ on: 'moment:когда-нибудь', steps: [] }] });
    const [problem] = errorsOf(lintSystem(system));
    ok(problem?.text.includes('«когда-нибудь»'), problem?.text);
    ok(problem?.text.includes('turn-start'), problem?.text);
  });
});

group('линт: вопрос «до» у вложенного вызова', () => {
  const nested = (from: 'steps' | 'handler'): System => {
    const system = withEffect('шип', { params: [{ key: 'жертва', kind: 'sheet' }] as never, steps: [mend('@жертва.hp')] });
    const emit = { type: 'emit', effect: 'шип', args: { жертва: { expr: '@носитель' } } } as unknown as Step;
    system.effects.удар = { label: 'Удар', activation: 'manual', params: [WHO] as never, steps: from === 'steps' ? [emit] : [] } as Effect;
    system.effects.шипы = { label: 'Шипы', activation: 'passive', on: from === 'handler' ? [{ on: 'after:удар', steps: [emit] }] : [] } as Effect;
    system.effects.заслон = { label: 'Заслон', activation: 'passive', on: [{ on: 'before:шип', confirm: true, steps: [] }] } as Effect;
    return system;
  };

  test('вызов из шагов эффекта — спросить до него нельзя', () => {
    ok(errorTexts(nested('steps')).some(t => t.includes('спросить игрока до него нельзя')), errorTexts(nested('steps')).join('\n'));
  });

  test('вызов из подписки идёт доставкой с вопросами — спросить можно', () => {
    ok(!errorTexts(nested('handler')).some(t => t.includes('спросить игрока до него нельзя')), errorTexts(nested('handler')).join('\n'));
  });
});

group('линт: стоимость не списывается дважды', () => {
  test('в образцах трата в стоимости не повторяется', () => {
    for (const system of SAMPLE_SYSTEMS) {
      eq(lintSystem(flattenSystem(system as System)).filter(p => p.text.includes('дважды')).map(p => p.text).join('\n'), '', system.name);
    }
  });
});

group('развёртка наследования', () => {
  test('повторная развёртка ничего не склеивает второй раз', () => {
    for (const system of SAMPLE_SYSTEMS) {
      const once = flattenSystem(system as System);
      eq(flattenSystem(once), once, system.name);
    }
  });
});

group('линт: у шага только поля его типа', () => {
  test('чужое поле — ошибка с именем поля', () => {
    const system = withEffect('hit', { params: [WHO] as never, steps: [{ type: 'emit', effect: 'x', лишнее: true } as unknown as Step] });
    ok(errorTexts(system).some(t => t.includes('нет поля «лишнее»')), errorTexts(system).join('\n'));
  });

  test('общие поля id, type, when допустимы у любого шага', () => {
    const system = withEffect('hit', { params: [WHO] as never, steps: [{ id: 'a', type: 'apply', if: { expr: 'да' }, target: { expr: '@действующий.hp' }, direction: 'add', value: { expr: '1' } } as unknown as Step] });
    ok(!errorTexts(system).some(t => t.includes('нет поля')), errorTexts(system).join('\n'));
  });

  test('своё условие у шага — ошибка: условие ставится блоком «Если»', () => {
    const own = withEffect('hit', { params: [WHO] as never, steps: [{ ...mend('@действующий.hp'), if: { expr: 'да' } }] as Step[] });
    ok(errorTexts(own).some(t => t.includes('условие теперь ставится блоком «Если»')), errorTexts(own).join('\n'));
    const block = withEffect('hit', { params: [WHO] as never, steps: [{ type: 'branch', if: { expr: 'да' } }, mend('@действующий.hp'), { type: 'end' }] as Step[] });
    eq(errorTexts(block).join('\n'), '');
    const open = withEffect('hit', { params: [WHO] as never, steps: [{ type: 'branch', if: { expr: 'да' } }, mend('@действующий.hp')] as Step[] });
    ok(errorTexts(open).some(t => t.includes('«Если» не закрыт')), errorTexts(open).join('\n'));
  });
});

group('колонка из таблицы — ссылкой, а не совпадением имён', () => {
  const lookups = (cell: string, expr: string): System => {
    const system = bare();
    system.tables!.ячейки = { label: 'Ячейки заклинаний', key: 'number', columns: [{ key: 'круг_1', label: '1-й круг', kind: 'number' }], rows: [{ value: 1, cells: { круг_1: 2 } }] } as never;
    system.tables!.круги = { label: 'Ячейки по кругам', key: 'word', owner: 'sheet',
      columns: [{ key: 'circle', label: 'Колонка', kind: 'column', from: 'ячейки' }, { key: 'max', label: 'Всего', kind: 'number', expr: { expr } }],
      rows: [{ value: 'первый', cells: { circle: cell } }] } as never;
    return system;
  };

  test('строка ссылается на колонку другой таблицы — ошибок нет', () => {
    eq(errorsOf(lintSystem(lookups('круг_1', 'таблица("ячейки", 1, @строка.circle)'))).length, 0);
  });

  test('ссылка на колонку, которой нет, — ошибка словами', () => {
    ok(errorsOf(lintSystem(lookups('круг_9', 'таблица("ячейки", 1, @строка.circle)'))).some(p => /указывает на колонку, которой/.test(p.text)));
  });

  test('«из таблицы» с несуществующей колонкой — ошибка, а не тихое «—»', () => {
    ok(errorsOf(lintSystem(lookups('круг_1', 'таблица("ячейки", 1, "круг_7")'))).some(p => /нет колонки «круг_7»/.test(p.text)));
  });

  test('служебная колонка «value» в «из таблицы» — не ошибка; ошибка называет таблицу по названию', () => {
    eq(errorsOf(lintSystem(lookups('круг_1', 'таблица("ячейки", 1, "value")'))).length, 0);
    ok(errorsOf(lintSystem(lookups('круг_1', 'таблица("ячейки", 1, "нет")'))).some(p => /в таблице «Ячейки заклинаний» нет колонки/.test(p.text)));
  });
});


group('метки правки вызова', () => {
  const resist = (tag: string): System => {
    const system = withEffect('урон', { params: [{ key: 'сколько', label: 'Сколько', kind: 'number', role: 'amount' }] as never });
    system.tables.типы = { shape: 'rows', rows: [{ value: 'огонь' }] } as never;
    system.effects.стойкость = { label: 'Стойкость', activation: 'passive', modifiers: [{ kind: 'edit', call: 'урон', param: 'сколько', op: 'mul', value: { expr: '0.5' }, anyTags: [tag] }] } as never;
    return system;
  };
  test('метка из таблицы — не ошибка', () => {
    eq(errorTexts(resist('огонь')).filter(t => /метки/.test(t)).length, 0);
  });
  test('опечатка в метке — ошибка словами', () => {
    ok(errorTexts(resist('огон')).some(t => t.includes('метки «огон» нет ни в одной таблице')));
  });
});

group('линт: правка, не привязанная к носителю', () => {
  const holding = (modifiers: unknown[]): System => {
    const system = withEffect('урон', {
      params: [{ key: 'лист', label: 'Лист', kind: 'sheet', role: 'target' }, { key: 'сколько', label: 'Сколько', kind: 'number', role: 'amount' }] as never,
      steps: [mend('@лист.hp', '-@сколько')],
    });
    system.effects.щит = { label: 'Щит', activation: 'passive', modifiers } as Effect;
    return system;
  };
  const warned = (system: System) => texts(system).filter(t => t.startsWith('warn') && t.includes('в условии нет носителя'));

  test('правка броска без условия действует на всех — предупреждение, публикации не мешает', () => {
    const system = holding([{ kind: 'edit', call: 'roll', param: 'bonus', op: 'add', value: { expr: '1' } }]);
    eq(warned(system).length, 1, texts(system).join('|'));
    ok(warned(system)[0]!.includes('«бросает носитель»'), warned(system)[0]);
    ok(!errorTexts(system).some(t => t.includes('носител')), errorTexts(system).join('|'));
  });

  test('условие про носителя — тихо, в том числе внутри «все(…)» и через поле носителя', () => {
    const system = holding([
      { kind: 'edit', call: 'roll', param: 'bonus', op: 'add', value: { expr: '1' }, if: { expr: '@бросающий == @носитель' } },
      { kind: 'edit', call: 'урон', param: 'сколько', op: 'mul', value: { expr: '0.5' }, if: { expr: '@лист == @носитель и @носитель.hp > 0' } },
    ]);
    eq(warned(system).join('|'), '');
  });

  test('поле носителя без «… == носитель» — не привязка: «пока носитель истощён» бьёт по броскам всех', () => {
    const system = holding([{ kind: 'edit', call: 'roll', param: 'bonus', op: 'add', value: { expr: '-1' }, if: { expr: '@носитель.hp >= 1' } }]);
    eq(warned(system).length, 1, texts(system).join('|'));
    const apart = holding([{ kind: 'edit', call: 'roll', param: 'bonus', op: 'add', value: { expr: '1' }, if: { expr: '@бросающий != @носитель' } }]);
    eq(warned(apart).join('|'), '', '«все, кроме носителя» — сравнение с носителем, это осознанно');
  });

  test('где искать носителя у вызова: вход-цель, иначе первый одиночный лист; без листов — некого', () => {
    const system = bare();
    system.effects.без_листов = { label: 'Без листов', params: [{ key: 'сколько', kind: 'number', role: 'amount' }], steps: [] } as unknown as Effect;
    system.effects.список = { label: 'Список', params: [{ key: 'цели', kind: 'sheet', many: true }, { key: 'сколько', kind: 'number', role: 'amount' }], steps: [] } as unknown as Effect;
    system.effects.кто = { label: 'Кто', params: [{ key: 'кто', kind: 'sheet', role: 'actor' }, { key: 'сколько', kind: 'number', role: 'amount' }], steps: [] } as unknown as Effect;
    eq(holderNameOf(system, 'без_листов'), null);
    eq(holderNameOf(system, 'список'), null);
    eq(holderNameOf(system, 'кто'), 'кто');
    eq(holderNameOf(system, 'roll'), 'бросающий');
  });

  test('правка вызова с условием не про носителя — предупреждение с подсказкой входа-цели', () => {
    const system = holding([{ kind: 'edit', call: 'урон', param: 'сколько', op: 'mul', value: { expr: '0.5' }, if: { expr: '@стол.страх > 0' } }]);
    eq(warned(system).length, 1, texts(system).join('|'));
    ok(warned(system)[0]!.includes('«урон»') && warned(system)[0]!.includes('«Лист — носитель»'), warned(system)[0]);
  });

  test('образцы: все правки привязаны к носителю', () => {
    for (const system of SAMPLE_SYSTEMS) {
      const world = SAMPLE_WORLDS.find(w => w.system === system);
      const loose = lintSystem(system as System, world?.compendium).filter(p => p.text.includes('в условии нет носителя'));
      eq(loose.map(p => p.text).join('|'), '', system.name);
    }
  });
});

group('линт: значение выбора — из его вариантов, для любого шага', () => {
  test('«Докинуть» с «Оставить: лучшая» вместо best — ошибка словами', () => {
    const system = bare();
    system.effects.удача = { label: 'Удача', activation: 'passive', on: [{ on: 'seen', confirm: true, steps: [{ type: 'roll-add', count: { expr: '1' }, keep: 'лучшая' }] }] } as unknown as Effect;
    ok(errorTexts(system).some(t => t.includes('оставить: нет варианта «лучшая»')), errorTexts(system).join('|'));
  });
});

group('линт: «Перебросить» — два режима', () => {
  const reacting = (step: Record<string, unknown>): System => {
    const system = bare();
    system.effects.удача = { label: 'Удача', activation: 'passive', on: [{ on: 'seen', confirm: true, steps: [{ type: 'roll-reroll', ...step }] }] } as unknown as Effect;
    return system;
  };

  test('«одну меньшую» не требует порога', () => {
    eq(errorTexts(reacting({ which: 'lowest' })).join('|'), '');
  });

  test('порог при «одной меньшей» — лишний, его просят убрать', () => {
    ok(errorTexts(reacting({ which: 'lowest', upTo: { expr: '1' } })).some(t => t.includes('«Перебросить, где выпало не больше» здесь не действует')), errorTexts(reacting({ which: 'lowest', upTo: { expr: '1' } })).join('|'));
  });

  test('режим не из списка — одна ошибка про режим; порог без режима, как раньше, требует числа', () => {
    ok(errorTexts(reacting({ which: 'всё', upTo: { expr: '1' } })).some(t => t.includes('что перебросить: нет варианта «всё»')));
    ok(!errorTexts(reacting({ which: 'всё', upTo: { expr: '1' } })).some(t => t.includes('здесь не действует')), 'второй, неверной ошибки про порог нет');
    ok(errorTexts(reacting({})).some(t => t.includes('не заполнено: перебросить, где выпало не больше')));
  });
});

group('линт: вход висящего эффекта и имена, которые видны от вызова', () => {
  const NUM = (key: string, label = key) => ({ key, label, kind: 'number' });
  const LIST = (key: string) => ({ key, label: key, kind: 'sheet' });
  const pay = { type: 'apply', target: { expr: '@носитель.hp' }, direction: 'subtract', value: { expr: '@бонус' } } as unknown as Step;

  const struck = (): System => withEffect('удар', {
    label: 'Удар',
    params: [WHO, NUM('бонус', 'Бонус')] as never,
    steps: [{ id: 'бросок', type: 'roll', fixed: { expr: '1' } }] as Step[],
  });
  const hung = (params: unknown[], handler: Record<string, unknown>, system = struck()): System => {
    system.effects.заслон = { label: 'Заслон', activation: 'passive', params, on: [{ steps: [], ...handler }] } as unknown as Effect;
    return system;
  };
  const clashes = (system: System) => errorTexts(system).filter(t => t.includes('совпадает с'));

  test('значение вызова и свой вход с одним именем: @имя в условии читает вызов — ошибка словами', () => {
    const system = hung([NUM('бонус', 'Запас')], { on: 'after:удар', if: { expr: '@бонус > 1' } });
    eq(clashes(system).join('|'), 'вход «Запас» у «Заслон» совпадает с «бонус» у «Удар»: здесь @бонус — значение «Удар». Переименуйте свой вход');
    const [problem] = lintSystem(system).filter(p => p.text.includes('совпадает с'));
    eq(problem?.level, 'error');
    eq(problem?.where.effect, 'заслон');
    eq(problem?.where.part, 'on');
    eq(problem?.where.handler, 0);
  });

  test('совпадение, которым не пользуются, безвредно: ни в условии, ни в шагах, ни в цене имени нет', () => {
    const system = hung([NUM('бонус')], { on: 'after:удар', if: { expr: 'да' }, steps: [mend('@носитель.hp', '1')], cost: [{ ...pay, value: { expr: '1' } } as Step] });
    eq(clashes(system).length, 0, errorTexts(system).join('|'));
  });

  test('имя читается в шагах подписки, в её цене и через точку — везде ошибка', () => {
    eq(clashes(hung([NUM('бонус')], { on: 'after:удар', steps: [pay] })).length, 1);
    eq(clashes(hung([NUM('бонус')], { on: 'after:удар', cost: [pay] })).length, 1);
    eq(clashes(hung([LIST('действующий')], { on: 'after:удар', steps: [mend('@действующий.hp')] })).length, 1);
  });

  test('имя шага вызываемого эффекта видно в «до», в «после» и в «завершено»', () => {
    for (const phase of ['before', 'after', 'done']) {
      const system = hung([NUM('бросок')], { on: `${phase}:удар`, if: { expr: '@бросок > 1' } });
      eq(clashes(system).length, 1, phase);
    }
  });

  test('побеждает вызов: его лист закрывает и лист, и число; свой лист закрывает только значение вызова', () => {
    const asSheet = { on: 'after:удар', if: { expr: '@действующий == @носитель' } };
    eq(clashes(hung([LIST('действующий')], asSheet)).length, 1, 'лист против листа');
    eq(clashes(hung([NUM('действующий')], asSheet)).length, 1, 'число против листа');
    eq(clashes(hung([LIST('бонус')], { on: 'after:удар', if: { expr: '@бонус == @носитель' } })).length, 0, 'лист против числа: читается свой лист');
  });

  test('итоги вызова видны подписке «после», в «до» их ещё нет', () => {
    const system = struck();
    system.effects.удар!.returns = [{ key: 'попал', label: 'Попал', kind: 'boolean', expr: { expr: 'да' } }] as never;
    eq(clashes(hung([{ key: 'попал', label: 'Попал', kind: 'boolean' }], { on: 'after:удар', if: { expr: '@попал' } }, system)).length, 1);
    eq(clashes(hung([{ key: 'попал', label: 'Попал', kind: 'boolean' }], { on: 'before:удар', if: { expr: '@попал' } }, struck())).length, 0);
  });

  test('«любое действие» имён не даёт — совпадать нечему', () => {
    const both = { if: { expr: '@бонус > @метки' } };
    eq(clashes(hung([NUM('бонус'), NUM('метки')], { on: 'before:удар', ...both })).length, 2, 'у конкретного вызова оба имени заняты');
    eq(clashes(hung([NUM('бонус'), NUM('метки')], { on: 'before:*', ...both })).length, 0);
  });

  test('метка с договором: вызов зовётся меткой, имена — входы её договора', () => {
    const system = struck();
    system.tags = { атака: { label: 'Любая атака', inputs: [{ key: 'цель', kind: 'sheet' }] } } as never;
    const found = clashes(hung([LIST('цель')], { on: 'before:атака', if: { expr: '@цель == @носитель' } }, system));
    eq(found.join('|'), 'вход «цель» у «Заслон» совпадает с «цель» у «Любая атака»: здесь @цель — значение «Любая атака». Переименуйте свой вход');
  });

  test('кости, моменты, появление и поле: вызов называется тем, что случилось', () => {
    const system = struck();
    system.effects.яд = { label: 'Яд', activation: 'passive' } as Effect;
    const cases: [string, string, string][] = [
      ['seen', 'бросающий', 'кости выпали'],
      ['moment:turn-end', 'ходит', 'в конце своего хода'],
      ['gained:яд', 'лист', 'Яд появилось'],
      ['lost:яд', 'лист', 'Яд ушло'],
      ['field:hp', 'лист', 'Хиты стало верным'],
    ];
    for (const [on, name, source] of cases) {
      const found = clashes(hung([LIST(name)], { on, if: { expr: `@${name} == @носитель` } }, system));
      eq(found.join('|'), `вход «${name}» у «Заслон» совпадает с «${name}» у «${source}»: здесь @${name} — значение «${source}». Переименуйте свой вход`, on);
      eq(clashes(hung([LIST(name)], { on, if: { expr: 'да' } }, system)).length, 0, `${on}: не используется`);
    }
  });

  const edited = (params: unknown[], mod: Record<string, unknown>): System => {
    const system = withEffect('урон', {
      label: 'Урон',
      params: [{ key: 'лист', label: 'Лист', kind: 'sheet', role: 'target' }, { key: 'сколько', label: 'Сколько', kind: 'number', role: 'amount' }] as never,
    });
    system.effects.щит = {
      label: 'Щит', activation: 'passive', params,
      modifiers: [{ kind: 'edit', call: 'урон', param: 'сколько', op: 'mul', value: { expr: '0.5' }, if: { expr: '@лист == @носитель' }, ...mod }],
    } as unknown as Effect;
    return system;
  };

  test('правка вызова: своё число с именем входа вызова, прочитанное в «сколько», — ошибка', () => {
    const system = edited([NUM('сколько', 'Запас')], { value: { expr: '@сколько / 2' } });
    eq(clashes(system).join('|'), 'вход «Запас» у «Щит» совпадает с «сколько» у «Урон»: здесь @сколько — значение «Урон». Переименуйте свой вход');
    eq(lintSystem(system).find(p => p.text.includes('совпадает с'))?.where.part, 'modifiers');
  });

  test('правка вызова: лист вызова в условии против своего входа-листа', () => {
    eq(clashes(edited([LIST('лист')], {})).length, 1);
  });

  test('правка вызова: совпадение без чтения и правка поля — тишина', () => {
    eq(clashes(edited([NUM('сколько')], {})).length, 0);
    const field = withEffect('щит', {
      activation: 'passive', params: [NUM('сколько')] as never,
      modifiers: [{ kind: 'value', target: 'hp', op: 'add', value: { expr: '@сколько' } }] as never,
    });
    eq(clashes(field).length, 0);
  });

  test('правка броска: «бросающий» и «против» — имена броска, он назван «Бросок»', () => {
    const system = withEffect('щит', {
      label: 'Щит', activation: 'passive', params: [LIST('против'), NUM('метки')] as never,
      modifiers: [{ kind: 'edit', call: 'roll', param: 'bonus', op: 'add', value: { expr: '1' }, if: { expr: '@бросающий == @носитель' } }] as never,
    });
    eq(clashes(system).length, 0, 'не читают — тишина');
    system.effects.щит!.modifiers = [{ kind: 'edit', call: 'roll', param: 'bonus', op: 'add', value: { expr: '1' }, if: { expr: '@против != @носитель и @бросающий == @носитель' } }] as never;
    eq(clashes(system).join('|'), 'вход «против» у «Щит» совпадает с «против» у «Бросок»: здесь @против — значение «Бросок». Переименуйте свой вход');
  });
});

group('линт: имя шага не совпадает с ключом входа', () => {
  const rolled = (id: string) => ({ id, type: 'roll', fixed: { expr: '1' } }) as unknown as Step;
  const withInput = (rest: Partial<Effect>): System => withEffect('e', { params: [WHO, { key: 'сколько', label: 'Сколько', kind: 'number' }] as never, ...rest });
  const named = (system: System) => lintSystem(system).filter(p => p.level === 'warn' && p.text.includes('назван как вход')).map(p => p.text);

  test('в шагах — предупреждение словами, не ошибка', () => {
    const system = withInput({ steps: [rolled('сколько')] });
    eq(named(system).join('|'), 'шаг «сколько» назван как вход «Сколько» — до шага @сколько читает вход, после — результат шага; лучше переименовать шаг');
    eq(errorTexts(system).filter(t => t.includes('назван как вход')).length, 0);
  });

  test('в цене, при наложении, при спадании, в шагах и в цене подписки', () => {
    const lanes: Partial<Effect>[] = [
      { cost: [rolled('сколько')] },
      { attach: [rolled('сколько')] },
      { detach: [rolled('сколько')] },
      { on: [{ on: 'moment:turn-start', steps: [rolled('сколько')] }] },
      { on: [{ on: 'moment:turn-start', cost: [rolled('сколько')] }] },
    ];
    for (const lane of lanes) eq(named(withInput(lane)).length, 1, Object.keys(lane).join());
  });

  test('шаг в подписке с чужим именем и шаги с другими именами — тишина', () => {
    eq(named(withInput({ steps: [rolled('итого')], on: [{ on: 'moment:turn-start', steps: [rolled('итого')] }] })).length, 0);
  });

  test('вход-лист и шаг с одним именем — предупреждение, что результат шага не прочесть', () => {
    const system = withEffect('e', { params: [WHO] as never, steps: [rolled('действующий')] });
    eq(named(system).length, 1);
    eq(named(system)[0]!.includes('всегда читает лист'), true);
  });
});

group('линт: слово «строка» занято', () => {
  const looping = (as: string): System => {
    const system = bare();
    system.tables!.запасы = { shape: 'rows', owner: 'sheet', key: 'word', label: 'Запасы', columns: [{ key: 'осталось', label: 'Осталось', kind: 'number', default: 0 }], rows: [{ value: 'ки', label: 'Ки' }] } as never;
    system.effects.привал = { label: 'Привал', activation: 'manual', params: [WHO], steps: [{ type: 'each', rows: 'запасы', as }, mend('@действующий.hp')] } as unknown as Effect;
    return system;
  };

  test('вход с ключом «строка» — ошибка с адресом входа', () => {
    const system = withEffect('e', { params: [WHO, { key: 'строка', label: 'Ряд', kind: 'number' }] as never });
    const found = lintSystem(system).filter(p => p.text.includes('слово движка'));
    eq(found.length, 1);
    eq(found[0]!.level, 'error');
    eq(found[0]!.where.part, 'params');
    eq(found[0]!.where.key, 'строка');
    eq(found[0]!.text, 'вход «Ряд» назван «строка» — это слово движка: так пишется клетка своей строки (@строка.колонка); переименуйте вход');
  });

  test('шаг с именем «строка» — ошибка', () => {
    const system = withEffect('e', { params: [WHO] as never, steps: [{ id: 'строка', type: 'roll', fixed: { expr: '1' } }] as Step[] });
    eq(errorTexts(system).filter(t => t.includes('слово движка')).join('|'), 'шаг не может зваться «строка» — это слово движка: так пишется клетка своей строки (@строка.колонка)');
  });

  test('«для каждой строки» не может звать строку словом «строка»', () => {
    ok(errorTexts(looping('строка')).some(t => t.includes('имя строки «строка» уже занято: так зовётся слово движка')), errorTexts(looping('строка')).join('|'));
    eq(errorTexts(looping('запас')).join(''), '');
  });

  test('похожие слова разрешены', () => {
    const system = withEffect('e', { params: [WHO, { key: 'строки', kind: 'number' }, { key: 'ряд', kind: 'number' }] as never, steps: [{ id: 'строчка', type: 'roll', fixed: { expr: '1' } }] as Step[] });
    eq(errorTexts(system).filter(t => t.includes('слово движка')).length, 0);
  });
});

group('линт: клетка записи в правке типа и поле листа с одним именем', () => {
  const typed = (modifiers: unknown[], extra: Record<string, unknown> = {}): System => {
    const system = bare();
    system.tables!.оружие = {
      shape: 'book', use: 'item', label: 'Оружие',
      columns: [{ key: 'hp', label: 'Прочность', kind: 'number' }, { key: 'вес', label: 'Вес', kind: 'number' }],
      modifiers, ...extra,
    } as never;
    return system;
  };
  const bump = (value: string, rest: Record<string, unknown> = {}) => ({ kind: 'value', target: 'hp', op: 'add', value: { expr: value }, ...rest });
  const cellWarns = (system: System, book?: unknown) =>
    lintSystem(system, book as never).filter(p => p.text.includes('клетку записи пишут'));

  test('голое имя колонки, совпавшее с полем листа, — предупреждение со словами', () => {
    const found = cellWarns(typed([bump('@hp')]));
    eq(found.length, 1);
    eq(found[0]!.level, 'warn');
    eq(found[0]!.text, '«hp» — поле листа; клетку записи пишут @строка.hp');
    eq(found[0]!.where.tab, 'records');
    eq(found[0]!.where.kind, 'оружие');
    eq(found[0]!.where.part, 'modifiers');
  });

  test('читается и в условии, и через точку; публикации предупреждение не мешает', () => {
    eq(cellWarns(typed([bump('1', { if: { expr: '@hp > 0' } })])).length, 1);
    eq(cellWarns(typed([bump('@hp.нет')])).length, 1);
    eq(errorsOf(lintSystem(typed([bump('@hp')]))).filter(p => p.text.includes('клетку записи')).length, 0);
  });

  test('записанная как @строка.колонка, чужая колонка и колонка без поля — тишина', () => {
    eq(cellWarns(typed([bump('@строка.hp')])).length, 0);
    eq(cellWarns(typed([bump('@вес')])).length, 0, 'вес — не поле листа');
    const other = typed([bump('@hp')], { columns: [{ key: 'вес', label: 'Вес', kind: 'number' }] });
    eq(cellWarns(other).length, 0, 'у типа нет колонки hp');
  });

  test('правка вызова с голым полем и так ошибка «чьё поле?» — второго сообщения нет', () => {
    const system = typed([{ kind: 'edit', call: 'roll', param: 'bonus', op: 'add', value: { expr: '@hp' }, if: { expr: '@бросающий == @носитель' } }]);
    eq(cellWarns(system).length, 0);
    ok(errorTexts(system).some(t => t.includes('«hp» — чьё поле?')), errorTexts(system).join('|'));
  });

  test('колонка, унаследованная от основы, считается колонкой типа', () => {
    const system = typed([], { columns: [{ key: 'вес', label: 'Вес', kind: 'number' }] });
    system.tables!.снаряжение = { shape: 'book', use: 'item', label: 'Снаряжение', columns: [{ key: 'hp', label: 'Прочность', kind: 'number' }] } as never;
    (system.tables!.оружие as { extends?: string }).extends = 'снаряжение';
    (system.tables!.оружие as { modifiers?: unknown[] }).modifiers = [bump('@hp')];
    const found = cellWarns(system);
    eq(found.length, 1);
    eq(found[0]!.where.kind, 'оружие');
  });

  test('правка записи книги проверяется по колонкам её типа', () => {
    const system = typed([]);
    const book = { records: [
      { id: 'меч', table: 'оружие', label: 'Меч', modifiers: [bump('@hp')] },
      { id: 'лук', table: 'оружие', label: 'Лук', modifiers: [bump('@строка.hp')] },
      { id: 'свиток', label: 'Свиток', modifiers: [bump('@hp')] },
    ] };
    const found = cellWarns(system, book);
    eq(found.length, 1);
    eq(found[0]!.where.tab, 'book');
    eq(found[0]!.where.record, 'меч');
    eq(found[0]!.where.part, 'modifiers');
  });
});

group('линт: проверки имён молчат на образцах', () => {
  const words = ['совпадает с', 'назван как вход', 'слово движка', 'клетку записи пишут', 'наложение «', 'нет ни входа, ни шага'];
  for (const system of SAMPLE_SYSTEMS) {
    test(`${system.name}: ни входов с чужими именами, ни занятого «строка», ни путаницы с клеткой записи`, () => {
      const world = SAMPLE_WORLDS.find(w => w.system === system);
      const found = lintSystem(system as System, world?.compendium).filter(p => words.some(word => p.text.includes(word)));
      eq(found.map(p => `${p.level}: ${p.text}`).join('\n'), '', system.name);
    });
  }
});

group('линт: наложение не заполняет вход наложенного эффекта', () => {
  const NUM = { key: 'сила', label: 'Сила', kind: 'number' };
  const applied = (mark: Partial<Effect>, step: Record<string, unknown> = {}, caller: Partial<Effect> = {}): System => {
    const system = withEffect('вешает', {
      params: [WHO] as never,
      steps: [{ type: 'status', effect: 'метка', to: { expr: '@действующий' }, ...step } as unknown as Step],
      ...caller,
    });
    system.effects.метка = { label: 'Метка', activation: 'passive', ...mark } as Effect;
    return system;
  };
  const unfilled = (system: System) => errorTexts(system).filter(t => t.includes('не заполняет его вход') || t.includes('ждёт свойство'));

  test('обязательный вход без аргумента — ошибка словами с адресом шага', () => {
    const system = applied({ params: [NUM] as never });
    eq(unfilled(system).join('|'), 'наложение «Метка» не заполняет его вход «Сила»');
    const [problem] = lintSystem(system).filter(p => p.text.includes('не заполняет его вход'));
    eq(problem?.level, 'error');
    eq(problem?.where.effect, 'вешает');
    eq(problem?.where.step, 0);
  });

  test('явный аргумент, необязательный вход, умолчание и вопрос за столом наложение закрывать не заставляют', () => {
    eq(unfilled(applied({ params: [NUM] as never }, { args: { сила: { expr: '3' } } })).length, 0, 'явный');
    eq(unfilled(applied({ params: [{ ...NUM, optional: true }] as never })).length, 0, 'необязательный');
    eq(unfilled(applied({ params: [{ ...NUM, default: 1 }] as never })).length, 0, 'умолчание');
    eq(unfilled(applied({ params: [{ ...NUM, ask: { by: 'actor' } }] as never })).length, 0, 'спросят за столом');
  });

  test('роли и одноимённый вход вызывающего сами не заполняют — нужен явный аргумент', () => {
    const roles = [{ key: 'на_ком', label: 'На ком', kind: 'sheet', role: 'target' }, { key: 'кто', label: 'Кто', kind: 'sheet', role: 'actor' }];
    eq(unfilled(applied({ params: roles as never })).length, 2, 'роли без аргументов');
    eq(unfilled(applied({ params: roles as never }, { args: { на_ком: { expr: '@действующий' }, кто: { expr: '@действующий' } } })).length, 0, 'роли с аргументами');
    eq(unfilled(applied({ params: [NUM] as never }, {}, { params: [WHO, NUM] as never })).length, 1, 'одноимённый вход без аргумента');
    eq(unfilled(applied({ params: [NUM] as never }, { args: { сила: { expr: '@сила' } } }, { params: [WHO, NUM] as never })).length, 0, 'одноимённый вход с аргументом');
  });

  test('наложение на себя вне «Для каждого»: лист с ролью target тоже передают явно', () => {
    const target = [{ key: 'на_ком', label: 'На ком', kind: 'sheet', role: 'target' }];
    eq(unfilled(applied({ params: target as never })).length, 1);
    eq(unfilled(applied({ params: target as never }, { args: { на_ком: { expr: '@действующий' } } })).length, 0);
  });

  test('список листов, бросок и поле «сами» не приходят — обязательный такой вход остаётся ошибкой', () => {
    const params = [{ key: 'все', label: 'Все', kind: 'sheet', many: true }, { key: 'бросок', label: 'Бросок', kind: 'roll' }, { key: 'поле', label: 'Поле', kind: 'field' }];
    const same = [WHO, ...params];
    eq(unfilled(applied({ params: params as never }, {}, { params: same as never })).length, 3);
  });

  test('«Снять» входов не заполняет и не проверяется', () => {
    eq(unfilled(applied({ params: [NUM] as never }, { mode: 'remove' })).length, 0);
  });

  test('наложение в подписке висящего эффекта: actor — носитель, ошибка называет подписку', () => {
    const system = applied({ params: [{ key: 'кто', label: 'Кто', kind: 'sheet', role: 'actor' }, NUM] as never }, {}, { steps: [] });
    system.effects.заслон = {
      label: 'Заслон', activation: 'passive',
      on: [{ on: 'after:вешает', steps: [{ type: 'status', effect: 'метка', to: { expr: '@носитель' }, args: { кто: { expr: '@носитель' } } }] }],
    } as unknown as Effect;
    const [problem] = lintSystem(system).filter(p => p.text.includes('не заполняет его вход'));
    eq(problem?.text, 'наложение «Метка» не заполняет его вход «Сила»');
    eq(problem?.where.effect, 'заслон');
    eq(problem?.where.handler, 0);
    eq(unfilled(system).length, 1, 'роль actor передана явно, открыта только «Сила»');
  });

  const chosen = (columns: string[], records: unknown[], extra: Record<string, unknown> = {}) => {
    const system = applied({ params: [NUM] as never }, { effect: { expr: '@состояние' } }, {
      params: [WHO, { key: 'состояние', label: 'Состояние', kind: 'effect', optional: true, ...extra }] as never,
    });
    system.tables!.оружие = {
      shape: 'book', use: 'item', label: 'Оружие',
      columns: [{ key: 'состояние', label: 'Состояние', kind: 'effect' }, ...columns.map(key => ({ key, label: key, kind: 'number' }))],
      bindings: [{ label: 'Метить', effect: 'вешает' }],
    } as never;
    const book = { records } as never;
    return { system, book };
  };
  const poisoned = { id: 'яд', table: 'оружие', label: 'Яд', cells: { состояние: 'метка' } };
  const unfilledWith = (made: { system: System; book: never }) =>
    errorsOf(lintSystem(made.system, made.book)).map(p => p.text).filter(t => t.includes('не заполняет его вход') || t.includes('ждёт свойство'));

  test('состояние выбрано клеткой записи: без явного аргумента вход не заполнен', () => {
    eq(unfilledWith(chosen([], [poisoned])).join('|'), 'наложение «Метка» не заполняет его вход «Сила»');
  });

  test('у типа есть колонка с именем входа — сама она вход не заполняет', () => {
    eq(unfilledWith(chosen(['сила'], [poisoned])).join('|'), 'наложение «Метка» не заполняет его вход «Сила»');
  });

  test('записи нет — выбирать из клеток нечего, не проверяется', () => {
    eq(unfilledWith(chosen([], [])).length, 0);
    eq(errorsOf(lintSystem(chosen([], [poisoned]).system)).filter(p => p.text.includes('ждёт свойство')).length, 0, 'без книги клетки не видны');
  });

  test('состояние выбрано умолчанием входа вызывающего — как у вызова', () => {
    const made = chosen([], [], { default: 'метка' });
    eq(unfilledWith(made).join('|'), 'наложение «Метка» не заполняет его вход «Сила»', 'тип привязан к кнопке с этим умолчанием');
    delete made.system.tables!.оружие;
    eq(unfilledWith(made).join('|'), 'наложение «Метка» не заполняет его вход «Сила»', 'привязок нет — заполнять нечем');
  });

  test('запись, чей тип не привязан к этому эффекту, состояние не выбирает', () => {
    const other = chosen([], [{ ...poisoned, table: 'другое' }]);
    other.system.tables!.другое = { shape: 'book', use: 'item', label: 'Другое', columns: [{ key: 'состояние', kind: 'effect' }] } as never;
    eq(unfilledWith(other).length, 0);
  });

  test('образцы чисты: ни одного нового сообщения', () => {
    for (const system of SAMPLE_SYSTEMS) {
      const world = SAMPLE_WORLDS.find(w => w.system === system);
      const found = errorsOf(lintSystem(system as System, world?.compendium)).filter(p => p.text.includes('наложение «'));
      eq(found.map(p => p.text).join('\n'), '', system.name);
    }
  });
});

group('линт: слова движка у входов и шагов — «носитель» и «стол»', () => {
  const found = (system: System) => errorTexts(system).filter(t => t.includes('слово движка'));
  const input = (key: string) => ({ key, label: 'Кто', kind: 'sheet' });
  const named = (id: string) => ({ id, type: 'roll', fixed: { expr: '1' } }) as unknown as Step;

  test('вход «носитель» — ошибка со своим пояснением; «строка» сказано, как раньше', () => {
    eq(found(withEffect('e', { params: [WHO, input('носитель')] as never })).join('|'),
      'вход «Кто» назван «носитель» — это слово движка: так пишется лист, на котором висит эффект (@носитель); переименуйте вход');
    eq(found(withEffect('e', { params: [WHO, input('строка')] as never })).join('|'),
      'вход «Кто» назван «строка» — это слово движка: так пишется клетка своей строки (@строка.колонка); переименуйте вход');
  });

  test('вход «стол» — ошибка со своим пояснением и адресом входа', () => {
    const system = withEffect('e', { params: [WHO, input('стол')] as never });
    eq(found(system).join('|'), 'вход «Кто» назван «стол» — это слово движка: так пишется стол (@стол.поле); переименуйте вход');
    const [problem] = lintSystem(system).filter(p => p.text.includes('слово движка'));
    eq(problem?.level, 'error');
    eq(problem?.where.part, 'params');
    eq(problem?.where.key, 'стол');
  });

  test('шаг с именем «носитель» или «стол» — ошибка', () => {
    eq(found(withEffect('e', { params: [WHO] as never, steps: [named('носитель')] })).join('|'),
      'шаг не может зваться «носитель» — это слово движка: так пишется лист, на котором висит эффект (@носитель)');
    eq(found(withEffect('e', { params: [WHO] as never, steps: [named('стол')] })).join('|'),
      'шаг не может зваться «стол» — это слово движка: так пишется стол (@стол.поле)');
  });

  test('похожие слова и служебные имена объекта — можно', () => {
    const system = withEffect('e', { params: [WHO, input('носители'), input('столб'), input('constructor')] as never, steps: [named('столбец'), named('toString')] });
    eq(found(system).length, 0);
  });

  test('висящий эффект: вход «носитель» недостижим в подписке, потому ошибка и там, где он объявлен', () => {
    const system = withEffect('щит', { activation: 'passive', params: [input('носитель')] as never, on: [{ on: 'moment:turn-start', if: { expr: '@носитель == @носитель' }, steps: [] }] as never });
    eq(found(system).length, 1);
  });
});

group('линт: подписка «после» видит итоги вызова, «до» и «завершено» — нет', () => {
  const called = (): System => {
    const system = withEffect('удар', {
      params: [WHO] as never,
      returns: [{ key: 'попал', label: 'Попал', kind: 'boolean', expr: { expr: 'да' } }, { key: 'урон', label: 'Урон', kind: 'number', expr: { expr: '3' } }] as never,
      steps: [{ id: 'бросок', type: 'roll', fixed: { expr: '1' } }] as Step[],
    });
    return system;
  };
  const listening = (on: string, expr = '@попал', system = called()): System => {
    system.effects.заслон = { label: 'Заслон', activation: 'passive', on: [{ on, if: { expr }, steps: [] }] } as unknown as Effect;
    return system;
  };
  const dangling = (system: System) => errorTexts(system).filter(t => t.includes('нет ни входа, ни шага'));

  test('heardNames: итоги вызываемого — в именах фазы «после» и только в ней', () => {
    const system = called();
    deepEq(heardNames(system, listenerOf({ on: 'after:удар' })).seeds, ['бросок', 'попал', 'урон', 'метки']);
    deepEq(heardNames(system, listenerOf({ on: 'before:удар' })).seeds, ['бросок', 'метки']);
    ok(!heardNames(system, listenerOf({ on: 'done:удар' })).seeds.includes('попал'));
    deepEq(heardNames(system, listenerOf({ on: 'after:*' })).seeds, []);
  });

  test('голое имя итога в «после» — не «нет ни входа, ни шага»; в «до» — ошибка', () => {
    eq(dangling(listening('after:удар')).length, 0, errorTexts(listening('after:удар')).join('|'));
    eq(dangling(listening('before:удар')).join('|'), '«попал» — нет ни входа, ни шага с таким именем');
    eq(dangling(listening('done:удар')).length, 1);
  });

  test('и в шагах подписки, и в цене', () => {
    const system = called();
    system.effects.заслон = {
      label: 'Заслон', activation: 'passive',
      on: [{ on: 'after:удар', cost: [mend('@носитель.hp', '@урон')], steps: [mend('@носитель.hp', '@урон')] }],
    } as unknown as Effect;
    eq(dangling(system).length, 0, errorTexts(system).join('|'));
  });

  test('чужое имя по-прежнему ошибка, а совпадение собственного входа с итогом — по-прежнему «совпадает с»', () => {
    eq(dangling(listening('after:удар', '@нету')).length, 1);
    const system = listening('after:удар', '@попал');
    system.effects.заслон!.params = [{ key: 'попал', label: 'Попал', kind: 'boolean' }] as never;
    eq(errorTexts(system).filter(t => t.includes('совпадает с')).length, 1);
  });
});

group('линт: двойники полей по подписи', () => {
  test('два поля листа с одной подписью — предупреждение, не ошибка; таблицы листа — одно пространство', () => {
    const system = bare();
    system.tables.лист!.columns.push({ key: 'field', label: ' хиты ', kind: 'number' } as never);
    system.tables.доп = { shape: 'single', owner: 'sheet', label: 'Доп', columns: [{ key: 'хп2', label: 'Хиты', kind: 'number' }] } as never;
    const found = lintSystem(system).filter(p => p.text.includes('два поля'));
    deepEq(found.map(p => `${p.level}: ${p.text}`), [
      'warn: в таблице «лист» два поля «хиты» — на листе и в формулах их не различить; переименуйте или удалите одно',
      'warn: в таблицах «лист» и «Доп» два поля «Хиты» — на листе и в формулах их не различить; переименуйте или удалите одно',
    ]);
    deepEq(found[0]!.where, { tab: 'sheet', field: 'field' });
    eq(errorTexts(system).length, 0);
  });

  test('у стола и у листа одна подпись — не двойники', () => {
    const system = bare();
    system.tables.лист!.columns.push({ key: 'fear', label: 'Страх', kind: 'number' } as never);
    eq(lintSystem(system).filter(p => p.text.includes('два поля')).length, 0);
  });
});
