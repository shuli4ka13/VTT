// apps/web/src/screens/constructor/card.tsx
// Карточка группы шагов: три понятия поверх пяти команд движка.
// Пересказ — сверху; контролы следуют за выбором (у «числа» видны только
// слоты выбранного источника); переключатели меняют step.type, ничего
// не стирая — вернул переключатель, вернулась и работа.

import { useState, type ReactNode } from 'react';
import type { System, Effect, Step, SlotRef } from '@vtt/schema';
import { Card, CardHead, Field, Fold, Segmented, Verdict, Button, Select, Input } from '../../ui/primitives.tsx';
import type { CardGroup } from './cards.ts';
import {
  checkReadback, changeReadback, numberReadback, amountValueSegments, joinReadback, type Segment,
} from './readback.ts';
import { parseRollExpr, formatRollExpr, parseAmountExpr, formatAmountExpr } from './roll-expr.ts';
import { compile } from '@vtt/engine/formula';
import { FormulaChips } from '../../ui/formula-chips.tsx';
import { SlotInput, chipOf, type SlotOption } from './slot-input.tsx';
import type { SlotContext, EarlierStep } from './slots.tsx';
import type { Problem } from './step-card.tsx';

const TITLES: Record<string, string> = { check: 'Проверка', change: 'Изменение', number: 'Число' };

type EditFn = (slotIndexInGroup: number, change: (draft: Step) => void) => void;

const firstDie = (system: System): string | undefined => Object.keys(system.constants ?? {})[0];

export function Readback({ segments }: { segments: Segment[] }) {
  return (
    <p className="readback">
      {segments.map((part, i) => {
        const glue = 'text' in part && /^[.,]/.test(part.text);
        const lead = i === 0 || glue ? '' : ' ';
        return 'text' in part
          ? <span key={i}>{lead}{part.text}</span>
          : <span key={i}>{lead}<span className="readback__hole">{part.hole}</span></span>;
      })}
    </p>
  );
}

