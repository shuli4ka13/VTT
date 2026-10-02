import { group, test, eq, ok, deepEq } from './harness.ts';
import { lintSystem, lintStep, errorsOf } from '../src/model/lint.ts';
import { referencesOf, listenerOf, heardNames } from '../src/model/references.ts';
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
    system.initiative = { die: { constant: 'нет_кости' }, tags: ['нет_броска'] } as never;
    system.tables = withColumn(system, { key: 'lvl', label: 'Ур', expr: 'таблица("нет_таблицы", #hp)' }).tables;
    system.grants = ['нет_правила'];
    system.effects.buff = { label: 'y', activation: 'passive', modifiers: [{ kind: 'edit', call: 'roll', param: 'edits', edit: 'нет_правки' }] } as never;
    const found = errorTexts(system).join('\n');
    for (const key of ['кости «нет_кости»', 'метки броска «нет_броска»', 'таблицы «нет_таблицы»', 'эффекта «нет_правила»', 'правки броска «нет_правки»']) {
      ok(found.includes(key), `нет «${key}» в:\n${found}`);
    }
  });

  test('ссылка на шаг выше по цепочке — законна, ниже — нет', () => {
    const roll = { id: 'бросок', type: 'roll', die: { constant: 'd20' } } as unknown as Step;
    const okSystem = withEffect('e', { params: [WHO] as never, steps: [roll, mend('@действующий.hp', '@бросок')] });
    eq(errorTexts(okSystem).join(''), '');
    const badSystem = withEffect('e', { params: [WHO] as never, steps: [mend('@действующий.hp', '@бросок'), roll] });
    ok(errorTexts(badSystem).some(t => t.includes('«бросок» выше по цепочке нет')), errorTexts(badSystem).join('|'));
  });

  test('условие «только если» ссылается на шаг выше', () => {
    const system = withEffect('e', {
      params: [WHO] as never,
      steps: [{ ...mend('@действующий.hp'), when: { expr: '@нет.success' } }] as Step[],
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
    const system = withEffect('e', { params: [WHO] as never, steps: [{ type: 'apply', target: { expr: '@действующий.hp' }, direction: 'add', value: { param: 'нету' } }] as never });
    ok(errorTexts(system).some(t => t.includes('вход «нету» эффектом не объявлен')), errorTexts(system).join('|'));
  });

  test('условие срабатывания смотрит на шаг слушаемого эффекта', () => {
    const system = withEffect('strike', {
      params: [WHO] as never,
      steps: [
        { id: 'бросок', type: 'roll', die: { constant: 'd20' } },
        { id: 'hit', type: 'check', value: { expr: '@бросок' }, versus: { expr: '10' } },
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
    system.tables = withColumn(system, { key: 'вдвое', label: 'Вдвое', expr: '@hp * 2' }).tables;
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
      params: [WHO, { key: 'цели', kind: 'sheet', many: true }] as never,
      steps: [{ type: 'each', of: 'цели', as: 'цель' }, { id: 'hit', type: 'check', value: { expr: '1' }, versus: { expr: '0' } }] as Step[],
    });
    system.effects.r = { label: 'r', activation: 'passive', on: [{ on: 'before:удар', if: { expr: 'все(@цель == @носитель, @действующий != @носитель)' }, steps: [] }] } as Effect;
    eq(errorTexts(system).join(''), '');
    system.effects.r = { label: 'r', activation: 'passive', on: [{ on: 'before:удар', if: { expr: '@враг == @носитель' }, steps: [] }] } as Effect;
    ok(errorTexts(system).some(t => t.includes('«враг» — нет ни входа, ни шага')), errorTexts(system).join('|'));
  });

  test('у броска подписка видит бросающего и противника', () => {
    const system = withEffect('r', { activation: 'passive', on: [{ on: 'seen', if: { expr: 'любое(@бросающий == @носитель, @против == @носитель)' }, steps: [] }] });
    eq(errorTexts(system).join(''), '');
  });

  test('вызовы по кругу: эффект зовёт тот, на который сам и срабатывает', () => {
    const system = withEffect('loop', {
      activation: 'passive',
      on: [{ on: 'after:damage', steps: [{ type: 'emit', event: 'damage', args: { раненый: { expr: '@раненый' }, сколько: { expr: '1' } } }] as Step[] }],
    });
    system.effects.damage = { label: 'Урон', params: [{ key: 'раненый', kind: 'sheet' }, { key: 'сколько', label: 'Сколько', kind: 'number', role: 'amount' }], steps: [] } as never;
    const found = errorTexts(system).find(t => t.includes('по кругу'));
    ok(found, errorTexts(system).join('|'));
    ok(found!.includes('«loop»') && found!.includes('«Урон»'), found);
  });

  test('без круга — тишина', () => {
    const system = withEffect('a', { params: [WHO] as never, steps: [{ type: 'emit', event: 'damage', args: { раненый: { expr: '@действующий' }, сколько: { expr: '1' } } }] as Step[] });
    system.effects.damage = { label: 'Урон', params: [{ key: 'раненый', kind: 'sheet' }, { key: 'сколько', label: 'Сколько', kind: 'number', role: 'amount' }], steps: [{ type: 'apply', target: { expr: '@раненый.hp' }, direction: 'subtract', value: { expr: '@сколько' } }] } as never;
    ok(!texts(system).some(t => t.includes('по кругу')));
  });

  test('вызов не заполняет вход вызываемого эффекта — ошибка', () => {
    const system = withEffect('a', { params: [WHO] as never, steps: [{ type: 'emit', event: 'damage', args: { сколько: { expr: '1' } } }] as Step[] });
    system.effects.damage = { label: 'Урон', params: [{ key: 'раненый', label: 'Раненый', kind: 'sheet' }, { key: 'сколько', kind: 'number' }], steps: [] } as never;
    ok(errorTexts(system).some(t => t.includes('не заполняет его вход «Раненый»')), errorTexts(system).join('|'));
  });

  test('«для каждого» в одной цепочке может быть только один', () => {
    const each = { type: 'each', of: 'цели', as: 'цель' } as unknown as Step;
    const system = withEffect('a', { params: [WHO, { key: 'цели', kind: 'sheet', many: true }] as never, steps: [each, mend('@цель.hp'), each] });
    ok(errorTexts(system).some(t => t.includes('может быть только один')), errorTexts(system).join('|'));
  });

  test('эффект зовут, а он ничего не делает — предупреждение', () => {
    const system = withEffect('a', { steps: [{ type: 'emit', event: 'ping' }] as Step[] });
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
    const system = withEffect('strike', { params: [WHO, { key: 'цели', kind: 'sheet', many: true }], steps: [] });
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
      weapon: { shape: 'book', use: 'item', label: 'Оружие', columns: [{ key: 'dmg' }], bindings: [{ label: 'Удар', effect: 'strike', args: { dice: { prop: 'other' } } }] },
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
      params: [WHO, { key: 'цели', kind: 'sheet', many: true }, { key: 'бонус', kind: 'number' }] as never,
      steps: [{ type: 'each', of: 'цели', as: 'цель' }, { id: 'hit', type: 'check', value: { expr: '1' }, versus: { expr: '0' } }] as Step[],
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
    const emit = { type: 'emit', event: 'шип', args: { жертва: { expr: '@носитель' } } } as unknown as Step;
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
  test('потомок повторил трату основы — предупреждение', () => {
    const system = withEffect('трата', { params: [WHO] as never, steps: [] });
    system.effects.основа = { label: 'Основа', activation: 'manual', params: [WHO] as never, cost: [{ type: 'emit', event: 'трата', args: { действующий: { expr: '@действующий' } } }] } as never;
    system.effects.потомок = { label: 'Потомок', extends: 'основа', cost: [{ type: 'emit', event: 'трата', args: { действующий: { expr: '@действующий' } } }] } as never;
    ok(texts(flattenSystem(system)).some(t => t.includes('стоимость зовёт «трата» дважды')), texts(flattenSystem(system)).join('\n'));
  });

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
