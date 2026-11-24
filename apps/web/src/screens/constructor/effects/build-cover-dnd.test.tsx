// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import { writeFileSync } from 'node:fs';
import { SAMPLE_WORLDS } from '@vtt/engine/samples';
import type { System, Effect } from '@vtt/schema';
import { useWorld } from '../../../store/world.ts';
import { openAll } from '../../../testing/render-open.tsx';
import { within, askWith, stepCard, block, blocks, headOf, addArm, addToArm, callIf, outcomeIf, armWord, dragParamBefore } from '../../../testing/cards.ts';
import { EffectsTab } from './effects-tab.tsx';
import { compile, printFormula } from '@vtt/engine';
import { folded } from '../../../testing/folded.ts';

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
  const own = card.querySelector<HTMLElement>('.number-line input.input');
  if (own) { within(card).type(own, name); return; }
  within(card).click(/^(имя в формулах|результат)/);
  const fresh = stepCard(new RegExp(`^${title} · `), card.parentElement ?? document);
  within(fresh).type(fresh.querySelector<HTMLElement>('.step-name input')!, name);
};

const savingThrow = (root: HTMLElement, at: number, args: readonly (readonly [string, string])[], plus = '+ изменение'): void => {
  within(root).click(plus);
  const made = () => stepCard(new RegExp(`^${at} · `), root);
  within(made()).click('вызов');
  within(made()).select('Какой эффект', 'saving_throw');
  for (const [name, text] of args) within(made()).formula(within(made()).arg(name), text);
  nameStep(made(), 'спас');
};

const marks = (card: HTMLElement, ...tags: string[]): void => {
  for (const tag of tags) {
    if (tag.startsWith('=')) {
      within(card).select('Метки', ':formula');
      within(card).type('Метки', tag.slice(1));
      within(card).click('добавить');
    } else within(card).select('Метки', tag);
  }
};

const built = (id: string): Effect | undefined => folded(useWorld.getState().system.effects[id]);

const printed = (effect: Effect | undefined): unknown => JSON.parse(JSON.stringify(effect), (key, value) => (key === 'expr' && typeof value === 'string' ? printFormula(compile(value).ast) : value));

const dump = (what: unknown) => {
  if (process.env.BUILD_DUMP) writeFileSync(process.env.BUILD_DUMP, JSON.stringify(what, null, 1));
};

const fresh = (button: string | string[], label: string, key: string, block: string | undefined, description: string, note?: string) => {
  const ui = within();
  for (const one of [button].flat()) ui.click(one);
  ui.type(document.querySelector<HTMLInputElement>('input[placeholder="как зовётся эффект"]')!, label);
  if (!ui.has('имя в формулах…') && ui.has('свойства')) ui.click('свойства');
  ui.click('имя в формулах…');
  ui.type(document.querySelector<HTMLElement>('.step-name input')!, key);
  if (block) ui.select('Папка', block);
  ui.type('Описание', description);
  if (note) ui.type('Заметка автора', note);
  return ui;
};

const modifierCards = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('.card')]
  .filter(card => /^(Правит поле|Правка вызова)/.test(textOf(card.querySelector('.card__head') ?? card)));
const lastModifier = (): HTMLElement => modifierCards().at(-1)!;

const handlerAt = (n: number): HTMLElement => stepCard(new RegExp(`^Когда №${n}`)).parentElement!;
const handlerHead = (n: number): HTMLElement => stepCard(new RegExp(`^Когда №${n}`));

