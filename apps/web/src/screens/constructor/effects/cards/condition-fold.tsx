import { Field, Fold, Select } from '../../../../ui/primitives.tsx';
import type { CardGroup } from '../../cards.ts';
import type { Segment } from '../../readback.ts';
import { outputRefs, outputLabel } from '../../slots.tsx';
import type { EarlierStep } from '../../slots.tsx';
import type { EditFn } from '../words.ts';

export function whenSegments(step: any, earlier: EarlierStep[]): Segment[] {
  const when = step?.when as { ref?: string; not?: boolean } | undefined;
  if (!when?.ref) return [];
  const label = outputLabel(when.ref, earlier);
  return [{ text: `Только если ${when.not ? label.replace(' — ', ' — не ') : label}.` }];
}

export function ConditionFold({ group, earlier, edit }: {
  group: CardGroup;
  earlier: EarlierStep[];
  edit: EditFn;
}) {
  const step = group.step as any;
  const when = step.when as { ref?: string; not?: boolean } | undefined;
  const flags = outputRefs(earlier).filter(o => o.kind === 'boolean');
  if (!flags.length && !when?.ref) return null;
  const setAll = (change: (draft: any) => void) => group.indices.forEach((_, k) => edit(k, change));
  const summary = when?.ref
    ? `${when.not ? 'если не' : 'если'} ${outputLabel(when.ref, earlier)}`
    : 'всегда';

  return (
    <Fold title="Когда выполнять" summary={summary}>
      <div className="row">
        <Field label="выполнять" hint="Исход шага выше по цепочке. Не сошлось — шаг пропускается, цепочка идёт дальше.">
          <Select
            value={when?.ref ?? ''}
            options={[['', 'всегда'], ...flags.map(f => [f.ref, `если ${f.label}`] as const)] as never}
            onChange={next => setAll(draft => {
              if (!next) { delete draft.when; return; }
              draft.when = { ref: next, ...(draft.when?.not ? { not: true } : {}) };
            })}
          />
        </Field>
        {when?.ref ? (
          <Field label="исход">
            <Select
              value={when.not ? 'no' : 'yes'}
              options={[['yes', 'да'], ['no', 'нет']] as const}
              onChange={next => setAll(draft => {
                draft.when = { ref: draft.when?.ref, ...(next === 'no' ? { not: true } : {}) };
              })}
            />
          </Field>
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
