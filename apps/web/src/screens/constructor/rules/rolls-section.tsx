import { useState } from 'react';
import { Card, CardHead, Button, DangerButton, Input, Select, Empty } from '../../../ui/primitives.tsx';
import { MultiCombo } from '../../../ui/combo.tsx';
import { blockLabel, NAMES, NAME_LABELS, NO_BLOCK, resultsOf, fieldsOf, onSheet, isSingle, STEP_WORDS, ROLL_NUMBER_WORDS, rollNumberWord, numbersOf, shapeOf } from '@vtt/engine';
import type { DieConstant } from '@vtt/engine';
import { TagsField } from '../tags-field.tsx';
import { FormulaField } from '../../../ui/formula-field.tsx';
import { dieEntries } from './dice-section.tsx';
import { addRoll } from './rolls.ts';
import { DegreesEditor } from '../degrees-editor.tsx';
import { blockOfColumn, byBlock } from '../field-groups.ts';
import type { Grouped } from '../field-groups.ts';
import type { System, SystemRoll } from '@vtt/schema';
import type { WorldState } from '../../../store/world.ts';
import { editsOnRule } from '../modifier-words.ts';
import { tagsSaid } from '../tag-said.ts';
import { useT, t } from '../../../i18n/author.ts';

type EditSystem = WorldState['editSystem'];


type Words = readonly (readonly [string, string, string])[];

const zeroWords = () => [['', t('rolls:zero.none')], ['worst', t('rolls:zero.worst')], ['best', t('rolls:zero.best')]] as const;

const ruleWords = (): Words => [
  [NAMES.roll, NAME_LABELS.roll, t('rolls:rule.roll')],
  [NAMES.rolled, NAME_LABELS.rolled, t('rolls:rule.rolled')],
  [NAMES.number, t('rolls:rule.numberLabel'), t('rolls:rule.number')],
  [NAMES.threshold, NAME_LABELS.threshold, t('rolls:rule.threshold')],
];

const degreeWords = (): Words => [
  ...ruleWords(),
  [NAMES.success, NAME_LABELS.success, t('rolls:rule.success')],
  [NAMES.margin, NAME_LABELS.margin, t('rolls:rule.margin')],
];

const namesFor = (words: Words, system: System, roll: SystemRoll) => {
  const out = new Map<string, string>(words.map(([key, label]) => [key, label]));
  for (const one of resultsOf(system, [], { type: 'roll', die: roll.die } as never)) if (one.path) out.set(`${NAMES.roll}${one.path}`, one.label);
  return out;
};

const degreeMeanings = () => new Map<string, string>(degreeWords().map(([key, , meaning]) => [key, t('rolls:rule.meaning', { meaning })]));

function Arrived({ words }: { words: Words }) {
  const t = useT('rolls');
  return (
    <span className="roll-arrived">
      {words.map(([key, label, meaning]) => <span key={key} className="roll-arrived__name" title={meaning}>{label}</span>)}
      <span className="faint">{t('arrived.hint')}</span>
    </span>
  );
}

function columnsOf(system: System): Grouped[] {
  const out: Grouped[] = [];
  const blockOf = blockOfColumn(system);
  for (const [id, table] of Object.entries(system.tables ?? {})) {
    if (!onSheet(table)) continue;
    for (const column of table.columns ?? []) {
      if ((column.kind ?? 'number') !== 'number') continue;
      const name = column.label || column.key;
      out.push([`${id}\u0000${column.key}`, isSingle(table) ? name : `${table.label || id} → ${name}`, blockOf(id, column.key)]);
    }
  }
  return byBlock(system, out);
}

const kindWords = (): Record<string, string> => ({ number: t('rolls:kind.number'), boolean: t('rolls:kind.boolean'), text: t('rolls:kind.text') });

