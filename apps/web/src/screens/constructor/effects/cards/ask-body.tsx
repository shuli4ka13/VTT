import type { System } from '@vtt/schema';
import { Field, Fold, Input } from '../../../../ui/primitives.tsx';
import { SheetPick } from '../../sheet-pick.tsx';
import { sheetChoices } from '../../slots.tsx';
import type { SlotContext } from '../../slots.tsx';
import type { EditFn } from '../words.ts';
import { ASK_YES, ASK_NO, ASK_WHOM } from '@vtt/engine/words/steps';


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
          <SheetPick
            value={step.to} sheets={sheetChoices(context).singles} system={system} empty={ASK_WHOM} where="спросить · кого"
            onChange={next => edit(0, draft => { if (next) loose(draft).to = next; else delete loose(draft).to; })}
          />
        </Field>
      </div>
      <Fold title="ещё" summary={given ? `${text('yes') || ASK_YES} / ${text('no') || ASK_NO}` : undefined}>
        <div className="row">
          <Field label="Ответ «да» словами" hint="Подпись кнопки. Пусто — «да».">
            <Input value={text('yes')} placeholder={ASK_YES} onChange={set('yes')} />
          </Field>
          <Field label="Ответ «нет» словами" hint="Подпись кнопки. Пусто — «нет».">
            <Input value={text('no')} placeholder={ASK_NO} onChange={set('no')} />
          </Field>
        </div>
      </Fold>
    </>
  );
}
