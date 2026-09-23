import { group, test, eq, ok } from './harness.ts';
import { lintSystem, lintStep, errorsOf } from '../src/model/lint.ts';
import { referencesOf, listenerOf } from '../src/model/references.ts';
import { PLAYABLE_SYSTEMS as SAMPLE_SYSTEMS, PLAYABLE_WORLDS as SAMPLE_WORLDS } from '../src/model/systems.ts';
import type { System, Effect, Step } from '../src/model/types.ts';

const bare = (): System => ({
  id: 'x', name: 'x', fields: [{ tag: 'hp', label: 'Хиты', value: { kind: 'stored', type: 'number', default: 10 } }],
  effects: {}, constants: { d20: { kind: 'die', dice: [{ count: 1, sides: 20 }] } },
}) as unknown as System;

const withEffect = (id: string, effect: Partial<Effect>): System => {
  const system = bare();
  system.effects[id] = { label: id, activation: 'manual', steps: [], ...effect } as Effect;
  return system;
};

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
  test('поле, которого нет — с подсказкой завести его на «Листе»', () => {
    const system = withEffect('hit', { steps: [{ type: 'apply', target: { tag: 'нет_такого' }, value: { const: 1 } }] as Step[] });
    const [problem] = errorsOf(lintSystem(system));
    ok(problem?.text.includes('«нет_такого»'), problem?.text);
    ok(problem?.text.includes('Лист'), problem?.text);
    eq(problem?.fix?.tag, 'нет_такого');
    eq(problem?.where.effect, 'hit');
    eq(problem?.where.step, 0);
  });

  test('слушатель эффекта, которого нет', () => {
    const system = withEffect('t', { activation: 'triggered', trigger: { on: 'event:нету' } });
    ok(errorTexts(system).some(t => t.includes('общего эффекта «нету»')), errorTexts(system).join('|'));
  });

  test('слушатель эффекта, которого нет', () => {
    const system = withEffect('t', { activation: 'triggered', trigger: { on: 'нет_эффекта' } });
    ok(errorTexts(system).some(t => t.includes('эффекта «нет_эффекта»')), errorTexts(system).join('|'));
  });

  test('привязка типа записи к несуществующему эффекту', () => {
    const system = bare();
    system.records = { weapon: { kind: 'item', label: 'Оружие', bindings: [{ label: 'Удар', effect: 'нету', args: {} }] } } as never;
    const [problem] = errorsOf(lintSystem(system));
    ok(problem?.text.includes('эффекта «нету»'), problem?.text);
    eq(problem?.where.tab, 'records');
    eq(problem?.where.kind, 'weapon');
  });

  test('кость инициативы, таблица поля, правило комнаты, правка броска', () => {
    const system = bare();
    system.initiative = { die: { constant: 'нет_кости' }, tags: ['нет_броска'] } as never;
    system.fields.push({ tag: 'lvl', label: 'Ур', value: { kind: 'table', table: 'нет_таблицы', arg: '#hp' } } as never);
    system.room_rules = ['нет_правила'];
    system.effects.buff = { label: 'y', activation: 'passive', modifiers: [{ kind: 'roll', target: 'roll:any', edit: 'нет_правки' }] } as never;
    const found = errorTexts(system).join('\n');
    for (const key of ['кости «нет_кости»', 'метки броска «нет_броска»', 'таблицы «нет_таблицы»', 'эффекта «нет_правила»', 'правки броска «нет_правки»']) {
      ok(found.includes(key), `нет «${key}» в:\n${found}`);
    }
  });

  test('ссылка на шаг выше по цепочке — законна, ниже — нет', () => {
    const okSystem = withEffect('e', {
      steps: [{ id: 'roll', type: 'amount', source: 'roll', dice: { constant: 'd20' } }, { type: 'apply', target: { tag: 'hp' }, value: { ref: 'roll' } }] as Step[],
    });
    eq(errorTexts(okSystem).join(''), '');
    const badSystem = withEffect('e', {
      steps: [{ type: 'apply', target: { tag: 'hp' }, value: { ref: 'roll' } }, { id: 'roll', type: 'amount', source: 'roll', dice: { constant: 'd20' } }] as Step[],
    });
    ok(errorTexts(badSystem).some(t => t.includes('«roll» выше по цепочке нет')), errorTexts(badSystem).join('|'));
  });

  test('условие «только если» ссылается на шаг выше', () => {
    const system = withEffect('e', {
      steps: [{ type: 'apply', target: { tag: 'hp' }, value: { const: 1 }, when: { ref: 'нет.success' } }] as Step[],
    });
    ok(errorTexts(system).some(t => t.includes('«нет» выше по цепочке нет')), errorTexts(system).join('|'));
  });

  test('потребность, которую эффект не объявил', () => {
    const system = withEffect('e', { params: [], steps: [{ type: 'apply', target: { tag: 'hp' }, value: { param: 'dmg' } }] as Step[] });
    ok(errorTexts(system).some(t => t.includes('потребность «dmg» эффектом не объявлена')), errorTexts(system).join('|'));
  });

  test('условие срабатывания смотрит на шаг слушаемого эффекта', () => {
    const system = withEffect('strike', { steps: [{ id: 'hit', type: 'threshold', roll: { die: { constant: 'd20' } }, versus: { const: 10 } }] as Step[] });
    system.effects.thorns = { label: 'Шипы', activation: 'triggered', trigger: { on: 'strike', condition: { ref: 'hit.success' } }, steps: [] } as never;
    eq(errorTexts(system).join(''), '');
    system.effects.thorns = { label: 'Шипы', activation: 'triggered', trigger: { on: 'strike', condition: { ref: 'miss.success' } }, steps: [] } as never;
    ok(errorTexts(system).some(t => t.includes('нет шага «miss»')), errorTexts(system).join('|'));
  });

  test('выведенные мишени правок броска (с двоеточием) — не ссылки на виды бросков', () => {
    const system = withEffect('buff', { activation: 'passive', modifiers: [{ kind: 'roll', target: 'roll:any', edit: 'adv' }] });
    system.roll_edits = { adv: { label: 'Преимущество', ops: [] } } as never;
    eq(errorTexts(system).join(''), '');
  });

  test('в шагах вызываемого эффекта «event.amount» — не висячая ссылка', () => {
    const system = bare();
    system.effects.damage = { label: 'Урон', params: [{ key: 'сколько', label: 'Сколько', kind: 'number', role: 'amount' }], steps: [{ type: 'apply', target: { tag: 'hp' }, direction: 'subtract', value: { ref: 'event.amount' } }] } as never;
    eq(errorTexts(system).join(''), '');
  });
});