export function GroupCard({
  group, position, system, effect, earlier, problem, problemAction,
  edit, onDelete, onMoveUp, onMoveDown, onAddParam,
}: {
  group: CardGroup;
  position: number;
  system: System;
  effect: Effect;
  earlier: EarlierStep[];
  problem: Problem | null;
  /**
   * Лекарство рядом с диагнозом (задача 3): если беда в отсутствующем поле
   * и нашёлся донор, эффект-таб кладёт сюда кнопку «взять блок» — она
   * рендерится внутри того же Verdict, а не отдельной карточкой.
   */
  problemAction?: ReactNode;
  edit: (slotIndexInGroup: number, change: (draft: Step) => void) => void;
  onDelete: () => void;
  /** Перенос карточки соседям навстречу. Нет обработчика — карточка с краю. */
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  /**
   * Заводит потребность на эффекте (не на шаге — `edit` шага сюда не
   * дотягивается) и возвращает её ключ. Задача 2, «согласованное
   * расширение пропсов»: потребность может родиться прямо там, где её
   * не хватило в слоте, а не только со вкладки эффекта.
   */
  onAddParam?: (label: string, kind: string) => string;
}) {
  const context: SlotContext = { system, effect, earlier };
  const step = group.step as any;
  // Удаление в два шага вместо подтверждения окном: первый клик взводит,
  // второй убирает. Карточка на восемь заполненных мест не должна умирать
  // от одного промаха мышью, а модальное окно ради этого — перебор.
  const [armed, setArmed] = useState(false);

  const actions = armed ? (
    <>
      <Button size="sm" variant="danger" onClick={onDelete}>убрать</Button>
      <Button size="sm" variant="ghost" onClick={() => setArmed(false)}>отмена</Button>
    </>
  ) : (
    <>
      <Button size="sm" variant="ghost" title="выше" disabled={!onMoveUp} onClick={onMoveUp}>↑</Button>
      <Button size="sm" variant="ghost" title="ниже" disabled={!onMoveDown} onClick={onMoveDown}>↓</Button>
      <Button size="sm" variant="ghost" title="убрать карточку" onClick={() => setArmed(true)}>×</Button>
    </>
  );

  if (group.kind === 'unknown') {
    return (
      <Card tone="bad">
        <CardHead title={`${position} · движок не знает типа «${group.step.type}»`}
          actions={actions} />
      </Card>
    );
  }

  const segments = group.kind === 'check' ? checkReadback(group.step, system, effect)
    : group.kind === 'change' ? changeReadback(group.step, group.amount, system, effect)
      : numberReadback(group.step, system, effect);

  return (
    <>
      <Card tone={problem ? 'bad' : undefined}>
        <CardHead
          title={`${position} · ${TITLES[group.kind]}`}
          // Имя нужно всякому шагу, на результат которого ссылаются, а не
          // только «Числу»: без имени проверку нельзя назвать в слоте, и
          // «костей на максимуме» из неё не достать. Раньше поле стояло
          // только у «Числа» — потому свежесобранная проверка и была
          // невидима для последующих шагов.
          badge={group.kind === 'change' ? null : (
            <Input
              value={step.id ?? ''}
              mono
              placeholder="имя"
              onChange={next => edit(0, draft => {
                const id = next.trim();
                if (id) (draft as any).id = id; else delete (draft as any).id;
              })}
            />
          )}
          actions={actions}
        />
        {problem ? <Verdict tone="bad" action={problemAction}>{problem.text}</Verdict> : null}
        <Readback segments={segments} />
        {group.kind === 'check' ? <CheckBody step={step} context={context} edit={edit} system={system} /> : null}
        {group.kind === 'change' ? <ChangeBody group={group} context={context} edit={edit} system={system} onAddParam={onAddParam} /> : null}
        {group.kind === 'number' ? <NumberBody step={step} context={context} edit={edit} onAddParam={onAddParam} /> : null}
      </Card>
      {breakLine(group)}
    </>
  );
}

// Исходы выводятся из оператора: у каждого сравнения есть отрицание
// (≥ ↔ <, = ↔ ≠), и проверка порождает ровно столько веток, сколько
// у неё исходов. Сегодня их два; настройки «когда обрыв» нет — есть
// выбор, какая ветка продолжает («дальше при» в тонкостях).
const OP_SIGN: Record<string, string> = { atLeast: '≥', notOver: '≤', over: '>', under: '<', equals: '=' };
const OP_NOT: Record<string, string> = { atLeast: '<', notOver: '>', over: '≤', under: '≥', equals: '≠' };

function breakLine(group: CardGroup) {
  if (group.kind !== 'check') return null;
  const s = group.step as any;
  if (group.step.type === 'compare') {
    if (s.breakIf === 'never') return null;
    const broken = s.breakIf === 'atMost' ? '≤' : '<';
    const pass = s.breakIf === 'atMost' ? '>' : '≥';
    return (
      <div className="card-forks">
        <p className="card-break card-break--on">{pass} — цепочка продолжается</p>
        <p className="card-break">{broken} — эффект кончается здесь</p>
      </div>
    );
  }
  const op = String(s.successWhen ?? 'atLeast');
  const onSuccess = (s.continueOn ?? 'success') === 'success';
  const sign = OP_SIGN[op] ?? '≥';
  const not = OP_NOT[op] ?? '<';
  return (
    <div className="card-forks">
      <p className="card-break card-break--on">{onSuccess ? sign : not} — цепочка продолжается</p>
      <p className="card-break">{onSuccess ? not : sign} — эффект кончается здесь</p>
    </div>
  );
}

// ── проверка ──────────────────────────────────────────────────────────────

