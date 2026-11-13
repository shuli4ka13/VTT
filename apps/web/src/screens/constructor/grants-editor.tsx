import type { System } from '@vtt/schema';
import { Button } from '../../ui/primitives.tsx';
import { MultiChoice } from '../../ui/multi-choice.tsx';
import { calledOf, isPipeline } from '@vtt/engine/engine/effects';

export function GrantsEditor({ system, value, onChange, except, hanging = false, onCreate }: {
  system: System;
  value: string[] | undefined;
  onChange: (next: string[] | undefined) => void;
  except?: string;
  hanging?: boolean;
  onCreate?: () => void;
}) {
  const called = new Set(calledOf(system).map(([key]) => key));
  const options = Object.entries(system.effects)
    .filter(([key, effect]) => key !== except && !called.has(key) && !(hanging && isPipeline(effect)))
    .map(([key, effect]) => ({ value: key, label: effect.label || key, group: isPipeline(effect) ? 'кнопки' : 'правила' }));
  const create = onCreate ? <Button size="sm" variant="ghost" onClick={onCreate}>+ новое правило</Button> : null;
  if (!options.length && !(value ?? []).length) {
    return (
      <div className="inline inline--tight">
        <span className="faint">
          {onCreate ? 'Выдавать пока нечего.' : 'Выдавать пока нечего — заведите эффект на вкладке «Эффекты»: «+ висит» или «+ кнопкой».'}
        </span>
        {create}
      </div>
    );
  }
  const list = <MultiChoice value={value ?? []} options={options} onChange={next => onChange(next.length ? next : undefined)} />;
  if (!create) return list;
  return <div className="inline inline--tight">{list}{create}</div>;
}
