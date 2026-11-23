import { useMemo, useState } from 'react';
import { useWorld } from '../../store/world.ts';
import { bring, undoFresh, useCurrentFresh } from '../../store/fresh.ts';
import { Select, Empty, Fold, Button } from '../../ui/primitives.tsx';
import type { System, Effect } from '@vtt/schema';
import { SAMPLE_SYSTEMS, PIECES, bringPiece, donorOf } from '@vtt/engine/samples';
import { bringIn, blockParts, closure, blockLine, launchOf, LAUNCHES, fieldsOf, fieldOf, kindOf, NO_BLOCK, blockLabel } from '@vtt/engine';
import type { Part, PartKind } from '@vtt/engine';
import { useT, t as tr, Trans } from '../../i18n/author.ts';
import { defaultDonor, effectStanding, fieldsStanding, ownWords, piecesStanding } from './donor-compare.ts';

const DONORS = SAMPLE_SYSTEMS as System[];

export function DonorPalette({ kind }: { kind: 'blocks' | 'effects' }) {
  const t = useT('records');
  const [donorId, setDonorId] = useState<string>(() => {
    const now = useWorld.getState();
    return defaultDonor(now.system, DONORS, now.origin.systemId);
  });
  const donors = donorId === '*' ? DONORS : DONORS.filter(d => d.id === donorId);

  return (
    <div className="stack">
      <FreshNote />
      <Select
        value={donorId}
        options={[['*', t('donors.all')], ...DONORS.map(d => [d.id ?? '', d.name ?? ''] as const)] as never}
        onChange={setDonorId}
      />
      {donors.map(donor => (
        <div key={donor.id} className="stack stack--tight">
          <span className="field__label">{donor.name}</span>
          <Pieces donor={donor} />
          <Fold title={kind === 'blocks' ? t('donors.blocks') : t('donors.effects')}>
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
    if (field) return { donor, group: field.group ?? NO_BLOCK };
  }
  return null;
}

export function copyDonorBlock(donor: System, group: string): void {
  bring(tr('records:donors.blockBrought', { name: blockLabel(donor, group) }), system => bringIn(system, donor, blockParts(donor, group)));
}

const partWord = (kind: PartKind): string => tr(`records:donors.part.${kind}`);

const PART_ORDER: PartKind[] = ['field', 'block', 'effect', 'record', 'recordKind', 'table', 'roll', 'rollEdit', 'constant', 'group'];

function partLabel(system: System, part: Part): string {
  switch (part.kind) {
    case 'field': return fieldOf(system, part.key)?.label ?? part.key;
    case 'effect': return system.effects[part.key]?.label ?? part.key;
    case 'table': return system.tables?.[part.key]?.label ?? part.key;
    case 'constant': return system.constants?.[part.key]?.label ?? part.key;
    case 'rollEdit': return system.roll_edits?.[part.key]?.label ?? part.key;
    case 'recordKind': return kindOf(system, part.key)?.label ?? part.key;
    case 'record': return system.library?.find(r => r.id === part.key)?.label ?? part.key;
    case 'roll': return system.rolls?.[part.key]?.label ?? part.key;
    case 'group': return blockLabel(system, part.key);
    case 'block': return blockLabel(system, part.key);
  }
}

function FreshNote() {
  const t = useT('records');
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
        <span><Trans i18nKey="records:donors.added" values={{ label: fresh.label }} components={{ b: <b /> }} /></span>
        <Button size="sm" variant="ghost" onClick={undoFresh}>{t('donors.undo')}</Button>
      </div>
      <Fold title={t('donors.came')} count={fresh.added.length}>
        <div className="stack stack--tight">
          {PART_ORDER.map(kind => {
            const parts = fresh.added.filter(part => part.kind === kind);
            if (!parts.length) return null;
            return (
              <div key={kind} className="fresh__row">
                <span className="faint">{partWord(kind)}:</span>{' '}
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
  const t = useT('records');
  const system = useWorld(s => s.system);
  const pieces = useMemo(
    () => PIECES.filter(piece => piece.donor === donor.id && donorOf(piece))
      .map(piece => {
        const brought = bringPiece(system, piece);
        return { piece, added: brought.added, ...piecesStanding(system, donor, brought.added, brought.kept) };
      }),
    [system, donor],
  );
  if (!pieces.length) return null;

  return (
    <div className="palette">
      {pieces.map(({ piece, added, standing, own }) => (
        <button
          key={piece.id}
          type="button"
          className="card card--pick"
          title={piece.hint}
          disabled={!added.length}
          onClick={() => bring(`«${piece.label}»`, current => bringPiece(current, piece))}
          style={added.length ? undefined : { opacity: 0.5, cursor: 'default' }}
        >
          <span className="card__title">{piece.label}</span>
          <span className="card__sub card__sub--clamp">
            {standing === 'new' ? piece.hint : standing === 'own' && own ? ownWords(partLabel(system, own)) : t('donors.already')}
          </span>
        </button>
      ))}
    </div>
  );
}

function Blocks({ donor }: { donor: System }) {
  const t = useT('records');
  const system = useWorld(s => s.system);

  const blocks = useMemo(() => {
    const names = new Map<string, number>();
    for (const field of fieldsOf(donor)) {
      const roots = new Set((field.placements ?? []).map(place => blockLine(donor, place.group).at(-1)!));
      for (const key of roots.size ? roots : [NO_BLOCK]) names.set(key, (names.get(key) ?? 0) + 1);
    }
    return [...names];
  }, [donor]);

  return (
    <div className="palette">
      {blocks.map(([group, count]) => {
        const fields = fieldsOf(donor).filter(f => (f.placements ?? []).some(place => blockLine(donor, place.group).includes(group)));
        const standing = fieldsStanding(system, donor, fields);
        const already = standing !== 'new';
        const brings = [...new Set(
          closure(donor, blockParts(donor, group))
            .filter(part => part.kind === 'field')
            .flatMap(part => (fieldOf(donor, part.key)?.placements ?? []).map(place => blockLine(donor, place.group).at(-1)!)),
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
            <span className="card__title">{blockLabel(donor, group)}</span>
            <span className="card__sub">
              {standing === 'same' ? t('donors.already') : standing === 'own' ? ownWords(blockLabel(donor, group)) : t('donors.fields', { n: count })}
              {!already && brings.length > 1 ? ` · ${t('donors.moreBlocks', { count: brings.length - 1 })}` : ''}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function Effects({ donor }: { donor: System }) {
  const t = useT('records');
  const system = useWorld(s => s.system);
  const pick = useWorld(s => s.pick);

  const list = Object.entries(donor.effects);
  if (!list.length) return <Empty title={t('donors.noEffects')} />;

  const copy = (id: string, effect: Effect) => {
    bring(`«${effect.label ?? id}»`, current => bringIn(current, donor, [{ kind: 'effect', key: id }]));
    pick({ activeEffectId: id });
  };

  return (
    <div className="palette">
      {list.map(([id, effect]) => {
        const standing = effectStanding(system, donor, id);
        const already = standing !== 'new';
        return (
          <button
            key={id}
            type="button"
            className="card card--pick"
            disabled={already}
            onClick={() => copy(id, effect)}
            style={already ? { opacity: 0.5, cursor: 'default' } : undefined}
          >
            <span className="card__title">{effect.label ?? id}</span>
            <span className="card__sub">
              {standing === 'same' ? t('donors.already') : standing === 'own' ? ownWords(effect.label ?? id) : `${effect.group ? blockLabel(donor, effect.group) : t('donors.mechanics')} · ${activationWord(effect)}`}
            </span>
          </button>
        );
      })}
    </div>
  );
}

const activationWord = (effect: Effect) => LAUNCHES[launchOf(effect).kind].label.toLowerCase();