// Одно поле на весь бросок: «1d20 + #бонус_атаки». Черновик держится
// локально и уходит в структуру по Enter/уходу с поля; ошибка разбора
// не затирает данные — остаётся в поле, пока автор не поправит.
function RollExprInput({ step, context, edit }: {
  step: any;
  context: SlotContext;
  edit: EditFn;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [trouble, setTrouble] = useState<string | null>(null);

  // Кость, объявленная в словарях, — ССЫЛКА, а не число: сменили ведущую
  // кость системы, и все броски поменялись разом. Поэтому она стоит фишкой,
  // как всякая ссылка. Своё число («3d15», такого в словаре нет) остаётся
  // текстом — по виду сразу понятно, что перед вами.
  const die = step.roll?.die;
  const dieChip = die && typeof die === 'object' && 'constant' in die ? chipOf(die, context) : null;
  const shown = draft ?? (dieChip
    ? exprText(step.roll?.bonus)
    : formatRollExpr(step.roll, context.system));

  const commit = () => {
    if (draft === null) return;
    // Кость стоит фишкой, и строка обычно правит только прибавку. Но если
    // человек НАБРАЛ нотацию — он меняет кость, а не пишет формулу: такой
    // текст заменяет фишку, как и было до неё.
    if (dieChip) {
      // Свой «+» в начале — законный способ написать прибавку: человек
      // читает строку как формулу и дописывает знак сам. Съедаем его,
      // чтобы не спорить с тем, кто прав.
      const draftText = draft.replace(/^\s*\+/, '');
      const parsed = parseAmountExpr(draftText, context.system);
      const bonus = draftText.trim() ? parsed.bonus : null;
      const trouble = badFormula(bonus);
      if (trouble) { setTrouble(trouble); return; }
      edit(0, target => {
        const roll = ((target as any).roll ??= {});
        if (parsed.die !== undefined) roll.die = parsed.die;
        if (bonus === null || bonus === undefined) delete roll.bonus; else roll.bonus = bonus;
      });
      setDraft(null);
      setTrouble(null);
      return;
    }
    const parsed = parseRollExpr(draft, context.system);
    if (parsed.error) { setTrouble(parsed.error); return; }
    const trouble = badFormula(parsed.bonus);
    if (trouble) { setTrouble(trouble); return; }
    edit(0, target => {
      const roll = ((target as any).roll ??= {});
      roll.die = parsed.die;
      if (parsed.bonus === null) delete roll.bonus;
      else roll.bonus = parsed.bonus;
    });
    setDraft(null);
    setTrouble(null);
  };

  return (
    <Field label="бросок" error={trouble}>
      <FormulaChips
        value={shown}
        system={context.system}
        placeholder={dieChip ? 'и прибавка: @поле, число…' : 'кость и прибавка: 1d20 + @поле'}
        extraOptions={Object.entries(context.system.constants ?? {})
          .filter(([, c]) => c.kind === 'die')
          .map(([key, c]) => ({
            group: 'кость системы',
            label: c.label ?? key,
            onPick: () => edit(0, target => { ((target as any).roll ??= {}).die = { constant: key }; }),
          }))}
        prefix={dieChip ? (
          <>
            <span className="chips__chip" title="кость из словарей системы">
              {dieChip.label}
              <button
                type="button" className="chips__x" aria-label="убрать кость"
                onMouseDown={e => {
                  e.preventDefault();
                  edit(0, target => { delete ((target as any).roll ??= {}).die; });
                }}
              >×</button>
            </span>
            {/* «+» рисуется, только когда после него правда что-то стоит.
                Постоянный плюс читался как «сюда обязательно вписать» и
                провоцировал набрать второй своими руками. */}
            {shown.trim() ? <span className="chips__plus" aria-hidden>+</span> : null}
          </>
        ) : null}
        onChange={next => { setDraft(next); setTrouble(null); }}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') { setDraft(null); setTrouble(null); }
        }}
      />
    </Field>
  );
}


