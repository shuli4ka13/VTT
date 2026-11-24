import { useState } from 'react';
import type { System, TagContract } from '@vtt/schema';
import { tagWords, rowTables, onSheet } from '@vtt/engine';
import { Card, CardHead, Field, Fold, Select, Button, DangerButton, Chip, LabelInput } from '../../../ui/primitives.tsx';
import { freeId, slugOf } from '../../../store/world.ts';
import { KEYS } from '../factory.ts';
import { dataT, useT } from '../../../i18n/author.ts';
import { rowSaid } from '../tag-said.ts';
import { TagsField } from '../tags-field.tsx';
import type { WorldState } from '../../../store/world.ts';

type EditSystem = WorldState['editSystem'];

export function TagsSection({ system, editSystem }: { system: System; editSystem: EditSystem }) {
  const t = useT('tables');
  const td = dataT(system);
  const tags = Object.entries(system.tags ?? {});
  const rows = [...tagWords(system)];
  const [open, setOpen] = useState<string | null>(null);
  const editTag = (key: string, change: (tag: TagContract) => void) => editSystem(draft => {
    const tag = draft.tags?.[key];
    if (tag) change(tag);
  });

  return (
    <>
      <Card>
        <CardHead
          title={t('tag.title')}
          sub={t('tag.sub')}
          actions={<Button size="sm" onClick={() => editSystem(draft => {
            const key = freeId(Object.keys(draft.tags ?? {}), KEYS.tag);
            (draft.tags ??= {})[key] = { label: td('tables:tag.new') };
            setOpen(key);
          })}>{t('tag.add')}</Button>}
        />
        {tags.length ? (
          <div className="inline inline--tight">
            {tags.map(([key, tag]) => (
              <Chip key={key} active={open === key} onClick={() => setOpen(open === key ? null : key)}>{tag.label ?? key}</Chip>
            ))}
          </div>
        ) : <span className="faint">{t('tag.empty')}</span>}
        {rows.length ? (
          <Fold title={t('tag.rolls')} summary={t('tag.rollsSummary', { n: rows.length })}>
            <span className="faint">{t('tag.rollsNote')}</span>
            <div className="inline inline--tight">
              {rows.map(([word, table]) => <Chip key={`${table}:${word}`} title={t('tag.fromTable', { table })}>{rowSaid(system, word)}</Chip>)}
            </div>
          </Fold>
        ) : null}
      </Card>

      {open && system.tags?.[open] ? (
        <Contract
          id={open} tag={system.tags[open]!} system={system}
          edit={change => editTag(open, change)}
          onDelete={() => { editSystem(draft => { delete draft.tags?.[open]; }); setOpen(null); }}
        />
      ) : null}
    </>
  );
}

const namesOf = (tag: TagContract): string[] => [...(tag.inputs ?? []).map(input => input.key), ...(tag.each ? [tag.each] : []), ...(tag.outputs ?? []).map(output => output.key), ...(tag.traits ?? []).map(trait => trait.key)];

function keyed(draft: TagContract, typed: string, fixed?: string): string {
  const text = typed.trim().replace(/\s+/g, ' ');
  const key = fixed ?? (slugOf(text) || text);
  if (key && key !== text) draft.said = { ...(draft.said ?? {}), [key]: text };
  return key;
}

function tidySaid(draft: TagContract): void {
  const used = new Set(namesOf(draft));
  const said = Object.fromEntries(Object.entries(draft.said ?? {}).filter(([key]) => used.has(key)));
  if (Object.keys(said).length) draft.said = said; else delete draft.said;
}

const saidOf = (tag: TagContract, key: string): string => tag.said?.[key] ?? key;

