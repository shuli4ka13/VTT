// apps/web/src/screens/constructor/card.tsx
// Карточка группы шагов: три понятия поверх пяти команд движка.
// Пересказ — сверху; контролы следуют за выбором (у «числа» видны только
// слоты выбранного источника); переключатели меняют step.type, ничего
// не стирая — вернул переключатель, вернулась и работа.

import { useState, type ReactNode } from 'react';
import type { System, Effect, Step, SlotRef } from '@vtt/schema';
import { Card, CardHead, Field, Fold, Segmented, Verdict, Button, Select, Input } from '../../ui/primitives.tsx';
import type { CardGroup } from './cards.ts';
import { checkReadback, changeReadback, numberReadback, type Segment } from './readback.ts';
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
function AmountExprInput({ amount, apply, applyIndex, context, edit, onCreateFromRecord }: {
  amount: Step;
  /** Шаг «применить»: он несёт мишень и операцию, и они тоже в этой строке. */
  apply: Step;
  applyIndex: number;
  context: SlotContext;
  edit: EditFn;
  onCreateFromRecord?: () => SlotRef;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const dice = (amount as Record<string, any>).dice;
  const target = (apply as Record<string, any>).target;
  const direction = String((apply as Record<string, any>).direction ?? 'subtract');

  const targetChip = chipOf(target, context);
  const diceChip = chipOf(dice, context);

  const setDice = (next: SlotRef | undefined) => edit(0, step => {
    const s = step as Record<string, unknown>;
    if (next === undefined) delete s.dice; else s.dice = next;
  });

  // Строка правит только текстовую часть величины; мишень, операция и кость
  // из записи — фишки и знак, у них свои жесты.
  const shown = draft ?? (diceChip
    ? exprText((amount as Record<string, any>).bonus)
    : formatAmountExpr(amount, context.system));

  const commit = () => {
    if (draft === null) return;
    if (diceChip) {
      const bonus = draft.trim() ? parseAmountExpr(draft, context.system).bonus : null;
      edit(0, step => {
        const s = step as Record<string, unknown>;
        if (bonus === null || bonus === undefined) delete s.bonus; else s.bonus = bonus;
      });
    } else {
      const parsed = parseAmountExpr(draft, context.system);
      edit(0, step => {
        const s = step as Record<string, unknown>;
        if (parsed.die === undefined) delete s.dice; else s.dice = parsed.die;
        if (parsed.bonus === null) delete s.bonus; else s.bonus = parsed.bonus;
      });
    }
    setDraft(null);
  };

  const fields = context.system.fields.map(f => ({
    group: 'поле цели',
    label: f.label ?? f.tag,
    onPick: () => edit(applyIndex, step => { (step as Record<string, unknown>).target = { tag: f.tag }; }),
  }));
  const needs = (context.effect.params ?? []).map(p => ({
    group: 'из записи',
    label: p.label ?? p.key,
    onPick: () => setDice({ param: p.key } as SlotRef),
  }));
  if (onCreateFromRecord) {
    needs.push({
      group: 'из записи',
      label: 'новая потребность…',
      onPick: () => setDice(onCreateFromRecord()),
    });
  }

  return (
    <Field
      label="что меняется"
      hint={targetChip
        ? 'Первым стоит поле, которое меняется; дальше — на сколько.'
        : 'Начните с поля цели: наберите «@» и выберите, что меняем.'}
    >
      <FormulaChips
        value={shown}
        system={context.system}
        placeholder={diceChip ? 'и ещё: @поле, число…' : 'кости и прибавка: 2d6 + @поле'}
        extraOptions={targetChip ? needs : [...fields, ...needs]}
        prefix={
          <>
            {targetChip ? (
              // Цель — не операнд формулы, а то, ЧТО меняется. Раньше она
              // выглядела как первое слагаемое, и строка читалась
              // арифметикой: «ХП минус кость плюс мод Силы». Отсюда и
              // вопрос «а где поле, которое меняется».
              <span className="chips__chip chips__chip--target">
                {targetChip.label}
                <button
                  type="button" className="chips__x" aria-label="убрать поле цели"
                  onMouseDown={e => {
                    e.preventDefault();
                    edit(applyIndex, step => { delete (step as Record<string, unknown>).target; });
                  }}
                >×</button>
              </span>
            ) : null}
            <select
              className="chips__op"
              aria-label="что делаем с полем"
              value={direction}
              onChange={e => {
                const next = e.target.value;
                edit(applyIndex, step => { (step as Record<string, unknown>).direction = next; });
              }}
            >
              <option value="subtract">−</option>
              <option value="add">+</option>
              <option value="set">=</option>
            </select>
            {diceChip ? (
              <>
                {/* Скобка — не украшение: «ХП − кость + мод Силы» читается
                    как «вычесть кость и ПРИБАВИТЬ мод», а на деле вычитается
                    их сумма. Пока слагаемых два, скобка это и говорит. */}
                {shown.trim() ? <span className="chips__paren" aria-hidden>(</span> : null}
                <span className={`chips__chip${diceChip.record ? ' chips__chip--record' : ''}`}>
                  {diceChip.label}
                  <button
                    type="button" className="chips__x" aria-label="убрать из записи"
                    onMouseDown={e => { e.preventDefault(); setDice(undefined); }}
                  >×</button>
                </span>
                {shown.trim() ? <span className="chips__plus" aria-hidden>+</span> : null}
              </>
            ) : null}
          </>
        }
        suffix={diceChip && shown.trim()
          ? <span className="chips__paren" aria-hidden>)</span>
          : null}
        onChange={setDraft}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') setDraft(null);
        }}
      />
    </Field>
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
          {/* Одна строка присвоения: «Текущие ХП − Кость урона + Мод Силы».
              Отдельных полей «какое поле» и «как» больше нет — мишень стоит
              фишкой в начале строки, операция знаком следом. В данных они
              по-прежнему врозь: на операцию завязаны сопротивления цели
              и границы, а кость обязана остаться броском, а не текстом. */}
          {group.amount ? (
            <AmountExprInput
              amount={group.amount} apply={step} applyIndex={applyIndex}
              context={context} edit={edit}
              onCreateFromRecord={fromRecord('сколько — кости', 'dice')} />
          ) : (
            <Field label="сколько">
              <SlotInput
                value={step.value} context={context} allow={['ref', 'param', 'const']}
                onChange={next => edit(0, draft => { (draft as any).value = next ?? undefined; })}
                onCreateFromRecord={fromRecord('сколько', 'expr')}
              />
            </Field>
          )}

          <Fold title="Тонкости">
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
