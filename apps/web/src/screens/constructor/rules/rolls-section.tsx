import { Card, CardHead, Button, DangerButton, Input, Select, Chip } from '../../../ui/primitives.tsx';
import { TagsField } from '../tags-field.tsx';
import { FormulaField } from '../../../ui/formula-field.tsx';
import { dieEntries } from './dice-section.tsx';
import { addRoll } from './rolls.ts';
import { fieldsOf, onSheet, isSingle } from '@vtt/engine/model/sheet-columns';
import type { System, SystemRoll } from '@vtt/schema';
import type { WorldState } from '../../../store/world.ts';

type EditSystem = WorldState['editSystem'];

const DEGREE_NAMES = new Map([['выпало', 'выпало'], ['число', 'число поля'], ['порог', 'порог'], ['успех', 'успех'], ['степени', 'степени']]);

const RULE_NAMES = new Map([['выпало', 'выпало'], ['число', 'число поля'], ['порог', 'порог']]);

const NUMBER_WORDS = [
  ['bonus', 'прибавка к кости'],
  ['count', 'сколько костей'],
  ['sides', 'сколько граней'],
  ['under', 'выкинуть не больше'],
  ['over', 'выкинуть не меньше'],
] as const;

function saidOf(number: SystemRoll['number'], die: string): string {
  if (number === 'count') return `число поля — сколько бросить: ${die}`;
  if (number === 'sides') return `${die}, грани — число поля`;
  if (number === 'under') return `${die}, успех — не больше числа поля`;
  if (number === 'over') return `${die}, успех — не меньше числа поля`;
  return `${die} + число поля`;
}

function columnsOf(system: System): [string, string][] {
  const out: [string, string][] = [];
  for (const [id, table] of Object.entries(system.tables ?? {})) {
    if (!onSheet(table)) continue;
    for (const column of table.columns ?? []) {
      if ((column.kind ?? 'number') !== 'number') continue;
      const name = column.label || column.key;
      out.push([`${id}\u0000${column.key}`, isSingle(table) ? name : `${table.label || id} → ${name}`]);
    }
  }
  return out;
}

function RollRow({ id, roll, system, editSystem }: { id: string; roll: SystemRoll; system: System; editSystem: EditSystem }) {
  const edit = (change: (draft: SystemRoll) => void) => editSystem(draft => { const one = draft.rolls?.[id]; if (one) change(one); });
  const columns = columnsOf(system);
  const nameOf = (table: string, column: string) => columns.find(([key]) => key === `${table}\u0000${column}`)?.[1] ?? column;
  const taken = new Set(Object.values(system.rolls ?? {}).flatMap(one => one.fields.map(f => `${f.table}\u0000${f.column}`)));
  const free = columns.filter(([key]) => !taken.has(key));
  const dice = dieEntries(system);
  const die = dice.find(([key]) => key === roll.die)?.[1];
  const dieName = die?.label || roll.die;
  const sample = fieldsOf(system).find(f => roll.fields.some(one => one.table === f.home && (f.cell ? f.cell.column === one.column : f.tag === one.column)))?.roll;
  const said = `${saidOf(roll.number, dieName)}${sample?.tags?.length ? ` · метки: ${sample.tags.join(', ')}` : ''}`;
  return (
    <div className="dict-block roll-word">
      <div className="dict-row">
        <span className="roll-word__name">
          <Input value={roll.label ?? ''} placeholder="как бросок зовётся"
            onChange={next => edit(draft => { if (next) draft.label = next; else delete draft.label; })} />
        </span>
        <span className="roll-word__said">{said}</span>
        <DangerButton size="sm" onConfirm={() => editSystem(draft => { delete draft.rolls?.[id]; if (draft.rolls && !Object.keys(draft.rolls).length) delete draft.rolls; })}>Убрать</DangerButton>
      </div>
      <div className="roll-form">
        <div className="dict-row roll-line">
          <span className="dict-row__label">Кость</span>
          <div className="roll-form__body roll-form__body--halves">
            <Select value={roll.die} options={dice.map(([key, c]) => [key, c.label || key] as const) as never}
              onChange={next => edit(draft => { draft.die = next; })} />
            <Select value={roll.number ?? 'bonus'} options={NUMBER_WORDS as never}
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
        <div className="dict-row roll-line">
          <span className="dict-row__label">Бросают</span>
          <div className="roll-form__body roll-form__body--wrap">
            {roll.fields.map(one => (
              <Chip key={`${one.table}.${one.column}`}
                onRemove={() => edit(draft => { draft.fields = draft.fields.filter(f => !(f.table === one.table && f.column === one.column)); })}>
                {nameOf(one.table, one.column)}
              </Chip>
            ))}
            {free.length ? (
              <Select value="" options={[['', '+ поле…'], ...free] as never}
                onChange={(next: string) => { if (!next) return; const [table, column] = next.split('\u0000'); edit(draft => { draft.fields.push({ table: table!, column: column! }); }); }} />
            ) : null}
          </div>
        </div>
        {roll.number === 'under' || roll.number === 'over' || roll.success || roll.margin ? (
          <>
            {([
              ['success', 'Успех, если', roll.number === 'under' ? '@выпало <= @порог' : '@выпало >= @порог', 'успех'],
              ['margin', 'Степени числом', roll.number === 'under' ? '@порог - @выпало' : '@выпало - @порог', 'степени'],
            ] as const).map(([key, label, hint, where]) => (
              <div key={key} className="dict-row roll-line">
                <span className="dict-row__label">{label}</span>
                <div className="roll-form__body">
                  <FormulaField value={roll[key]?.expr ?? ''} system={system} where={`${roll.label || id} · ${where}`} extraNames={RULE_NAMES} placeholder={hint}
                    onCommit={text => edit(draft => { if (text.trim()) draft[key] = { expr: text.trim() }; else delete draft[key]; })} />
                </div>
              </div>
            ))}
          </>
        ) : null}
        <div className="dict-row roll-line roll-line--top">
          <span className="dict-row__label">Ступени</span>
          <div className="roll-form__body roll-form__body--stack">
            {(roll.degrees ?? []).map((degree, at) => (
              <div key={at} className="roll-degree">
                <Input value={degree.label} placeholder="как зовётся ступень"
                  onChange={label => edit(draft => { const one = draft.degrees?.[at]; if (one) one.label = label; })} />
                <span className="roll-degree__if">если</span>
                <FormulaField value={degree.if.expr} system={system} where={`${roll.label || id} · ступень`} extraNames={DEGREE_NAMES} placeholder="@выпало <= @число"
                  onCommit={text => edit(draft => { const one = draft.degrees?.[at]; if (one) one.if = { expr: text.trim() }; })} />
                <button type="button" className="chips__x" aria-label="убрать ступень"
                  onClick={() => edit(draft => { draft.degrees?.splice(at, 1); if (!draft.degrees?.length) delete draft.degrees; })}>×</button>
              </div>
            ))}
            <button type="button" className="roll-form__add"
              onClick={() => edit(draft => { (draft.degrees ??= []).push({ label: 'Новая ступень', if: { expr: '@выпало <= @число' } }); })}>+ ступень</button>
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
      <CardHead title="Броски" sub="Щелчок по полю на листе бросает его броском."
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