group('линт: чей лист в шагах отправителя', () => {
  test('@получатель в шагах отправителя — ошибка с подсказкой, как написать', () => {
    const system = withEffect('a', { self: [{ type: 'apply', target: { tag: 'hp' }, direction: 'subtract', value: { expr: '@получатель.hp' } }] as Step[] });
    ok(errorTexts(system).some(text => text.includes('в шагах отправителя получателя нет') && text.includes('@отправитель.hp')), errorTexts(system).join('\n'));
  });

  test('@получатель в шагах получателя — законно', () => {
    const system = withEffect('a', { steps: [{ type: 'apply', target: { tag: 'hp' }, direction: 'subtract', value: { expr: '@получатель.hp' } }] as Step[] });
    eq(errorTexts(system).filter(text => text.includes('получателя нет')).length, 0);
  });
});

group('линт: слушатели, круги, потребности', () => {
  test('срабатывающий сам эффект без слушателя — ошибка человеческим текстом', () => {
    const system = withEffect('t', { activation: 'triggered', trigger: { on: '' } });
    const [problem] = errorsOf(lintSystem(system));
    ok(problem?.text.includes('не сказано на что'), problem?.text);
    eq(problem?.where.part, 'trigger');
    const noTrigger = withEffect('r', { activation: 'reaction' });
    ok(errorTexts(noTrigger).some(t => t.includes('не сказано на что')));
  });

  test('вызовы по кругу: эффект зовёт тот, на который сам и срабатывает', () => {
    const system = withEffect('loop', {
      activation: 'triggered', trigger: { on: 'event:damage' },
      steps: [{ type: 'emit', event: 'damage' }] as Step[],
    });
    system.effects.damage = { label: 'Урон', params: [{ key: 'сколько', label: 'Сколько', kind: 'number', role: 'amount' }], steps: [] } as never;
    const found = errorTexts(system).find(t => t.includes('по кругу'));
    ok(found, errorTexts(system).join('|'));
    ok(found!.includes('«loop»') && found!.includes('«Урон»'), found);
  });

  test('без круга — тишина', () => {
    const system = withEffect('a', { steps: [{ type: 'emit', event: 'damage' }] as Step[] });
    system.effects.damage = { label: 'Урон', params: [{ key: 'сколько', label: 'Сколько', kind: 'number', role: 'amount' }], steps: [{ type: 'apply', target: { tag: 'hp' }, direction: 'subtract', value: { ref: 'event.amount' } }] } as never;
    ok(!texts(system).some(t => t.includes('по кругу')));
  });

  test('эффект зовут, а он ничего не делает — предупреждение', () => {
    const system = withEffect('a', { steps: [{ type: 'emit', event: 'ping' }] as Step[] });
    system.effects.ping = { label: 'Пинг', tags: ['сигнал'] } as never;
    ok(texts(system).some(t => t.startsWith('warn') && t.includes('«Пинг» вызывают, но он ничего не делает')), texts(system).join('|'));
    eq(errorTexts(system).length, 0);
  });

  test('привязка не закрывает потребность эффекта', () => {
    const system = withEffect('strike', { params: [{ key: 'dice', label: 'Кость урона' }], steps: [] });
    system.records = { weapon: { kind: 'item', label: 'Оружие', props: [], bindings: [{ label: 'Удар', effect: 'strike', args: {} }] } } as never;
    const [problem] = errorsOf(lintSystem(system));
    ok(problem?.text.includes('не заполняет потребность «Кость урона»'), problem?.text);
    eq(problem?.where.binding, 0);
  });

  test('потребность, которую спрашивают за столом, привязка закрывать не обязана', () => {
    const system = withEffect('strike', { params: [{ key: 'дистанция', label: 'Дистанция', ask: { by: 'actor' } }], steps: [] });
    system.records = { weapon: { kind: 'item', label: 'Оружие', props: [], bindings: [{ label: 'Удар', effect: 'strike', args: {} }] } } as never;
    eq(errorTexts(system).join(''), '');
  });

  test('привязка берёт свойство, которого у этого типа нет', () => {
    const system = withEffect('strike', { params: [{ key: 'dice' }], steps: [] });
    system.records = {
      weapon: { kind: 'item', label: 'Оружие', props: [{ key: 'dmg' }], bindings: [{ label: 'Удар', effect: 'strike', args: { dice: { prop: 'other' } } }] },
      armor: { kind: 'item', label: 'Броня', props: [{ key: 'other' }] },
    } as never;
    ok(errorTexts(system).some(t => t.includes('«other» не объявлено у этого типа')), errorTexts(system).join('|'));
  });

  test('активируемый эффект, который никто не даёт — предупреждение, не ошибка', () => {
    const system = withEffect('lonely', { steps: [] });
    const withBook = lintSystem(system, { items: [], actions: [] } as never)
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
    const step = { type: 'apply', target: { tag: 'hp' }, value: { expr: '#n + 1' } } as unknown as Step;
    eq(lintStep(step, bare(), effect, [{ id: 'n', type: 'amount' }]), null);
    const problem = lintStep(step, bare(), effect, []);
    eq(problem?.fix?.tag, 'n');
  });
});