// Величина изменения одной строкой: «1d8 + ⟦Мод Силы⟧». Кость и прибавка
// живут в движке порознь (кость бросает отправитель, формулу считает лист),
// но набирают их вместе — парсер делит, формат собирает обратно.
/** Чем подписать число в строке: тем, что оно бросает. */
function diceWord(amount: Step, context: SlotContext): string {
  const dice = (amount as Record<string, any>).dice;
  const chip = chipOf(dice, context);
  if (chip) return chip.label;
  if (dice && typeof dice === 'object' && 'const' in dice) return String((dice as any).const);
  return 'число';
}

function ChangeValue({ amount, apply, applyIndex, context, edit, onCreateFromRecord }: {
  /** Величина карточки, если она есть: только она умеет бросать кость. */
  amount?: Step;
  /** Шаг «применить»: он несёт поле цели и новое значение. */
  apply: Step;
  applyIndex: number;
  context: SlotContext;
  edit: EditFn;
  onCreateFromRecord?: () => SlotRef;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [trouble, setTrouble] = useState<string | null>(null);
  const target = (apply as Record<string, any>).target;

  // Имя, которым выражение зовёт брошенное число. У склеенной пары это имя
  // её же величины: она бросает кость (или берёт значение из записи), а
  // выражение ниже с ним считает.
  const amountId = String((amount as Record<string, any> | undefined)?.id ?? '');

  // Показываем ровно то, что посчитается. Старые эффекты (и образцы) хранят
  // «направление + величина» — их выражение собирается для показа, а при
  // первой же правке ложится в данные тем, чем читается.
  const asExpr = (): string => {
    const a = apply as Record<string, any>;
    const value = a.value;
    if (value && typeof value === 'object' && 'expr' in value) return String(value.expr);
    // Число разворачивается на слагаемые: кость формулой не выразить (её
    // бросает отправитель), а прибавка — обычная формула, и держать её
    // внутри одной фишки значит слепить выражение в нечитаемый ком.
    const bonusText = exprText((amount as Record<string, any> | undefined)?.bonus);
    const dicePart = amountId ? `#${amountId}` : '';
    const amountName = !dicePart ? bonusText
      : bonusText ? `(${dicePart} + ${bonusText})` : dicePart;
    const targetName = target && typeof target === 'object' && 'tag' in target ? `#${target.tag}` : '';
    const direction = String(a.direction ?? 'subtract');
    if (direction === 'set') return amountName;
    if (!targetName) return amountName;
    // Минус здесь ОБЫЧНЫЙ дефис, а не типографский «−»: строка уходит
    // в формулу, и красивый знак парсер не понимает.
    return `${targetName} ${direction === 'add' ? '+' : '-'} ${amountName}`;
  };

  const shown = draft ?? asExpr();

  // Имя числа в строке подписано его содержимым: «Кость урона + Мод Силы»,
  // а не «dmg». Машинное имя нужно данным, человеку — нет.
  const names = amountId && amount
    ? { [amountId]: diceWord(amount, context) }
    : undefined;

  // Кость в формуле не считается: её бросает ОТПРАВИТЕЛЬ при упаковке, а
  // выражение считает лист цели. Поэтому набранная нотация уезжает в
  // величину карточки, а в тексте остаётся имя — то же, что и было бы,
  // выбери человек кость из подсказки.
  const DICE = /(\d+)?\s*[dдк]\s*(\d+)/iu;

  const commit = () => {
    if (draft === null) return;
    let text = draft.trim();

    const rolled = text.match(DICE);
    if (rolled) {
      if (!amountId) {
        setTrouble('кость бросает отправитель — заведите карточку «число» и назовите её');
        return;
      }
      const notation = `${rolled[1] ?? 1}d${rolled[2]}`;
      edit(0, step => { (step as Record<string, unknown>).dice = { const: notation }; });
      text = text.replace(DICE, `#${amountId}`);
    }

    // Прибавка переехала в выражение — в числе ей больше не место, иначе
    // она посчиталась бы дважды: и внутри числа, и в формуле.
    if (amountId) edit(0, step => { delete (step as Record<string, unknown>).bonus; });
    edit(applyIndex, step => {
      const a = step as Record<string, any>;
      if (!text) { delete a.value; return; }
      a.direction = 'set';
      a.value = { expr: text, of: 'target' };
    });
    setDraft(null);
    setTrouble(null);
  };

  // «Из записи» тоже приносит ЧИСЛО, которого у формулы нет: его берёт
  // величина карточки, а выражение зовёт её по имени — как и кость.
  const putIntoAmount = (ref: SlotRef) => {
    edit(0, step => { (step as Record<string, unknown>).dice = ref; });
    if (amountId) setDraft(prev => `${(prev ?? shown).trim()} #${amountId}`.trim());
  };
  const needs = (context.effect.params ?? []).map(p => ({
    group: 'из записи',
    label: p.label ?? p.key,
    onPick: () => putIntoAmount({ param: p.key } as SlotRef),
  }));
  if (onCreateFromRecord) {
    needs.push({
      group: 'из записи',
      label: 'новая потребность…',
      onPick: () => putIntoAmount(onCreateFromRecord()),
    });
  }

  return (
    <>
      {/* Две подписанные вещи: ЧТО меняем и ЧЕМ ОНО СТАНЕТ. Вторая —
          обычная математика, без знаков-выпадашек: «#хп − #урон», «0»,
          «#максхп / 2» — всё это законные ответы. */}
      <Field
        label="что меняется"
        needed={!target}
        hint={target ? undefined : 'Поле цели: что этот шаг поменяет.'}
      >
        <SlotInput
          value={target}
          context={context}
          allow={['tag', 'param']}
          placeholder="поле цели"
          onChange={next => edit(applyIndex, target => {
            const t = target as Record<string, unknown>;
            if (next) t.target = next; else delete t.target;
          })}
          onCreateFromRecord={onCreateFromRecord}
        />
      </Field>

      {/* Вторая строка — ЧЕМ ПОЛЕ СТАНЕТ, и это обычная математика.
          Ни знака-выпадашки, ни обязательного поля впереди: «#хп − #урон»,
          «0», «#максхп / 2» — всё это законные ответы на один и тот же
          вопрос. Кость, брошенную отправителем, формула зовёт по имени
          шага (engine/refs.ts): без этого выражение пришлось бы разбирать
          на «направление» и «величину», чем карточка и занималась раньше. */}
      <Field
        label="станет"
        error={trouble}
        hint="Математика по листу цели. Брошенное число зовите по имени шага."
      >
        <FormulaChips
          value={shown}
          system={context.system}
          names={names}
          placeholder="например: #хп − #урон"
          extraOptions={needs}
          onChange={setDraft}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') { setDraft(null); setTrouble(null); }
          }}
        />
      </Field>
    </>
  );
}

