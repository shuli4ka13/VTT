import type { System } from '@vtt/schema';
import { Field, Fold, Input } from '../../../../ui/primitives.tsx';
import { SheetPick } from '../../sheet-pick.tsx';
import { TypedPick } from '../../typed-pick.tsx';
import { sheetChoices } from '../../slots.tsx';
import type { SlotContext } from '../../slots.tsx';
import type { EditFn } from '../words.ts';
import { NAME_LABELS, ASK_WHOM } from '@vtt/engine';


const loose = (draft: unknown): Record<string, unknown> => draft as Record<string, unknown>;

export function AskBody({ step, context, edit, system }: { step: Record<string, unknown>; context: SlotContext; edit: EditFn; system: System }) {
  const text = (key: string) => (typeof step[key] === 'string' ? step[key] as string : '');
  const set = (key: string) => (next: string) => edit(0, draft => { if (next.trim()) loose(draft)[key] = next; else delete loose(draft)[key]; });
  const given = Boolean(text('yes') || text('no'));
  return (
    <>
      <div className="row">
        <Field label="Вопрос" needed={!text('label').trim()}>
          <Input value={text('label')} placeholder="Кто победил?" onChange={set('label')} />
        </Field>
        <Field label="Кого" hint="Кто отвечает на вопрос. Пусто — отвечает ведущий.">
          <TypedPick want={{ kind: 'sheet' }} value={step.to} context={context} blank={ASK_WHOM} label="Кого"
            onChange={next => edit(0, draft => { if (next) loose(draft).to = next; else delete loose(draft).to; })}>
            <SheetPick
              value={step.to} sheets={sheetChoices(context).singles} system={system} empty={ASK_WHOM} where="спросить · кого"
              onChange={next => edit(0, draft => { if (next) loose(draft).to = next; else delete loose(draft).to; })}
            />
          </TypedPick>
        </Field>
      </div>
      <Fold title="ещё" summary={given ? `${text('yes') || NAME_LABELS.yes} / ${text('no') || NAME_LABELS.no}` : undefined}>
        <div className="row">
          <Field label="Ответ «да» словами" hint="Подпись кнопки. Пусто — «да».">
            <Input value={text('yes')} placeholder={NAME_LABELS.yes} onChange={set('yes')} />
          </Field>
          <Field label="Ответ «нет» словами" hint="Подпись кнопки. Пусто — «нет».">
            <Input value={text('no')} placeholder={NAME_LABELS.no} onChange={set('no')} />
          </Field>
        </div>
      </Fold>
    </>
  );
}
