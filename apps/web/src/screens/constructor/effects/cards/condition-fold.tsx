import type { System } from '@vtt/schema';
import { tagsOf, listOf } from '@vtt/engine/model/lists';
import { Field, Fold, Select, Input } from '../../../../ui/primitives.tsx';
import { SlotInput } from '../../slot-input.tsx';
import type { SlotContext } from '../../slots.tsx';
import type { CardGroup } from '../../cards.ts';
import type { Segment } from '../../readback.ts';
import { outputRefs, outputLabel } from '../../slots.tsx';
import type { EarlierStep } from '../../slots.tsx';
import type { EditFn } from '../words.ts';

type Bound = number | { tag: string } | { expr: string } | { param: string };

interface RowIs { table: string; column: string; is: unknown }

interface When { ref?: string; not?: boolean; atLeast?: Bound; atMost?: Bound; has?: string; where?: RowIs }

const EVENT_TAGS = 'event.tags';

const EVENT_TAGS_LABEL = 'метки вызова';

type WhenStep = { when?: When };

const boundWords = (bound: Bound | undefined): string => {
  if (bound === undefined || bound === null) return '';
  if (typeof bound !== 'object') return String(bound);
  if ('tag' in bound) return `«${bound.tag}»`;
  if ('param' in bound) return `«${bound.param}»`;
  if ('expr' in bound) return String(bound.expr);
  return '';
};

const numberWords = (when: When): string => {
  const low = boundWords(when.atLeast);
  const high = boundWords(when.atMost);
  if (low && high) return `от ${low} до ${high}`;
  if (low) return `не меньше ${low}`;
  if (high) return `не больше ${high}`;
  return 'любое число';
};

const rowIsWords = (where: RowIs, system?: System): string => {
  const table = system?.tables?.[where.table];
  const column = table?.columns?.find(c => c.key === where.column);
  return `у метки «${column?.label || where.column}» = «${String(where.is)}»`;
};

export const whenWords = (when: When | undefined, earlier: EarlierStep[], system?: System): string | null => {
  if (!when?.ref) return null;
  const label = when.ref === EVENT_TAGS ? EVENT_TAGS_LABEL : outputLabel(when.ref, earlier);
  if (when.where) {
    const parts = [when.has !== undefined ? `есть «${when.has}»` : '', rowIsWords(when.where, system)].filter(Boolean).join(' и ');
    return `${when.not ? 'не так, что ' : ''}${label}: ${parts}`;
  }
  if (when.has !== undefined) return `${label} ${when.not ? 'не' : ''} «${when.has}»`.replace('  ', ' ');
  if (when.atLeast !== undefined || when.atMost !== undefined) return `${label} ${numberWords(when)}`;
  return when.not ? label.replace(' — ', ' — не ') : label;
};

export function whenSegments(step: unknown, earlier: EarlierStep[], system?: System): Segment[] {
  const words = whenWords((step as WhenStep | null)?.when, earlier, system);
  return words ? [{ text: `Только если ${words}.` }] : [];
}

const KIND_OF = (ref: string | undefined, earlier: EarlierStep[]): string =>
  (ref === EVENT_TAGS ? 'tags' : outputRefs(earlier).find(o => o.ref === ref)?.kind ?? 'boolean');

const tablesOfTags = (system: System, tags: string[]) =>
  Object.entries(system.tables ?? {})
    .filter(([, t]) => (t.columns ?? []).length && (t.rows ?? []).some(r => tags.includes(String(r.value))))
    .map(([id, t]) => [id, t.label || id] as const);