function FlowList({ rows }: { rows: Words }) {
  return (
    <table className="roll-flow">
      <tbody>
        {rows.map(([name, kind, said]) => (
          <tr key={name}>
            <td className="roll-flow__name">{name}</td>
            <td className="roll-flow__kind">{kind}</td>
            <td className="roll-flow__said">{said}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function RollFlow({ roll }: { roll: SystemRoll }) {
  const t = useT('rolls');
  const kinds = kindWords();
  const fieldGate = roll.fields.some(one => one.threshold !== undefined);
  const graded = roll.number === 'under' || roll.number === 'over' || fieldGate;
  const gate = fieldGate && roll.number !== 'under' && roll.number !== 'over' ? t('flow.gate') : '';
  const common = (STEP_WORDS.roll.outputs as readonly { label: string; kind?: string; onlyWith?: string }[]).filter(one => !one.onlyWith && one.kind !== 'roll')
    .map(one => [one.label.replace(/^да или нет: /, ''), kinds[one.kind ?? 'number'] ?? '', t('flow.any')] as const);
  const own: (readonly [string, string, string])[] = [
    ...(graded || roll.success ? [[t('flow.passed'), kinds.boolean!, roll.success ? t('flow.successRule') : roll.number === 'under' ? t('flow.underSaid') : t('flow.overSaid', { gate })] as const] : []),
    ...(graded || roll.margin ? [[t('flow.margin'), kinds.number!, roll.margin ? t('flow.marginRule') : roll.number === 'under' ? t('flow.marginUnder') : t('flow.marginOver', { gate })] as const] : []),
    ...((Array.isArray(roll.degrees) ? roll.degrees.length : roll.degrees) ? [[t('flow.degree'), kinds.text!, t('flow.degreeRule')] as const] : []),
  ];
  return (
    <>
      <div className="dict-row roll-line roll-line--top">
        <span className="dict-row__label" title={t('flow.title')}>{t('flow.label')}</span>
        <div className="roll-form__body roll-form__body--stack">
          <FlowList rows={[...own, ...common]} />
        </div>
      </div>
    </>
  );
}

const SHOWN = 6;

function EditsOnRule({ system, id }: { system: System; id: string }) {
  const t = useT('rolls');
  const { named, all } = editsOnRule(system, id);
  if (!named.length && !all.length) return null;
  const list = (items: string[]) => (items.length > SHOWN ? t('edits.rule.more', { list: items.slice(0, SHOWN).join(', '), n: items.length - SHOWN }) : items.join(', '));
  const parts = [
    named.length ? list(named.map(([label, what]) => `«${label}» — ${what}`)) : '',
    all.length ? t('edits.rule.all', { list: list(all.map(label => `«${label}»`)) }) : '',
  ].filter(Boolean);
  return (
    <div className="dict-row roll-line">
      <span className="dict-row__label" title={t('edits.rule.title')}>{t('edits.rule.label')}</span>
      <span className="faint">{parts.join('; ')}</span>
    </div>
  );
}

function RollRow({ id, roll, system, editSystem }: { id: string; roll: SystemRoll; system: System; editSystem: EditSystem }) {
  const t = useT('rolls');
  const edit = (change: (draft: SystemRoll) => void) => editSystem(draft => { const one = draft.rolls?.[id]; if (one) change(one); });
  const columns = columnsOf(system);
  const taken = new Set(Object.values(system.rolls ?? {}).flatMap(one => one.fields.map(f => `${f.table}\u0000${f.column}`)));
  const [service, setService] = useState(false);
  const untaken = columns.filter(([key]) => !taken.has(key));
  const hidden = untaken.filter(([, , group]) => group === NO_BLOCK).length;
  const dice = dieEntries(system);
  const die = dice.find(([key]) => key === roll.die)?.[1] as DieConstant | undefined;
  const allowed: readonly string[] = die ? numbersOf(die, roll.pair === true) : ROLL_NUMBER_WORDS.map(([key]) => key);
  const current = roll.number ?? 'bonus';
  const numberOptions: (readonly [string, string])[] = [
    ...ROLL_NUMBER_WORDS.filter(([key]) => allowed.includes(key)),
    ...(allowed.includes(current) ? [] : [[current, t('row.notFit', { word: rollNumberWord(current) })] as const]),
  ];
  const showPair = roll.pair === true || (die ? shapeOf(die) === 'parts' : false);
  const graded = roll.number === 'under' || roll.number === 'over' || Boolean(roll.success || roll.margin);
  const ruleNames = namesFor(ruleWords(), system, roll);
  const degreeNames = namesFor(degreeWords(), system, roll);
  const meanings = degreeMeanings();
  const sample = fieldsOf(system).find(f => roll.fields.some(one => one.table === f.home && (f.cell ? f.cell.column === one.column : f.tag === one.column)))?.roll;
  const tags = sample?.tags?.length ? t('row.tags', { list: tagsSaid(system, sample.tags) }) : '';
  return (
    <div className="dict-block roll-word">
      <div className="dict-row">
        <span className="roll-word__name">
          <Input value={roll.label ?? ''} placeholder={t('row.namePlaceholder')}
            onChange={next => edit(draft => { if (next) draft.label = next; else delete draft.label; })} />
        </span>
        <span className="roll-word__said">{tags}</span>
        <DangerButton size="sm" onConfirm={() => editSystem(draft => { delete draft.rolls?.[id]; if (draft.rolls && !Object.keys(draft.rolls).length) delete draft.rolls; })}>{t('common:remove')}</DangerButton>
      </div>
      <EditsOnRule system={system} id={id} />
      <div className="roll-form">
        <RollFlow roll={roll} />
        <div className="dict-row roll-line">
          <span className="dict-row__label">{t('row.rolls')}</span>
          <div className="roll-form__body roll-form__body--wrap">
            <MultiCombo
              prompt={t('row.addField')}
              value={roll.fields.map(one => `${one.table}\u0000${one.column}`)}
              options={columns
                .filter(([key]) => !taken.has(key) || roll.fields.some(one => `${one.table}\u0000${one.column}` === key))
                .map(([key, label, group]) => ({ value: key, label, ...(group && group !== NO_BLOCK ? { group: blockLabel(system, group) } : { group: t('row.serviceGroup'), hidden: !service && !roll.fields.some(one => `${one.table}\u0000${one.column}` === key) }) }))}
              more={hidden && !service ? { label: t('row.serviceMore', { n: hidden }), run: () => setService(true) } : undefined}
              onChange={next => edit(draft => {
                draft.fields = next.map(key => {
                  const [table, column] = key.split('\u0000');
                  return draft.fields.find(f => f.table === table && f.column === column) ?? { table: table!, column: column! };
                });
              })}
            />
          </div>
        </div>
        <div className="dict-row roll-line">
          <span className="dict-row__label">{t('row.die')}</span>
          <div className="roll-form__body">
            <Select label={t('row.die')} value={roll.die} options={dice.map(([key, c]) => [key, c.label || key] as const) as never}
              onChange={next => edit(draft => { draft.die = next; })} />
          </div>
        </div>
        <div className="dict-row roll-line">
          <span className="dict-row__label">{t('row.number')}</span>
          <div className="roll-form__body">
            <Select label={t('row.number')} value={current} options={numberOptions as never}
              onChange={next => edit(draft => { if (next === 'bonus') delete draft.number; else draft.number = next; if (next !== 'count') { delete draft.keep; delete draft.zero; } })} />
          </div>
        </div>
        {showPair ? (
        <div className="dict-row roll-line">
          <span className="dict-row__label">{t('row.pair')}</span>
          <div className="roll-form__body">
            <input type="checkbox" aria-label={t('row.pair')} checked={roll.pair === true}
              onChange={event => edit(draft => { if (event.target.checked) draft.pair = true; else delete draft.pair; })} />
            <span className="faint">{t('row.pairHint')}</span>
          </div>
        </div>
        ) : null}
        {roll.number === 'count' || roll.zero ? (
          <div className="dict-row roll-line">
            <span className="dict-row__label">{t('row.zero')}</span>
            <div className="roll-form__body">
              <Select label={t('row.zero')} value={roll.zero ? roll.zero.keep ?? 'worst' : ''} options={zeroWords() as never}
                onChange={(next: string) => edit(draft => {
                  if (next === 'worst') draft.zero = { count: 2 };
                  else if (next === 'best') draft.zero = { count: 2, keep: 'best' };
                  else delete draft.zero;
                })} />
            </div>
          </div>
        ) : null}
        {roll.number === 'count' || roll.keep !== undefined ? (
          <div className="dict-row roll-line">
            <span className="dict-row__label">{t('row.keep')}</span>
            <div className="roll-form__body">
              <FormulaField value={typeof roll.keep === 'object' ? roll.keep.expr : roll.keep ?? ''} system={system} where={t('row.keepWhere', { name: roll.label || id })} placeholder={t('row.keepAll')}
                onCommit={text => edit(draft => { if (text.trim()) draft.keep = { expr: text.trim() }; else delete draft.keep; })} />
            </div>
          </div>
        ) : null}
        <div className="dict-row roll-line roll-line--top">
          <span className="dict-row__label">{t('row.arrives')}</span>
          <div className="roll-form__body">
            <Arrived words={graded ? degreeWords() : degreeWords().filter(([key]) => key === NAMES.roll || key === NAMES.rolled || key === NAMES.number)} />
          </div>
        </div>
        {([
          ['total', t('row.total'), t('row.totalWhere', { name: roll.label || id })],
          ['success', t('row.success'), t('row.successWhere', { name: roll.label || id })],
          ['margin', t('row.margin'), t('row.marginWhere', { name: roll.label || id })],
        ] as const).map(([key, label, where]) => (
          <div key={key} className="dict-row roll-line">
            <span className="dict-row__label">{label}</span>
            <div className="roll-form__body">
              <FormulaField value={roll[key]?.expr ?? ''} system={system} where={where} extraNames={ruleNames} meanings={meanings} placeholder={t('row.emptyHint')}
                onCommit={text => edit(draft => { if (text.trim()) draft[key] = { expr: text.trim() }; else delete draft[key]; })} />
            </div>
          </div>
        ))}
        <div className="dict-row roll-line roll-line--top">
          <span className="dict-row__label">{t('row.degrees')}</span>
          <div className="roll-form__body roll-form__body--stack">
            <DegreesEditor value={roll.degrees} system={system} where={t('row.degreesWhere', { name: roll.label || id })} shared={{ extraNames: degreeNames, meanings }}
              set={next => edit(draft => { if (next === undefined) delete draft.degrees; else draft.degrees = next; })} />
          </div>
        </div>
        <div className="dict-row roll-line">
          <span className="dict-row__label">{t('row.moreTags')}</span>
          <div className="roll-form__body roll-form__body--wrap">
            <TagsField system={system} value={roll.tags}
              onChange={tags => edit(draft => { const list = tags.filter((t): t is string => typeof t === 'string'); if (list.length) draft.tags = list; else delete draft.tags; })} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function RollsSection({ system, editSystem }: { system: System; editSystem: EditSystem }) {
  const t = useT('rolls');
  const rolls = Object.entries(system.rolls ?? {});
  const die = dieEntries(system)[0]?.[0];
  return (
    <Card>
      <CardHead title={t('section.title')} sub={t('section.sub')}
        actions={die ? <Button size="sm" onClick={() => editSystem(draft => { addRoll(draft, die); })}>{t('section.add')}</Button> : null} />
      {rolls.length ? (
        <div className="stack">
          {rolls.map(([id, roll]) => <RollRow key={id} id={id} roll={roll} system={system} editSystem={editSystem} />)}
        </div>
      ) : (
        <Empty
          title={t('section.emptyTitle')}
          hint={die ? t('section.emptyWithDie') : t('section.emptyNoDie')}
        />
      )}
    </Card>
  );
}
