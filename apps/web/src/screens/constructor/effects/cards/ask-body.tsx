import type { System } from '@vtt/schema';
import { Field, Fold, Input } from '../../../../ui/primitives.tsx';
import { SheetPick } from '../../sheet-pick.tsx';
import { TypedPick } from '../../typed-pick.tsx';
import { sheetChoices } from '../../slots.tsx';
import type { SlotContext } from '../../slots.tsx';
import type { EditFn } from '../words.ts';
import { NAME_LABELS, ASK_WHOM } from '@vtt/engine';
import { useT } from '../../../../i18n/author.ts';


const loose = (draft: unknown): Record<string, unknown> => draft as Record<string, unknown>;

export function AskBody({ step, context, edit, system }: { step: Record<string, unknown>; context: SlotContext; edit: EditFn; system: System }) {
  const t = useT('stepCards');
  const text = (key: string) => (typeof step[key] === 'string' ? step[key] as string : '');
  const set = (key: string) => (next: string) => edit(0, draft => { if (next.trim()) loose(draft)[key] = next; else delete loose(draft)[key]; });
  const given = Boolean(text('yes') || text('no'));
  return (
    <>
      <div className="row">
        <Field label={t('ask.question.label')} needed={!text('question').trim()}>
          <Input value={text('question')} placeholder={t('ask.question.placeholder')} onChange={set('question')} />
        </Field>
        <Field label={t('ask.whom.label')} hint={t('ask.whom.hint')}>
          <TypedPick want={{ kind: 'sheet' }} value={step.to} context={context} blank={ASK_WHOM} label={t('ask.whom.label')}
            onChange={next => edit(0, draft => { if (next) loose(draft).to = next; else delete loose(draft).to; })}>
            <SheetPick
              value={step.to} sheets={sheetChoices(context).singles} system={system} empty={ASK_WHOM} where={t('ask.whom.where')}
              onChange={next => edit(0, draft => { if (next) loose(draft).to = next; else delete loose(draft).to; })}
            />
          </TypedPick>
        </Field>
      </div>
      <Fold title={t('common:more')} summary={given ? `${text('yes') || NAME_LABELS.yes} / ${text('no') || NAME_LABELS.no}` : undefined}>
        <div className="row">
          <Field label={t('ask.yes.label')} hint={t('ask.yes.hint')}>
            <Input value={text('yes')} placeholder={NAME_LABELS.yes} onChange={set('yes')} />
          </Field>
          <Field label={t('ask.no.label')} hint={t('ask.no.hint')}>
            <Input value={text('no')} placeholder={NAME_LABELS.no} onChange={set('no')} />
          </Field>
        </div>
      </Fold>
    </>
  );
}