export function ConditionFold({ group, earlier, edit, context }: {
  group: CardGroup;
  earlier: EarlierStep[];
  edit: EditFn;
  context: SlotContext;
}) {
  const when = (group.step as WhenStep).when;
  const system = context.system;
  const tagged = tagsOf(system, context.effect);
  const outputs = [
    ...(tagged.length ? [{ ref: EVENT_TAGS, label: EVENT_TAGS_LABEL }] : []),
    ...outputRefs(earlier).filter(o => o.kind === 'boolean' || o.kind === 'number' || o.kind === 'text'),
  ];
  if (!outputs.length && !when?.ref) return null;
  const setAll = (change: (draft: WhenStep) => void) =>
    group.indices.forEach((_, k) => edit(k, draft => change(draft as WhenStep)));
  const kind = KIND_OF(when?.ref, earlier);
  const summary = whenWords(when, earlier, system) ? `если ${whenWords(when, earlier, system)}` : 'всегда';
  const whereTable = when?.where ? system.tables?.[when.where.table] : undefined;
  const whereColumn = whereTable?.columns?.find(c => c.key === when?.where?.column);
  const whereValues = whereColumn?.kind === 'choice' ? (listOf(system, whereColumn.from) ?? []) : [];

  const keep = (draft: WhenStep, next: Partial<When>) => {
    const made: When = { ref: draft.when?.ref, ...next };
    for (const key of ['atLeast', 'atMost', 'has', 'not', 'where'] as const) {
      if (made[key] === undefined) delete made[key];
    }
    draft.when = made;
  };

  return (
    <Fold title="Делать этот шаг" summary={summary}>
      <div className="row">
        <Field label="делать" hint="Смотрит на исход шага выше. Не сошлось — этот шаг пропускается, цепочка идёт дальше.">
          <Select
            value={when?.ref ?? ''}
            options={[['', 'всегда'], ...outputs.map(o => [o.ref, `если ${o.label}`] as const)] as never}
            onChange={next => setAll(draft => {
              if (!next) { delete draft.when; return; }
              draft.when = { ref: next };
            })}
          />
        </Field>

        {when?.ref && kind === 'boolean' ? (
          <Field label="исход">
            <Select
              value={when.not ? 'no' : 'yes'}
              options={[['yes', 'да'], ['no', 'нет']] as const}
              onChange={next => setAll(draft => { keep(draft, next === 'no' ? { not: true } : {}); })}
            />
          </Field>
        ) : null}

        {when?.ref && kind === 'tags' ? (
          <>
            <Field label="есть метка" hint="Пусто — любая.">
              <Select
                value={when.has ?? ''}
                options={[['', '— любая —'], ...tagged.map(t => [t, t] as const)] as never}
                onChange={next => setAll(draft => {
                  keep(draft, { ...(next ? { has: next } : {}), where: draft.when?.where, not: draft.when?.not });
                })}
              />
            </Field>
            <Field label="где у метки" hint="Смотрит в строку метки в таблице: один факт вместо перечня меток.">
              <div className="inline inline--tight">
                <Select
                  value={when.where?.table ?? ''}
                  options={[['', '— без условия —'], ...tablesOfTags(system, tagged)] as never}
                  onChange={next => setAll(draft => {
                    const column = next ? system.tables?.[next]?.columns?.[0]?.key : undefined;
                    keep(draft, {
                      has: draft.when?.has, not: draft.when?.not,
                      ...(next && column ? { where: { table: next, column, is: '' } } : {}),
                    });
                  })}
                />
                {when.where ? (
                  <>
                    <Select
                      value={when.where.column}
                      options={(whereTable?.columns ?? []).map(c => [c.key, c.label || c.key] as const) as never}
                      onChange={next => setAll(draft => { keep(draft, { ...draft.when, where: { ...draft.when!.where!, column: next, is: '' } }); })}
                    />
                    <span className="faint">=</span>
                    {whereValues.length ? (
                      <Select
                        value={String(when.where.is ?? '')}
                        options={[['', '— что —'], ...whereValues.map(o => [String(o.value), o.label] as const)] as never}
                        onChange={next => setAll(draft => { keep(draft, { ...draft.when, where: { ...draft.when!.where!, is: next } }); })}
                      />
                    ) : (
                      <Input
                        value={String(when.where.is ?? '')}
                        onChange={next => setAll(draft => { keep(draft, { ...draft.when, where: { ...draft.when!.where!, is: next } }); })}
                      />
                    )}
                  </>
                ) : null}
              </div>
            </Field>
            <Field label="исход">
              <Select
                value={when.not ? 'no' : 'yes'}
                options={[['yes', 'так и есть'], ['no', 'не так']] as const}
                onChange={next => setAll(draft => {
                  keep(draft, { has: draft.when?.has, where: draft.when?.where, ...(next === 'no' ? { not: true } : {}) });
                })}
              />
            </Field>
          </>
        ) : null}

        {when?.ref && kind === 'number' ? (
          <>
            <Field label="не меньше" hint="Пусто — нижней границы нет.">
              <SlotInput
                value={when.atLeast as never} context={context} allow={['const', 'tag', 'expr', 'param']}
                onChange={next => setAll(draft => {
                  keep(draft, { atLeast: next as Bound | undefined, atMost: draft.when?.atMost });
                })}
              />
            </Field>
            <Field label="не больше" hint="Пусто — верхней границы нет.">
              <SlotInput
                value={when.atMost as never} context={context} allow={['const', 'tag', 'expr', 'param']}
                onChange={next => setAll(draft => {
                  keep(draft, { atLeast: draft.when?.atLeast, atMost: next as Bound | undefined });
                })}
              />
            </Field>
          </>
        ) : null}

        {when?.ref && kind === 'text' ? (
          <>
            <Field label="ступень" hint="Как она названа в таблице степеней.">
              <Input
                value={when.has ?? ''}
                onChange={next => setAll(draft => { keep(draft, { has: next, not: draft.when?.not }); })}
              />
            </Field>
            <Field label="исход">
              <Select
                value={when.not ? 'no' : 'yes'}
                options={[['yes', 'она и есть'], ['no', 'любая другая']] as const}
                onChange={next => setAll(draft => {
                  keep(draft, { has: draft.when?.has ?? '', ...(next === 'no' ? { not: true } : {}) });
                })}
              />
            </Field>
          </>
        ) : null}
      </div>
    </Fold>
  );
}

const OP_SIGN: Record<string, string> = { atLeast: '≥', notOver: '≤', over: '>', under: '<', equals: '=' };
const OP_NOT: Record<string, string> = { atLeast: '<', notOver: '>', over: '≤', under: '≥', equals: '≠' };

export function breakLine(group: CardGroup) {
  if (group.kind !== 'check') return null;
  const s = group.step as any;
  if (group.step.type === 'compare') {
    if (s.breakIf === 'never') return null;
    const broken = s.breakIf === 'atMost' ? '≤' : '<';
    const pass = s.breakIf === 'atMost' ? '>' : '≥';
    return (
      <div className="card-forks">
        <p className="card-break card-break--on">{pass} — цепочка продолжается</p>
        <p className="card-break">{broken} — эффект кончается здесь</p>
      </div>
    );
  }
  if ((s.continueOn ?? 'success') === 'always') return null;
  const op = String(s.successWhen ?? 'atLeast');
  const onSuccess = (s.continueOn ?? 'success') === 'success';
  const sign = OP_SIGN[op] ?? '≥';
  const not = OP_NOT[op] ?? '<';
  return (
    <div className="card-forks">
      <p className="card-break card-break--on">{onSuccess ? sign : not} — цепочка продолжается</p>
      <p className="card-break">{onSuccess ? not : sign} — эффект кончается здесь</p>
    </div>
  );
}
