import { useState } from 'react';
import { Card, CardHead, Button, DangerButton, Input, Select, Chip } from '../../../ui/primitives.tsx';
import { NO_BLOCK } from '@vtt/engine/model/blocks';
import { TagsField } from '../tags-field.tsx';
import { FormulaField } from '../../../ui/formula-field.tsx';
import { dieEntries } from './dice-section.tsx';
import { addRoll } from './rolls.ts';
import { DegreesEditor } from '../degrees-editor.tsx';
import { resultsOf } from '@vtt/engine/model/names-at';
import { blockOfColumn, byBlock } from '../field-groups.ts';
import type { Grouped } from '../field-groups.ts';
import { fieldsOf, onSheet, isSingle } from '@vtt/engine/model/sheet-columns';
import { STEP_WORDS } from '@vtt/engine/words/steps';
import { ROLL_NUMBER_WORDS, rollNumberWord } from '@vtt/engine/words/dice-kinds';
import { numbersOf, shapeOf } from '@vtt/engine/model/die-kinds';
import type { DieConstant } from '@vtt/engine/model/types';
import type { System, SystemRoll } from '@vtt/schema';
import type { WorldState } from '../../../store/world.ts';

type EditSystem = WorldState['editSystem'];

const SERVICE = '\u0001';

const RULE_WORDS = [
  ['бросок', 'бросок', 'сам бросок; после точки — его части, как у шага «Бросок»'],
  ['выпало', 'выпало', 'что выпало на кости этого броска'],
  ['число', 'число поля', 'число брошенного поля как есть — например, «Итог: Атлетика»'],
  ['порог', 'порог', 'с чем сравнивают выпавшее: число поля с поправкой шага «Бросок»'],
] as const;

const DEGREE_WORDS = [
  ...RULE_WORDS,
  ['успех', 'успех', 'да или нет — итог строки «Успех, если» этого броска'],
  ['степени', 'степени', 'число — итог строки «Степени числом» этого броска'],
] as const;

const namesFor = (words: readonly (readonly [string, string, string])[], system: System, roll: SystemRoll) => {
  const out = new Map<string, string>(words.map(([key, label]) => [key, label]));
  for (const one of resultsOf(system, [], { type: 'roll', die: roll.die } as never)) if (one.path) out.set(`бросок${one.path}`, one.label);
  return out;
};
const EMPTY_HINT = 'пусто — успех считает «Проверка» в эффекте';

const DEGREE_MEANINGS = new Map<string, string>(DEGREE_WORDS.map(([key, , meaning]) => [key, `${meaning}; имя есть в каждом броске, объявлять его не нужно`]));

