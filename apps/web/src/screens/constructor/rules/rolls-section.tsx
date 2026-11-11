import { useState } from 'react';
import { Card, CardHead, Button, DangerButton, Input, Select, Chip } from '../../../ui/primitives.tsx';
import { NO_BLOCK } from '@vtt/engine/model/blocks';
import { TagsField } from '../tags-field.tsx';
import { FormulaField } from '../../../ui/formula-field.tsx';
import { dieEntries } from './dice-section.tsx';
import { addRoll } from './rolls.ts';
import { blockOfColumn, byBlock } from '../field-groups.ts';
import type { Grouped } from '../field-groups.ts';
import { fieldsOf, onSheet, isSingle } from '@vtt/engine/model/sheet-columns';
import { STEP_WORDS } from '@vtt/engine/words/steps';
import type { System, SystemRoll } from '@vtt/schema';
import type { WorldState } from '../../../store/world.ts';

type EditSystem = WorldState['editSystem'];

const SERVICE = '\u0001';

const RULE_WORDS = [
  ['выпало', 'выпало', 'что выпало на кости этого броска'],
  ['число', 'число поля', 'число брошенного поля как есть — например, «Итог: Атлетика»'],
  ['порог', 'порог', 'с чем сравнивают выпавшее: число поля с поправкой шага «Бросок»'],
] as const;

const DEGREE_WORDS = [
  ...RULE_WORDS,
  ['успех', 'успех', 'да или нет — итог строки «Успех, если» этого броска'],
  ['степени', 'степени', 'число — итог строки «Степени числом» этого броска'],
] as const;

const RULE_NAMES = new Map(RULE_WORDS.map(([key, label]) => [key, label]));
const DEGREE_NAMES = new Map(DEGREE_WORDS.map(([key, label]) => [key, label]));
const DEGREE_MEANINGS = new Map<string, string>(DEGREE_WORDS.map(([key, , meaning]) => [key, `${meaning}; имя есть в каждом броске, объявлять его не нужно`]));

const OTHERWISE = 'да';

function Arrived({ words }: { words: readonly (readonly [string, string, string])[] }) {
  return (
    <span className="roll-arrived">
      {words.map(([key, label, meaning]) => <span key={key} className="roll-arrived__name" title={meaning}>{label}</span>)}
      <span className="faint">— есть в каждом броске; наведите или щёлкните имя в формуле, чтобы узнать, что это</span>
    </span>
  );
}

