import { CALL_TAGS } from '@vtt/engine/model/references';
import { tagsOf } from '@vtt/engine/model/lists';
import type { CardGroup } from '../../cards.ts';
import type { SlotContext, EarlierStep } from '../../slots.tsx';
import { outputRefs, isCalled, namesOf } from '../../slots.tsx';
import type { EditFn } from '../words.ts';
import { ConditionField } from '../../condition-field.tsx';
import type { QuickRef, QuickKind } from '../../condition-field.tsx';

type IfStep = { if?: { expr: string } };

const QUICK_KINDS: readonly string[] = ['boolean', 'number', 'text'];

export function quickOf(context: SlotContext, earlier: EarlierStep[]): QuickRef[] {
  const tagged = isCalled(context) ? tagsOf(context.system, context.effect) : [];
  return [
    ...(tagged.length ? [{ ref: CALL_TAGS, label: 'метки вызова', kind: 'tags' as const, tags: tagged }] : []),
    ...outputRefs(earlier).filter(o => QUICK_KINDS.includes(String(o.kind))).map(o => ({ ref: o.ref, label: o.label, kind: o.kind as QuickKind })),
  ];
}

export function ConditionFold({ group, earlier, edit, context }: {
  group: CardGroup;
  earlier: EarlierStep[];
  edit: EditFn;
  context: SlotContext;
}) {
  const written = (group.step as IfStep).if?.expr;
  const setAll = (expr: string | null) =>
    group.indices.forEach((_, k) => edit(k, draft => {
      const d = draft as IfStep;
      if (expr) d.if = { expr }; else delete d.if;
    }));
  return (
    <ConditionField
      value={written}
      onChange={setAll}
      system={context.system}
      quick={quickOf(context, earlier)}
      names={namesOf(context)}
      {...(context.sheets ? { sheets: context.sheets } : {})}
      where="условие шага"
      placeholder="например: @попадание.natural >= 19"
      ruleHint="Не сошлось — этот шаг пропускается, цепочка идёт дальше."
    />
  );
}

const OP_SIGN: Record<string, string> = { atLeast: '≥', notOver: '≤', over: '>', under: '<', equals: '=' };
const OP_NOT: Record<string, string> = { atLeast: '<', notOver: '>', over: '≤', under: '≥', equals: '≠' };

export function breakLine(group: CardGroup) {
  if (group.kind !== 'check') return null;
  const s = group.step as any;
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
