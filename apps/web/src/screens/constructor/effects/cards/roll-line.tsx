import type { ReactNode } from 'react';
import type { System } from '@vtt/schema';
import { SheetPick } from '../../sheet-pick.tsx';
import { TagsField } from '../../tags-field.tsx';
import type { TagValue } from '../../tags-field.tsx';
import { sheetChoices } from '../../slots.tsx';
import type { SlotContext } from '../../slots.tsx';

function Part({ label, title, wide = false, children }: { label: string; title: string; wide?: boolean; children: ReactNode }) {
  return (
    <span className={`field roll-line__part${wide ? ' roll-line__part--wide' : ''}`} title={title}>
      <span className="field__label">{label}</span>
      {children}
    </span>
  );
}

export function RollLine({ roll, context, system, onRoll, owned = true, keep = false }: {
  roll: Record<string, unknown>;
  context: SlotContext;
  system: System;
  onRoll: (change: (draft: Record<string, unknown>) => void) => void;
  owned?: boolean;
  keep?: boolean;
}) {
  const { singles, firsts, lists, shared: overAll } = sheetChoices(context);
  const shared = overAll && !roll.against;
  return (
    <div className="roll-line">
      <Part label="Бросает" title="Кто бросает — на его бросок действуют правки (преимущество, «Благословение») и вопросы «увидев кости». Пусто — просто расчёт, кости без правок.">
        <SheetPick value={roll.by} sheets={singles} system={system} where="бросок · бросает" empty="— расчёт —"
          onChange={next => { if (!next && keep) return; onRoll(draft => { if (next) draft.by = next; else { delete draft.by; delete draft.against; } }); }} />
      </Part>
      {owned && roll.by ? (
        <>
          <Part label="Против кого" title={shared
            ? 'Бросок выше «Для каждого из» — один на все цели, поэтому ни против кого: правки «против меня» («Ослеплён», «Уязвим») не действуют. Нужны правки по каждой цели — поставьте бросок ниже «Для каждого из».'
            : 'Для правок по тому, против кого бросают: «Ослеплён» даёт преимущество тем, кто бросает против него.'}>
            <SheetPick value={roll.against} sheets={singles} system={system} where="бросок · против кого" known={lists}
              empty={shared ? 'ни против кого — бросок один на все цели' : 'ни против кого'} extra={firsts}
              onChange={next => onRoll(draft => { if (next) draft.against = next; else delete draft.against; })} />
          </Part>
          <Part label="Метки" wide title="По меткам бросок находят правки и подписки: «атака», «спасбросок», «ловкость»">
            <TagsField system={system} value={(roll.tags ?? []) as TagValue[]} computed empty="+ метка"
              onChange={next => onRoll(draft => { if (next.length) draft.tags = next; else delete draft.tags; })} />
          </Part>
        </>
      ) : null}
    </div>
  );
}
