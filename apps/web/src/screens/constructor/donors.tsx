import { useMemo, useState } from 'react';
import { useWorld } from '../../store/world.ts';
import { bring, undoFresh, useCurrentFresh } from '../../store/fresh.ts';
import { Select, Empty, Fold, Button } from '../../ui/primitives.tsx';
import type { System, Effect } from '@vtt/schema';
import { SAMPLE_SYSTEMS } from '@vtt/engine/model/systems';
import { bringIn, blockParts, closure } from '@vtt/engine/model/bring';
import type { Part, PartKind } from '@vtt/engine/model/bring';
import { PIECES, bringPiece, donorOf } from '@vtt/engine/model/pieces';
import { groupChain, subtreeNames } from './groups.ts';
import { launchOf, LAUNCHES } from '@vtt/engine/model/effect-kinds';
import { fieldsOf, fieldOf } from '@vtt/engine/model/sheet-columns';
import { kindOf } from '@vtt/engine/model/owned';

const DONORS = SAMPLE_SYSTEMS as System[];

export function DonorPalette({ kind }: { kind: 'blocks' | 'effects' }) {
  const [donorId, setDonorId] = useState<string>('*');
  const donors = donorId === '*' ? DONORS : DONORS.filter(d => d.id === donorId);

  return (
    <div className="stack">
      <FreshNote />
      <Select
        value={donorId}
        options={[['*', 'все системы'], ...DONORS.map(d => [d.id ?? '', d.name ?? ''] as const)] as never}
        onChange={setDonorId}
      />
      {donors.map(donor => (
        <div key={donor.id} className="stack stack--tight">
          <span className="field__label">{donor.name}</span>
          <Pieces donor={donor} />
          <Fold title={kind === 'blocks' ? 'Отдельные блоки' : 'Отдельные эффекты'}>
            {kind === 'blocks' ? <Blocks donor={donor} /> : <Effects donor={donor} />}
          </Fold>
        </div>
      ))}
    </div>
  );
}

export function findDonorBlock(tag: string): { donor: System; group: string } | null {
  for (const donor of DONORS) {
    const field = fieldOf(donor, tag);
    if (field) return { donor, group: field.group ?? 'Без блока' };
  }
  return null;
}

export function copyDonorBlock(donor: System, group: string): void {
  bring(`Блок «${group}»`, system => bringIn(system, donor, blockParts(donor, group)));
}

const PART_WORDS: Record<PartKind, string> = {
  field: 'Поля', group: 'Блоки', effect: 'Эффекты', table: 'Таблицы',
  constant: 'Кости', rollEdit: 'Правки броска', recordKind: 'Типы записей', record: 'Записи',
};

const PART_ORDER: PartKind[] = ['field', 'effect', 'record', 'recordKind', 'table', 'rollEdit', 'constant', 'group'];

function partLabel(system: System, part: Part): string {
  switch (part.kind) {
    case 'field': return fieldOf(system, part.key)?.label ?? part.key;
    case 'effect': return system.effects[part.key]?.label ?? part.key;
    case 'table': return system.tables?.[part.key]?.label ?? part.key;
    case 'constant': return system.constants?.[part.key]?.label ?? part.key;
    case 'rollEdit': return system.roll_edits?.[part.key]?.label ?? part.key;
    case 'recordKind': return kindOf(system, part.key)?.label ?? part.key;
    case 'record': return system.library?.find(r => r.id === part.key)?.label ?? part.key;
    case 'group': return part.key;
  }
}

function FreshNote() {
  const fresh = useCurrentFresh();
  const pick = useWorld(s => s.pick);
  if (!fresh) return null;

  const open = (part: Part) => {
    if (part.kind === 'field') pick({ activeTab: 'sheet', activeFieldTag: part.key, activeGroupName: null });
    if (part.kind === 'effect') pick({ activeTab: 'effects', activeEffectId: part.key });
  };

  return (
    <div className="fresh">
      <div className="fresh__head">
        <span><b>{fresh.label}</b> — добавлено</span>
        <Button size="sm" variant="ghost" onClick={undoFresh}>отменить</Button>
      </div>
      <Fold title="что пришло" count={fresh.added.length}>
        <div className="stack stack--tight">
          {PART_ORDER.map(kind => {
            const parts = fresh.added.filter(part => part.kind === kind);
            if (!parts.length) return null;
            return (
              <div key={kind} className="fresh__row">
                <span className="faint">{PART_WORDS[kind]}:</span>{' '}
                {parts.map((part, at) => (
                  <span key={part.key}>
                    {part.kind === 'field' || part.kind === 'effect'
                      ? <button type="button" className="linkish" onClick={() => open(part)}>{partLabel(fresh.after, part)}</button>
                      : partLabel(fresh.after, part)}
                    {at < parts.length - 1 ? ', ' : ''}
                  </span>
                ))}
              </div>
            );
          })}
        </div>
      </Fold>
    </div>
  );
}

