import { Field, Fold, Select, Input } from '../../../../ui/primitives.tsx';
import { SlotInput } from '../../slot-input.tsx';
import type { SlotContext } from '../../slots.tsx';
import type { CardGroup } from '../../cards.ts';
import type { Segment } from '../../readback.ts';
import { outputRefs, outputLabel } from '../../slots.tsx';
import type { EarlierStep } from '../../slots.tsx';
import type { EditFn } from '../words.ts';

type Bound = number | { tag: string } | { expr: string } | { param: string };

interface When { ref?: string; not?: boolean; atLeast?: Bound; atMost?: Bound; has?: string }

type WhenStep = { when?: When };

const boundWords = (bound: Bound | undefined): string => {
  if (bound === undefined || bound === null) return '';
  if (typeof bound !== 'object') return String(bound);
  if ('tag' in bound) return `«${bound.tag}»`;
  if ('param' in bound) return `«${bound.param}»`;
  if ('expr' in bound) return String(bound.expr);
  return '';
};

const numberWords = (when: When): string => {
  const low = boundWords(when.atLeast);
  const high = boundWords(when.atMost);
  if (low && high) return `от ${low} до ${high}`;
  if (low) return `не меньше ${low}`;
  if (high) return `не больше ${high}`;
  return 'любое число';
};

export const whenWords = (when: When | undefined, earlier: EarlierStep[]): string | null => {
  if (!when?.ref) return null;
  const label = outputLabel(when.ref, earlier);
  if (when.has !== undefined) return `${label} ${when.not ? 'не' : ''} «${when.has}»`.replace('  ', ' ');
  if (when.atLeast !== undefined || when.atMost !== undefined) return `${label} ${numberWords(when)}`;
  return when.not ? label.replace(' — ', ' — не ') : label;
};

export function whenSegments(step: unknown, earlier: EarlierStep[]): Segment[] {
  const words = whenWords((step as WhenStep | null)?.when, earlier);
  return words ? [{ text: `Только если ${words}.` }] : [];
}

const KIND_OF = (ref: string | undefined, earlier: EarlierStep[]): string =>
  outputRefs(earlier).find(o => o.ref === ref)?.kind ?? 'boolean';

export function ConditionFold({ group, earlier, edit, context }: {
  group: CardGroup;
  earlier: EarlierStep[];
  edit: EditFn;
  context: SlotContext;
}) {
  const when = (group.step as WhenStep).when;
  const outputs = outputRefs(earlier).filter(o => o.kind === 'boolean' || o.kind === 'number' || o.kind === 'text');
  if (!outputs.length && !when?.ref) return null;
  const setAll = (change: (draft: WhenStep) => void) =>
    group.indices.forEach((_, k) => edit(k, draft => change(draft as WhenStep)));
  const kind = KIND_OF(when?.ref, earlier);
  const summary = whenWords(when, earlier) ? `если ${whenWords(when, earlier)}` : 'всегда';

  const keep = (draft: WhenStep, next: Partial<When>) => {
    const made: When = { ref: draft.when?.ref, ...next };
    for (const key of ['atLeast', 'atMost', 'has', 'not'] as const) {
      if (made[key] === undefined) delete made[key];
    }
    draft.when = made;
  };

  return (
    <Fold title="Когда выполнять" summary={summary}>
      <div className="row">
        <Field label="выполнять" hint="Исход шага выше по цепочке. Не сошлось — шаг пропускается, цепочка идёт дальше.">
          <Select
            value={when?.ref ?? ''}
            options={[['', 'всегда'], ...outputs.map(o => [o.ref, `если ${o.label}`] as const)] as never}
            onChange={next => setAll(draft => {
              if (!next) { delete draft.when; return; }
              draft.when = { ref: next };
            })}
          />
        </Field>

        {when?.ref && kind === 'boolean' ? (
          <Field label="исход">
            <Select
              value={when.not ? 'no' : 'yes'}
              options={[['yes', 'да'], ['no', 'нет']] as const}
              onChange={next => setAll(draft => { keep(draft, next === 'no' ? { not: true } : {}); })}
            />
          </Field>
        ) : null}

        {when?.ref && kind === 'number' ? (
          <>
            <Field label="не меньше" hint="Пусто — нижней границы нет.">
              <SlotInput
                value={when.atLeast as never} context={context} allow={['const', 'tag', 'expr', 'param']}
                onChange={next => setAll(draft => {
                  keep(draft, { atLeast: next as Bound | undefined, atMost: draft.when?.atMost });
                })}
              />
            </Field>
            <Field label="не больше" hint="Пусто — верхней границы нет.">
              <SlotInput
                value={when.atMost as never} context={context} allow={['const', 'tag', 'expr', 'param']}
                onChange={next => setAll(draft => {
                  keep(draft, { atLeast: draft.when?.atLeast, atMost: next as Bound | undefined });
                })}
              />
            </Field>
          </>
        ) : null}

        {when?.ref && kind === 'text' ? (
          <>
            <Field label="ступень" hint="Как она названа в таблице степеней.">
              <Input
                value={when.has ?? ''}
                onChange={next => setAll(draft => { keep(draft, { has: next, not: draft.when?.not }); })}
              />
            </Field>
            <Field label="исход">
              <Select
                value={when.not ? 'no' : 'yes'}
                options={[['yes', 'она и есть'], ['no', 'любая другая']] as const}
                onChange={next => setAll(draft => {
                  keep(draft, { has: draft.when?.has ?? '', ...(next === 'no' ? { not: true } : {}) });
                })}
              />
            </Field>
          </>
        ) : null}
      </div>
    </Fold>
  );
}

const OP_SIGN: Record<string, string> = { atLeast: '≥', notOver: '≤', over: '>', under: '<', equals: '=' };
const OP_NOT: Record<string, string> = { atLeast: '<', notOver: '>', over: '≤', under: '≥', equals: '≠' };

export function breakLine(group: CardGroup) {
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
  if ((s.continueOn ?? 'success') === 'always') return null;
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
