// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { writeFileSync } from 'node:fs';
import { SAMPLE_WORLDS } from '@vtt/engine/model/systems';
import type { System, Effect } from '@vtt/schema';
import { useWorld } from '../../../store/world.ts';
import { openAll } from '../../../testing/render-open.tsx';
import { within, stepCard } from '../../../testing/cards.ts';
import { EffectsTab } from './effects-tab.tsx';

const worldOf = (id: string) => SAMPLE_WORLDS.find(w => w.system.id === id)!;

const start = (systemId: string, without: string[]): Effect[] => {
  const world = structuredClone(worldOf(systemId));
  const goal = without.map(id => world.system.effects[id]!);
  for (const id of without) delete world.system.effects[id];
  useWorld.setState(state => ({
    ...state, system: world.system as System, compendium: world.compendium,
    activeEffectId: null, activeFieldTag: null, activeRecordKind: null, activeSheetKind: null,
  }));
  render(<EffectsTab />);
  openAll();
  return goal;
};

const textOf = (el: Element): string => (el.textContent ?? '').replace(/\s+/g, ' ').trim();

const nameStep = (card: HTMLElement, name: string): void => {
  const title = (card.querySelector('.step-fold, .card__head')?.textContent ?? '').replace(/^[▾▸]\s*/, '').split('·')[0]!.trim();
  within(card).click(/^имя в формулах/);
  const fresh = stepCard(new RegExp(`^${title} · `), card.parentElement ?? document);
  within(fresh).type(fresh.querySelector<HTMLElement>('.step-name input')!, name);
};

const marks = (card: HTMLElement, ...tags: string[]): void => {
  for (const tag of tags) {
    if (tag.startsWith('=')) {
      within(card).select('Метки', ':формула');
      within(card).type('Метки', tag.slice(1));
      within(card).click('добавить');
    } else within(card).select('Метки', tag);
  }
};

const built = (id: string): Effect | undefined => useWorld.getState().system.effects[id];

const dump = (what: unknown) => {
  if (process.env.BUILD_DUMP) writeFileSync(process.env.BUILD_DUMP, JSON.stringify(what, null, 1));
};

const fresh = (button: string, label: string, key: string, block: string, description: string) => {
  const ui = within();
  ui.click(button);
  ui.type(document.querySelector<HTMLInputElement>('input[placeholder="как зовётся эффект"]')!, label);
  ui.click('имя в формулах…');
  ui.type(document.querySelector<HTMLElement>('.step-name input')!, key);
  ui.select('Блок', block);
  ui.type('Описание', description);
  return ui;
};

const modifierCards = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('.card')]
  .filter(card => /^(Правит поле|Правка вызова)/.test(textOf(card.querySelector('.card__head') ?? card)));
const lastModifier = (): HTMLElement => modifierCards().at(-1)!;

const handlerAt = (n: number): HTMLElement => stepCard(new RegExp(`^Подписка №${n}`)).parentElement!;
const handlerHead = (n: number): HTMLElement => stepCard(new RegExp(`^Подписка №${n}`));

const valueModifier = (target: string, op: string, value: string, stacking: string) => {
  within().click('+ правит поле');
  const card = lastModifier;
  within(card()).select('Что правим', target);
  within(card()).select('Как', op);
  within(card()).formula('На сколько', value);
  within(card()).select('Если таких несколько', stacking);
};

const presetDefault = (goal: Effect, ...paths: string[][]): Effect => {
  const copy = structuredClone(goal) as unknown as Record<string, unknown>;
  for (const path of paths) {
    let at = copy as Record<string, unknown>;
    for (const key of path.slice(0, -1)) at = at[key] as Record<string, unknown>;
    delete at[path.at(-1)!];
  }
  return copy as unknown as Effect;
};

const lifetime = (kind: string, reapply?: string) => {
  const ui = within();
  ui.select('Сколько висит', kind);
  if (reapply) ui.select('Если наложить второй раз', reapply);
};