/**
 * Формулу, которую не разобрать, нельзя пускать в данные молча: набранное
 * «@…», которое ничего не выбрало, — обычный случай, и человек должен
 * увидеть, что строка не понята, а не гадать за столом.
 */
function badFormula(bonus: unknown): string | null {
  if (!bonus || typeof bonus !== 'object' || !('expr' in (bonus as object))) return null;
  const text = String((bonus as { expr: unknown }).expr ?? '').trim();
  if (!text) return null;
  try { compile(text); return null; } catch (err) {
    return (err as Error).message;
  }
}

/** Текст прибавки как её набирают: формула строкой, число числом. */
function exprText(bonus: unknown): string {
  if (!bonus || typeof bonus !== 'object') return '';
  const b = bonus as Record<string, unknown>;
  if ('expr' in b) return String(b.expr ?? '');
  if ('const' in b) return String(b.const ?? '');
  return '';
}

function CheckBody({ step, context, edit, system }: {
  step: any;
  context: SlotContext;
  edit: EditFn;
  system: System;
}) {
  const mode = step.type === 'compare' ? 'plain' : 'roll';
  const tables = Object.entries(system.tables ?? {});

  return (
    <>
      {/* Переключатель проверки: тип меняется, чужая нагрузка остаётся. */}
      <Segmented
        value={mode}
        options={[{ key: 'roll', label: 'броском' }, { key: 'plain', label: 'без броска' }]}
        onChange={next => edit(0, draft => {
          const d = draft as any;
          if (next === 'roll') {
            draft.type = 'threshold';
            d.roll ??= { die: firstDie(system) ? { constant: firstDie(system) } : undefined, check: null };
            d.side ??= 'sender'; d.successWhen ??= 'atLeast'; d.continueOn ??= 'success';
          } else {
            draft.type = 'compare';
            d.breakIf ??= 'less';
          }
        })}
      />

      {/* Проверка — уравнение: слева строка броска, оператор, справа порог.
          Строку разбирает парсер: голова — кость (преимуществу есть что
          удваивать), хвост после «+» — число или формула. */}
      {mode === 'roll' ? (
        <div className="row">
          <RollExprInput step={step} context={context} edit={edit} />
          <Field label="успех">
            <Select
              value={String(step.successWhen ?? 'atLeast')}
              options={[['atLeast', '≥'], ['notOver', '≤'],
                ['over', '>'], ['under', '<'], ['equals', '=']] as const}
              onChange={next => edit(0, draft => { (draft as any).successWhen = next; })}
            />
          </Field>
          <Field label="против">
            <SlotInput
              value={step.versus} context={context} allow={['tag', 'expr', 'const', 'param', 'ref']}
              onChange={next => edit(0, draft => { (draft as any).versus = next ?? undefined; })}
            />
          </Field>
        </div>
      ) : (
        <div className="row">
          <Field label="что сравниваем">
            <SlotInput
              value={step.value} context={context} allow={['ref']}
              onChange={next => edit(0, draft => { (draft as any).value = next ?? undefined; })}
            />
          </Field>
          <Field label="обрыв, если">
            <Select
              value={String(step.breakIf ?? 'less')}
              options={[['less', '< меньше правого'], ['atMost', '≤ не больше правого'],
                ['never', 'обрыва нет — разница идёт дальше']] as const}
              onChange={next => edit(0, draft => { (draft as any).breakIf = next; })}
            />
          </Field>
          <Field label="против">
            <SlotInput
              value={step.versus} context={context} allow={['tag', 'expr', 'const', 'param', 'ref']}
              onChange={next => edit(0, draft => { (draft as any).versus = next ?? undefined; })}
            />
          </Field>
        </div>
      )}

      {mode === 'roll' ? (
        <Fold title="Тонкости">
          <Field label="кто бросает">
            <Select
              value={String(step.side ?? 'sender')}
              options={[['sender', 'отправитель'], ['target', 'цель']] as const}
              onChange={next => edit(0, draft => { (draft as any).side = next; })}
            />
          </Field>
          <Field label="дальше при">
            <Select
              value={String(step.continueOn ?? 'success')}
              options={[['success', 'успехе'], ['fail', 'провале']] as const}
              onChange={next => edit(0, draft => { (draft as any).continueOn = next; })}
            />
          </Field>
          {/* Мишень — КЛАСС броска, крючок для узких правил: «преимущество
              на атаки». Правки «на любой бросок» ловятся и без неё — всякий
              бросок принадлежит общей мишени, ничего не объявляя. */}
          <Field label="какой это бросок" hint="Вид броска из словаря — чтобы правило «преимущество на атаки» знало, куда целиться. Правки «на любой бросок» этот бросок поймает в любом случае.">
            <Select
              value={String(step.roll?.check ?? '')}
              options={[['', '— просто бросок: только общие правки —'],
                ...(context.system.rolls ?? []).map(r => [r.tag, r.label] as const)] as never}
              onChange={next => edit(0, draft => { ((draft as any).roll ??= {}).check = next || null; })}
            />
          </Field>
          {/* Степени успеха — мирам PbtA и PF2e мало «да/нет». Строка живёт
              в тонкостях и по умолчанию выключена: кто играет в 5e, её
              не встретит. Шкала — обычная таблица из словарей. */}
          <Field
            label="степени успеха"
            hint={tables.length
              ? 'Вместо «да/нет» исход читается ступенями по таблице: «провал / успех с ценой / полный успех».'
              : 'Сначала заведите таблицу ступеней в «Словарях».'}
          >
            <Select
              value={String(step.degrees?.table ?? '')}
              options={[['', '— не считать, просто да/нет —'],
                ...tables.map(([key, t]) => [key, t.label || key] as const)] as never}
              onChange={next => edit(0, draft => {
                const d = draft as any;
                if (!next) delete d.degrees;
                else d.degrees = { table: next, of: d.degrees?.of ?? 'total' };
              })}
            />
          </Field>
          {step.degrees?.table ? (
            <Field label="ступень по">
              <Select
                value={String(step.degrees.of ?? 'total')}
                options={[['total', 'итогу броска'], ['margin', 'запасу против порога']] as const}
                onChange={next => edit(0, draft => { (draft as any).degrees.of = next; })}
              />
            </Field>
          ) : null}
        </Fold>
      ) : null}
    </>
  );
}

