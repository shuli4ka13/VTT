import { useWorld } from '../../../store/world.ts';
import { Card, CardHead, Field, Input, DangerButton, Verdict, LabelInput } from '../../../ui/primitives.tsx';
import { Chain } from './chain.tsx';
import type { System, Effect, SystemEvent } from '@vtt/schema';

export const COMMON_PREFIX = 'event:';

export const commonKeyOf = (activeId: string | null): string | null =>
  (activeId && activeId.startsWith(COMMON_PREFIX) ? activeId.slice(COMMON_PREFIX.length) : null);

export function CommonEffectEditor({ id, event, system }: { id: string; event: SystemEvent; system: System }) {
  const editSystem = useWorld(s => s.editSystem);
  const editRules = useWorld(s => s.editRules);
  const pick = useWorld(s => s.pick);

  const edit = (change: (draft: SystemEvent) => void) => editRules(draft => {
    const target = draft.events?.[id];
    if (target) change(target);
  });

  const asEffect = { label: event.label ?? id, steps: event.receive ?? [] } as Effect;

  const editChain = (change: (draft: Effect) => void) => edit(draft => {
    const carrier = { label: draft.label, steps: draft.receive ?? [] } as Effect;
    change(carrier);
    draft.receive = carrier.steps ?? [];
  });

  const tags = event.tags ?? [];

  return (
    <>
      <Card>
        <CardHead
          title={<LabelInput value={event.label ?? ''} placeholder="как зовётся общий эффект" onCommit={label => edit(draft => { draft.label = label; })} />}
          sub="Общий эффект: его вызывают другие эффекты шагом «вызвать». Здесь написано, что он делает с целью."
          actions={
            <DangerButton size="sm" onConfirm={() => {
              editSystem(draft => { delete draft.events?.[id]; });
              pick({ activeEffectId: null });
            }}>
              Удалить
            </DangerButton>
          }
        />

        <Field label="Теги" hint="Через запятую: огонь, холод, яд. По ним цель узнаёт своё сопротивление.">
          <Input
            value={tags.join(', ')}
            placeholder="огонь, холод, яд — через запятую"
            onChange={text => edit(draft => {
              const list = text.split(',').map(s => s.trim()).filter(Boolean);
              if (list.length) draft.tags = list; else delete draft.tags;
            })}
          />
        </Field>

        {event.receive?.length
          ? null
          : <Verdict tone="warn">Шагов нет: вызов дойдёт до цели, но сам ничего не изменит. Его услышат только те, кто на него подписан.</Verdict>}
      </Card>

      <Chain effect={asEffect} system={system} edit={editChain} />
    </>
  );
}