function Contract({ id, tag, system, edit, onDelete }: {
  id: string; tag: TagContract; system: System;
  edit: (change: (tag: TagContract) => void) => void;
  onDelete: () => void;
}) {
  const t = useT('tables');
  const td = dataT(system);
  const inputs = tag.inputs ?? [];
  const tables: [string, string][] = rowTables(system).filter(([, table]) => !onSheet(table)).map(([key, table]) => [key, table.label || key]);
  return (
    <Card>
      <CardHead
        title={<LabelInput value={tag.label ?? id} placeholder={t('common:name.tag')} onCommit={label => edit(draft => { draft.label = label; })} />}
        actions={<DangerButton size="sm" onConfirm={onDelete}>{t('common:delete')}</DangerButton>}
      />
      <Field label={t('tag.has')} hint={t('tag.hasHint')}>
        <div className="stack stack--tight">
          {inputs.map((input, index) => (
            <div key={index} className="inline inline--tight">
              <LabelInput value={saidOf(tag, input.key)} placeholder={t('tag.inputName')} onCommit={next => edit(draft => {
                const one = draft.inputs?.[index];
                if (!one || !next.trim()) return;
                one.key = keyed(draft, next);
                tidySaid(draft);
              })} />
              <Select<string>
                value={input.kind === 'sheet' ? (input.many ? 'sheets' : 'sheet') : input.kind === 'choice' && input.many ? 'choices' : String(input.kind)}
                options={[['sheet', t('tag.sheet')], ['sheets', t('tag.sheets')], ['number', t('tag.number')], ['boolean', t('tag.yesNo')], ['choice', t('tag.choice')], ['choices', t('tag.choices')]]}
                onChange={next => edit(draft => {
                  const one = draft.inputs?.[index];
                  if (!one) return;
                  one.kind = next === 'sheets' ? 'sheet' : next === 'choices' ? 'choice' : next as never;
                  if (next === 'sheets' || next === 'choices') one.many = true; else delete one.many;
                  if (next === 'choice' || next === 'choices') { if (tables[0]) one.from = one.from ?? tables[0][0]; } else delete one.from;
                })}
              />
              {input.kind === 'choice' ? (
                <Select<string>
                  value={input.from ?? ''}
                  options={[...(input.from ? [] : [['', t('tag.pickTable')] as const]), ...tables]}
                  onChange={next => edit(draft => { const one = draft.inputs?.[index]; if (!one) return; if (next) one.from = next; else delete one.from; })}
                />
              ) : null}
              <Button size="sm" variant="ghost" title={t('tag.removeInput')} onClick={() => edit(draft => {
                draft.inputs = (draft.inputs ?? []).filter((_, at) => at !== index);
                if (!draft.inputs.length) delete draft.inputs;
                tidySaid(draft);
              })}>×</Button>
            </div>
          ))}
          <Button size="sm" onClick={() => edit(draft => {
            const key = inputs.length ? keyed(draft, td('tables:tag.input', { n: inputs.length + 1 }), `vhod_${inputs.length + 1}`) : keyed(draft, td('tables:tag.actor'), KEYS.actor);
            (draft.inputs ??= []).push({ key, kind: 'sheet' });
          })}>{t('tag.addInput')}</Button>
        </div>
      </Field>
      <Fold title={t('common:more')} summary={t('tag.moreSummary')}>
        <div className="row">
          <Field label={t('tag.each')} hint={t('tag.eachHint')}>
            <LabelInput value={tag.each ? saidOf(tag, tag.each) : ''} placeholder={t('tag.eachPlaceholder')} onCommit={next => edit(draft => {
              if (next.trim()) draft.each = keyed(draft, next); else delete draft.each;
              tidySaid(draft);
            })} />
          </Field>
          <Field label={t('tag.outputs')} hint={t('tag.outputsHint')}>
            <div className="stack stack--tight">
              {(tag.outputs ?? []).map((output, index) => (
                <div key={index} className="inline inline--tight">
                  <LabelInput value={saidOf(tag, output.key)} placeholder={t('tag.outputName')} onCommit={next => edit(draft => {
                    const one = draft.outputs?.[index];
                    if (!one || !next.trim()) return;
                    one.key = keyed(draft, next);
                    tidySaid(draft);
                  })} />
                  <Select<string>
                    value={String(output.kind)}
                    options={[['boolean', t('tag.yesNo')], ['number', t('tag.number')], ['choice', t('tag.choice')]]}
                    onChange={next => edit(draft => {
                      const one = draft.outputs?.[index];
                      if (!one) return;
                      one.kind = next as never;
                      if (next === 'choice') one.from = one.from ?? tables[0]?.[0];
                      else delete one.from;
                      if (next === 'choice' && !one.from) delete one.from;
                    })}
                  />
                  {output.kind === 'choice' ? (
                    <Select<string>
                      value={output.from ?? ''}
                      options={tables}
                      onChange={next => edit(draft => { const one = draft.outputs?.[index]; if (one) one.from = next; })}
                    />
                  ) : null}
                  <Button size="sm" variant="ghost" title={t('tag.removeOutput')} onClick={() => edit(draft => {
                    draft.outputs = (draft.outputs ?? []).filter((_, at) => at !== index);
                    if (!draft.outputs.length) delete draft.outputs;
                    tidySaid(draft);
                  })}>×</Button>
                </div>
              ))}
              <Button size="sm" onClick={() => edit(draft => {
                const n = (draft.outputs ?? []).length + 1;
                (draft.outputs ??= []).push({ key: keyed(draft, td('tables:tag.output', { n }), `itog_${n}`), kind: 'boolean' });
              })}>{t('tag.addOutput')}</Button>
            </div>
          </Field>
          <Field label={t('tag.traits')} hint={t('tag.traitsHint')}>
            <div className="stack stack--tight">
              {(tag.traits ?? []).map((trait, index) => (
                <div key={index} className="inline inline--tight">
                  <LabelInput value={saidOf(tag, trait.key)} placeholder={t('tag.traitName')} onCommit={next => edit(draft => {
                    const one = draft.traits?.[index];
                    if (!one || !next.trim()) return;
                    one.key = keyed(draft, next);
                    tidySaid(draft);
                  })} />
                  <Select<string>
                    value={trait.from === undefined ? 'mark' : 'table'}
                    options={[['mark', t('tag.traitMark')], ['table', t('tag.traitTable')]]}
                    onChange={next => edit(draft => {
                      const one = draft.traits?.[index];
                      if (!one) return;
                      if (next === 'table') { if (tables[0]) one.from = tables[0][0]; } else delete one.from;
                    })}
                  />
                  {trait.from !== undefined ? (
                    <Select<string>
                      value={trait.from}
                      options={tables}
                      onChange={next => edit(draft => { const one = draft.traits?.[index]; if (one) one.from = next; })}
                    />
                  ) : null}
                  <Button size="sm" variant="ghost" title={t('tag.removeTrait')} onClick={() => edit(draft => {
                    draft.traits = (draft.traits ?? []).filter((_, at) => at !== index);
                    if (!draft.traits.length) delete draft.traits;
                    tidySaid(draft);
                  })}>×</Button>
                </div>
              ))}
              <Button size="sm" onClick={() => edit(draft => {
                const n = (draft.traits ?? []).length + 1;
                (draft.traits ??= []).push({ key: keyed(draft, td('tables:tag.trait', { n }), `priznak_${n}`) });
              })}>{t('tag.addTrait')}</Button>
            </div>
          </Field>
          <Field label={t('tag.includes')} hint={t('tag.includesHint')}>
            <TagsField
              system={{ ...system, tables: {} }}
              value={tag.includes}
              known={Object.keys(system.tags ?? {}).filter(key => key !== id)}
              onChange={next => edit(draft => { const list = next.filter((t): t is string => typeof t === 'string'); if (list.length) draft.includes = list; else delete draft.includes; })}
            />
          </Field>
        </div>
      </Fold>
    </Card>
  );
}