function Arrived({ words }: { words: readonly (readonly [string, string, string])[] }) {
  return (
    <span className="roll-arrived">
      {words.map(([key, label, meaning]) => <span key={key} className="roll-arrived__name" title={meaning}>{label}</span>)}
      <span className="faint">— есть в каждом броске; наведите или щёлкните имя в формуле, чтобы узнать, что это</span>
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

const KIND_WORDS: Record<string, string> = { number: 'число', boolean: 'да или нет', text: 'текст' };

function FlowList({ rows }: { rows: readonly (readonly [string, string, string])[] }) {
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
  const fieldGate = roll.fields.some(one => one.threshold !== undefined);
  const graded = roll.number === 'under' || roll.number === 'over' || fieldGate;
  const gate = fieldGate && roll.number !== 'under' && roll.number !== 'over' ? ' (у полей со своим порогом)' : '';
  const common = (STEP_WORDS.roll.outputs as readonly { label: string; kind?: string; onlyWith?: string }[]).filter(one => !one.onlyWith && one.kind !== 'roll')
    .map(one => [one.label.replace(/^да или нет: /, ''), KIND_WORDS[one.kind ?? 'number'] ?? '', 'у любого броска'] as const);
  const own: (readonly [string, string, string])[] = [
    ...(graded || roll.success ? [['пройден', 'да или нет', roll.success ? '«Успех, если»' : roll.number === 'under' ? 'выпало не больше порога' : `выпало не меньше порога${gate}`] as const] : []),
    ...(graded || roll.margin ? [['степени', 'число', roll.margin ? '«Степени числом»' : roll.number === 'under' ? 'порог минус выпало' : `выпало минус порог${gate}`] as const] : []),
    ...((Array.isArray(roll.degrees) ? roll.degrees.length : roll.degrees) ? [['ступень', 'текст', '«Ступени» — первая подошедшая'] as const] : []),
  ];
  return (
    <>
      <div className="dict-row roll-line roll-line--top">
        <span className="dict-row__label" title="что получает тот, кто бросил: @бросок и через точку — @бросок.пройден">Что отдаёт</span>
        <div className="roll-form__body roll-form__body--stack">
          <FlowList rows={[...own, ...common]} />
        </div>
      </div>
    </>
  );
}

function RollRow({ id, roll, system, editSystem }: { id: string; roll: SystemRoll; system: System; editSystem: EditSystem }) {
  const edit = (change: (draft: SystemRoll) => void) => editSystem(draft => { const one = draft.rolls?.[id]; if (one) change(one); });
  const columns = columnsOf(system);
  const nameOf = (table: string, column: string) => columns.find(([key]) => key === `${table}\u0000${column}`)?.[1] ?? column;
  const taken = new Set(Object.values(system.rolls ?? {}).flatMap(one => one.fields.map(f => `${f.table}\u0000${f.column}`)));
  const [service, setService] = useState(false);
  const untaken = columns.filter(([key]) => !taken.has(key));
  const hidden = untaken.filter(([, , group]) => group === NO_BLOCK).length;
  const free = service ? untaken : untaken.filter(([, , group]) => group !== NO_BLOCK);
  const dice = dieEntries(system);
  const die = dice.find(([key]) => key === roll.die)?.[1] as DieConstant | undefined;
  const allowed: readonly string[] = die ? numbersOf(die, roll.pair === true) : ROLL_NUMBER_WORDS.map(([key]) => key);
  const current = roll.number ?? 'bonus';
  const numberOptions: (readonly [string, string])[] = [
    ...ROLL_NUMBER_WORDS.filter(([key]) => allowed.includes(key)),
    ...(allowed.includes(current) ? [] : [[current, `${rollNumberWord(current)} — не подходит этой кости`] as const]),
  ];
  const showPair = roll.pair === true || (die ? shapeOf(die) === 'parts' : false);
  const graded = roll.number === 'under' || roll.number === 'over' || Boolean(roll.success || roll.margin);
  const ruleNames = namesFor(RULE_WORDS, system, roll);
  const degreeNames = namesFor(DEGREE_WORDS, system, roll);
  const sample = fieldsOf(system).find(f => roll.fields.some(one => one.table === f.home && (f.cell ? f.cell.column === one.column : f.tag === one.column)))?.roll;
  const tags = sample?.tags?.length ? `метки: ${sample.tags.join(', ')}` : '';
  return (
    <div className="dict-block roll-word">
      <div className="dict-row">
        <span className="roll-word__name">
          <Input value={roll.label ?? ''} placeholder="как бросок зовётся"
            onChange={next => edit(draft => { if (next) draft.label = next; else delete draft.label; })} />
        </span>
        <span className="roll-word__said">{tags}</span>
        <DangerButton size="sm" onConfirm={() => editSystem(draft => { delete draft.rolls?.[id]; if (draft.rolls && !Object.keys(draft.rolls).length) delete draft.rolls; })}>Убрать</DangerButton>
      </div>
      <div className="roll-form">
        <RollFlow roll={roll} />
        <div className="dict-row roll-line">
          <span className="dict-row__label">Бросают</span>
          <div className="roll-form__body roll-form__body--wrap">
            {roll.fields.map(one => (
              <Chip key={`${one.table}.${one.column}`}
                onRemove={() => edit(draft => { draft.fields = draft.fields.filter(f => !(f.table === one.table && f.column === one.column)); })}>
                {nameOf(one.table, one.column)}
              </Chip>
            ))}
            {untaken.length ? (
              <Select value="" label="добавить поле" options={[['', '+ поле…'], ...free, ...(hidden && !service ? [[SERVICE, `служебные поля, которых нет на листе (${hidden})…`]] : [])] as never}
                onChange={(next: string) => {
                  if (!next) return;
                  if (next === SERVICE) { setService(true); return; }
                  const [table, column] = next.split('\u0000');
                  edit(draft => { draft.fields.push({ table: table!, column: column! }); });
                }} />
            ) : null}
          </div>
        </div>
        <div className="dict-row roll-line">
          <span className="dict-row__label">Кость</span>
          <div className="roll-form__body">
            <Select label="Кость" value={roll.die} options={dice.map(([key, c]) => [key, c.label || key] as const) as never}
              onChange={next => edit(draft => { draft.die = next; })} />
          </div>
        </div>
        <div className="dict-row roll-line">
          <span className="dict-row__label">Число поля — это</span>
          <div className="roll-form__body">
            <Select label="Число поля — это" value={current} options={numberOptions as never}
              onChange={next => edit(draft => { if (next === 'bonus') delete draft.number; else draft.number = next; if (next !== 'count') delete draft.keep; })} />
          </div>
        </div>
        {showPair ? (
        <div className="dict-row roll-line">
          <span className="dict-row__label">Бросают два поля</span>
          <div className="roll-form__body">
            <input type="checkbox" aria-label="Бросают два поля" checked={roll.pair === true}
              onChange={event => edit(draft => { if (event.target.checked) draft.pair = true; else delete draft.pair; })} />
            <span className="faint">Кость из двух видов; грани каждой — своё поле</span>
          </div>
        </div>
        ) : null}
        {roll.number === 'count' ? (
          <div className="dict-row roll-line">
            <span className="dict-row__label">Оставить лучшие</span>
            <div className="roll-form__body">
              <FormulaField value={typeof roll.keep === 'object' ? roll.keep.expr : roll.keep ?? ''} system={system} where={`${roll.label || id} · сколько оставить`} placeholder="все"
                onCommit={text => edit(draft => { if (text.trim()) draft.keep = { expr: text.trim() }; else delete draft.keep; })} />
            </div>
          </div>
        ) : null}
        <div className="dict-row roll-line roll-line--top">
          <span className="dict-row__label">Что приходит</span>
          <div className="roll-form__body">
            <Arrived words={graded ? DEGREE_WORDS : DEGREE_WORDS.filter(([key]) => key === 'бросок' || key === 'выпало' || key === 'число')} />
          </div>
        </div>
        {([
          ['success', 'Успех, если', 'успех'],
          ['margin', 'Степени числом', 'степени'],
        ] as const).map(([key, label, where]) => (
          <div key={key} className="dict-row roll-line">
            <span className="dict-row__label">{label}</span>
            <div className="roll-form__body">
              <FormulaField value={roll[key]?.expr ?? ''} system={system} where={`${roll.label || id} · ${where}`} extraNames={ruleNames} meanings={DEGREE_MEANINGS} placeholder={EMPTY_HINT}
                onCommit={text => edit(draft => { if (text.trim()) draft[key] = { expr: text.trim() }; else delete draft[key]; })} />
            </div>
          </div>
        ))}
        <div className="dict-row roll-line roll-line--top">
          <span className="dict-row__label">Ступени</span>
          <div className="roll-form__body roll-form__body--stack">
            <DegreesEditor value={roll.degrees} system={system} where={`${roll.label || id} · ступень`} shared={{ extraNames: degreeNames, meanings: DEGREE_MEANINGS }}
              set={next => edit(draft => { if (next === undefined) delete draft.degrees; else draft.degrees = next; })} />
          </div>
        </div>
        <div className="dict-row roll-line">
          <span className="dict-row__label">Ещё метки</span>
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
  const rolls = Object.entries(system.rolls ?? {});
  const die = dieEntries(system)[0]?.[0];
  return (
    <Card>
      <CardHead title="Броски" sub="Как бросают поля листа: щелчок по полю и шаг «Бросок» с полем."
        actions={die ? <Button size="sm" onClick={() => editSystem(draft => { addRoll(draft, die); })}>+ бросок</Button> : null} />
      {rolls.length ? (
        <div className="stack">
          {rolls.map(([id, roll]) => <RollRow key={id} id={id} roll={roll} system={system} editSystem={editSystem} />)}
        </div>
      ) : (
        <span className="faint">{die ? 'Бросков нет. Заведите бросок и выберите поля, которые им бросают.' : 'Сначала заведите кость в «Костях».'}</span>
      )}
    </Card>
  );
}
