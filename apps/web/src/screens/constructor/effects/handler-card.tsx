import { groupSteps } from '../cards.ts';
import { useState } from 'react';
import { Card, CardHead, Field, Select, DangerButton, Button } from '../../../ui/primitives.tsx';
import { formulaWords } from '../../../ui/formula-words.ts';
import { MOMENTS as TIMES, MOMENT_PREFIX, FIELD_PREFIX, GAINED_PREFIX, LOST_PREFIX, PHASES, SEEN, seenLabel, ROLLED, rolledLabel, ANY_ACTION, callHappening, happeningOf, fieldsOf, TARGETS_SEED, HOLDER, compile, printFormula, andParts, namesAt, splitsTargets } from '@vtt/engine';
import type { Phase, MomentKey, Node } from '@vtt/engine';
import { sheetsAt, placeNamesAt, placeTablesAt } from './names.ts';
import { ConditionField } from '../condition-field.tsx';
import { RollsPick } from '../rolls-pick.tsx';
import { WhileWhenRow } from './while-when.tsx';
import { cardTitle } from './words.ts';
import { outcomeRefs, fieldedOf } from '../slots.tsx';
import type { System, Handler } from '@vtt/schema';
import { tagSaid } from '../tag-said.ts';
import { useT, t as tt } from '../../../i18n/author.ts';

type Kind = 'call' | 'seen' | 'rolled' | 'moment' | 'field' | 'gained' | 'lost';

const kinds = (): readonly (readonly [Kind, string])[] => [
  ['call', tt('effects:handler.kind.call')],
  ['seen', seenLabel()],
  ['rolled', rolledLabel()],
  ['moment', tt('effects:handler.kind.moment')],
  ['field', tt('effects:handler.kind.field')],
  ['gained', tt('effects:handler.kind.gained')],
  ['lost', tt('effects:handler.kind.lost')],
];

const phaseOptions = () => (Object.keys(PHASES) as Phase[]).map(key => [key, PHASES[key].label] as const);

const kindOf = (on: string): Kind => {
  if (on === SEEN) return 'seen';
  if (on === ROLLED) return 'rolled';
  if (on.startsWith(MOMENT_PREFIX)) return 'moment';
  if (on.startsWith(FIELD_PREFIX)) return 'field';
  if (on.startsWith(GAINED_PREFIX)) return 'gained';
  if (on.startsWith(LOST_PREFIX)) return 'lost';
  return 'call';
};

const subjectOf = (on: string): string => {
  const call = callHappening(on);
  if (call) return call.of;
  const at = on.indexOf(':');
  return at > 0 ? on.slice(at + 1) : '';
};

const PREFIX: Record<Exclude<Kind, 'call' | 'seen' | 'rolled'>, string> = {
  moment: MOMENT_PREFIX, field: FIELD_PREFIX, gained: GAINED_PREFIX, lost: LOST_PREFIX,
};

type Named = readonly (readonly [string, { label?: string | undefined }])[];

const callSubjects = (tags: Named, actions: Named, genitive: boolean): (readonly [string, string])[] => [
  [ANY_ACTION, genitive ? tt('effects:handler.anyActionGen') : tt('effects:handler.anyAction')],
  ...tags.map(([key, tag]) => [key, genitive ? tt('effects:handler.tagGen', { name: tag.label ?? key }) : tt('effects:handler.tag', { name: tag.label ?? key })] as const),
  ...actions.map(([key, e]) => [key, `«${e.label ?? key}»`] as const),
];

function outcomesOf(system: System, listened: string, phase: Phase): (readonly [string, string])[] {
  const source = system.effects[listened];
  if (!source) return [];
  const steps = source.steps ?? [];
  const split = steps.findIndex(step => splitsTargets(step));
  const cards = groupSteps(steps);
  const earlier = steps.flatMap((step, index) => {
    const title = cardTitle(cards, index, system, source);
    return step.id ? [{ id: String(step.id), ...(step.label ? { label: step.label } : {}), type: step.type, ...fieldedOf(system, source.params ?? [], step), ...(title ? { title } : {}) }] : [];
  });
  return outcomeRefs(earlier).filter(output => output.kind === 'boolean').map(output => {
    const index = steps.findIndex(step => step.id && output.ref.startsWith(`${step.id}.`));
    const path = output.ref.slice(String(steps[index]!.id).length);
    return phase === 'done' && split >= 0 && index > split
      ? [`count(@${TARGETS_SEED}.${steps[index]!.id}${path}, true) >= 1`, tt('effects:handler.anyTarget', { label: output.label })] as const
      : [`@${output.ref}`, output.label] as const;
  });
}