const NUMBER_WORDS = [
  ['bonus', 'прибавка к выпавшему'],
  ['count', 'сколько костей бросить'],
  ['sides', 'сколько граней у кости'],
  ['under', 'порог: выкинуть не больше'],
  ['over', 'порог: выкинуть не меньше'],
] as const;

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
  const number = NUMBER_WORDS.find(([key]) => key === (roll.number ?? 'bonus'))?.[1] ?? '';
  const inputs: (readonly [string, string, string])[] = [
    ['выпало', 'число', 'что выпало на костях, с прибавками и правками'],
    ['число', 'число', `число поля с листа: ${number}`],
    ...(graded ? [['порог', 'число', `число поля со сдвигом сложности и правками порога${gate}`] as const] : []),
  ];
  const common = (STEP_WORDS.roll.outputs as readonly { label: string; kind?: string; onlyWith?: string }[]).filter(one => !one.onlyWith)
    .map(one => [one.label.replace(/^да или нет: /, ''), KIND_WORDS[one.kind ?? 'number'] ?? '', 'у любого броска'] as const);
  const own: (readonly [string, string, string])[] = [
    ...(graded || roll.success ? [['пройден', 'да или нет', roll.success ? '«Успех, если»' : roll.number === 'under' ? 'выпало не больше порога' : `выпало не меньше порога${gate}`] as const] : []),
    ...(graded || roll.margin ? [['степени', 'число', roll.margin ? '«Степени числом»' : roll.number === 'under' ? 'порог минус выпало' : `выпало минус порог${gate}`] as const] : []),
    ...(roll.degrees?.length ? [['ступень', 'текст', '«Ступени» — первая подошедшая'] as const] : []),
  ];
  return (
    <>
      <div className="dict-row roll-line roll-line--top">
        <span className="dict-row__label" title="имена, которые правило видит в своих формулах">Что приходит</span>
        <div className="roll-form__body roll-form__body--stack"><FlowList rows={inputs} /></div>
      </div>
      <div className="dict-row roll-line roll-line--top">
        <span className="dict-row__label" title="что получает тот, кто бросил: @бросок и через точку — @бросок.пройден">Что отдаёт</span>
        <div className="roll-form__body roll-form__body--stack">
          <FlowList rows={[...own, ...common]} />
          {own.length ? null : <span className="faint">успеха и степеней правило не считает — их решает «Проверка» в эффекте</span>}
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
            <Select label="Число поля — это" value={roll.number ?? 'bonus'} options={NUMBER_WORDS as never}
              onChange={next => edit(draft => { if (next === 'bonus') delete draft.number; else draft.number = next; if (next !== 'count') delete draft.keep; })} />
          </div>
        </div>
        {roll.number === 'count' ? (
          <div className="dict-row roll-line">
            <span className="dict-row__label">Оставить лучшие</span>
            <div className="roll-form__body">
              <FormulaField value={typeof roll.keep === 'object' ? roll.keep.expr : roll.keep ?? ''} system={system} where={`${roll.label || id} · сколько оставить`} placeholder="все"
                onCommit={text => edit(draft => { if (text.trim()) draft.keep = { expr: text.trim() }; else delete draft.keep; })} />
            </div>
          </div>
        ) : null}
        {roll.number === 'under' || roll.number === 'over' || roll.success || roll.margin || roll.degrees?.length ? (
          <div className="dict-row roll-line roll-line--top">
            <span className="dict-row__label">Что приходит</span>
            <div className="roll-form__body">
              <Arrived words={roll.number === 'under' || roll.number === 'over' || roll.success || roll.margin ? DEGREE_WORDS : DEGREE_WORDS.filter(([key]) => key === 'выпало' || key === 'число')} />
            </div>
          </div>
        ) : null}
        {roll.number === 'under' || roll.number === 'over' || roll.success || roll.margin ? (
          <>
            {([
              ['success', 'Успех, если', roll.number === 'under' ? '@выпало <= @порог' : '@выпало >= @порог', 'успех'],
              ['margin', 'Степени числом', roll.number === 'under' ? '@порог - @выпало' : '@выпало - @порог', 'степени'],
            ] as const).map(([key, label, hint, where]) => (
              <div key={key} className="dict-row roll-line">
                <span className="dict-row__label">{label}</span>
                <div className="roll-form__body">
                  <FormulaField value={roll[key]?.expr ?? ''} system={system} where={`${roll.label || id} · ${where}`} extraNames={RULE_NAMES} meanings={DEGREE_MEANINGS} placeholder={hint}
                    onCommit={text => edit(draft => { if (text.trim()) draft[key] = { expr: text.trim() }; else delete draft[key]; })} />
                </div>
              </div>
            ))}
          </>
        ) : null}
        <div className="dict-row roll-line roll-line--top">
          <span className="dict-row__label">Ступени</span>
          <div className="roll-form__body roll-form__body--stack">
            {roll.degrees && roll.degrees.length > 1 ? <span className="faint">Берётся первая подходящая сверху.</span> : null}
            {(roll.degrees ?? []).map((degree, at) => {
              const otherwise = at > 0 && at === roll.degrees!.length - 1 && degree.if.expr.trim() === OTHERWISE;
              return (
              <div key={at} className="roll-degree">
                <Input value={degree.label} placeholder="как зовётся ступень"
                  onChange={label => edit(draft => { const one = draft.degrees?.[at]; if (one) one.label = label; })} />
                {otherwise ? (
                  <span className="roll-degree__if roll-degree__if--else" title="все исходы, которые не подошли ступеням выше">иначе</span>
                ) : (
                  <>
                    <span className="roll-degree__if">если</span>
                    <FormulaField value={degree.if.expr} system={system} where={`${roll.label || id} · ступень`} extraNames={DEGREE_NAMES} meanings={DEGREE_MEANINGS} placeholder="@выпало <= @число"
                      onCommit={text => edit(draft => { const one = draft.degrees?.[at]; if (one) one.if = { expr: text.trim() }; })} />
                  </>
                )}
                <button type="button" className="chips__x" aria-label="убрать ступень"
                  onClick={() => edit(draft => { draft.degrees?.splice(at, 1); if (!draft.degrees?.length) delete draft.degrees; })}>×</button>
              </div>
              );
            })}
            <span className="inline inline--tight">
              <button type="button" className="roll-form__add"
                onClick={() => edit(draft => {
                  const list = (draft.degrees ??= []);
                  const last = list[list.length - 1];
                  const fresh = { label: 'Новая ступень', if: { expr: '@выпало <= @число' } };
                  if (list.length > 1 && last?.if.expr.trim() === OTHERWISE) list.splice(list.length - 1, 0, fresh); else list.push(fresh);
                })}>+ ступень</button>
              {roll.degrees?.length && roll.degrees[roll.degrees.length - 1]!.if.expr.trim() !== OTHERWISE ? (
                <button type="button" className="roll-form__add"
                  onClick={() => edit(draft => { (draft.degrees ??= []).push({ label: 'Иначе', if: { expr: OTHERWISE } }); })}>+ иначе</button>
              ) : null}
            </span>
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