function Pieces({ donor }: { donor: System }) {
  const system = useWorld(s => s.system);
  const pieces = useMemo(
    () => PIECES.filter(piece => piece.donor === donor.id && donorOf(piece))
      .map(piece => ({ piece, added: bringPiece(system, piece).added })),
    [system, donor],
  );
  if (!pieces.length) return null;

  return (
    <div className="palette">
      {pieces.map(({ piece, added }) => (
        <button
          key={piece.id}
          type="button"
          className="card card--pick"
          title={piece.hint}
          disabled={!added.length}
          onClick={() => bring(`«${piece.label}»`, current => bringPiece(current, piece))}
          style={added.length ? undefined : { opacity: 0.5, cursor: 'default' }}
        >
          <span className="card__title" style={{ fontSize: 'var(--fs-4)' }}>{piece.label}</span>
          <span className="card__sub card__sub--clamp">{added.length ? piece.hint : 'уже в системе'}</span>
        </button>
      ))}
    </div>
  );
}

function Blocks({ donor }: { donor: System }) {
  const system = useWorld(s => s.system);

  const blocks = useMemo(() => {
    const names = new Map<string, number>();
    for (const field of fieldsOf(donor)) {
      const key = groupChain(donor, field.group ?? 'Без блока').at(-1)!;
      names.set(key, (names.get(key) ?? 0) + 1);
    }
    return [...names];
  }, [donor]);

  const have = new Set(fieldsOf(system).map(f => f.tag));

  return (
    <div className="palette">
      {blocks.map(([group, count]) => {
        const inside = new Set(subtreeNames(donor, group));
        const fields = fieldsOf(donor).filter(f => inside.has(f.group ?? 'Без блока'));
        const already = fields.every(f => have.has(f.tag));
        const brings = [...new Set(
          closure(donor, blockParts(donor, group))
            .filter(part => part.kind === 'field')
            .map(part => groupChain(donor, fieldOf(donor, part.key)?.group ?? 'Без блока').at(-1)!),
        )];

        return (
          <button
            key={group}
            type="button"
            className="card card--pick"
            disabled={already}
            onClick={() => copyDonorBlock(donor, group)}
            style={already ? { opacity: 0.5, cursor: 'default' } : undefined}
          >
            <span className="card__title" style={{ fontSize: 'var(--fs-4)' }}>{group}</span>
            <span className="card__sub">
              {already ? 'уже в системе' : `полей: ${count}`}
              {!already && brings.length > 1 ? ` · и ещё ${brings.length - 1} блок(а)` : ''}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function Effects({ donor }: { donor: System }) {
  const system = useWorld(s => s.system);
  const pick = useWorld(s => s.pick);

  const list = Object.entries(donor.effects);
  if (!list.length) return <Empty title="У этого донора эффектов нет" />;

  const copy = (id: string, effect: Effect) => {
    bring(`«${effect.label ?? id}»`, current => bringIn(current, donor, [{ kind: 'effect', key: id }]));
    pick({ activeEffectId: id });
  };

  return (
    <div className="palette">
      {list.map(([id, effect]) => {
        const already = Boolean(system.effects[id]);
        return (
          <button
            key={id}
            type="button"
            className="card card--pick"
            disabled={already}
            onClick={() => copy(id, effect)}
            style={already ? { opacity: 0.5, cursor: 'default' } : undefined}
          >
            <span className="card__title" style={{ fontSize: 'var(--fs-4)' }}>{effect.label ?? id}</span>
            <span className="card__sub">
              {already ? 'уже в системе' : `${effect.group ?? 'Механики'} · ${activationWord(effect)}`}
            </span>
          </button>
        );
      })}
    </div>
  );
}

const activationWord = (effect: Effect) => LAUNCHES[launchOf(effect).kind].label.toLowerCase();
