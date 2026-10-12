import { CALL_TAGS } from '@vtt/engine/model/references';
import { tagsOf } from '@vtt/engine/model/lists';
import type { SlotContext, EarlierStep } from '../../slots.tsx';
import { outcomeRefs, isCalled } from '../../slots.tsx';
import type { QuickRef, QuickKind } from '../../condition-field.tsx';

const QUICK_KINDS: readonly string[] = ['boolean', 'number', 'text'];

export function quickOf(context: SlotContext, earlier: EarlierStep[]): QuickRef[] {
  const tagged = isCalled(context) ? tagsOf(context.system, context.effect) : [];
  return [
    ...(tagged.length ? [{ ref: CALL_TAGS, label: 'метки вызова', kind: 'tags' as const, tags: tagged }] : []),
    ...outcomeRefs(earlier).filter(o => QUICK_KINDS.includes(String(o.kind))).map(o => ({ ref: o.ref, label: o.label, kind: o.kind as QuickKind, ...(o.no ? { no: o.no } : {}) })),
  ];
}