const valueModifier = (target: string, op: string, value: string) => {
  within().click('+ правит поле');
  const card = lastModifier;
  within(card()).select('Что правим', target);
  within(card()).select('Как', op);
  within(card()).formula('На сколько', value);
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
    fresh('+ висит', goal!.label!, 'mage_armored', 'sostoyaniya', goal!.description!);
    lifetime('scene', 'refresh');
    valueModifier('ac_base', 'set', '13');
    dump({ got: built('mage_armored'), goal });
    expect(built('mage_armored')).toEqual(folded(goal));
  });

  it('D&D «В рывке» (dashing): на 1 ход, спадает в конце хода, умножить; умолч: duration.ends = "turn-end"', { timeout: 60000 }, () => {
    const [goal] = start('dnd5e', ['dashing']);
    const ui = fresh('+ висит', goal!.label!, 'dashing', 'sostoyaniya', goal!.description!);
    lifetime('turns', 'refresh');
    ui.type('Сколько', '1');
    ui.select('Спадает', 'turn-end');
    valueModifier('speed', 'mul', '2');
    dump({ got: built('dashing'), goal });
    expect(built('dashing')).toEqual(folded(presetDefault(goal!, ['duration', 'ends'])));
  });

  it('D&D «Каменная кожа» (stoneskin): правка вызова урона — кроме меток, «где у метки»', { timeout: 60000 }, () => {
    const [goal] = start('dnd5e', ['stoneskin']);
    fresh('+ висит', goal!.label!, 'stoneskin', 'sostoyaniya', goal!.description!);
    lifetime('permanent', 'refresh');
    within().click('+ правка вызова');
    const card = lastModifier;
    within(card()).select('Чей вызов', 'damage');
    within(card()).formula('На сколько', '0.5');
    within(card()).select('Этап', 'soprotivlenie');
    within(card()).select('Кроме меток', 'magicheskiy');
    within(card()).select('Где у метки', 'damage_types\u0000nature');
    within(within(card()).field('Где у метки')).select(within(card()).field('Где у метки').querySelectorAll('[role="combobox"]')[1] as HTMLElement, 'fizicheskiy');
    within(card()).select('Кого касается', '@list == @holder');
    dump({ got: built('stoneskin'), goal });
    expect(built('stoneskin')).toEqual(folded(goal));
  });

  it('D&D «Что доходит до меня» (taken_rule): две правки вызова урона — строка типа урона по значению, сопротивление и уязвимость по этапам', { timeout: 120000 }, () => {
    const [goal] = start('dnd5e', ['taken_rule']);
    fresh('+ висит', goal!.label!, 'taken_rule', 'obschie_pravila', goal!.description!);
    for (const m of goal!.modifiers ?? []) {
      const one = m as { value: { expr: string }; stage: string };
      within().click('+ правка вызова');
      const card = lastModifier;
      within(card()).select('Чей вызов', 'damage');
      within(card()).formula('На сколько', one.value.expr);
      within(card()).select('Этап', one.stage);
      within(card()).select('Кого касается', '@list == @holder');
      within(card()).when('=не пусто(@holder.damage_types.[@damage_type].taken)');
    }
    dump({ got: built('taken_rule'), goal });
    expect(built('taken_rule')).toEqual(folded(goal));
  });

  it('D&D «Крит» (crit_double_rule): правка «кубики — умножить» по метке «крит», бросает носитель', { timeout: 60000 }, () => {
    const [goal] = start('dnd5e', ['crit_double_rule']);
    fresh('+ висит', goal!.label!, 'crit_double_rule', undefined, goal!.description!);
    lifetime('permanent');
    within().click('+ правка вызова');
    const card = lastModifier;
    within(card()).select('Чей вызов', 'roll');
    within(card()).select('Что правим', 'count');
    within(card()).select('Как', 'mul');
    within(card()).formula('На сколько', '2');
    within(card()).select('Какие броски', 'krit');
    within(card()).select('Кого касается', '@roller == @holder');
    dump({ got: built('crit_double_rule'), goal });
    expect(built('crit_double_rule')).toEqual(folded(goal));
  });

  it('D&D «Лежит» (prone): три правки броска — по нему вплотную с преимуществом, издали с помехой, свои атаки с помехой', { timeout: 90000 }, () => {
    const [goal] = start('dnd5e', ['prone']);
    fresh('+ висит', goal!.label!, 'prone', 'sostoyaniya', goal!.description!);
    lifetime('permanent', 'refresh');
    for (const m of goal!.modifiers ?? []) {
      const one = m as { tags?: string[]; notTags?: string[]; edit: string; if: { expr: string } };
      within().click('+ правка вызова');
      const card = lastModifier;
      for (const tag of one.tags ?? []) within(card()).select('Какие броски', tag);
      for (const tag of one.notTags ?? []) {
        within(card()).click('+ или / кроме');
        within(card()).select('Кроме', tag);
      }
      within(card()).select('Какое слово', one.edit);
      within(card()).when(`=${one.if.expr}`);
    }
    dump({ got: built('prone'), goal });
    expect(built('prone')).toEqual(folded(goal));
  });

  it('D&D «Скрытая атака» (sneak_attack): две подписки «после» атаки оружием, у каждой свой вопрос и плата «раз за ход», бросок урона с меткой крита', { timeout: 120000 }, () => {
    const [goal] = start('dnd5e', ['sneak_attack']);
    fresh('+ висит', goal!.label!, 'sneak_attack', 'umeniya_klassa', goal!.description!);
    lifetime('permanent');
    const rules = [
      '@попал и @holder.sneak_dice > 0 и ((не пусто(@свойства) и есть(@свойства, "fehtovalnoe")) или @дальность == "dalniy") и @преимущество и (не @desk.combat или @holder.turn.raz_za_hod.left >= 1)',
      '@попал и @holder.sneak_dice > 0 и ((не пусто(@свойства) и есть(@свойства, "fehtovalnoe")) или @дальность == "dalniy") и не @преимущество и не @помеха и (не @desk.combat или @holder.turn.raz_za_hod.left >= 1)',
    ];
    rules.forEach((rule, index) => {
      const n = index + 1;
      const at = () => handlerAt(n);
      within().click('+ когда');
      within(handlerHead(n)).select('Что именно', 'ataka_oruzhiem');
      within(handlerHead(n)).select('Когда именно', 'after');
      within(handlerHead(n)).select('Кого касается', '@deystvuyuschiy == @holder');
      within(handlerHead(n)).when(`=${rule}`);
      askWith(within(handlerHead(n)), { question: goal!.on![index]!.confirm!.question! });

      within().select(at().querySelector<HTMLElement>('.add-cost [role="combobox"]')!, 'cost_once');
      let card = stepCard(/^1 · /, at());
      within(card).formula(within(card).arg('Лист'), '@holder');
      within(card).formula(within(card).arg('Источник'), '@holder');

      within(at()).click('+ бросок');
      card = stepCard(/^2 · /, at());
      within(card).select('Кто бросает', '@holder');
      within(card).select('Что бросает', 'own-die');
      within(card).formula('Своя кость', "'1d6'");
      within(card).click('+ сколько раз');
      within(card).formula('Сколько раз', '@holder.sneak_dice');
      card = stepCard(/^2 · /, at());
      marks(card, 'uron', '=if(@krit, "krit", "")');
      nameStep(card, 'урон');

      within(at()).click('+ изменение');
      card = stepCard(/^3 · /, at());
      within(card).click('вызов');
      card = stepCard(/^3 · /, at());
      within(card).select('Какой эффект', 'damage');
      for (const [name, text] of [['Сколько урона', '@урон.total'], ['Лист', '@цель'], ['Источник', '@holder'], ['Тип урона', '@damage_type'], ['От крита', '@крит']] as const) {
        within(card).formula(within(card).arg(name), text);
      }
    });
    dump({ got: built('sneak_attack'), goal });
    expect(printed(built('sneak_attack'))).toEqual(printed(folded(goal)));
  });

  it('D&D «Магические стрелы» (spell_auto): цели по счёту с повторами, метка вызова «Урона», ветка по настройке стола', { timeout: 180000 }, () => {
    const [goal] = start('dnd5e', ['spell_auto']);
    const ui = fresh(['+ кнопкой', '+ для каждого из списка'], goal!.label!, 'spell_auto', 'zaklinaniya', goal!.description!);
    ui.select('Метки', 'volshebnaya_strela');
    const param = (row: number, label: string, kind: string, from?: string) => {
      if (row >= (built('spell_auto')!.params ?? []).length) ui.click('+ ещё одно');
      ui.type(ui.cell('Название', row), label);
      ui.select(ui.cell('Вид', row), kind);
      if (from) ui.select(ui.cell('Таблица', row), from);
    };
    param(2, 'Круг заклинания', 'number');
    param(3, 'Каким кругом', 'number');
    ui.select(ui.cell('Если не передали', 3), 'actor');
    ui.type(ui.cell('Подсказка за столом', 3), goal!.params![2]!.ask!.hint!);
    const bounds = ui.cell('Границы', 3).querySelectorAll<HTMLInputElement>('input');
    act(() => { fireEvent.change(bounds[0]!, { target: { value: '1' } }); });
    act(() => { fireEvent.change(ui.cell('Границы', 3).querySelectorAll<HTMLInputElement>('input')[1]!, { target: { value: '9' } }); });
    param(4, 'Кость урона', 'dice');
    param(5, 'Сколько стрел', 'number');
    param(6, 'Стрел за каждый круг выше', 'number');
    param(7, 'Прибавка к кости стрелы', 'number');
    param(8, 'Тип урона', 'choice', 'damage_types');
    dragParamBefore('Цели', 'Кость урона');
    ui.formula(ui.cell('Сколько целей', 3), '@сколько_стрел + (@каким_кругом - @круг_заклинания) * @стрел_за_каждый_круг_выше');
    ui.check('«Цели» — можно повторять');
    const damage = (card: () => HTMLElement, amount: string) => {
      within(card()).click('вызов');
      within(card()).select('Какой эффект', 'damage');
      for (const [name, text] of [['Сколько урона', amount], ['Источник урона', '"magicheskiy"'], ['Лист', '@цель'], ['Источник', '@кто_действует'], ['Тип урона', '@тип_урона']] as const) {
        within(card()).formula(within(card()).arg(name), text);
      }
      within(card()).select('Метки вызова', 'volshebnaya_strela');
    };
    ui.click('+ бросок');
    let card = stepCard(/^2 · /);
    within(card).select('Кто бросает', '');
    within(card).select('Что бросает', 'own-die');
    within(card).formula('Своя кость', '@кость_урона');
    within(card).click('+ прибавка');
    within(card).formula('Прибавка', '@прибавка_к_кости_стрелы');
    nameStep(stepCard(/^2 · /), 'общий бросок');
    within(stepCard(/^2 · /)).click('↑');

    ui.click('+ если');
    const flow = blocks().length - 1;
    within(headOf(block(flow))).when('=@desk.strely_odnim_broskom');
    addToArm(block(flow), 0, 'change');
    damage(() => stepCard(/^3 · /), '@общий_бросок.total');
    addArm(block(flow), '+ иначе');
    addToArm(block(flow), 1, 'roll');
    card = stepCard(/^4 · /);
    within(card).select('Кто бросает', '@deystvuyuschiy');
    within(card).select('Что бросает', 'own-die');
    within(card).formula('Своя кость', '@кость_урона');
    within(card).click('+ прибавка');
    within(card).formula('Прибавка', '@прибавка_к_кости_стрелы');
    marks(stepCard(/^4 · /), 'uron', 'zaklinanie');
    nameStep(stepCard(/^4 · /), 'стрела');
    addToArm(block(flow), 1, 'change');
    damage(() => stepCard(/^5 · /), '@стрела.total');
    ui.select(document.querySelector<HTMLElement>('.add-cost [role="combobox"]')!, 'cost_spell');
    card = stepCard(/^1 · /);
    for (const [name, text] of [['Лист', '@кто_действует'], ['Источник', '@кто_действует'], ['Круг заклинания', '@круг_заклинания'], ['Каким кругом', '@каким_кругом']] as const) {
      within(card).formula(within(card).arg(name), text);
    }
    dump({ got: built('spell_auto'), goal });
    expect(built('spell_auto')).toEqual(folded(goal));
  });

  it('D&D «Недееспособен» (incapacitated): при наложении снимает концентрацию; обход: пустые modifiers снимаются только добавлением и удалением правки', { timeout: 60000 }, () => {
    const [goal] = start('dnd5e', ['incapacitated']);
    const ui = fresh('+ висит', goal!.label!, 'incapacitated', 'sostoyaniya', goal!.description!);
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
    within(card).formula('С кого', '@holder');
    dump({ got: built('incapacitated'), goal });
    expect(built('incapacitated')).toEqual(folded(goal));
  });

  it('D&D «Парализован» (paralyzed): выдаёт «Беспомощен», вход-память, подписка на конец хода зовёт «Повторный спасбросок»', { timeout: 90000 }, () => {
    const [goal] = start('dnd5e', ['paralyzed']);
    const ui = fresh('+ висит', goal!.label!, 'paralyzed', 'sostoyaniya', goal!.description!);
    lifetime('permanent', 'refresh');
    ui.click('+ правит поле');
    within(lastModifier()).click('Удалить');
    within(lastModifier()).click('точно убрать');
    ui.click('+ что даёт');
    within(ui.field('Что даёт')).select(ui.field('Что даёт'), 'helpless');
    valueModifier('krit_vplotnuyu', 'set', '1');

    ui.click('+ вход');
    ui.type(ui.cell('Название', 0), 'Запомненное число');
    if (ui.has('ещё')) ui.click('ещё');
    ui.type(ui.cell('Имя в формулах', 0), 'запомнено');
    ui.select(ui.cell('Если не передали', 0), 'empty');

    ui.click('+ когда');
    within(handlerHead(1)).select('Что случилось', 'moment');
    within(handlerHead(1)).select('Когда', 'turn-end');
    within(handlerHead(1)).select('Кого касается', '@mover == @holder');
    within(handlerHead(1)).when('=(@zapomneno или 0) > 0');

    within(handlerAt(1)).click('+ изменение');
    const made = () => stepCard(/^1 · /, handlerAt(1));
    within(made()).click('вызов');
    within(made()).select('Какой эффект', 'repeat_save');
    within(made()).formula(within(made()).arg('Кто спасается'), '@holder');
    within(made()).formula(within(made()).arg('Чем спасается'), '"mudrost"');
    within(made()).formula(within(made()).arg('Сложность'), '@zapomneno');
    within(made()).select(within(made()).arg('Что снимается').querySelector<HTMLElement>('[role="combobox"]')!, 'paralyzed');

    dump({ got: built('paralyzed'), goal });
    expect(built('paralyzed')).toEqual(folded(goal));
  });

  it('D&D «Кость вдохновения наготове» (bardic_ready): вход-кость с умолчанием, на 1 срабатывание, «увидев кости» — прибавить кость из входа', { timeout: 60000 }, () => {
    const [goal] = start('dnd5e', ['bardic_ready']);
    const ui = fresh('+ висит', goal!.label!, 'bardic_ready', 'reakcii', goal!.description!, goal!.note);
    within().click('+ когда');
    ui.click('+ вход');
    ui.type(ui.cell('Название', 0), 'Кость вдохновения');
    ui.select(ui.cell('Вид', 0), 'dice');
    ui.select(ui.cell('Если не передали', 0), 'value');
    ui.type(ui.cell('Если не передали', 0), '1к6');
    if (ui.has('ещё')) ui.click('ещё');
    ui.type(ui.cell('Имя в формулах', 0), 'кость');
    lifetime('uses');
    within(handlerHead(1)).select('Что случилось', 'seen');
    within(handlerHead(1)).select('Кого касается', '@roller == @holder');
    within(handlerHead(1)).when('=@roller == @holder и (есть(@roll.tags, "ataka") или есть(@roll.tags, "spasbrosok") или есть(@roll.tags, "proverka"))');
    askWith(within(handlerHead(1)), { show: ['roll'] });
    within(handlerAt(1)).click('+ прибавить');
    const card = stepCard(/^1 · /, handlerAt(1));
    within(card).select('Сколько', 'expr:@kost');
    dump({ got: built('bardic_ready'), goal });
    expect(built('bardic_ready')).toEqual(folded(goal));
  });

  it('D&D «Героическое вдохновение» (inspire): «увидев кости», цена подписки — трата поля, перебросить одну меньшую кость; смена режима снимает порог', { timeout: 60000 }, () => {
    const [goal] = start('dnd5e', ['inspire']);
    fresh('+ висит', goal!.label!, 'inspire', 'reakcii', goal!.description!);
    within().click('+ когда');
    within(handlerHead(1)).select('Что случилось', 'seen');
    within(handlerHead(1)).select('Кого касается', '@roller == @holder');
    askWith(within(handlerHead(1)), { show: ['roll'] });

    within(handlerAt(1)).click('+ изменение');
    let card = stepCard(/^1 · /, handlerAt(1));
    within(card).click('вызов');
    card = stepCard(/^1 · /, handlerAt(1));
    within(card).select('Какой эффект', 'spend');
    const args = (goal!.on![0]!.cost![0] as { args: Record<string, { expr: string }> }).args;
    const label: Record<string, string> = { what: 'Что тратим', amount: 'Сколько', note: 'Если не хватает', list: 'Лист', istochnik: 'Источник' };
    for (const [key, value] of Object.entries(args)) {
      card = stepCard(/^1 · /, handlerAt(1));
      within(card).formula(within(card).arg(label[key]!), value.expr);
    }
    within(stepCard(/^1 · /, handlerAt(1))).click('↑');

    within(handlerAt(1)).click('+ перебросить');
    card = stepCard(/^2 · /, handlerAt(1));
    expect(within(card).field('Перебросить, где выпало не больше')).toBeTruthy();
    within(card).select('Что перебросить', 'lowest');
    card = stepCard(/^2 · /, handlerAt(1));
    expect(card.textContent).not.toContain('Перебросить, где выпало не больше');
    dump({ got: built('inspire'), goal });
    expect(built('inspire')).toEqual(folded(goal));
  });

  it('«Перебросить»: назад к порогу — порог снова 1, режим в данных не пишется', { timeout: 60000 }, () => {
    const [goal] = start('dnd5e', ['inspire']);
    fresh('+ висит', 'Проба режима', 'reroll_probe', 'reakcii', goal!.description!);
    within().click('+ когда');
    within(handlerHead(1)).select('Что случилось', 'seen');
    within(handlerAt(1)).click('+ перебросить');
    let card = stepCard(/^1 · /, handlerAt(1));
    within(card).select('Что перебросить', 'lowest');
    expect((built('reroll_probe').on![0]!.steps![0] as Record<string, unknown>).upTo).toBeUndefined();
    card = stepCard(/^1 · /, handlerAt(1));
    within(card).select('Что перебросить', '');
    const step = built('reroll_probe').on![0]!.steps![0] as Record<string, unknown>;
    expect(step.which).toBeUndefined();
    expect(step.upTo).toEqual({ expr: '1' });
  });

  it('D&D «Щит» (shield): две подписки с вопросом — «до» атаки и «до» волшебной стрелы, цена реакцией и ячейкой, вешает состояние на себя', { timeout: 90000 }, () => {
    const [goal] = start('dnd5e', ['shield']);
    const ui = fresh('+ висит', goal!.label!, 'shield', 'reakcii', goal!.description!);
    const heard = [
      ['ataka', '@popal и @holder.shield_up == 0'],
      ['volshebnaya_strela', '@holder.shield_up == 0'],
    ] as const;
    heard.forEach(([listened, when], index) => {
      const n = index + 1;
      const at = () => handlerAt(n);
      within().click('+ когда');
      within(handlerHead(n)).select('Что именно', listened);
      within(handlerHead(n)).select('Когда именно', 'before');
      within(handlerHead(n)).select('Кого касается', '@cel == @holder');
      within(handlerHead(n)).when(`=${when}`);
      askWith(within(handlerHead(n)), { question: goal!.on![index]!.confirm!.question! });

      ui.select(at().querySelector<HTMLElement>('.add-cost [role="combobox"]')!, 'cost_reaction');
      let card = stepCard(/^1 · /, at());
      within(card).formula(within(card).arg('Лист'), '@holder');
      within(card).formula(within(card).arg('Источник'), '@holder');
      within(at()).click('+ изменение');
      card = stepCard(/^2 · /, at());
      within(card).click('вызов');
      card = stepCard(/^2 · /, at());
      within(card).select('Какой эффект', 'spell_slot');
      for (const name of within(card).args()) {
        within(card).formula(within(card).arg(name), name === 'Лист' || name === 'Источник' ? '@holder' : '1');
      }
      within(stepCard(/^2 · /, at())).click('↑');

      within(at()).click('+ изменение');
      card = stepCard(/^3 · /, at());
      within(card).click('состояние');
      card = stepCard(/^3 · /, at());
      within(card).select('Какое', 'shield_up');
      within(card).formula('На кого', '@holder');
    });
    dump({ got: built('shield'), goal });
    expect(built('shield')).toEqual(folded(goal));
  });

  it('D&D «Не замечает» (hidden): срок 1 ход, спадает в начале хода листа из входа, две правки броска по двум листам', { timeout: 60000 }, () => {
    const [goal] = start('dnd5e', ['hidden']);
    const ui = fresh('+ висит', goal!.label!, 'hidden', 'sostoyaniya', goal!.description!);
    ui.click('+ вход');
    ui.type(ui.cell('Название', 0), 'Кого не замечает');
    ui.select(ui.cell('Вид', 0), 'sheet');
    if (ui.has('ещё')) ui.click('ещё');
    ui.type(ui.cell('Имя в формулах', 0), 'kogo');
    lifetime('turns', 'refresh');
    ui.type('Сколько', '1');
    ui.select('Спадает', 'turn-start');
    ui.select('Чьи ходы считать', 'kogo');

    const rollEdit = (edit: string, when: string) => {
      within().click('+ правка вызова');
      const card = lastModifier;
      within(card()).select('Какие броски', 'ataka');
      within(card()).select('Какое слово', edit);
      within(card()).when(`=${when}`);
    };
    rollEdit('advantage', '@against == @holder and @roller == @kogo');
    rollEdit('disadvantage', '@roller == @holder and @against == @kogo');
    dump({ got: built('hidden'), goal });
    expect(built('hidden')).toEqual(folded(goal));
  });

  it('D&D «Засада» (hide): бросок выше «Для каждого из» — один; бросающий чипом в начале строки формулы, «Против кого» нет, метки под строкой', { timeout: 30000 }, () => {
    const world = structuredClone(worldOf('dnd5e'));
    useWorld.setState(state => ({
      ...state, system: world.system as System, compendium: world.compendium,
      activeEffectId: 'hide', activeFieldTag: null, activeRecordKind: null, activeSheetKind: null,
    }));
    render(<EffectsTab />);
    openAll();
    const roll = stepCard(/^2 · Бросок/);
    const chip = within(roll).field('Кто бросает');
    expect(chip.querySelector<HTMLInputElement>('[role="combobox"]')!.value).toBe('Кто действует');
    expect(roll.querySelector('.number-line__formula')!.firstElementChild).toBe(chip);
    expect(roll.textContent).not.toContain('Против кого');
    expect(within(roll).field('Ещё метки')).toBeTruthy();
    expect(useWorld.getState().system.effects.hide!.steps![0]).not.toHaveProperty('against');
  });
});