// ── изменение ─────────────────────────────────────────────────────────────

function ChangeBody({ group, context, edit, system, onAddParam }: {
  group: CardGroup;
  context: SlotContext;
  edit: EditFn;
  system: System;
  onAddParam?: (label: string, kind: string) => string;
}) {
  const step = group.step as any;
  const mode = step.type === 'status' ? 'status' : 'apply';
  const applyIndex = group.amount ? 1 : 0;

  // Потребность рождается по подписи слота: dice-слоту — «кости», карточке
  // состояния — «эффект-состояние», остальным — «формула». Без колбэка
  // (например, в тестах карточки) пункт «новая потребность…» просто не
  // появляется — SlotInput проверяет это сам.
  const fromRecord = (label: string, kind: string) =>
    onAddParam ? () => ({ param: onAddParam(label, kind) }) : undefined;

  // Состояния для карточки «изменение → состояние»: пассивные эффекты системы.
  const statusOptions: SlotOption[] = Object.entries(system.effects ?? {})
    .filter(([, e]) => (e.activation ?? 'manual') === 'passive')
    .map(([id, e]) => ({ group: 'Состояния', label: e.label ?? id, ref: { const: id } }));

  return (
    <>
      {/* Переключатель изменения: тип меняется, чужая нагрузка остаётся. */}
      <Segmented
        value={mode}
        options={[{ key: 'apply', label: 'поле' }, { key: 'status', label: 'состояние' }]}
        onChange={next => edit(applyIndex, draft => {
          const d = draft as any;
          if (next === 'status') {
            draft.type = 'status';
            d.mode ??= 'apply';
          } else {
            draft.type = 'apply';
            d.direction ??= 'subtract';
            d.targetModifiers ??= true;
          }
        })}
      />

      {mode === 'apply' ? (
        <>
          {/* Карточка «изменение» выглядит одинаково, есть у неё величина
              или нет: поле цели и выражение. Раньше без величины показывался
              другой набор полей («сколько»), и одна и та же карточка
              выглядела двумя разными. */}
          <ChangeValue
            amount={group.amount ?? undefined} apply={step} applyIndex={applyIndex}
            context={context} edit={edit}
            onCreateFromRecord={fromRecord('сколько — кости', 'dice')} />


          <Fold title="Тонкости">
            {/* Само число живёт ВНУТРИ изменения — так и было решено: атака
                это две карточки, а не три. В строке выше оно читается тем,
                чем является («Кость урона + Мод Силы»), а его устройство
                правится здесь, не занимая места у главного. */}
            {group.amount ? (
              <NumberBody
                step={group.amount}
                context={context}
                edit={(_, change) => edit(0, change)}
                onAddParam={onAddParam}
              />
            ) : null}
            <Field label="не ниже">
              <SlotInput
                value={step.floor} context={context} allow={['const', 'tag']}
                onChange={next => edit(applyIndex, draft => { (draft as any).floor = next ?? undefined; })}
              />
            </Field>
            <Field label="не выше">
              <SlotInput
                value={step.ceiling} context={context} allow={['const', 'tag']}
                onChange={next => edit(applyIndex, draft => { (draft as any).ceiling = next ?? undefined; })}
              />
            </Field>
            <Field label="сопротивления цели">
              <Select
                value={String(step.targetModifiers ?? true)}
                options={[['true', 'учитываются'], ['false', 'не учитываются']] as const}
                onChange={next => edit(applyIndex, draft => { (draft as any).targetModifiers = next === 'true'; })}
              />
            </Field>
          </Fold>
        </>
      ) : (
        <>
          {/* Состоянию число не нужно, но выбрасывать набранное нельзя:
              вернул переключатель — вернулась и величина. Говорим об этом,
              чтобы «куда делась кость урона» не пришлось гадать. */}
          {group.amount ? (
            <span className="faint">
              величина сохранена — вернётся, если снова выбрать «поле»
            </span>
          ) : null}
          <Field label="что делаем">
            <Select
              value={String(step.mode ?? 'apply')}
              options={[['apply', 'вешаем'], ['remove', 'снимаем']] as const}
              onChange={next => edit(applyIndex, draft => { (draft as any).mode = next; })}
            />
          </Field>
          <Field label="какое">
            <SlotInput
              value={step.effect} context={context} extraOptions={statusOptions}
              onChange={next => edit(applyIndex, draft => { (draft as any).effect = next ?? undefined; })}
              onCreateFromRecord={fromRecord('какое', 'effect')}
            />
          </Field>
        </>
      )}
    </>
  );
}

