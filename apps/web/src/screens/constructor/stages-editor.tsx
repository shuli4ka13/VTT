import type { Stage } from '@vtt/schema';
import { Field, LabelInput, Input, Select, Button, DangerButton } from '../../ui/primitives.tsx';
import { COMBINE_DEFAULT } from '@vtt/engine/engine/stages';
import { STAGE_WORDS } from '@vtt/engine/words/stages';

type Op = 'set' | 'add' | 'mul';

const nextKey = (stages: readonly Stage[]): string => {
  let n = stages.length + 1;
  while (stages.some(stage => stage.key === `этап_${n}`)) n += 1;
  return `этап_${n}`;
};

export function StagesEditor({ stages, onChange }: {
  stages: readonly Stage[] | undefined;
  onChange: (next: Stage[] | undefined) => void;
}) {
  const list = stages ?? [];
  const edit = (index: number, change: (stage: Stage) => void) => {
    const next = structuredClone(list) as Stage[];
    change(next[index]!);
    onChange(next);
  };
  const combineOf = (stage: Stage, op: Op): string => stage.combine?.[op] ?? COMBINE_DEFAULT[op];
  const setCombine = (index: number, op: Op, value: string) => edit(index, stage => {
    const combine = { ...(stage.combine ?? {}) } as Record<string, string>;
    if (value === COMBINE_DEFAULT[op]) delete combine[op]; else combine[op] = value;
    if (Object.keys(combine).length) stage.combine = combine as Stage['combine']; else delete stage.combine;
  });
  return (
    <Field label={STAGE_WORDS.title} hint={STAGE_WORDS.hint}>
      <div className="stages">
        {list.map((stage, index) => (
          <div key={stage.key} className="stages__row inline inline--tight" data-stage={stage.key}>
            <LabelInput
              value={stage.label ?? ''}
              placeholder={STAGE_WORDS.name}
              onCommit={label => edit(index, s => { if (label) s.label = label; else delete s.label; })}
            />
            {(['set', 'add', 'mul'] as const).map(op => (
              <Select
                key={op}
                label={STAGE_WORDS.ops[op]}
                value={combineOf(stage, op)}
                options={STAGE_WORDS.combine[op]}
                onChange={value => setCombine(index, op, value)}
              />
            ))}
            <Select
              label={STAGE_WORDS.roundLabel}
              value={stage.round ?? ''}
              options={STAGE_WORDS.round}
              onChange={round => edit(index, s => { if (round) s.round = round as Stage['round']; else delete s.round; })}
            />
            <Input
              type="number"
              value={stage.atLeast === undefined ? '' : String(stage.atLeast)}
              placeholder={STAGE_WORDS.atLeast}
              onChange={value => edit(index, s => { if (value.trim() === '' || Number.isNaN(Number(value))) delete s.atLeast; else s.atLeast = Number(value); })}
            />
            <DangerButton size="sm" onConfirm={() => {
              const next = list.filter((_, i) => i !== index);
              onChange(next.length ? next : undefined);
            }}>×</DangerButton>
          </div>
        ))}
        <Button size="sm" variant="ghost" onClick={() => onChange([...list, { key: nextKey(list), label: `${STAGE_WORDS.name} ${list.length + 1}` }])}>
          {STAGE_WORDS.add}
        </Button>
      </div>
    </Field>
  );
}