group('ссылки и слушатели', () => {
  test('referencesOf образца видит привязки, инициативу и правила комнаты', () => {
    const refs = referencesOf(SAMPLE_SYSTEMS[0] as System);
    ok(refs.some(r => r.kind === 'effect' && r.from.tab === 'records'));
    ok(refs.some(r => r.kind === 'constant' && r.from.section === 'initiative'));
    ok(refs.some(r => r.kind === 'effect' && r.from.section === 'room_rules'));
  });

  test('listenerOf разбирает три вида слушателя и пустоту', () => {
    eq(listenerOf('*').kind, 'any');
    eq(listenerOf('event:damage').key, 'damage');
    eq(listenerOf('strike').kind, 'effect');
    eq(listenerOf('').kind, 'empty');
    eq(listenerOf(undefined).kind, 'empty');
  });
});

group('линт: моменты хода', () => {
  test('известный момент — законный слушатель', () => {
    const system = withEffect('яд', { activation: 'triggered', trigger: { on: 'moment:turn-start' }, steps: [] });
    eq(errorsOf(lintSystem(system)).map(p => p.text).join(''), '');
  });

  test('выдуманный момент назван, и список известных показан', () => {
    const system = withEffect('яд', { activation: 'triggered', trigger: { on: 'moment:когда-нибудь' }, steps: [] });
    const [problem] = errorsOf(lintSystem(system));
    ok(problem?.text.includes('«когда-нибудь»'), problem?.text);
    ok(problem?.text.includes('turn-start'), problem?.text);
  });
});