// ── число ─────────────────────────────────────────────────────────────────

function NumberBody({ step, context, edit, onAddParam }: {
  step: any;
  context: SlotContext;
  edit: EditFn;
  onAddParam?: (label: string, kind: string) => string;
}) {
  const source = typeof step.source === 'object' ? 'roll' : (step.source ?? 'roll');
  const fromRecord = (label: string, kind: string) =>
    onAddParam ? () => ({ param: onAddParam(label, kind) }) : undefined;

  return (
    <>
      <Field label="откуда">
        <Select
          value={String(source)}
          options={[
            ['roll', 'свой бросок'], ['margin', 'превышение проверки'], ['item', 'фикс записи'],
          ] as const}
          onChange={next => edit(0, draft => { (draft as any).source = next; })}
        />
      </Field>

      {source === 'roll' ? (
        <>
          <Field label="кости">
            <SlotInput
              value={step.dice} context={context} dice placeholder="кости или из записи"
              onChange={next => edit(0, draft => { (draft as any).dice = next ?? undefined; })}
              onCreateFromRecord={fromRecord('кости', 'dice')}
            />
          </Field>
          <Field label="прибавка">
            <SlotInput
              value={step.bonus} context={context}
              onChange={next => edit(0, draft => { (draft as any).bonus = next ?? undefined; })}
            />
          </Field>
        </>
      ) : null}

      {source === 'margin' ? (
        <Field label="какое превышение">
          <SlotInput
            value={step.margin} context={context} allow={['ref']}
            onChange={next => edit(0, draft => { (draft as any).margin = next ?? undefined; })}
          />
        </Field>
      ) : null}

      {source === 'item' ? (
        <Field label="фикс записи">
          <SlotInput
            value={step.fixed} context={context}
            onChange={next => edit(0, draft => { (draft as any).fixed = next ?? undefined; })}
            onCreateFromRecord={fromRecord('фикс записи', 'expr')}
          />
        </Field>
      ) : null}
    </>
  );
}