describe('эффекты D&D собираются в конструкторе руками (покрытие возможностей)', () => {
  beforeEach(() => { try { localStorage.clear(); } catch { return; } });
  afterEach(() => { cleanup(); });

  it('D&D «Доспех мага» (mage_armored): до конца сцены, правит поле «задать» с наибольшим', { timeout: 60000 }, () => {
    const [goal] = start('dnd5e', ['mage_armored']);
    fresh('+ висит и правит', goal!.label!, 'mage_armored', 'Состояния', goal!.description!);
    lifetime('scene', 'refresh');
    valueModifier('ac_base', 'set', '13', 'max');
    dump({ got: built('mage_armored'), goal });
    expect(built('mage_armored')).toEqual(goal);
  });

  it('D&D «В рывке» (dashing): на 1 ход, спадает в конце хода, умножить; умолч: duration.ends = "turn-end"', { timeout: 60000 }, () => {
    const [goal] = start('dnd5e', ['dashing']);
    const ui = fresh('+ висит и правит', goal!.label!, 'dashing', 'Состояния', goal!.description!);
    lifetime('turns', 'refresh');
    ui.type('Сколько', '1');
    ui.select('Спадает', 'turn-end');
    valueModifier('speed', 'mul', '2', 'sum');
    dump({ got: built('dashing'), goal });
    expect(built('dashing')).toEqual(presetDefault(goal!, ['duration', 'ends']));
  });

  it('D&D «Каменная кожа» (stoneskin): правка вызова урона — кроме меток, «где у метки»', { timeout: 60000 }, () => {
    const [goal] = start('dnd5e', ['stoneskin']);
    fresh('+ висит и правит', goal!.label!, 'stoneskin', 'Состояния', goal!.description!);
    lifetime('permanent', 'refresh');
    within().click('+ правка вызова');
    const card = lastModifier;
    within(card()).select('Чей вызов', 'damage');
    within(card()).formula('На сколько', '0.5');
    within(card()).select('Если таких несколько', 'max');
    within(card()).select('Кроме меток', 'магический');
    within(card()).select('Где у метки', 'damage_types\u0000nature');
    within(within(card()).field('Где у метки')).select(within(card()).field('Где у метки').querySelectorAll('select')[1] as HTMLElement, 'физический');
    within(card()).select('Кого касается', '@лист == @носитель');
    dump({ got: built('stoneskin'), goal });
    expect(built('stoneskin')).toEqual(goal);
  });

  it('D&D «Что доходит до меня» (taken_rule): 13 правок вызова урона по меткам', { timeout: 120000 }, () => {
    const [goal] = start('dnd5e', ['taken_rule']);
    fresh('+ висит и правит', goal!.label!, 'taken_rule', 'Общие правила', goal!.description!);
    for (const m of goal!.modifiers ?? []) {
      const one = m as { anyTags: string[]; value: { expr: string } };
      within().click('+ правка вызова');
      const card = lastModifier;
      within(card()).select('Чей вызов', 'damage');
      within(card()).formula('На сколько', one.value.expr);
      within(card()).select('По меткам', one.anyTags[0]!);
      within(card()).select('Кого касается', '@лист == @носитель');
    }
    dump({ got: built('taken_rule'), goal });
    expect(built('taken_rule')).toEqual(goal);
  });

  it('D&D «Недееспособен» (incapacitated): при наложении снимает концентрацию; обход: пустые modifiers снимаются только добавлением и удалением правки', { timeout: 60000 }, () => {
    const [goal] = start('dnd5e', ['incapacitated']);
    const ui = fresh('+ висит и правит', goal!.label!, 'incapacitated', 'Состояния', goal!.description!);
    lifetime('permanent', 'refresh');
    ui.click('+ правит поле');
    within(lastModifier()).click('Удалить');
    within(lastModifier()).click('точно убрать');
    ui.click('+ при наложении');
    ui.click('+ изменение');
    let card = stepCard(/^1 · /);
    within(card).click('состояние');
    card = stepCard(/^1 · /);
    within(card).select('Что делаем', 'remove');
    within(card).select('Какое', 'concentration');
    within(card).formula('С кого', '@носитель');
    dump({ got: built('incapacitated'), goal });
    expect(built('incapacitated')).toEqual(goal);
  });

  it('D&D «Парализован» (paralyzed): правки броска, поле, выдача, вход-память, подписка на конец хода; умолч: on[0].steps[1].continueOn = "success"', { timeout: 90000 }, () => {
    const [goal] = start('dnd5e', ['paralyzed']);
    const ui = fresh('+ висит и правит', goal!.label!, 'paralyzed', 'Состояния', goal!.description!);
    lifetime('permanent', 'refresh');
    ui.click('+ что даёт');
    within(ui.field('Что даёт')).select(ui.field('Что даёт').querySelector('select') as HTMLElement, 'incapacitated');

    const rollEdit = (tags: string[], edit: string, holder: string) => {
      within().click('+ правка вызова');
      const card = lastModifier;
      for (const tag of tags) within(card()).select('С метками', tag);
      within(card()).select('Какая правка', edit);
      within(card()).select('Кого касается', holder);
    };
    rollEdit(['атака'], 'advantage', '@против == @носитель');
    rollEdit(['спасбросок', 'сила'], 'auto_fail', '@бросающий == @носитель');
    rollEdit(['спасбросок', 'ловкость'], 'auto_fail', '@бросающий == @носитель');
    valueModifier('speed', 'set', '0', 'override');

    ui.click('+ вход');
    ui.type(ui.cell('Название', 0), 'Запомненное число');
    if (ui.has('ещё')) ui.click('ещё');
    ui.type(ui.cell('Имя в формулах', 0), 'запомнено');
    ui.select(ui.cell('Если не передали', 0), 'empty');

    ui.click('+ когда');
    within(handlerHead(1)).select('Что случилось', 'moment');
    within(handlerHead(1)).select('Когда', 'turn-end');
    within(handlerHead(1)).select('Кого касается', '@ходит == @носитель');
    within(handlerHead(1)).select('Ещё условие', 'формулой…');
    within(handlerHead(1)).formula('Условие', 'или(@запомнено, 0) > 0');

    within(handlerAt(1)).click('+ проверка');
    let card = stepCard(/^1 · /, handlerAt(1));
    within(card).formula('Проверка', 'кинуть(@lead_die) + @носитель.abilities.мудрость.save >= @запомнено');
    card = stepCard(/^1 · /, handlerAt(1));
    marks(card, 'спасбросок', 'мудрость');
    card = stepCard(/^1 · /, handlerAt(1));
    within(card).select('Шаги ниже идут при', 'success');
    nameStep(stepCard(/^1 · /, handlerAt(1)), 'save');

    within(handlerAt(1)).click('+ изменение');
    card = stepCard(/^2 · /, handlerAt(1));
    within(card).click('состояние');
    card = stepCard(/^2 · /, handlerAt(1));
    within(card).select('Что делаем', 'remove');
    within(card).select('Какое', 'paralyzed');
    within(card).formula('С кого', '@носитель');

    dump({ got: built('paralyzed'), goal });
    expect(built('paralyzed')).toEqual(presetDefault(goal!, ['on', '0', 'steps', '1', 'continueOn']));
  });

  it('D&D «Кость вдохновения наготове» (bardic_ready): на 1 срабатывание, «увидев кости» — прибавить кость', { timeout: 60000 }, () => {
    const [goal] = start('dnd5e', ['bardic_ready']);
    const ui = fresh('+ срабатывает сам', goal!.label!, 'bardic_ready', 'Реакции', goal!.description!);
    lifetime('uses');
    within(handlerHead(1)).select('Что случилось', 'seen');
    within(handlerHead(1)).select('Кого касается', '@бросающий == @носитель');
    within(handlerHead(1)).select('Решение', 'ask');
    within(handlerAt(1)).click('+ прибавить');
    const card = stepCard(/^1 · /, handlerAt(1));
    within(card).formula('Сколько', "кинуть('1к6')");
    void ui;
    dump({ got: built('bardic_ready'), goal });
    expect(built('bardic_ready')).toEqual(goal);
  });

  it('D&D «Вдохновение» (inspire): «увидев кости», цена подписки — трата поля, докинуть и оставить лучшую', { timeout: 60000 }, () => {
    const [goal] = start('dnd5e', ['inspire']);
    fresh('+ срабатывает сам', goal!.label!, 'inspire', 'Реакции', goal!.description!);
    within(handlerHead(1)).select('Что случилось', 'seen');
    within(handlerHead(1)).select('Кого касается', '@бросающий == @носитель');
    within(handlerHead(1)).select('Решение', 'ask');

    within(handlerAt(1)).click('+ изменение');
    let card = stepCard(/^1 · /, handlerAt(1));
    within(card).click('вызов');
    card = stepCard(/^1 · /, handlerAt(1));
    within(card).select('Какой эффект', 'spend');
    const args = (goal!.on![0]!.cost![0] as { args: Record<string, { expr: string }> }).args;
    const label: Record<string, string> = { what: 'Что тратим', amount: 'Сколько', note: 'Если не хватает', лист: 'Лист', источник: 'Источник' };
    for (const [key, value] of Object.entries(args)) {
      card = stepCard(/^1 · /, handlerAt(1));
      within(card).formula(within(card).arg(label[key]!), value.expr);
    }
    within(stepCard(/^1 · /, handlerAt(1))).click('цена');

    within(handlerAt(1)).click('+ докинуть');
    card = stepCard(/^2 · /, handlerAt(1));
    within(card).select('Оставить', 'best');
    dump({ got: built('inspire'), goal });
    expect(built('inspire')).toEqual(goal);
  });

  it('D&D «Щит» (shield): «до» всего с меткой «атака», цена реакцией и ячейкой, вешает состояние на себя', { timeout: 60000 }, () => {
    const [goal] = start('dnd5e', ['shield']);
    const ui = fresh('+ срабатывает сам', goal!.label!, 'shield', 'Реакции', goal!.description!);
    within(handlerHead(1)).select('Что именно', 'атака');
    within(handlerHead(1)).select('Когда именно', 'before');
    within(handlerHead(1)).select('Кого касается', '@цель == @носитель');
    within(handlerHead(1)).select('Ещё условие', 'формулой…');
    within(handlerHead(1)).formula('Условие', '@hit.success');
    within(handlerHead(1)).select('Решение', 'ask');

    ui.select(handlerAt(1).querySelector<HTMLElement>('.add-cost select')!, 'cost_reaction');
    let card = stepCard(/^1 · /, handlerAt(1));
    within(card).formula(within(card).arg('Лист'), '@носитель');
    within(card).formula(within(card).arg('Источник'), '@носитель');
    within(handlerAt(1)).click('+ изменение');
    card = stepCard(/^2 · /, handlerAt(1));
    within(card).click('вызов');
    card = stepCard(/^2 · /, handlerAt(1));
    within(card).select('Какой эффект', 'spell_slot');
    for (const name of within(card).args()) {
      within(card).formula(within(card).arg(name), name === 'Лист' || name === 'Источник' ? '@носитель' : '1');
    }
    within(stepCard(/^2 · /, handlerAt(1))).click('цена');

    within(handlerAt(1)).click('+ изменение');
    card = stepCard(/^3 · /, handlerAt(1));
    within(card).click('состояние');
    card = stepCard(/^3 · /, handlerAt(1));
    within(card).select('Какое', 'shield_up');
    within(card).formula('На кого', '@носитель');
    dump({ got: built('shield'), goal });
    expect(built('shield')).toEqual(goal);
  });

  it('D&D «Заклинание: спасбросок или состояние» (spell_condition): на основе, выбор из таблицы как метка, «запомнит»', { timeout: 90000 }, () => {
    const [goal] = start('dnd5e', ['spell_condition']);
    const ui = fresh('+ кнопкой', goal!.label!, 'spell_condition', 'Заклинания', goal!.description!);
    ui.select('На основе', 'spell');
    within(ui.cell('Название', 0).parentElement!).click('×');
    ui.click('+ вход');
    ui.type(ui.cell('Название', 1), 'Чем спасаются');
    ui.select(ui.cell('Тип', 1), 'choice');
    ui.select(ui.cell('Из таблицы', 1), 'abilities');
    if (ui.has('ещё')) ui.click('ещё');
    ui.type(ui.cell('Имя в формулах', 1), 'save_by');
    ui.click('+ вход');
    ui.type(ui.cell('Название', 2), 'Состояние');
    ui.select(ui.cell('Тип', 2), 'effect');
    ui.type(ui.cell('Имя в формулах', 2), 'status');

    ui.click('+ проверка');
    const at = (n: number) => stepCard(new RegExp(`^${n} · `));
    within(at(2)).formula('Проверка', 'кинуть(@lead_die) + @цель.save_by.save >= @действующий.spell_dc');
    within(at(2)).formula('Бросает', '@цель');
    within(at(2)).formula('Против кого', '@действующий');
    marks(at(2), 'спасбросок', '=@save_by');
    within(at(2)).select('Шаги ниже идут при', 'fail');
    nameStep(at(2), 'save');

    ui.click('+ изменение');
    within(at(3)).click('состояние');
    within(at(3)).select('Какое', ':вход:status');
    within(at(3)).formula('На кого', '@цель');
    within(at(3)).formula('Запомнит: Запомненное число', '@действующий.spell_dc');
    within(at(3)).formula('Запомнит: Кто наложил', '@действующий');
    dump({ got: built('spell_condition'), goal });
    expect(built('spell_condition')).toEqual(goal);
  });

  it('D&D «Не замечает» (hidden): срок 1 ход, спадает в начале хода листа из входа, две правки броска по двум листам', { timeout: 60000 }, () => {
    const [goal] = start('dnd5e', ['hidden']);
    const ui = fresh('+ висит и правит', goal!.label!, 'hidden', 'Состояния', goal!.description!);
    ui.click('+ вход');
    ui.type(ui.cell('Название', 0), 'Кого не замечает');
    ui.select(ui.cell('Тип', 0), 'sheet');
    if (ui.has('ещё')) ui.click('ещё');
    ui.type(ui.cell('Имя в формулах', 0), 'кого');
    lifetime('turns', 'refresh');
    ui.type('Сколько', '1');
    ui.select('Спадает', 'turn-start');
    ui.select('Чьи ходы считать', 'кого');

    const rollEdit = (edit: string, when: string) => {
      within().click('+ правка вызова');
      const card = lastModifier;
      within(card()).select('С метками', 'атака');
      within(card()).select('Какая правка', edit);
      within(card()).select('Ещё условие', 'формулой…');
      within(card()).formula('Условие', when);
    };
    rollEdit('advantage', 'все(@против == @носитель, @бросающий == @кого)');
    rollEdit('disadvantage', 'все(@бросающий == @носитель, @против == @кого)');
    dump({ got: built('hidden'), goal });
    expect(built('hidden')).toEqual(goal);
  });

  it('D&D «Засада» (hide): один бросок Скрытности выше «Для каждого из», проверка против пассивной внимательности каждой цели, «Не замечает» с входом', { timeout: 90000 }, () => {
    const [goal] = start('dnd5e', ['hide']);
    const ui = fresh('+ кнопкой', goal!.label!, 'hide', 'Действия в бою', goal!.description!);
    ui.select(document.querySelector<HTMLElement>('.add-cost select')!, 'cost_action');
    let card = stepCard(/^1 · /);
    within(card).formula(within(card).arg('Лист'), '@действующий');
    within(card).formula(within(card).arg('Источник'), '@действующий');

    ui.click('+ число');
    card = stepCard(/^3 · /);
    within(card).formula('Бросает', '@действующий');
    card = stepCard(/^3 · /);
    within(card).formula('Сколько', 'кинуть(@lead_die) + @действующий.skills.скрытность.total');
    nameStep(stepCard(/^3 · /), 'sneak_бросок');
    within(stepCard(/^3 · /)).click('↑');

    ui.click('+ проверка');
    card = stepCard(/^4 · /);
    within(card).formula('Проверка', '@sneak_бросок >= @цель.passive_perception');
    nameStep(stepCard(/^4 · /), 'sneak');
    marks(stepCard(/^2 · /), 'проверка', 'ловкость', 'скрытность');

    ui.click('+ изменение');
    within(stepCard(/^5 · /)).click('состояние');
    card = stepCard(/^5 · /);
    within(card).select('Какое', 'hidden');
    within(stepCard(/^5 · /)).formula('На кого', '@цель');
    within(stepCard(/^5 · /)).formula('Запомнит: Кого не замечает', '@действующий');
    dump({ got: built('hide'), goal });
    expect(built('hide')).toEqual(goal);
  });

  it('D&D «Засада» (hide): у броска выше «Для каждого из» «Против кого» пусто — «ни против кого — бросок один на все цели»', { timeout: 30000 }, () => {
    const world = structuredClone(worldOf('dnd5e'));
    useWorld.setState(state => ({
      ...state, system: world.system as System, compendium: world.compendium,
      activeEffectId: 'hide', activeFieldTag: null, activeRecordKind: null, activeSheetKind: null,
    }));
    render(<EffectsTab />);
    openAll();
    const roll = stepCard(/^2 · Число/);
    const field = within(roll).field('Против кого');
    const shown = field.querySelector<HTMLElement>('[placeholder]');
    expect(shown?.getAttribute('placeholder')).toBe('ни против кого — бросок один на все цели');
    expect((shown as HTMLInputElement | null)?.value ?? shown?.textContent ?? '').toBe('');
    expect(useWorld.getState().system.effects.hide!.steps![0]).not.toHaveProperty('against');
  });
});
