import { useState } from 'react';
import type { System, FieldValue } from '@vtt/schema';
import { useWorld } from '../../store/world.ts';
import {
  Card, CardHead, Field, Input, Select, Button, NumInput, DangerButton, Verdict,
} from '../../ui/primitives.tsx';
import { FormulaInput, formulaAsLabels } from '../../ui/formula.tsx';
import {
  effectiveDefault, defaultSource, setGroupDefault, applyDefaultToAll,
  renameGroup, freeGroupName, subtreeNames, groupChain,
} from './groups.ts';

const DEFAULT_KINDS = [
  ['none', 'не задано'],
  ['stored', 'число'],
  ['formula', 'формула'],
] as const;

const describeValue = (system: System, value: FieldValue): string =>
  value.kind === 'stored' ? `число ${String(value.default)}`
    : `формула: ${formulaAsLabels(system, value.expr) || '—'}`;

export function GroupEditor({ name, system }: { name: string; system: System }) {
  const editSystem = useWorld(s => s.editSystem);
  const pick = useWorld(s => s.pick);
  const [applied, setApplied] = useState<number | null>(null);

  const spec = system.groups?.[name];
  const own = spec?.default;
  const inheritedFrom = own ? undefined : defaultSource(system, name);
  const inherited = own ? undefined : effectiveDefault(system, name);

  const inside = new Set(subtreeNames(system, name));
  const fieldCount = system.fields.filter(f => inside.has(f.group ?? 'Без блока')).length;
  const children = Object.entries(system.groups ?? {})
    .filter(([, s]) => s.parent === name).map(([child]) => child);

  const parents = [...new Set([
    ...Object.keys(system.groups ?? {}),
    ...system.fields.map(f => f.group ?? 'Без блока'),
  ])].filter(candidate => candidate !== name && !groupChain(system, candidate).includes(name));

  const setDefault = (next: FieldValue | undefined) => {
    setApplied(null);
    editSystem(draft => setGroupDefault(draft, name, next));
  };

  const setKind = (kind: string) => {
    if (kind === 'none') return setDefault(undefined);
    if (kind === 'stored') return setDefault(own?.kind === 'stored' ? own : { kind: 'stored', type: 'number', default: 0 });
    return setDefault(own?.kind === 'formula' ? own : { kind: 'formula', expr: '' });
  };

  const rename = (next: string) => {
    const clean = next.trim();
    if (!clean || clean === name) return;
    const fresh = freeGroupName(system, clean) === clean ? clean : null;
    if (!fresh) return;
    editSystem(draft => renameGroup(draft, name, fresh));
    pick({ activeGroupName: fresh });
  };

  const addSubgroup = () => {
    const fresh = freeGroupName(system, 'Новая подгруппа');
    editSystem(draft => { (draft.groups ??= {})[fresh] = { parent: name }; });
    pick({ activeGroupName: fresh });
  };

  const removable = fieldCount === 0 && children.length === 0;

  return (
    <>
      <Card>
        <CardHead
          title={name}
          actions={removable && spec ? (
            <DangerButton size="sm" onConfirm={() => {
              editSystem(draft => { if (draft.groups) delete draft.groups[name]; });
              pick({ activeGroupName: null });
            }}>
              Удалить
            </DangerButton>
          ) : undefined}
        />
        <div className="row">
          <Field label="Название">
            <Input value={name} onChange={rename} />
          </Field>
          <Field label="Внутри блока">
            <Select
              value={spec?.parent ?? ''}
              options={[['', '— сам по себе —'], ...parents.map(p => [p, p] as const)] as never}
              onChange={next => editSystem(draft => {
                const target = { ...draft.groups?.[name] };
                if (next) target.parent = next; else delete target.parent;
                (draft.groups ??= {})[name] = target;
              })}
            />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHead title="Значение по умолчанию" />
        <p className="faint">
          Его получают новые поля блока. Поля, где стоит текущее умолчание, поменяются
          вместе с ним; введённое вручную останется как есть.
        </p>
        <div className="row">
          <Field label="Что по умолчанию">
            <Select
              value={own?.kind ?? 'none'}
              options={DEFAULT_KINDS as never}
              onChange={setKind}
            />
          </Field>
          {own?.kind === 'stored' ? (
            <Field label="Число">
              <NumInput
                value={Number(own.default ?? 0)}
                onCommit={n => setDefault({ kind: 'stored', type: 'number', default: n })}
              />
            </Field>
          ) : null}
        </div>
        {own?.kind === 'formula' ? (
          <Field label="Формула">
            <FormulaInput
              where="формула блока"
              system={system}
              value={own.expr}
              onChange={expr => setDefault({ kind: 'formula', expr })}
            />
          </Field>
        ) : null}
        {!own && inherited && inheritedFrom ? (
          <p className="faint">Наследуется от «{inheritedFrom}»: {describeValue(system, inherited)}.</p>
        ) : null}
        {(own ?? inherited) && fieldCount > 0 ? (
          <div className="inline">
            <Button size="sm" onClick={() => {
              let touched = 0;
              editSystem(draft => { touched = applyDefaultToAll(draft, name); });
              setApplied(touched);
            }}>
              Раздать умолчание всем полям ({fieldCount})
            </Button>
          </div>
        ) : null}
        {applied !== null ? (
          <Verdict tone="ok">
            {applied === 0 ? 'все поля уже с этим значением' : `переписано полей: ${applied}`}
          </Verdict>
        ) : null}
      </Card>

      <Card>
        <CardHead title="Подгруппы" />
        <p className="faint">
          Подгруппа наследует умолчание блока, пока не задаст своё — например, «Навыки
          от ловкости» внутри «Навыков» с формулой от Ловкости.
        </p>
        <div className="inline">
          <Button size="sm" onClick={addSubgroup}>+ подгруппа</Button>
        </div>
      </Card>
    </>
  );
}
