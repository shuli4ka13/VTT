import { useMemo, useState } from 'react';
import { useWorld } from '../../store/world.ts';
import { Select, Empty } from '../../ui/primitives.tsx';
import type { System, Effect } from '@vtt/schema';
import { SAMPLE_SYSTEMS } from '@vtt/engine/model/systems';
import { bringIn, blockParts, closure } from '@vtt/engine/model/bring';
import type { Brought, Part, PartKind } from '@vtt/engine/model/bring';
import { PIECES, bringPiece, donorOf } from '@vtt/engine/model/pieces';
import { groupChain, subtreeNames } from './groups.ts';
import { launchOf, LAUNCHES } from '@vtt/engine/model/effect-kinds';

const DONORS = SAMPLE_SYSTEMS as System[];

export function DonorPalette({ kind }: { kind: 'blocks' | 'effects' }) {
  const [donorId, setDonorId] = useState<string>('*');
  const donors = donorId === '*' ? DONORS : DONORS.filter(d => d.id === donorId);

  return (
    <div className="stack">
      <div className="stack stack--tight">
        <span className="field__label">Куски систем</span>
        <Pieces />
      </div>
      <Select
        value={donorId}
        options={[['*', 'все системы'], ...DONORS.map(d => [d.id ?? '', d.name ?? ''] as const)] as never}
        onChange={setDonorId}
      />
      {donors.map(donor => (
        <div key={donor.id} className="stack stack--tight">
          <span className="field__label">{donor.name}</span>
          {kind === 'blocks' ? <Blocks donor={donor} /> : <Effects donor={donor} />}
        </div>
      ))}
    </div>
  );
}

export function findDonorBlock(tag: string): { donor: System; group: string } | null {
  for (const donor of DONORS) {
    const field = donor.fields.find(f => f.tag === tag);
    if (field) return { donor, group: field.group ?? 'Без блока' };
  }
  return null;
}

type EditSystem = (edit: (draft: System) => void) => void;

const into = (editSystem: EditSystem, bring: (system: System) => Brought): void =>
  editSystem(draft => { Object.assign(draft, bring(draft).system); });

export function copyDonorBlock(editSystem: EditSystem, donor: System, group: string): void {
  into(editSystem, system => bringIn(system, donor, blockParts(donor, group)));
}

const PART_WORDS: Record<PartKind, string> = {
  field: 'полей', group: 'блоков', effect: 'эффектов', table: 'таблиц',
  constant: 'костей', rollEdit: 'правок броска', recordKind: 'типов записей',
};

export const broughtWords = (parts: Part[]): string => {
  const counts = new Map<PartKind, number>();
  for (const part of parts) counts.set(part.kind, (counts.get(part.kind) ?? 0) + 1);
  return [...counts].map(([kind, n]) => `${PART_WORDS[kind]}: ${n}`).join(' · ');
};

export function Pieces() {
  const system = useWorld(s => s.system);
  const editSystem = useWorld(s => s.editSystem);
  const pieces = useMemo(
    () => PIECES.filter(piece => donorOf(piece)).map(piece => ({ piece, added: bringPiece(system, piece).added })),
    [system],
  );

  return (
    <div className="palette">
      {pieces.map(({ piece, added }) => (
        <button
          key={piece.id}
          type="button"
          className="card card--pick"
          title={piece.hint}
          disabled={!added.length}
          onClick={() => into(editSystem, current => bringPiece(current, piece))}
          style={added.length ? undefined : { opacity: 0.5, cursor: 'default' }}
        >
          <span className="card__title" style={{ fontSize: 'var(--fs-4)' }}>{piece.label}</span>
          <span className="card__sub">{added.length ? `добавит ${broughtWords(added)}` : 'уже в системе'}</span>
        </button>
      ))}
    </div>
  );
}

function Blocks({ donor }: { donor: System }) {
  const system = useWorld(s => s.system);
  const editSystem = useWorld(s => s.editSystem);

  const blocks = useMemo(() => {
    const names = new Map<string, number>();
    for (const field of donor.fields) {
      const key = groupChain(donor, field.group ?? 'Без блока').at(-1)!;
      names.set(key, (names.get(key) ?? 0) + 1);
    }
    return [...names];
  }, [donor]);

  const have = new Set(system.fields.map(f => f.tag));

  const copy = (group: string) => copyDonorBlock(editSystem, donor, group);

  return (
    <div className="palette">
      {blocks.map(([group, count]) => {
        const inside = new Set(subtreeNames(donor, group));
        const fields = donor.fields.filter(f => inside.has(f.group ?? 'Без блока'));
        const already = fields.every(f => have.has(f.tag));
        const brings = [...new Set(
          closure(donor, blockParts(donor, group))
            .filter(part => part.kind === 'field')
            .map(part => groupChain(donor, donor.fields.find(f => f.tag === part.key)?.group ?? 'Без блока').at(-1)!),
        )];

        return (
          <button
            key={group}
            type="button"
            className="card card--pick"
            disabled={already}
            onClick={() => copy(group)}
            style={already ? { opacity: 0.5, cursor: 'default' } : undefined}
          >
            <span className="card__title" style={{ fontSize: 'var(--fs-4)' }}>{group}</span>
            <span className="card__sub">
              {already ? 'уже в системе' : `полей: ${count}`}
              {!already && brings.length > 1 ? ` · приедет с ${brings.length - 1} блоком(ами)` : ''}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function Effects({ donor }: { donor: System }) {
  const system = useWorld(s => s.system);
  const editSystem = useWorld(s => s.editSystem);
  const pick = useWorld(s => s.pick);

  const list = Object.entries(donor.effects);
  if (!list.length) return <Empty title="У этого донора эффектов нет" />;

  const copy = (id: string) => {
    into(editSystem, current => bringIn(current, donor, [{ kind: 'effect', key: id }]));
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
            onClick={() => copy(id)}
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