describe('общие эффекты D&D собираются руками: цикл по строкам, адрес через строку', () => {
  beforeEach(() => { try { localStorage.clear(); } catch { return; } });
  afterEach(() => { cleanup(); });

  const calledHead = (goal: Effect, key: string) => {
    const ui = fresh('+ кнопкой', goal.label!, key, goal.group!, goal.description!);
    return ui;
  };

  const param = (ui: ReturnType<typeof within>, id: string, row: number, label: string, kind: string, key: string, more: { ask?: string; main?: boolean; role?: string } = {}) => {
    if (row >= (built(id)!.params ?? []).length) ui.click((built(id)!.params ?? []).length ? '+ ещё одно' : '+ вход');
    if (ui.has('ещё')) ui.click('ещё');
    ui.type(ui.cell('Название', row), label);
    ui.select(ui.cell('Вид', row), kind);
    if (more.ask) ui.select(ui.cell('Если не передали', row), more.ask);
    if (more.main) ui.check(`«${label}» — величина`, true);
    if (more.role) ui.select(ui.cell('Кто это', row), more.role);
    if (ui.cell('Имя в формулах', row).querySelector('input')) ui.type(ui.cell('Имя в формулах', row), key);
  };

  const change = (card: () => HTMLElement, owner: string, field: string, how: string, value: string) => {
    within(card()).select('У кого', owner);
    within(card()).select('Какое поле', field);
    within(card()).select('Как', how);
    within(card()).formula('Сколько', value);
  };

  const rows = (root: ParentNode, table: string, name: string) => {
    const strip = () => root.querySelector<HTMLElement>('.steps__split')!;
    within(strip()).select(strip().querySelector<HTMLElement>('[role="combobox"]')!, `rows:${table}`);
    within(strip()).type(strip().querySelector<HTMLElement>('input:not([role="combobox"])')!, name);
  };

  it('D&D «Ячейка заклинания» (spell_slot): «Потратить» клетку строки по значению — @лист.slots.[@circle]', { timeout: 90000 }, () => {
    const [goal] = start('dnd5e', ['spell_slot']);
    const ui = calledHead(goal!, 'spell_slot');
    param(ui, 'spell_slot', 0, 'Лист', 'sheet', 'list', { role: 'actor' });
    param(ui, 'spell_slot', 1, 'Источник', 'sheet', 'istochnik', { ask: 'empty', role: 'actor' });
    param(ui, 'spell_slot', 2, 'Круг ячейки', 'number', 'circle', { main: true });
    ui.click('+ изменение');
    const made = () => stepCard(/^1 · /);
    within(made()).click('вызов');
    within(made()).select('Какой эффект', 'spend');
    within(made()).formula(within(made()).arg('Что тратим'), '@лист.slots.[@circle].left');
    within(made()).formula(within(made()).arg('Сколько'), '1');
    within(made()).formula(within(made()).arg('Если не хватает'), '@лист.slots.[@circle].none');
    dump({ got: built('spell_slot'), goal });
    expect(built('spell_slot')).toEqual(folded(goal));
  });

  it('D&D «Ресурсы классов после отдыха» (resources_rest): две подписки, цикл по строкам ресурсов, «Если» по колонке строки', { timeout: 120000 }, () => {
    const [goal] = start('dnd5e', ['resources_rest']);
    const ui = fresh('+ висит', goal!.label!, 'resources_rest', goal!.group!, goal!.description!);
    within().click('+ когда');
    lifetime('permanent');
    within(handlerHead(1)).select('Что случилось', 'moment');
    within(handlerHead(1)).select('Когда', 'short-rest');
    within(handlerAt(1)).click('+ для каждого из списка');
    rows(handlerAt(1), 'resources', 'ресурс');
    within(handlerAt(1)).click('+ если');
    within(headOf(block(0, handlerAt(1)))).when('=@holder.resurs.short');
    addToArm(block(0, handlerAt(1)), 0, 'change');
    change(() => stepCard(/^2 · /, handlerAt(1)), 'holder', 'resurs.left', 'set', '@holder.resurs.max');

    ui.click('+ когда');
    within(handlerHead(2)).select('Что случилось', 'moment');
    within(handlerHead(2)).select('Когда', 'long-rest');
    within(handlerAt(2)).click('+ для каждого из списка');
    rows(handlerAt(2), 'resources', 'ресурс');
    within(handlerAt(2)).click('+ изменение');
    change(() => stepCard(/^2 · /, handlerAt(2)), 'holder', 'resurs.left', 'set', '@holder.resurs.max');

    dump({ got: built('resources_rest'), goal });
    expect(built('resources_rest')).toEqual(folded(goal));
  });
});