function heardOutcomes(system: System, id: string, index: number): (readonly [string, string])[] {
  const out: (readonly [string, string])[] = [];
  for (const one of namesAt(system, id, { part: 'handler-if', handler: index })) {
    if (one.group !== 'heard') continue;
    for (const child of one.children ?? []) {
      if (child.kind !== 'boolean') continue;
      out.push(one.name === TARGETS_SEED
        ? [`count(@${one.name}${child.path}, true) >= 1`, tt('effects:handler.anyTarget', { label: child.label })] as const
        : [`@${one.name}${child.path}`, `${one.label} — ${child.label}`] as const);
    }
  }
  return out;
}

export function HandlerCard({ id, index, handler, system, edit, onRemove, startOpen = false }: {
  startOpen?: boolean;
  id: string;
  index: number;
  handler: Handler;
  system: System;
  edit: (change: (draft: Handler) => void) => void;
  onRemove: () => void;
}) {
  const t = useT('effects');
  const [open, setOpen] = useState(!handler.on || startOpen);
  const kind = kindOf(handler.on ?? '');
  const subject = subjectOf(handler.on ?? '');
  const phase = callHappening(handler.on)?.phase ?? 'before';
  const sheets = sheetsAt(system, id, { part: 'handler-if', handler: index });
  const names = [...sheets].filter(([name]) => name !== HOLDER);
  const own = kind === 'call' && subject ? outcomesOf(system, subject, phase) : [];
  const outcomes = own.length || kind !== 'call' ? own : heardOutcomes(system, id, index);
  const watchable = fieldsOf(system).filter(f => f.value.kind !== 'stored' || f.value.type === 'boolean');
  const hanging = Object.entries(system.effects).filter(([key, e]) => key !== id && (e.activation ?? 'manual') === 'passive');
  const actions = Object.entries(system.effects).filter(([key, e]) => key !== id && (e.activation ?? 'manual') === 'manual');
  const tags = Object.entries(system.tags ?? {});

  const effectTags = [...new Set(Object.values(system.effects).flatMap(e => e.tags ?? []))]
    .filter(tag => !hanging.some(([key]) => key === tag));

  const subjects: (readonly [string, string] | readonly [string, string, string])[] = kind === 'call'
    ? callSubjects(tags, actions, false)
    : kind === 'moment' ? (Object.keys(TIMES) as MomentKey[]).map(key => [key, TIMES[key]] as const)
      : kind === 'field' ? watchable.map(f => [f.tag, `«${f.label}»`] as const)
        : kind === 'gained' || kind === 'lost' ? [
          ...hanging.map(([key, e]) => [key, `«${e.label ?? key}»`] as const),
          ...effectTags.map(tag => [tag, t('handler.withTag', { name: tagSaid(system, tag) }), t('handler.tagsGroup')] as const),
        ]
          : [];

  const setOn = (nextKind: Kind, nextSubject: string, nextPhase: Phase) => edit(draft => {
    draft.on = nextKind === 'seen' ? SEEN
      : nextKind === 'rolled' ? ROLLED
      : nextKind === 'call' ? happeningOf(nextPhase, nextSubject || ANY_ACTION)
        : `${PREFIX[nextKind]}${nextSubject}`;
    delete draft.if;
    if (nextKind !== 'seen' && nextKind !== 'rolled') { delete draft.tags; delete draft.anyTags; delete draft.notTags; }
  });
  const setTags = (key: 'tags' | 'anyTags' | 'notTags', next: readonly unknown[]) => edit(draft => {
    const list = next.filter((tag): tag is string => typeof tag === 'string');
    if (list.length) draft[key] = list; else delete draft[key];
  });
  const setIf = (expr: string | null) => edit(draft => {
    if (expr) draft.if = { expr }; else delete draft.if;
  });
  const visible = placeNamesAt(system, id, { part: 'handler-if', handler: index });
  const tables = placeTablesAt(system, id, { part: 'handler-if', handler: index });

  const spoken = kind === 'call' && phase !== 'done' ? callSubjects(tags, actions, true) : subjects;
  const subjectWord = spoken.find(([key]) => key === subject)?.[1] ?? (kind === 'field' ? fieldsOf(system).find(f => f.tag === subject)?.label : undefined) ?? tagSaid(system, subject);
  const quoted = (list?: readonly string[]): string => (list ?? []).map(tag => `«${tagSaid(system, tag)}»`).join(', ');
  const filter = [
    handler.tags?.length ? t('handler.filter.only', { list: quoted(handler.tags) }) : '',
    handler.anyTags?.length ? t('handler.filter.any', { list: quoted(handler.anyTags) }) : '',
    handler.notTags?.length ? t('handler.filter.not', { list: quoted(handler.notTags) }) : '',
  ].filter(Boolean).join(', ');
  const happened = kind === 'seen' ? `${seenLabel()}${filter ? `, ${filter}` : ''}`
    : kind === 'rolled' ? `${rolledLabel()}${filter ? `, ${filter}` : ''}`
    : kind === 'call' ? `${PHASES[phase].label} ${subjectWord}`
      : kind === 'moment' ? subjectWord
        : kind === 'field' ? t('handler.fieldTrue', { name: subjectWord })
          : kind === 'gained' ? t('handler.gainedWord', { name: subjectWord }) : t('handler.lostWord', { name: subjectWord });
  const condition = (() => {
    const text = handler.if?.expr?.trim();
    if (!text) return '';
    let parts: Node[];
    try { parts = andParts(compile(text).ast); } catch { return formulaWords(system, text, visible, tables); }
    return parts.map(part => {
      const holder = part.kind === 'Binary' && part.op === '==' && part.left.kind === 'Ref' && part.right.kind === 'Ref' && part.right.tag === HOLDER ? part.left.tag : null;
      const label = holder ? names.find(([name]) => name === holder)?.[1] : undefined;
      return label ? t('handler.holderIs', { name: label }) : formulaWords(system, printFormula(part), visible, tables);
    }).join(` ${t('handler.and')} `);
  })();
  const said = happened || t('handler.what');
  const sentence = condition
    ? (handler.confirm ? t('handler.sentence.both', { said, condition }) : t('handler.sentence.ifOnly', { said, condition }))
    : (handler.confirm ? t('handler.sentence.decides', { said }) : said);

  if (!open) {
    return (
      <WhileWhenRow when label={t('common:fold.expand', { name: t('handler.when', { sentence }) })} onOpen={() => setOpen(true)} onRemove={onRemove}>
        {sentence}
      </WhileWhenRow>
    );
  }

  return (
    <Card className="mod-card">
      <CardHead
        title={t('handler.title', { n: index + 1, sentence })}
        actions={<>
          <Button size="sm" variant="ghost" ariaLabel={t('common:fold.collapse', { name: t('handler.when', { sentence }) })} onClick={() => setOpen(false)}>{t('common:collapse')}</Button>
          <DangerButton size="sm" onConfirm={onRemove}>{t('common:delete')}</DangerButton>
        </>}
      />

      <div className="row">
        <Field label={t('handler.happened')} needed={!handler.on}>
          <Select<Kind>
            value={kind}
            options={kinds()}
            onChange={next => setOn(next, '', 'before')}
          />
        </Field>
        {kind === 'seen' || kind === 'rolled' ? null : (
          <Field label={kind === 'call' ? t('handler.subject.call') : kind === 'moment' ? t('handler.subject.moment') : t('handler.subject.other')} needed={!subject}>
            <Select<string>
              value={subject}
              options={[...(subject ? [] : [['', t('common:choose')] as const]), ...(subject && !subjects.some(([key]) => key === subject) ? [[subject, subjectWord] as const] : []), ...subjects]}
              onChange={next => setOn(kind, next, phase)}
            />
          </Field>
        )}
        {kind === 'call' ? (
          <Field label={t('handler.phase')} hint={PHASES[phase].note}>
            <Select<Phase> value={phase} options={phaseOptions()} onChange={next => setOn(kind, subject, next)} />
          </Field>
        ) : null}
      </div>

      {kind === 'seen' || kind === 'rolled' ? (
        <div className="row">
          <RollsPick boxed tips system={system} value={{ tags: handler.tags, anyTags: handler.anyTags, notTags: handler.notTags }} onChange={(key, next) => setTags(key, next)} />
        </div>
      ) : null}

      <div className="stack">
        <ConditionField
          value={handler.if?.expr}
          onChange={setIf}
          system={system}
          holders={names.map(([name, label]) => [name, t('handler.holderIs', { name: label })] as const)}
          phrases={outcomes.map(([expr, label]) => ({ expr, label }))}
          names={visible}
          sheets={sheets}
          where={t('handler.where', { n: index + 1 })}
          placeholder={phase === 'done' ? t('handler.placeholderDone') : t('handler.placeholder')}
          holderHint=""
          holderTip={t('handler.holderTip')}
          aside={(
            <Field label={t('handler.decision')}>
              <Select<string>
                value={handler.confirm ? 'ask' : ''}
                options={[['', t('handler.auto')], ['ask', t('handler.asks')]]}
                onChange={next => edit(draft => { if (next) draft.confirm = true; else delete draft.confirm; })}
              />
            </Field>
          )}
        />
      </div>
    </Card>
  );
}
